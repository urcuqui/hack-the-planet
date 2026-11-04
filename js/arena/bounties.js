// FSYNDICATE — The Agentic Frontier: the Bounty Board. Three bounties in
// order; only one duel can be active; containing one unlocks the next.
// Three breaches (KUKY taken down) end the mission.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./agents.js'));
  else (root.HTPArena = root.HTPArena || {}).Bounties = factory(root.HTPArena.Agents);
})(typeof self !== 'undefined' ? self : this, function (Agents) {
  'use strict';

  const MAX_BREACHES = 3;

  function createBoard() {
    const status = {};
    Agents.ORDER.forEach((k, i) => { status[k] = i === 0 ? 'available' : 'locked'; });
    const b = { status, active: null, contained: 0, breaches: 0 };

    // Start the next duel. Refuses locked bounties and a second active duel.
    function start(kind) {
      if (b.active || status[kind] !== 'available') return false;
      status[kind] = 'in-progress';
      b.active = kind;
      return true;
    }

    // The active agent was neutralized: contain it and unlock the next one.
    function contain() {
      const kind = b.active;
      if (!kind) return null;
      status[kind] = 'contained';
      b.active = null;
      b.contained++;
      const next = Agents.ORDER[Agents.ORDER.indexOf(kind) + 1];
      if (next && status[next] === 'locked') status[next] = 'available';
      return next || null;
    }

    function breach() {
      b.breaches++;
      return b.breaches >= MAX_BREACHES;
    }

    const nextAvailable = () => Agents.ORDER.find(k => status[k] === 'available') || null;
    const complete = () => b.contained >= Agents.ORDER.length;

    return Object.assign(b, { start, contain, breach, nextAvailable, complete });
  }

  return { MAX_BREACHES, createBoard };
});
