// HACK THE PLANET — knowledge progress (DISCOVERED → UNDERSTOOD → MASTERED),
// learning XP, badges and the learning review.
//
// Stored under its own key (htp.knowledge); the campaign save (htp.progress)
// is never touched. Everything is pure and deterministic except the store
// wrapper at the bottom, so it is tested in Node.
//
// Storage holds only what progress needs: milestone times per concept, a few
// evidence references, the best result per source, badges and small counters.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./concepts.js'), require('./learning-events.js'), require('./rewards.js'), require('./challenges.js'));
  } else {
    const K = root.HTPKnowledge = root.HTPKnowledge || {};
    K.Progress = factory(K.Concepts, K.Events, K.Rewards, K.Challenges);
  }
})(typeof self !== 'undefined' ? self : this, function (Concepts, Events, Rewards, Challenges) {
  'use strict';

  const STORAGE_KEY = 'htp.knowledge';
  const VERSION = 1;
  const MAX_EVIDENCE = 8;          // per concept
  const MAX_SEEN = 300;            // processed event ids (idempotency)
  const MAX_RECENT = 8;

  function defaultState() {
    return { version: VERSION, concepts: {}, sources: {}, badges: {}, recent: [], seen: [], challenges: {},
      stats: { attempts: 0, independentAttempts: 0, independentSuccesses: 0, hintsUsed: 0, challengeAttempts: 0, challengePasses: 0 } };
  }

  const isTime = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  const clone = s => JSON.parse(JSON.stringify(s));
  const text = (v, n = 220) => (typeof v === 'string' ? v.slice(0, n) : null);

  // Accepts anything and returns a valid state. Unknown concepts, sources and
  // badges are dropped; malformed fields fall back to safe values.
  function normalize(raw) {
    const s = defaultState();
    if (!raw || typeof raw !== 'object' || raw.version !== VERSION) return s;
    for (const [id, c] of Object.entries(raw.concepts || {})) {
      if (!Concepts.byId[id] || !c || typeof c !== 'object') continue;
      const out = { evidence: [] };
      for (const k of ['discoveredAt', 'understoodAt', 'masteredAt']) if (isTime(c[k])) out[k] = c[k];
      if (out.masteredAt && !out.understoodAt) delete out.masteredAt;      // milestones are ordered
      if (out.understoodAt && !out.discoveredAt) out.discoveredAt = out.understoodAt;
      if (Concepts.byId[id].mastery === 'none') delete out.masteredAt;
      for (const e of Array.isArray(c.evidence) ? c.evidence : []) {
        if (e && Events.SOURCES[e.source] && isTime(e.at) && typeof e.type === 'string') {
          out.evidence.push({ source: e.source, level: Events.SOURCES[e.source].level, type: e.type,
            result: typeof e.result === 'string' ? e.result : null, firstTry: !!e.firstTry, guided: !!e.guided, at: e.at });
        }
      }
      out.evidence = out.evidence.slice(-MAX_EVIDENCE);
      if (out.masteredAt && isTime(c.excellenceAt)) out.excellenceAt = c.excellenceAt;
      const ins = c.insight;
      if (ins && typeof ins === 'object' && Events.SOURCES[ins.source] && isTime(ins.at)) {
        out.insight = { source: ins.source, action: text(ins.action), outcome: text(ins.outcome), accepted: !!ins.accepted, at: ins.at };
      }
      if (out.discoveredAt) s.concepts[id] = out;
    }
    for (const [src, e] of Object.entries(raw.sources || {})) {
      if (Events.SOURCES[src] && e && typeof e === 'object' && isTime(e.at)) {
        s.sources[src] = { accepted: !!e.accepted, firstTry: !!e.firstTry, result: typeof e.result === 'string' ? e.result : null, at: e.at };
      }
    }
    for (const [id, b] of Object.entries(raw.badges || {})) {
      if (Rewards.badgeById[id] && b && isTime(b.unlockedAt)) {
        s.badges[id] = { unlockedAt: b.unlockedAt, sourceEvidence: Array.isArray(b.sourceEvidence) ? b.sourceEvidence.filter(x => Events.SOURCES[x]) : [] };
      }
    }
    for (const [id, ch] of Object.entries(raw.challenges || {})) {
      if (!Challenges.byId[id] || !ch || typeof ch !== 'object') continue;
      const n = k => (Number.isFinite(ch[k]) && ch[k] >= 0 ? Math.floor(ch[k]) : 0);
      s.challenges[id] = { attempts: n('attempts'), passes: Math.min(n('passes'), n('attempts')), hintsUsed: n('hintsUsed'),
        firstAttempt: ['pass', 'fail'].includes(ch.firstAttempt) ? ch.firstAttempt : null,
        lastResult: ['pass', 'fail'].includes(ch.lastResult) ? ch.lastResult : null,
        bestMs: Number.isFinite(ch.bestMs) && ch.bestMs > 0 ? Math.round(ch.bestMs) : null, lastAt: isTime(ch.lastAt) ? ch.lastAt : null };
    }
    if (Array.isArray(raw.recent)) s.recent = raw.recent.filter(r => r && typeof r.id === 'string' && typeof r.kind === 'string').slice(-MAX_RECENT);
    if (Array.isArray(raw.seen)) s.seen = raw.seen.filter(x => typeof x === 'string').slice(-MAX_SEEN);
    const st = raw.stats || {};
    for (const k of Object.keys(s.stats)) if (Number.isFinite(st[k]) && st[k] >= 0) s.stats[k] = Math.floor(st[k]);
    return s;
  }

  function status(state, conceptId) {
    const c = state.concepts[conceptId];
    if (!c || !c.discoveredAt) return 'locked';
    return c.masteredAt ? 'mastered' : c.understoodAt ? 'understood' : 'discovered';
  }

  // Best evidence recorded for a source: accepted beats not, first-try beats later.
  function evidenceLookup(state) {
    return (source, need = {}) => {
      const e = state.sources[source];
      if (!e) return null;
      if (need.accepted && !e.accepted) return null;
      if (need.firstTry && !e.firstTry) return null;
      return e;
    };
  }

  // Pure: applies one level report. Returns { state, changes, rejected }.
  // changes: [{ kind: 'discovered'|'understood'|'mastered'|'badge', id, xp }]
  function apply(prev, input, now) {
    const v = Events.validate(input);
    if (!v.ok) return { state: prev, changes: [], rejected: v.reason };
    const state = clone(prev);
    const at = (now || new Date()).toISOString();
    const src = Events.SOURCES[input.source];
    const changes = [];
    // Challenges: the verdict is recomputed from the answers, never taken from the page.
    const verdict = Events.verdictOf(input);
    const result = verdict ? (verdict.pass ? 'verified' : 'failed') : input.result;
    const isChallenge = src.context === 'challenge' && input.stage === 'apply';
    let attemptNo = 0, attemptSeen = false;

    if (isChallenge) {
      const key = 'attempt|' + input.source + '|' + input.attemptId;
      attemptSeen = state.seen.includes(key);
      if (!attemptSeen) {
        state.seen.push(key);
        const ch = state.challenges[src.challengeId] || (state.challenges[src.challengeId] = { attempts: 0, passes: 0, hintsUsed: 0, firstAttempt: null, lastResult: null, bestMs: null, lastAt: null });
        ch.attempts++;
        attemptNo = ch.attempts;
        if (!ch.firstAttempt) ch.firstAttempt = verdict.pass ? 'pass' : 'fail';      // history is never rewritten
        if (verdict.pass) ch.passes++;
        if (input.guided) ch.hintsUsed++;
        ch.lastResult = verdict.pass ? 'pass' : 'fail';
        ch.lastAt = at;
        const ms = Number(input.timeMs);
        if (verdict.pass && Number.isFinite(ms) && ms > 0 && ms < 3600000) ch.bestMs = ch.bestMs ? Math.min(ch.bestMs, Math.round(ms)) : Math.round(ms);
        state.stats.challengeAttempts++;
        if (verdict.pass) state.stats.challengePasses++;
      }
    }

    // Best result per source (used by badges and the review).
    if (input.stage === 'apply') {
      const accepted = src.accept.includes(result);
      const old = state.sources[input.source];
      const firstTry = isChallenge ? attemptNo === 1 : !!input.firstTry;
      const better = !old || (accepted && !old.accepted) || (accepted === old.accepted && firstTry && !old.firstTry);
      if (better) state.sources[input.source] = { accepted, firstTry, result, at };
    }

    const reportInput = isChallenge ? Object.assign({}, input, { firstTry: attemptNo === 1 }) : input;
    for (const ev of Events.expand(reportInput, now, verdict || undefined)) {
      if (state.seen.includes(ev.eventId)) continue;           // the same event twice is one event
      state.seen.push(ev.eventId);
      if (state.seen.length > MAX_SEEN) state.seen.splice(0, state.seen.length - MAX_SEEN);
      const def = Concepts.byId[ev.conceptId];
      const c = state.concepts[ev.conceptId] || (state.concepts[ev.conceptId] = { evidence: [] });
      const understoodBefore = !!c.understoodAt;
      // Earlier correct applications in a *different* scenario (and level, if required).
      const independentOf = c.evidence.filter(e => e.type === 'knowledge.understood' && e.source !== ev.sourceAction &&
        (def.mastery !== 'cross-level' || e.level !== ev.levelId));
      // Challenge concepts are mastered only through their challenge.
      const contextOk = def.mastery === 'challenge' ? src.context === 'challenge' : def.mastery !== 'none';
      const newContext = contextOk && understoodBefore && independentOf.length > 0 && !ev.guided && input.stage === 'apply';

      if (!c.discoveredAt) { c.discoveredAt = at; changes.push({ kind: 'discovered', id: ev.conceptId, xp: Rewards.XP.discovered }); }
      if (ev.guided) state.stats.hintsUsed++;                   // a decision made with the guide's help
      if (ev.type === 'knowledge.attempted') {
        state.stats.attempts++;
        if (newContext) state.stats.independentAttempts++;
      }
      if (ev.type === 'knowledge.understood') {
        if (!c.understoodAt) {
          c.understoodAt = at;
          changes.push({ kind: 'understood', id: ev.conceptId, xp: Rewards.XP.understood });
        } else if (newContext && def.mastery === 'challenge') {
          // Challenge mastery: an unguided pass after understanding it in its
          // mission. A retry after a failed attempt counts (the feedback is
          // the remediation); a pass on the very first attempt also earns an
          // excellence mark. Earlier first-attempt results stay as they were.
          state.stats.independentAttempts++;
          state.stats.independentSuccesses++;
          if (!c.masteredAt) {
            c.masteredAt = at;
            changes.push({ kind: 'mastered', id: ev.conceptId, xp: Rewards.XP.mastered });
            if (attemptNo === 1) { c.excellenceAt = at; changes.push({ kind: 'excellence', id: ev.conceptId, xp: 0 }); }
          }
        } else if (newContext) {
          state.stats.independentAttempts++;
          // Mastery: a later, first-try, unguided success in a new context.
          if (ev.firstTry && !c.masteredAt) {
            c.masteredAt = at;
            state.stats.independentSuccesses++;
            changes.push({ kind: 'mastered', id: ev.conceptId, xp: Rewards.XP.mastered });
          } else if (ev.firstTry) state.stats.independentSuccesses++;
        }
      }
      if (!c.evidence.some(e => e.source === ev.sourceAction && e.type === ev.type && e.firstTry === ev.firstTry)) {
        c.evidence.push({ source: ev.sourceAction, level: ev.levelId, type: ev.type, result: ev.result, firstTry: ev.firstTry, guided: ev.guided, at });
        if (c.evidence.length > MAX_EVIDENCE) c.evidence.splice(0, c.evidence.length - MAX_EVIDENCE);
      }
      // Security insight: what the player did and what really happened, as
      // reported from game state (or, for challenges, from the verdict).
      if (input.stage === 'apply' && (verdict || input.insight)) {
        c.insight = { source: ev.sourceAction, accepted: ev.type === 'knowledge.understood', at,
          action: text(verdict ? verdict.action : input.insight.action), outcome: text(verdict ? verdict.outcome : input.insight.outcome) };
      }
    }
    if (attemptSeen) { /* a re-sent attempt changes nothing */ }

    const ev = evidenceLookup(state);
    for (const b of Rewards.BADGES) {
      if (state.badges[b.id]) continue;
      const proof = b.check(ev);
      if (proof) {
        state.badges[b.id] = { unlockedAt: at, sourceEvidence: proof };
        changes.push({ kind: 'badge', id: b.id, xp: 0 });
      }
    }
    for (const ch of changes) state.recent.push({ kind: ch.kind, id: ch.id, at });
    if (state.recent.length > MAX_RECENT) state.recent.splice(0, state.recent.length - MAX_RECENT);
    return { state, changes, rejected: null };
  }

  function xp(state) {
    let total = 0;
    for (const c of Object.values(state.concepts)) {
      if (c.discoveredAt) total += Rewards.XP.discovered;
      if (c.understoodAt) total += Rewards.XP.understood;
      if (c.masteredAt) total += Rewards.XP.mastered;
    }
    return total;
  }

  function summary(state) {
    const counts = { total: Concepts.CONCEPTS.length, discovered: 0, understood: 0, mastered: 0,
      masterable: Concepts.CONCEPTS.filter(c => c.mastery !== 'none').length, excellence: 0 };
    for (const c of Concepts.CONCEPTS) {
      const st = status(state, c.id);
      if (st !== 'locked') counts.discovered++;
      if (st === 'understood' || st === 'mastered') counts.understood++;
      if (st === 'mastered') counts.mastered++;
      if (state.concepts[c.id] && state.concepts[c.id].excellenceAt) counts.excellence++;
    }
    return Object.assign(counts, { xp: xp(state), badges: Object.keys(state.badges).length, badgesTotal: Rewards.BADGES.length });
  }

  // WHAT YOU KNOW / WHAT YOU CAN PRACTISE / WHAT TO TRY NEXT.
  // Points to missions and challenges, never to answers.
  // unlockedLevels: level ids the player can open now.
  // next: a deterministic recommendation, in this order:
  //   1. an understood concept whose mastery challenge is waiting
  //   2. an understood concept that can be mastered in another unlocked mission
  //   3. a discovered concept that can be practised in an unlocked mission
  //   4. an unlocked mission with undiscovered concepts
  //   5. optional review: replay a mastered concept's challenge
  function review(state, unlockedLevels) {
    const open = new Set(unlockedLevels || [1, 2, 3, 4, 5]);
    const mastered = [], practise = [], know = [], needsWork = [];
    let rec1 = null, rec2 = null, rec3 = null, rec5 = null;
    for (const c of Concepts.CONCEPTS) {
      const st = status(state, c.id);
      const cs = state.concepts[c.id];
      const challenge = c.mastery === 'challenge' ? Challenges.byId[c.challenge] : null;
      const chStats = challenge ? state.challenges[challenge.id] : null;
      if (st === 'mastered') {
        mastered.push({ id: c.id }); know.push({ id: c.id, status: st });
        if (challenge && !rec5) rec5 = { type: 'challenge', conceptId: c.id, challenge: challenge.id, why: 'Optional review: replay ' + challenge.title + ' (no new XP).' };
        continue;
      }
      if (st === 'locked') continue;
      if (st === 'understood') know.push({ id: c.id, status: st });
      const used = new Set((cs.evidence || []).map(e => e.source));
      const usedLevels = new Set((cs.evidence || []).filter(e => e.type === 'knowledge.understood').map(e => e.level));
      const where = Events.sourcesForConcept(c.id).filter(s => s.context === 'campaign' && open.has(s.level) &&
        (st === 'discovered' ? true : c.mastery === 'cross-level' ? !usedLevels.has(s.level) : !used.has(s.id)));
      const levels = [...new Set(where.map(s => s.level))];
      if (st === 'discovered') {
        practise.push({ id: c.id, why: 'Discovered — apply the right control to understand it.', levels });
        if (!rec3 && levels.length) rec3 = { type: 'level', level: levels[0], conceptId: c.id, why: 'Practise ' + c.title + ': apply the right control this time.' };
        if ((cs.evidence || []).some(e => e.type === 'knowledge.attempted')) needsWork.push({ id: c.id, why: 'A decision did not hold up yet — the mission report explains why.' });
      } else if (challenge) {
        const failed = chStats && chStats.lastResult === 'fail';
        practise.push({ id: c.id, why: failed ? 'Your last challenge attempt did not pass verification — re-read its evidence and try again.' : 'Understood — pass its mastery challenge to master it.', levels: [], challenge: challenge.id });
        if (failed) needsWork.push({ id: c.id, why: 'Challenge not passed yet: ' + challenge.title + '.' });
        if (!rec1) rec1 = { type: 'challenge', conceptId: c.id, challenge: challenge.id, why: 'Apply ' + c.title + ' in a new scenario: ' + challenge.title + '.' };
      } else if (c.mastery !== 'none' && levels.length) {
        practise.push({ id: c.id, why: 'Understood — apply it first time in a new context to master it.', levels });
        if (!rec2) rec2 = { type: 'level', level: levels[0], conceptId: c.id, why: 'Apply ' + c.title + ' first time in a different mission to master it.' };
      }
    }
    let rec4 = null;
    for (const lvl of [1, 2, 3, 4, 5]) {
      if (!open.has(lvl)) continue;
      if (Events.sourcesForLevel(lvl).some(s => s.concepts.some(id => status(state, id) === 'locked'))) {
        rec4 = { type: 'level', level: lvl, why: 'New concepts are waiting to be discovered in this mission.' };
        break;
      }
    }
    const next = rec1 || rec2 || rec3 || rec4 || rec5 || null;
    return { mastered, know, practise, needsWork, next };
  }

  // Storage wrapper. Missing, blocked or corrupt storage never throws.
  function createStore(storage) {
    function load() {
      try { const t = storage ? storage.getItem(STORAGE_KEY) : null; return normalize(t ? JSON.parse(t) : null); }
      catch (e) { return defaultState(); }
    }
    function save(state) {
      try { if (!storage) return false; storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
      catch (e) { return false; }
    }
    return {
      load, save,
      record(input, now) {
        const res = apply(load(), input, now);
        if (!res.rejected && (res.changes.length || JSON.stringify(res.state) !== JSON.stringify(load()))) save(res.state);
        return res;
      },
      hintUsed() { const s = load(); s.stats.hintsUsed++; save(s); },
      reset() { try { if (storage) storage.removeItem(STORAGE_KEY); return true; } catch (e) { return false; } },
    };
  }
  function browserStorage() {
    try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (e) { return null; }
  }
  const store = createStore(browserStorage());

  return { STORAGE_KEY, VERSION, defaultState, normalize, status, apply, xp, summary, review, evidenceLookup, createStore,
    load: store.load, record: store.record, reset: store.reset, hintUsed: store.hintUsed };
});
