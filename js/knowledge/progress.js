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
    module.exports = factory(require('./concepts.js'), require('./learning-events.js'), require('./rewards.js'));
  } else {
    const K = root.HTPKnowledge = root.HTPKnowledge || {};
    K.Progress = factory(K.Concepts, K.Events, K.Rewards);
  }
})(typeof self !== 'undefined' ? self : this, function (Concepts, Events, Rewards) {
  'use strict';

  const STORAGE_KEY = 'htp.knowledge';
  const VERSION = 1;
  const MAX_EVIDENCE = 8;          // per concept
  const MAX_SEEN = 300;            // processed event ids (idempotency)
  const MAX_RECENT = 8;

  function defaultState() {
    return { version: VERSION, concepts: {}, sources: {}, badges: {}, recent: [], seen: [],
      stats: { attempts: 0, independentAttempts: 0, independentSuccesses: 0, hintsUsed: 0 } };
  }

  const isTime = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  const clone = s => JSON.parse(JSON.stringify(s));

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

    // Best result per source (used by badges and the review).
    if (input.stage === 'apply') {
      const accepted = src.accept.includes(input.result);
      const old = state.sources[input.source];
      const better = !old || (accepted && !old.accepted) || (accepted === old.accepted && input.firstTry && !old.firstTry);
      if (better) state.sources[input.source] = { accepted, firstTry: !!input.firstTry, result: input.result, at };
    }

    for (const ev of Events.expand(input, now)) {
      if (state.seen.includes(ev.eventId)) continue;           // the same event twice is one event
      state.seen.push(ev.eventId);
      if (state.seen.length > MAX_SEEN) state.seen.splice(0, state.seen.length - MAX_SEEN);
      const def = Concepts.byId[ev.conceptId];
      const c = state.concepts[ev.conceptId] || (state.concepts[ev.conceptId] = { evidence: [] });
      const understoodBefore = !!c.understoodAt;
      // Earlier correct applications in a *different* scenario (and level, if required).
      const independentOf = c.evidence.filter(e => e.type === 'knowledge.understood' && e.source !== ev.sourceAction &&
        (def.mastery !== 'cross-level' || e.level !== ev.levelId));
      const newContext = def.mastery !== 'none' && understoodBefore && independentOf.length > 0 && !ev.guided && input.stage === 'apply';

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
    }

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
      masterable: Concepts.CONCEPTS.filter(c => c.mastery !== 'none').length };
    for (const c of Concepts.CONCEPTS) {
      const st = status(state, c.id);
      if (st !== 'locked') counts.discovered++;
      if (st === 'understood' || st === 'mastered') counts.understood++;
      if (st === 'mastered') counts.mastered++;
    }
    return Object.assign(counts, { xp: xp(state), badges: Object.keys(state.badges).length, badgesTotal: Rewards.BADGES.length });
  }

  // MASTERED / TO PRACTISE / NEXT OPPORTUNITY. Points to missions, never to answers.
  // unlockedLevels: level ids the player can open now.
  function review(state, unlockedLevels) {
    const open = new Set(unlockedLevels || [1, 2, 3, 4, 5]);
    const mastered = [], practise = [];
    for (const c of Concepts.CONCEPTS) {
      const st = status(state, c.id);
      if (st === 'mastered') { mastered.push({ id: c.id }); continue; }
      if (st === 'locked') continue;
      const used = new Set((state.concepts[c.id].evidence || []).map(e => e.source));
      const usedLevels = new Set((state.concepts[c.id].evidence || []).filter(e => e.type === 'knowledge.understood').map(e => e.level));
      const where = Events.sourcesForConcept(c.id).filter(s => open.has(s.level) &&
        (st === 'discovered' ? true : c.mastery === 'cross-level' ? !usedLevels.has(s.level) : !used.has(s.id)));
      if (st === 'discovered') practise.push({ id: c.id, why: 'Discovered — apply the right control to understand it.', levels: [...new Set(where.map(s => s.level))] });
      else if (c.mastery !== 'none' && where.length) practise.push({ id: c.id, why: 'Understood — apply it first time in a new context to master it.', levels: [...new Set(where.map(s => s.level))] });
    }
    // Next opportunity: the first open level with a source for an undiscovered concept.
    let next = null;
    for (const lvl of [1, 2, 3, 4, 5]) {
      if (!open.has(lvl)) continue;
      const fresh = Events.sourcesForLevel(lvl).some(s => s.concepts.some(id => status(state, id) === 'locked'));
      if (fresh) { next = { level: lvl, why: 'New concepts are waiting to be discovered in this mission.' }; break; }
    }
    if (!next && practise.length && practise[0].levels.length) next = { level: practise[0].levels[0], why: practise[0].why };
    return { mastered, practise, next };
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
