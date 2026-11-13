// HACK THE PLANET — learning XP and specialist badges.
//
// XP is derived from milestones (never incremented), so it cannot be farmed:
// each concept pays once for DISCOVERED, once for UNDERSTOOD and once for
// MASTERED. Badges are explicit predicates over recorded evidence; none is
// awarded for simply finishing a mission.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPKnowledge = root.HTPKnowledge || {}).Rewards = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const XP = { discovered: 25, understood: 75, mastered: 150 };

  // ev(state, source) → the best recorded evidence for a source, or null.
  // A badge's sourceEvidence lists the sources that satisfied it.
  const BADGES = [
    {
      id: 'agent-containment-specialist', level: 1, icon: 'star-key',
      title: 'AGENT CONTAINMENT SPECIALIST',
      description: 'Restricted a rogue agent\'s tool call to its role and scope in FSYNDICATE.',
      requirements: 'Handle the Enforcer\'s tool request at the Sheriff\'s Office terminal correctly.',
      check: ev => (ev('L1:enforcer', { accepted: true }) ? ['L1:enforcer'] : null),
    },
    {
      id: 'ai-security-investigator', level: 2, icon: 'star-lens',
      title: 'AI SECURITY INVESTIGATOR',
      description: 'Diagnosed and verified at least four AI Incident Lab incidents right first time.',
      requirements: 'Verify at least 4 of the 6 lab incidents with no wrong diagnosis and no failed verification.',
      check: ev => {
        const ids = ['L2:injector', 'L2:poisoner', 'L2:invertor', 'L2:adversar', 'L2:biasbot', 'L2:hallucin'].filter(id => ev(id, { accepted: true, firstTry: true }));
        return ids.length >= 4 ? ids : null;
      },
    },
    {
      id: 'identity-detective', level: 3, icon: 'star-badge',
      title: 'IDENTITY DETECTIVE',
      description: 'Told verified identities from claimed ones, first time, in Operation Ghost.',
      requirements: 'Solve MARCUS\'s identity analysis and response first time, and CIPHER\'s identity step first time.',
      check: ev => (ev('L3:marcus', { accepted: true, firstTry: true }) && ev('L3:cipher-identities', { accepted: true, firstTry: true })
        ? ['L3:marcus', 'L3:cipher-identities'] : null),
    },
    {
      id: 'safety-first-driver', level: 4, icon: 'star-flag',
      title: 'SAFETY-FIRST DRIVER',
      description: 'Made the safe call on all three AI decisions in Neon Grand Prix.',
      requirements: 'Make the safe call on all three AI decisions in one race or across races.',
      check: ev => {
        const ids = ['L4:prompt-injection', 'L4:sensor-spoofing', 'L4:agent-permissions'];
        return ids.every(id => ev(id, { accepted: true })) ? ids : null;
      },
    },
    {
      id: 'city-guardian', level: 5, icon: 'star-city',
      title: 'CITY GUARDIAN',
      description: 'Contained the cascade first time and restored the city without a critical failure.',
      requirements: 'Contain INC-05 correctly with your first response, then restore and verify all five incidents with no service falling to CRITICAL.',
      check: ev => (ev('L5:INC-05', { accepted: true, firstTry: true }) && ev('L5:city', { accepted: true }) ? ['L5:INC-05', 'L5:city'] : null),
    },
  ];
  const badgeById = Object.fromEntries(BADGES.map(b => [b.id, b]));

  return { XP, BADGES, badgeById };
});
