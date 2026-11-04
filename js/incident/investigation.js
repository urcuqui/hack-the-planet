// Vulnerability Hunter — AI Incident Lab: the investigation state machine.
//   UNDISCOVERED → DETECTED → INVESTIGATING → DIAGNOSED → MITIGATION APPLIED → VERIFIED
//                                                       ↘ NEEDS REVIEW (failed verification) ↗
// A case only counts as resolved once verification passes. Wrong diagnoses
// and failed verifications cost integrity; looking at evidence or navigating
// never does. Pure logic (Node-testable).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cases.js'));
  else (root.HTPIncident = root.HTPIncident || {}).Investigation = factory(root.HTPIncident.Cases);
})(typeof self !== 'undefined' ? self : this, function (Cases) {
  'use strict';

  const PENALTY = 10;
  const STATUS_LABEL = {
    'undiscovered': 'UNDISCOVERED', 'detected': 'DETECTED', 'investigating': 'INVESTIGATING', 'diagnosed': 'DIAGNOSED',
    'mitigation-applied': 'MITIGATION APPLIED', 'verified': 'VERIFIED', 'needs-review': 'NEEDS REVIEW',
  };
  // Security status: an explicit, documented rule — not a real risk model.
  // Each open incident adds its severity weight (HIGH 2, MEDIUM 1; max 9).
  const WEIGHT = { HIGH: 2, MEDIUM: 1 };
  const STATUS_BANDS = [[7, 'CRITICAL'], [4, 'ELEVATED'], [1, 'GUARDED'], [0, 'STABILIZED']];

  function createLab(cases = Cases.CASES) {
    const lab = { integrity: 100, cases: {} };
    cases.forEach(c => {
      lab.cases[c.id] = {
        def: c, status: 'undiscovered', viewed: new Set(),
        diagnoseAttempts: 0, verifyAttempts: 0, selected: [], lastVerification: null, lastFeedback: null,
      };
    });
    const get = id => lab.cases[id];
    const penalize = () => { lab.integrity = Math.max(0, lab.integrity - PENALTY); };

    function detect(id) {
      const s = get(id);
      if (s.status === 'undiscovered') s.status = 'detected';
    }
    // Opening the analyzer needs an explicit action ([E]); proximity only detects.
    function open(id) {
      const s = get(id);
      if (s.status === 'undiscovered' || s.status === 'detected') s.status = 'investigating';
      return s;
    }
    function viewEvidence(id, evId) {
      const s = get(id);
      if (s.def.evidence.some(e => e.id === evId)) s.viewed.add(evId);
    }
    const canDiagnose = id => get(id).viewed.size >= get(id).def.minEvidence && get(id).status === 'investigating';

    function diagnose(id, answer) {
      const s = get(id);
      if (!canDiagnose(id)) return { ok: false, locked: true, feedback: ['Inspect more evidence first.'] };
      s.diagnoseAttempts++;
      const r = Cases.checkDiagnosis(s.def, answer);
      if (r.ok) { s.status = 'diagnosed'; s.lastFeedback = null; return { ok: true, revealed: s.def.diagnose.revealed }; }
      penalize();
      s.lastFeedback = r.feedback;
      return { ok: false, feedback: r.feedback, penalty: PENALTY };
    }

    function applyMitigation(id, selected) {
      const s = get(id);
      if (!['diagnosed', 'needs-review', 'mitigation-applied'].includes(s.status)) return false;
      const ids = selected.filter(x => s.def.mitigation.options.some(o => o.id === x)).slice(0, s.def.mitigation.max);
      if (!ids.length) return false;
      s.selected = ids;
      s.status = 'mitigation-applied';
      return true;
    }

    // Verification replays the incident against the applied controls.
    function verify(id) {
      const s = get(id);
      if (s.status !== 'mitigation-applied') return null;
      s.verifyAttempts++;
      const r = Cases.evaluateMitigation(s.def, s.selected);
      s.lastVerification = r;
      if (r.pass) s.status = 'verified';
      else { s.status = 'needs-review'; penalize(); }
      return Object.assign({ penalty: r.pass ? 0 : PENALTY }, r);
    }

    const verifiedCount = () => Object.values(lab.cases).filter(s => s.status === 'verified').length;
    const openCases = () => Object.values(lab.cases).filter(s => s.status !== 'verified');
    function securityStatus() {
      const load = openCases().reduce((n, s) => n + WEIGHT[s.def.severity], 0);
      return { load, open: openCases().length, label: STATUS_BANDS.find(([min]) => load >= min)[1] };
    }
    const complete = () => verifiedCount() === cases.length;
    const defeated = () => lab.integrity <= 0 && !complete();

    // What the analyzer may show: the concept stays hidden until diagnosed.
    function publicView(id) {
      const s = get(id), c = s.def;
      const known = ['diagnosed', 'mitigation-applied', 'verified', 'needs-review'].includes(s.status);
      return {
        robot: c.robot, category: c.category, status: STATUS_LABEL[s.status], scenario: c.scenario, observed: c.observed,
        objective: objectiveFor(s), evidenceCount: c.evidence.length, viewed: s.viewed.size, minEvidence: c.minEvidence,
        concept: known ? c.concept : null, revealed: known ? c.diagnose.revealed : null,
      };
    }
    function objectiveFor(s) {
      switch (s.status) {
        case 'undiscovered': case 'detected': return 'Inspect the system with [E].';
        case 'investigating': return s.viewed.size < s.def.minEvidence ? s.def.objective + ' (inspect ' + s.def.minEvidence + ' pieces of evidence)' : 'Diagnose the incident from the evidence.';
        case 'diagnosed': return 'Choose the controls to apply.';
        case 'mitigation-applied': return 'Run the verification.';
        case 'needs-review': return 'Verification failed — review the evidence and adjust the controls.';
        default: return 'Verified.';
      }
    }

    function summary() {
      const list = Object.values(lab.cases);
      return {
        verified: verifiedCount(), total: list.length, integrity: lab.integrity,
        firstTryDiagnoses: list.filter(s => s.status === 'verified' && s.diagnoseAttempts === 1).length,
        firstTryMitigations: list.filter(s => s.status === 'verified' && s.verifyAttempts === 1).length,
      };
    }

    function report() {
      return Object.values(lab.cases).map(s => {
        const c = s.def;
        const controls = c.mitigation.options.filter(o => s.selected.includes(o.id)).map(o => o.label);
        return {
          id: c.id, robot: c.robot, concept: c.concept, knowledge: c.knowledge,
          status: STATUS_LABEL[s.status], verified: s.status === 'verified',
          happened: c.observed, evidence: c.diagnose.revealed,
          controls, check: s.lastVerification ? s.lastVerification.steps.join(' · ') : '—',
          residual: c.residual,
          diagnoseAttempts: s.diagnoseAttempts, verifyAttempts: s.verifyAttempts,
        };
      });
    }

    return Object.assign(lab, {
      get, detect, open, viewEvidence, canDiagnose, diagnose, applyMitigation, verify,
      verifiedCount, securityStatus, complete, defeated, publicView, summary, report,
    });
  }

  return { PENALTY, STATUS_LABEL, WEIGHT, STATUS_BANDS, createLab };
});
