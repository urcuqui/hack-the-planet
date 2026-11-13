// HACK THE PLANET — shared knowledge UI: concept icons, the KNOWLEDGE UNLOCKED
// notifier used inside the levels, the four reward sounds, and the Knowledge
// Vault + Achievements views used by the Mission Hub.
//
// All text is inserted with textContent; the only innerHTML is the static SVG
// icon markup defined in this file.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./concepts.js'), require('./learning-events.js'), require('./rewards.js'), require('./progress.js'));
  else {
    const K = root.HTPKnowledge = root.HTPKnowledge || {};
    K.UI = factory(K.Concepts, K.Events, K.Rewards, K.Progress);
  }
})(typeof self !== 'undefined' ? self : this, function (Concepts, Events, Rewards, Progress) {
  'use strict';

  // ── Icons: original line glyphs, 24×24, stroke = currentColor ──
  const GLYPH = {
    key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
    badge: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.6-1.6 1.6-2.4 2.5-2.4s1.9.8 2.5 2.4M14 10h4M14 13h3"/><path d="M15 17l1.5 1.5L20 15"/>',
    trace: '<circle cx="5" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="18" r="2"/><path d="M6.5 7.5l4 3M13.5 13.5l4 3"/><path d="M3 20h4M17 4h4"/>',
    cascade: '<rect x="3" y="4" width="5" height="5"/><rect x="10" y="10" width="5" height="5"/><rect x="17" y="16" width="4" height="4"/><path d="M8 7h3v3M15 13h3v3"/>',
    bubble: '<path d="M4 5h16v10H10l-4 4v-4H4z"/><path d="M8 9l3 2-3 2M13 13h3"/>',
    drop: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M12 10c-1.5 2-2 3-2 3.8a2 2 0 004 0c0-.8-.5-1.8-2-3.8z"/>',
    noise: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/><path d="M4 4l1 1M19 4l-1 1M20 19l-1-1M5 19l1-1"/>',
    face: '<path d="M7 20v-2a5 5 0 0110 0v2"/><circle cx="12" cy="9" r="4"/><path d="M3 5h2M3 9h1M19 5h2M20 9h1M3 13h2M19 13h2"/>',
    mask: '<path d="M3 7c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0 0 5-2 9-6 9-2 0-3-1.5-3-3 0 1.5-1 3-3 3-4 0-6-4-6-9z"/><path d="M7 10.5h2M15 10.5h2"/>',
    scale: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 006 0zM19 7l-3 6a3 3 0 006 0z"/>',
    cloud: '<path d="M7 18a4 4 0 01-.5-8A5 5 0 0116 8a4 4 0 011 8z"/><path d="M10.5 11.5a1.5 1.5 0 113 .3c0 1-1.5 1.2-1.5 2.2M12 16v.5"/>',
    lens: '<circle cx="10" cy="10" r="5"/><path d="M14 14l6 6M8 10h4"/>',
    flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/><path d="M8 4v8M11 4v8M14 4v8"/>',
    city: '<path d="M3 20h18M5 20V10h4v10M10 20V5h5v15M16 20v-7h3v7"/><path d="M12 8h1M12 11h1M12 14h1"/>',
  };
  const BADGE_GLYPH = { 'star-key': 'key', 'star-lens': 'lens', 'star-badge': 'badge', 'star-flag': 'flag', 'star-city': 'city' };

  function icon(name, size = 28) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = GLYPH[BADGE_GLYPH[name] || name] || GLYPH.key;      // static markup from this file
    return svg;
  }

  // ── Reward sounds (original, short, via the caller's audio path) ──
  // ctx: an AudioContext the level already unlocked; dest: its SFX node.
  const CUES = {
    discovered: [[1318.5, 0, 0.22, 'sine', 0.05], [1760, 0.07, 0.3, 'sine', 0.035]],
    understood: [[784, 0, 0.12, 'triangle', 0.07], [1174.7, 0.11, 0.26, 'triangle', 0.07]],
    mastered: [[659.3, 0, 0.1, 'square', 0.035], [880, 0.08, 0.1, 'square', 0.035], [1046.5, 0.16, 0.1, 'square', 0.035],
      [1318.5, 0.24, 0.45, 'triangle', 0.06], [659.3, 0.24, 0.45, 'triangle', 0.04]],
    badge: [[523.3, 0, 0.06, 'square', 0.04], [659.3, 0.06, 0.06, 'square', 0.04], [784, 0.12, 0.06, 'square', 0.04],
      [1046.5, 0.18, 0.08, 'square', 0.04], [1568, 0.27, 0.35, 'triangle', 0.06]],
  };
  function playCue(ctx, dest, kind) {
    const notes = CUES[kind];
    if (!ctx || !dest || !notes || ctx.state === 'closed') return false;
    const t0 = ctx.currentTime + 0.02;
    for (const [f, at, dur, type, peak] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.linearRampToValueAtTime(peak, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g); g.connect(dest);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    }
    return true;
  }

  // ── Notifier: compact, queued, non-blocking ──
  const CSS = `
  .htpk-unlock { position: fixed; z-index: 60; top: var(--htpk-top, 76px); right: var(--htpk-right, 16px); width: min(320px, calc(100vw - 32px));
    display: grid; grid-template-columns: 44px 1fr; gap: 4px 12px; align-items: start; padding: 12px 14px; pointer-events: none;
    font-family: var(--htpk-font, "Courier New", monospace); color: #f4f7ff; background: rgba(10, 12, 24, 0.95);
    border: 1px solid var(--htpk-accent, #72DCEB); border-left-width: 4px; box-shadow: 0 6px 24px rgba(0,0,0,0.45); }
  .htpk-unlock[hidden] { display: none; }
  .htpk-unlock.bottom-center { top: auto; right: auto; bottom: var(--htpk-bottom, 56px); left: calc(50% - min(160px, 50vw - 16px)); }
  .htpk-unlock.top-center { right: auto; left: calc(50% - min(160px, 50vw - 16px)); }
  .htpk-unlock.bottom-left { top: auto; right: auto; left: 12px; bottom: var(--htpk-bottom, 44px); }
  .htpk-unlock > :not(.ic) { grid-column: 2; }
  .htpk-unlock .ic { grid-row: 1 / span 3; color: var(--htpk-accent, #72DCEB); width: 44px; height: 44px; display: grid; place-items: center;
    border: 1px solid currentColor; border-radius: 50%; }
  .htpk-unlock .k { font-size: 11px; letter-spacing: 3px; color: var(--htpk-accent, #72DCEB); }
  .htpk-unlock .t { font-size: 15px; letter-spacing: 1px; font-weight: bold; line-height: 1.25; }
  .htpk-unlock .d { font-size: 12px; line-height: 1.45; color: rgba(244,247,255,0.82); }
  .htpk-unlock .x { font-size: 11px; letter-spacing: 2px; color: rgba(244,247,255,0.7); }
  .htpk-unlock .ins { font-size: 12px; line-height: 1.45; display: grid; gap: 2px; border-top: 1px solid rgba(255,255,255,0.12); padding-top: 4px; margin-top: 2px; }
  .htpk-unlock .ins b { font-weight: normal; font-size: 11px; letter-spacing: 2px; color: var(--htpk-accent, #72DCEB); }
  /* Reward tiers: each step is a little more distinctive, never flashing. */
  .htpk-unlock.k-discovered { border-left-width: 2px; }
  .htpk-unlock.k-discovered .ic { border-style: dashed; }
  .htpk-unlock.k-mastered, .htpk-unlock.k-excellence { border-color: #ffd23f; border-left-width: 6px; }
  .htpk-unlock.k-mastered .ic, .htpk-unlock.k-excellence .ic { color: #ffd23f; border-width: 2px; background: radial-gradient(circle, rgba(255,210,63,0.18), transparent 70%); }
  .htpk-unlock.k-mastered .k, .htpk-unlock.k-excellence .k { color: #ffd23f; }
  .htpk-unlock.k-badge { border-color: #ffd23f; }
  .htpk-unlock.k-badge .ic { color: #ffd23f; border: 2px double #ffd23f; border-radius: 30%; }
  .htpk-unlock.anim { animation: htpkIn 0.35s ease-out; }
  .htpk-unlock.anim.k-understood .ic, .htpk-unlock.anim.k-mastered .ic, .htpk-unlock.anim.k-badge .ic { animation: htpkPulse 1.1s ease-out 0.15s; }
  .htpk-unlock.anim.k-mastered .ic, .htpk-unlock.anim.k-excellence .ic { animation: htpkPulse 1.1s ease-out 0.15s, htpkGrow 0.5s ease-out; }
  @keyframes htpkGrow { from { transform: scale(0.7); } to { transform: none; } }
  @keyframes htpkIn { from { transform: translateY(-10px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes htpkPulse { 0% { box-shadow: 0 0 0 0 var(--htpk-accent, #72DCEB); } 100% { box-shadow: 0 0 0 14px transparent; } }
  @media (prefers-reduced-motion: reduce) { .htpk-unlock.anim, .htpk-unlock.anim .ic { animation: none !important; } }
  `;
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('htpk-css')) return;
    const st = document.createElement('style');
    st.id = 'htpk-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const KICKER = { discovered: 'KNOWLEDGE UNLOCKED', understood: 'SECURITY INSIGHT · CONCEPT UNDERSTOOD', mastered: 'CONCEPT MASTERED · COLLECTION UPGRADED',
    excellence: 'EXCELLENCE · MASTERED ON THE FIRST ATTEMPT', badge: 'BADGE EARNED' };

  // Player preference shared by every page: reward sounds on or off.
  const PREFS_KEY = 'htp.prefs';
  function prefs() {
    try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return { rewardSounds: p.rewardSounds !== false }; }
    catch (e) { return { rewardSounds: true }; }
  }
  function setPref(k, v) {
    try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); p[k] = v; localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* not persistent */ }
  }

  // Merges one batch of changes into cards: a concept discovered and
  // understood at once shows as one UNDERSTOOD card worth both rewards.
  function cardsFor(changes) {
    const byId = new Map(), cards = [];
    for (const ch of changes) {
      if (ch.kind === 'badge') { cards.push({ kind: 'badge', id: ch.id, xp: 0 }); continue; }
      const prev = byId.get(ch.id);
      const rank = { discovered: 0, understood: 1, mastered: 2, excellence: 3 };
      if (!prev) { const c = { kind: ch.kind, id: ch.id, xp: ch.xp }; byId.set(ch.id, c); cards.push(c); }
      else { prev.xp += ch.xp; if (rank[ch.kind] > rank[prev.kind]) prev.kind = ch.kind; }
    }
    return cards;
  }

  // opts: isBusy() → true while an unlock would interrupt (combat, driving);
  //       sound(kind) → plays a cue through the level's audio settings;
  //       reducedMotion; accent; top/right offsets.
  function createNotifier(opts = {}) {
    injectCss();
    const box = document.createElement('div');
    box.className = 'htpk-unlock';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.hidden = true;
    if (opts.accent) box.style.setProperty('--htpk-accent', opts.accent);
    if (opts.top) box.style.setProperty('--htpk-top', opts.top);
    if (opts.right) box.style.setProperty('--htpk-right', opts.right);
    if (opts.font) box.style.setProperty('--htpk-font', opts.font);
    if (opts.bottom) box.style.setProperty('--htpk-bottom', opts.bottom);
    if (opts.position && opts.position !== 'top-right') box.classList.add(opts.position);
    document.body.appendChild(box);
    const queue = [];
    let showing = null, timer = null;
    const reduced = opts.reducedMotion != null ? opts.reducedMotion
      : typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    function render(card) {
      box.replaceChildren();
      const ic = document.createElement('div'); ic.className = 'ic';
      const isBadge = card.kind === 'badge';
      const def = isBadge ? Rewards.badgeById[card.id] : Concepts.byId[card.id];
      ic.appendChild(icon(def.icon, 26));
      const k = document.createElement('div'); k.className = 'k'; k.textContent = KICKER[card.kind];
      const t = document.createElement('div'); t.className = 't'; t.textContent = def.title.toUpperCase();
      const d = document.createElement('div'); d.className = 'd'; d.textContent = isBadge ? def.description : def.shortDescription;
      const x = document.createElement('div'); x.className = 'x';
      x.textContent = (card.xp ? '+' + card.xp + ' LEARNING XP · ' : '') + (isBadge ? 'SAVED TO ACHIEVEMENTS' : 'REVIEW IT IN THE KNOWLEDGE VAULT');
      box.append(ic, k, t, d);
      // SECURITY INSIGHT: what you did and what really happened (from game state).
      if (card.insight && card.insight.action && !isBadge) {
        const ins = document.createElement('div'); ins.className = 'ins';
        const line = (label, v) => { const r = document.createElement('div'); const b = document.createElement('b'); b.textContent = label + ' '; r.append(b, document.createTextNode(v)); ins.append(r); };
        line('YOUR ACTION', card.insight.action);
        if (card.insight.outcome) line('RESULT', card.insight.outcome);
        box.append(ins);
      }
      box.append(x);
      box.className = 'htpk-unlock k-' + card.kind + (opts.position && opts.position !== 'top-right' ? ' ' + opts.position : '');
      box.classList.toggle('anim', !reduced);
      box.hidden = false;
    }
    function next() {
      if (showing || !queue.length) return;
      if (opts.isBusy && opts.isBusy()) return;               // wait for a safe moment
      showing = queue.shift();
      render(showing);
      if (opts.sound && prefs().rewardSounds) {
        try { opts.sound(showing.kind === 'excellence' ? 'mastered' : showing.kind); } catch (e) { /* sound is optional */ }
      }
      const ms = (showing.insight ? 4600 : 2800) + (reduced ? 400 : 0);
      timer = setTimeout(() => { showing = null; box.hidden = true; box.classList.remove('anim'); next(); }, ms);
    }
    // If play turns intense while a card is up (a race resumes), the card
    // gets out of the way at once; it is always reviewable in the Vault.
    function hideIfBusy() {
      if (showing && opts.isBusy && opts.isBusy()) {
        clearTimeout(timer); showing = null; box.hidden = true; box.classList.remove('anim');
      }
    }
    const poll = setInterval(() => { hideIfBusy(); next(); }, 150);
    return {
      // insightOf(conceptId) → the stored insight for that concept, if any.
      push(changes, insightOf) {
        for (const c of cardsFor(changes || [])) {
          if (insightOf && c.kind !== 'badge' && c.kind !== 'discovered') c.insight = insightOf(c.id) || null;
          queue.push(c);
        }
        next();
      },
      pending: () => queue.length + (showing ? 1 : 0),
      clear() { queue.length = 0; clearTimeout(timer); showing = null; box.hidden = true; },
      dispose() { clearInterval(poll); clearTimeout(timer); box.remove(); },
      element: box,
    };
  }

  // One call from a level: record the report, queue whatever it unlocked.
  function reporter(notifier) {
    return input => {
      const res = Progress.record(input);
      if (notifier && res.changes.length) notifier.push(res.changes, id => res.state.concepts[id] && res.state.concepts[id].insight);
      return res;
    };
  }

  // ── Vault (Mission Hub) ──
  const STATUS = {
    locked: { label: 'UNDISCOVERED', mark: '◇', pips: 0 },
    discovered: { label: 'DISCOVERED', mark: '◆', pips: 1 },
    understood: { label: 'UNDERSTOOD', mark: '✓', pips: 2 },
    mastered: { label: 'MASTERED', mark: '★', pips: 3 },
  };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const catLabel = id => (Concepts.CATEGORIES.find(c => c.id === id) || {}).label || id;
  const levelCode = n => 'MISSION 0' + n;

  // opts.levels: HTPProgress.LEVELS; opts.unlocked: ids the player can open;
  // opts.challengeUrl(challengeId) → where a challenge is played.
  function renderVault(host, opts = {}) {
    const state = Progress.load();
    const sum = Progress.summary(state);
    const levels = opts.levels || [];
    const unlocked = opts.unlocked || [];
    const challengeUrl = opts.challengeUrl || (id => 'mastery.html?c=' + encodeURIComponent(id));
    const levelOf = n => levels.find(x => x.id === n);
    const levelName = n => { const l = levelOf(n); return l ? l.code + ' · ' + l.name : levelCode(n); };
    const Ch = (typeof HTPKnowledge !== 'undefined' && HTPKnowledge.Challenges) || null;
    host.replaceChildren();

    const stats = el('div', 'kv-stats');
    const stat = (k, v, of) => { const s = el('div', 'kv-stat'); s.append(el('span', 'kv-num', v + (of != null ? '/' + of : '')), el('span', 'kv-k', k)); stats.append(s); };
    stat('DISCOVERED', sum.discovered, sum.total);
    stat('UNDERSTOOD', sum.understood, sum.total);
    stat('MASTERED', sum.mastered, sum.masterable);
    stat('LEARNING XP', sum.xp);
    stat('BADGES', sum.badges, sum.badgesTotal);
    host.append(stats);
    host.append(el('p', 'kv-note', 'XP and badges reflect what you did in these games — not real-world competence.'));

    const rv = Progress.review(state, unlocked);

    // CONTINUE LEARNING — one deterministic recommendation.
    const cont = el('section', 'kv-continue');
    cont.setAttribute('aria-label', 'Continue learning');
    cont.append(el('h3', '', 'CONTINUE LEARNING'));
    if (rv.next) {
      const n = rv.next;
      const concept = n.conceptId && Concepts.byId[n.conceptId];
      if (concept) { const ic = el('span', 'kv-ic'); ic.append(icon(concept.icon, 30)); cont.append(ic); }
      const body = el('div');
      body.append(el('div', 'kv-ctitle', concept ? concept.title : levelName(n.level)), el('div', 'kv-why', n.why));
      const a = el('a', 'kv-go');
      if (n.type === 'challenge') { const ch = Ch && Ch.byId[n.challenge]; a.textContent = (/Optional review/.test(n.why) ? 'REPLAY ' : 'START ') + (ch ? ch.title : 'CHALLENGE') + ' >'; a.href = challengeUrl(n.challenge); }
      else { const l = levelOf(n.level); a.textContent = 'PLAY ' + (l ? l.code + ' · ' + l.name : levelCode(n.level)) + ' >'; a.href = l ? l.url : '#'; }
      body.append(a);
      cont.append(body);
    } else cont.append(el('p', 'kv-why', 'Unlock a mission in the campaign to start discovering concepts.'));
    host.append(cont);

    // WHAT YOU KNOW · WHAT YOU CAN PRACTISE
    const review = el('section', 'kv-review');
    review.setAttribute('aria-label', 'Learning review');
    const col = (title, items) => { const c = el('div', 'kv-col'); c.append(el('h3', '', title)); const ul = el('ul'); items.forEach(i => ul.append(i)); if (!items.length) ul.append(el('li', 'kv-empty', '—')); c.append(ul); review.append(c); };
    col('WHAT YOU KNOW', rv.know.map(k => el('li', '', STATUS[k.status].mark + ' ' + Concepts.byId[k.id].title + ' — ' + STATUS[k.status].label.toLowerCase())));
    const work = new Map(rv.needsWork.map(n => [n.id, n.why]));
    col('WHAT YOU CAN PRACTISE', rv.practise.slice(0, 6).map(p => {
      const li = el('li');
      li.append(el('b', '', (work.has(p.id) ? '⚠ ' : '') + Concepts.byId[p.id].title), document.createTextNode(' — ' + (work.get(p.id) || p.why) +
        (p.levels.length ? ' Try ' + p.levels.map(levelCode).join(' or ') + '.' : '')));
      return li;
    }));
    host.append(review);

    const grid = (ids, label) => {
      const ul = el('ul', 'kv-grid');
      ul.setAttribute('aria-label', label);
      for (const id of ids) ul.append(card(Concepts.byId[id]));
      return ul;
    };
    function card(c) {
      const st = Progress.status(state, c.id);
      const li = el('li');
      const b = el('button', 'kv-card');
      b.type = 'button';
      b.dataset.status = st;
      b.dataset.concept = c.id;
      const ic = el('span', 'kv-ic'); ic.append(icon(st === 'locked' ? 'cloud' : c.icon, 30));
      if (st === 'locked') ic.classList.add('locked');
      const title = st === 'locked' ? 'UNDISCOVERED CONCEPT' : c.title;
      const pips = el('span', 'kv-pips');
      pips.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) pips.append(el('i', i < STATUS[st].pips ? 'on' : ''));
      const excellent = state.concepts[c.id] && state.concepts[c.id].excellenceAt;
      b.append(ic, el('span', 'kv-title', title), el('span', 'kv-cat', catLabel(c.category)),
        el('span', 'kv-status s-' + st, STATUS[st].mark + ' ' + STATUS[st].label + (excellent ? ' · EXCELLENCE' : '')), pips,
        el('span', 'kv-lv', c.relatedLevels.map(n => '0' + n).join(' · ') + (c.mastery === 'challenge' && st !== 'locked' ? ' · CHALLENGE' : '')));
      b.setAttribute('aria-label', title + ', ' + catLabel(c.category) + ', ' + STATUS[st].label + (excellent ? ' with excellence' : '') + ', missions ' + c.relatedLevels.join(' and '));
      b.onclick = () => openDetail(c.id, b);
      li.append(b);
      return li;
    }

    // NEEDS PRACTICE — concepts with something left to do.
    const practiseIds = rv.practise.map(p => p.id);
    if (practiseIds.length) { host.append(el('h3', 'kv-sec', 'NEEDS PRACTICE')); host.append(grid(practiseIds, 'Concepts to practise')); }
    // MASTERED — the collection.
    if (rv.mastered.length) { host.append(el('h3', 'kv-sec', 'MASTERED CONCEPTS')); host.append(grid(rv.mastered.map(m => m.id), 'Mastered concepts')); }

    // ALL CONCEPTS — with a category filter.
    host.append(el('h3', 'kv-sec', 'ALL CONCEPTS'));
    const filter = el('div', 'kv-filter');
    filter.setAttribute('role', 'group');
    filter.setAttribute('aria-label', 'Filter concepts by category');
    const all = el('ul', 'kv-grid');
    all.setAttribute('aria-label', 'All concept cards');
    all.id = 'kv-all';
    let current = 'all';
    const draw = () => {
      all.replaceChildren();
      for (const c of Concepts.CONCEPTS) if (current === 'all' || c.category === current) all.append(card(c));
    };
    for (const cat of [{ id: 'all', label: 'ALL' }].concat(Concepts.CATEGORIES)) {
      const fb = el('button', 'kv-fbtn', cat.label);
      fb.type = 'button';
      fb.setAttribute('aria-pressed', String(cat.id === current));
      fb.onclick = () => { current = cat.id; for (const x of filter.children) x.setAttribute('aria-pressed', String(x === fb)); draw(); };
      filter.append(fb);
    }
    host.append(filter, all);
    draw();

    // Detail dialog (native <dialog>: Esc closes, focus returns to the card)
    let dlg = document.getElementById('kv-detail');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'kv-detail'; dlg.className = 'kv-dialog'; dlg.setAttribute('aria-labelledby', 'kv-detail-title'); document.body.appendChild(dlg); }
    function openDetail(id, opener) {
      const c = Concepts.byId[id];
      const st = Progress.status(state, id);
      const cs = state.concepts[id];
      dlg.replaceChildren();
      const head = el('div', 'kv-dhead');
      const ic = el('span', 'kv-ic'); ic.append(icon(st === 'locked' ? 'cloud' : c.icon, 40));
      const h = el('h2', '', st === 'locked' ? 'UNDISCOVERED CONCEPT' : c.title);
      h.id = 'kv-detail-title';
      const hs = el('div'); hs.append(el('div', 'kv-cat', catLabel(c.category) + ' · ' + c.relatedLevels.map(levelCode).join(' · ')), h,
        el('div', 'kv-status s-' + st, STATUS[st].mark + ' ' + STATUS[st].label + (cs && cs.excellenceAt ? ' · EXCELLENCE' : '')));
      head.append(ic, hs);
      dlg.append(head);
      const sec = (k, v) => { const p = el('p'); p.append(el('b', '', k + ' '), document.createTextNode(v)); return p; };
      if (st === 'locked') {
        dlg.append(el('p', '', c.lockedHint), el('p', 'kv-muted', 'Play the missions listed above to discover it. Its details stay hidden until then, so nothing is spoiled.'));
      } else {
        dlg.append(sec('WHAT IT MEANS', c.shortDescription));
        // Where, evidence, action, result — newest first, one per scenario.
        const ev = (cs && cs.evidence) || [];
        const ins = cs && cs.insight;
        const where = el('section', 'kv-where');
        const seen = new Set();
        for (const e of ev.slice().reverse()) {
          if (seen.has(e.source)) continue;
          seen.add(e.source);
          const src = Events.SOURCES[e.source];
          const ok = e.type === 'knowledge.understood';
          const box = el('div', 'kv-ev');
          box.append(el('div', 'kv-evh', (src.context === 'challenge' ? 'MASTERY CHALLENGE · ' + src.scenario : src.scenario + ' — ' + levelName(src.level))));
          box.append(sec('EVIDENCE YOU OBSERVED', src.evidence));
          const insHere = ins && ins.source === e.source ? ins : null;
          box.append(sec('ACTION YOU TOOK', insHere && insHere.action ? insHere.action : ok ? src.did : 'A decision that did not hold up — the report explains why.'));
          box.append(sec('WHAT HAPPENED', (insHere && insHere.outcome ? insHere.outcome + ' · ' : '') + (ok ? (e.firstTry ? 'right first time' : 'right after feedback') : 'not applied correctly yet') + (e.guided ? ' · guided' : '')));
          where.append(box);
        }
        if (!where.children.length) where.append(el('p', 'kv-muted', 'Discovered — no decision recorded yet.'));
        const whereD = el('details'); whereD.open = true;
        whereD.append(el('summary', '', 'WHERE YOU ENCOUNTERED IT'), where);
        const why = el('details');
        why.append(el('summary', '', 'WHY IT MATTERS'), el('p', '', c.detailedExplanation));
        const world = el('details');
        world.append(el('summary', '', 'REAL-WORLD APPLICATION · WHAT TO VERIFY'), sec('APPLICATION', c.realWorldApplication), sec('WHAT TO VERIFY', c.verificationGuidance));
        dlg.append(whereD, why, world);
      }
      // PRACTICE / MASTERY
      const m = el('section', 'kv-mastery');
      m.append(el('h3', '', 'PRACTICE / MASTERY'));
      const ch = c.mastery === 'challenge' && Ch ? Ch.byId[c.challenge] : null;
      const chs = ch && state.challenges[ch.id];
      if (ch) {
        if (st === 'mastered') {
          m.append(el('div', 'kv-mstate', '★ MASTERED'), el('p', 'kv-muted', ch.title + ' — ' + ch.setting));
          const a = el('a', 'btn kv-cta', 'REPLAY CHALLENGE'); a.href = challengeUrl(ch.id); m.append(a);
        } else if (st === 'understood') {
          m.append(el('div', 'kv-mstate', 'MASTERY CHALLENGE AVAILABLE'), el('p', '', 'Apply what you learned in a new scenario: ' + ch.title + ' (' + ch.minutes + ' min).'));
          const a = el('a', 'btn kv-cta', 'START CHALLENGE'); a.href = challengeUrl(ch.id); a.id = 'kv-start-challenge'; m.append(a);
        } else {
          m.append(el('div', 'kv-mstate', 'FIRST, UNDERSTAND THIS CONCEPT'));
          const lvl = c.relatedLevels.find(n => unlocked.includes(n));
          if (lvl) { const a = el('a', 'btn kv-cta', 'GO TO ' + levelName(lvl) + ' >'); a.href = levelOf(lvl).url; m.append(a); }
          else m.append(el('p', 'kv-muted', 'Its mission is not unlocked yet.'));
        }
        if (chs && chs.attempts) m.append(el('p', 'kv-muted', 'Challenge attempts: ' + chs.attempts + ' · passed ' + chs.passes + ' · first attempt: ' + (chs.firstAttempt === 'pass' ? 'passed' : 'not passed') + (chs.hintsUsed ? ' · hints used ' + chs.hintsUsed : '')));
      } else if (st !== 'locked') {
        const pr = rv.practise.find(p => p.id === id);
        if (st === 'mastered') m.append(el('div', 'kv-mstate', '★ MASTERED'), el('p', 'kv-muted', 'You applied it first time, unguided, in a new context.'));
        else if (pr && pr.levels.length) {
          m.append(el('div', 'kv-mstate', st === 'understood' ? 'MASTER IT IN ANOTHER MISSION' : 'FIRST, UNDERSTAND THIS CONCEPT'), el('p', '', pr.why));
          const lvl = pr.levels[0];
          const a = el('a', 'btn kv-cta', 'GO TO ' + levelName(lvl) + ' >'); a.href = levelOf(lvl) ? levelOf(lvl).url : '#'; m.append(a);
        } else m.append(el('p', 'kv-muted', 'Play the related missions to practise it.'));
      }
      if (st !== 'locked') m.append(sec('MASTERED WHEN', c.masteryCriteria));
      dlg.append(m);
      if (st !== 'locked') {
        const objectives = el('details');
        objectives.append(el('summary', '', 'LEARNING OBJECTIVES'));
        const ol = el('ul'); c.learningObjectives.forEach(o => ol.append(el('li', '', o))); objectives.append(ol);
        dlg.append(objectives);
      }
      const close = el('button', 'btn', 'CLOSE');
      close.type = 'button';
      close.onclick = () => dlg.close();
      const row = el('div', 'actions'); row.append(close);
      dlg.append(row);
      dlg.onclose = () => { if (opener && opener.isConnected) opener.focus(); };
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      close.focus();
    }
    return { state, summary: sum, review: rv, openDetail };
  }

  function renderAchievements(host) {
    const state = Progress.load();
    host.replaceChildren();
    const ul = el('ul', 'kv-badges');
    for (const b of Rewards.BADGES) {
      const got = state.badges[b.id];
      const li = el('li', 'kv-badge' + (got ? ' earned' : ''));
      li.dataset.badge = b.id;
      const ic = el('span', 'kv-medal'); ic.append(icon(b.icon, 30));
      const body = el('div');
      // The description says what was done, so it appears only once earned.
      body.append(el('div', 'kv-cat', levelCode(b.level)), el('h3', '', b.title), el('p', '', got ? b.description : 'Locked badge.'),
        el('div', 'kv-status ' + (got ? 's-understood' : 's-locked'), got ? '✓ EARNED · ' + new Date(got.unlockedAt).toLocaleDateString() : '◇ NOT YET'),
        el('p', 'kv-muted', 'How to earn it: ' + b.requirements));
      li.append(ic, body);
      ul.append(li);
    }
    host.append(ul);
    host.append(el('p', 'kv-note', 'Badges are earned from specific decisions, never from finishing a mission alone.'));
  }

  return { GLYPH, icon, CUES, playCue, createNotifier, cardsFor, reporter, renderVault, renderAchievements, STATUS, prefs, setPref, PREFS_KEY };
});
