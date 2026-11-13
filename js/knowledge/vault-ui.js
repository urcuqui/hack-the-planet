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
  .htpk-unlock .ic { grid-row: span 4; color: var(--htpk-accent, #72DCEB); width: 44px; height: 44px; display: grid; place-items: center;
    border: 1px solid currentColor; border-radius: 50%; }
  .htpk-unlock .k { font-size: 11px; letter-spacing: 3px; color: var(--htpk-accent, #72DCEB); }
  .htpk-unlock .t { font-size: 15px; letter-spacing: 1px; font-weight: bold; line-height: 1.25; }
  .htpk-unlock .d { font-size: 12px; line-height: 1.45; color: rgba(244,247,255,0.82); }
  .htpk-unlock .x { font-size: 11px; letter-spacing: 2px; color: rgba(244,247,255,0.7); }
  .htpk-unlock.anim { animation: htpkIn 0.35s ease-out; }
  .htpk-unlock.anim .ic { animation: htpkPulse 1.1s ease-out 0.15s; }
  @keyframes htpkIn { from { transform: translateY(-10px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes htpkPulse { 0% { box-shadow: 0 0 0 0 var(--htpk-accent, #72DCEB); } 100% { box-shadow: 0 0 0 14px transparent; } }
  @media (prefers-reduced-motion: reduce) { .htpk-unlock.anim, .htpk-unlock.anim .ic { animation: none; } }
  `;
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('htpk-css')) return;
    const st = document.createElement('style');
    st.id = 'htpk-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const KICKER = { discovered: 'KNOWLEDGE UNLOCKED', understood: 'CONCEPT UNDERSTOOD', mastered: 'CONCEPT MASTERED', badge: 'BADGE EARNED' };

  // Merges one batch of changes into cards: a concept discovered and
  // understood at once shows as one UNDERSTOOD card worth both rewards.
  function cardsFor(changes) {
    const byId = new Map(), cards = [];
    for (const ch of changes) {
      if (ch.kind === 'badge') { cards.push({ kind: 'badge', id: ch.id, xp: 0 }); continue; }
      const prev = byId.get(ch.id);
      const rank = { discovered: 0, understood: 1, mastered: 2 };
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
      x.textContent = (card.xp ? '+' + card.xp + ' LEARNING XP · ' : '') + (isBadge ? 'SAVED TO ACHIEVEMENTS' : 'ADDED TO KNOWLEDGE VAULT');
      box.append(ic, k, t, d, x);
      box.classList.toggle('anim', !reduced);
      box.hidden = false;
    }
    function next() {
      if (showing || !queue.length) return;
      if (opts.isBusy && opts.isBusy()) return;               // wait for a safe moment
      showing = queue.shift();
      render(showing);
      if (opts.sound) { try { opts.sound(showing.kind); } catch (e) { /* sound is optional */ } }
      timer = setTimeout(() => { showing = null; box.hidden = true; box.classList.remove('anim'); next(); }, reduced ? 3200 : 2800);
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
      push(changes) { for (const c of cardsFor(changes || [])) queue.push(c); next(); },
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
      if (notifier && res.changes.length) notifier.push(res.changes);
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

  // opts.levels: HTPProgress.LEVELS; opts.unlocked: ids the player can open.
  function renderVault(host, opts = {}) {
    const state = Progress.load();
    const sum = Progress.summary(state);
    const levels = opts.levels || [];
    const levelName = n => { const l = levels.find(x => x.id === n); return l ? l.code + ' · ' + l.name : levelCode(n); };
    host.replaceChildren();

    const stats = el('div', 'kv-stats');
    const stat = (k, v, of) => { const s = el('div', 'kv-stat'); s.append(el('span', 'kv-num', v + (of != null ? '/' + of : '')), el('span', 'kv-k', k)); stats.append(s); };
    stat('DISCOVERED', sum.discovered, sum.total);
    stat('UNDERSTOOD', sum.understood, sum.total);
    stat('MASTERED', sum.mastered, sum.masterable);
    stat('LEARNING XP', sum.xp);
    stat('BADGES', sum.badges, sum.badgesTotal);
    host.append(stats);
    host.append(el('p', 'kv-note', 'MASTERED counts only concepts that have an independent scenario to prove it in. XP and badges reflect what you did in these games — not real-world competence.'));

    // Learning review
    const rv = Progress.review(state, opts.unlocked);
    const review = el('section', 'kv-review');
    review.setAttribute('aria-label', 'Learning review');
    const col = (title, items) => { const c = el('div', 'kv-col'); c.append(el('h3', '', title)); const ul = el('ul'); items.forEach(i => ul.append(i)); if (!items.length) ul.append(el('li', 'kv-empty', '—')); c.append(ul); review.append(c); };
    col('CONCEPTS MASTERED', rv.mastered.map(m => el('li', '', '★ ' + Concepts.byId[m.id].title)));
    col('CONCEPTS TO PRACTISE', rv.practise.slice(0, 5).map(p => {
      const li = el('li');
      li.append(el('b', '', Concepts.byId[p.id].title), document.createTextNode(' — ' + p.why + (p.levels.length ? ' Try ' + p.levels.map(levelCode).join(' or ') + '.' : '')));
      return li;
    }));
    const nextItems = [];
    if (rv.next) {
      const li = el('li');
      const lvl = levels.find(l => l.id === rv.next.level);
      if (lvl) { const a = el('a', 'kv-link', 'PLAY ' + lvl.code + ' · ' + lvl.name + ' >'); a.href = lvl.url; li.append(a); }
      li.append(el('div', 'kv-why', rv.next.why));
      nextItems.push(li);
    }
    col('NEXT LEARNING OPPORTUNITY', nextItems);
    host.append(review);

    // Recent unlocks
    if (state.recent.length) {
      const rec = el('div', 'kv-recent');
      rec.append(el('span', 'kv-k', 'RECENTLY UNLOCKED '));
      for (const r of state.recent.slice().reverse().slice(0, 5)) {
        const def = r.kind === 'badge' ? Rewards.badgeById[r.id] : Concepts.byId[r.id];
        if (def) rec.append(el('span', 'kv-chip', (r.kind === 'badge' ? '◎ ' : STATUS[r.kind === 'discovered' ? 'discovered' : r.kind].mark + ' ') + def.title));
      }
      host.append(rec);
    }

    // Category filter
    const filter = el('div', 'kv-filter');
    filter.setAttribute('role', 'group');
    filter.setAttribute('aria-label', 'Filter concepts by category');
    const grid = el('ul', 'kv-grid');
    grid.setAttribute('aria-label', 'Concept cards');
    let current = 'all';
    const draw = () => {
      grid.replaceChildren();
      for (const c of Concepts.CONCEPTS) {
        if (current !== 'all' && c.category !== current) continue;
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
        b.append(ic, el('span', 'kv-title', title), el('span', 'kv-cat', catLabel(c.category)),
          el('span', 'kv-status s-' + st, STATUS[st].mark + ' ' + STATUS[st].label), pips,
          el('span', 'kv-lv', c.relatedLevels.map(n => '0' + n).join(' · ')));
        b.setAttribute('aria-label', title + ', ' + catLabel(c.category) + ', ' + STATUS[st].label + ', missions ' + c.relatedLevels.join(' and '));
        b.onclick = () => openDetail(c.id, b);
        li.append(b);
        grid.append(li);
      }
    };
    for (const cat of [{ id: 'all', label: 'ALL' }].concat(Concepts.CATEGORIES)) {
      const fb = el('button', 'kv-fbtn', cat.label);
      fb.type = 'button';
      fb.setAttribute('aria-pressed', String(cat.id === current));
      fb.onclick = () => { current = cat.id; for (const x of filter.children) x.setAttribute('aria-pressed', String(x === fb)); draw(); };
      filter.append(fb);
    }
    host.append(filter, grid);
    draw();

    // Detail dialog (native <dialog>: Esc closes and focus returns)
    let dlg = document.getElementById('kv-detail');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'kv-detail'; dlg.className = 'kv-dialog'; dlg.setAttribute('aria-labelledby', 'kv-detail-title'); document.body.appendChild(dlg); }
    function openDetail(id, opener) {
      const c = Concepts.byId[id];
      const st = Progress.status(state, id);
      dlg.replaceChildren();
      const head = el('div', 'kv-dhead');
      const ic = el('span', 'kv-ic'); ic.append(icon(st === 'locked' ? 'cloud' : c.icon, 40));
      const h = el('h2', '', st === 'locked' ? 'UNDISCOVERED CONCEPT' : c.title);
      h.id = 'kv-detail-title';
      const hs = el('div'); hs.append(el('div', 'kv-cat', catLabel(c.category) + ' · ' + c.relatedLevels.map(levelCode).join(' · ')), h, el('div', 'kv-status s-' + st, STATUS[st].mark + ' ' + STATUS[st].label));
      head.append(ic, hs);
      dlg.append(head);
      if (st === 'locked') {
        dlg.append(el('p', '', c.lockedHint), el('p', 'kv-muted', 'Play the missions listed above to discover it. Its details stay hidden until then, so nothing is spoiled.'));
      } else {
        const sec = (k, v) => { const p = el('p'); p.append(el('b', '', k + ' '), document.createTextNode(v)); return p; };
        dlg.append(sec('WHAT IT MEANS', c.shortDescription), sec('WHY IT MATTERS', c.detailedExplanation));
        const ev = (state.concepts[id] && state.concepts[id].evidence) || [];
        const met = el('details'); met.open = true;
        met.append(el('summary', '', 'WHERE YOU MET IT'));
        const ul = el('ul');
        const seen = new Set();
        for (const e of ev.slice().reverse()) {
          if (seen.has(e.source)) continue;
          seen.add(e.source);
          const s = Events.SOURCES[e.source];
          const ok = e.type === 'knowledge.understood';
          const li = el('li');
          li.append(el('b', '', s.scenario + ' — ' + levelName(s.level)));
          li.append(el('div', '', 'Evidence: ' + s.evidence));
          li.append(el('div', '', ok ? 'What you did: ' + s.did : 'What you did: a decision that did not hold up — the mission\'s report explains why.'));
          li.append(el('div', 'kv-muted', 'What happened: ' + (ok ? (e.firstTry ? 'right first time' : 'right after feedback') : 'not yet applied correctly') +
            (e.guided ? ' · guided' : '') + ' · ' + new Date(e.at).toLocaleDateString()));
          ul.append(li);
        }
        if (!ul.children.length) ul.append(el('li', 'kv-muted', 'Discovered — no decision recorded yet.'));
        met.append(ul);
        const world = el('details');
        world.append(el('summary', '', 'IN THE REAL WORLD'), sec('APPLICATION', c.realWorldApplication), sec('WHAT TO VERIFY', c.verificationGuidance));
        const mastery = el('details');
        mastery.append(el('summary', '', 'MASTERY'));
        mastery.append(sec('UNDERSTOOD WHEN', c.understandingCriteria), sec('MASTERED WHEN', c.masteryCriteria));
        const pr = rv.practise.find(p => p.id === id);
        if (st === 'mastered') mastery.append(el('p', 'kv-muted', 'Mastered: you applied it first time, unguided, in a new context.'));
        else if (c.mastery === 'none') mastery.append(el('p', 'kv-muted', 'No independent mastery scenario exists yet, so this concept stays at UNDERSTOOD.'));
        else if (pr && pr.levels.length) mastery.append(el('p', '', 'Available challenge: ' + pr.levels.map(levelName).join(' or ') + '.'));
        const objectives = el('details');
        objectives.append(el('summary', '', 'LEARNING OBJECTIVES'));
        const ol = el('ul'); c.learningObjectives.forEach(o => ol.append(el('li', '', o))); objectives.append(ol);
        dlg.append(met, world, mastery, objectives);
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
    return { state, summary: sum, openDetail };
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

  return { GLYPH, icon, CUES, playCue, createNotifier, cardsFor, reporter, renderVault, renderAchievements, STATUS };
});
