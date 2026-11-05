// Operation Ghost: investigation state, case files and the CIPHER finale.
// Each case moves through OBSERVE → TALK → INSPECT → DECIDE → LEARN; an intel
// file is filed once, when LEARN is acknowledged. CIPHER stays LOCKED until
// all five files are in, and the mission is complete only when the final
// analysis is. Mistakes cost nothing but are counted, so the report can say
// how many calls were right first time. Pure logic, testable in Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cases.js'));
  else (root.HTPSocial = root.HTPSocial || {}).Intel = factory(root.HTPSocial.Cases);
})(typeof self !== 'undefined' ? self : this, function (Cases) {
  'use strict';

  const STEPS = ['observe', 'talk', 'inspect', 'decide', 'learn'];
  const REQUIRED = Cases.CASES.length;

  function createOperation() {
    const cases = {};
    Cases.CASES.forEach(c => {
      cases[c.id] = { status: 'available', step: null, asked: [], evidence: [], inspectTries: 0, decideTries: 0,
        inspectFirst: null, decideFirst: null, decision: null, lastFeedback: null, filedAt: null };
    });
    const op = {
      cases, files: [], active: Cases.CASES[0].id,
      cipher: { step: 0, tries: [], firstTry: [], done: false, answers: {} },
      completeRecorded: false,
    };

    const get = id => {
      if (!cases[id]) throw new Error('unknown case ' + id);
      return cases[id];
    };

    op.intelCount = () => op.files.length;
    op.cipherUnlocked = () => op.files.length >= REQUIRED;

    // Marker state for an NPC: AVAILABLE, ACTIVE, COMPLETED (CIPHER: LOCKED).
    op.markerState = id => {
      if (id === 'cipher') return op.cipher.done ? 'COMPLETED' : op.cipherUnlocked() ? (op.active === 'cipher' ? 'ACTIVE' : 'AVAILABLE') : 'LOCKED';
      const s = get(id);
      if (s.status === 'completed') return 'COMPLETED';
      return op.active === id ? 'ACTIVE' : 'AVAILABLE';
    };

    // The player picks which open case to pursue (any order).
    op.setActive = id => {
      if (id === 'cipher') { if (!op.cipherUnlocked() || op.cipher.done) return false; op.active = 'cipher'; return true; }
      if (get(id).status === 'completed') return false;
      op.active = id; return true;
    };
    // After a case closes, point at the next open one (or CIPHER).
    op.autoActive = () => {
      if (op.active === 'cipher' && !op.cipher.done) return;
      if (op.active && op.active !== 'cipher' && cases[op.active].status !== 'completed') return;
      const next = Cases.CASES.find(c => cases[c.id].status !== 'completed');
      op.active = next ? next.id : (op.cipher.done ? null : 'cipher');
    };

    // Opening a case starts it (or resumes where it was left).
    op.open = id => {
      const s = get(id);
      if (s.status === 'completed') return false;
      if (s.status === 'available') {
        s.status = 'active'; s.step = 'observe';
        s.evidence.push(Cases.byId(id).observe.evidence);
      }
      op.active = id;
      return true;
    };

    op.observed = id => { const s = get(id); if (s.step === 'observe') s.step = 'talk'; return s.step; };

    // Asking a question reveals its evidence (once).
    op.ask = (id, index) => {
      const s = get(id), c = Cases.byId(id), q = c.talk[index];
      if (!q || s.step !== 'talk' && s.step !== 'inspect') return null;
      if (!s.asked.includes(index)) { s.asked.push(index); if (!s.evidence.includes(q.evidence)) s.evidence.push(q.evidence); }
      if (s.asked.length === c.talk.length && s.step === 'talk') s.step = 'inspect';
      return q;
    };
    op.canInspect = id => get(id).step === 'inspect';

    op.inspect = (id, answer) => {
      const s = get(id);
      if (s.step !== 'inspect') return { ok: false, feedback: 'Talk to them first: you are missing evidence.', locked: true };
      const r = Cases.checkInspect(Cases.byId(id), answer);
      s.inspectTries++;
      if (s.inspectFirst === null) s.inspectFirst = r.ok;
      s.lastFeedback = r.feedback;
      if (r.ok) s.step = 'decide';
      return r;
    };

    op.decide = (id, optionId) => {
      const s = get(id);
      if (s.step !== 'decide') return { ok: false, outcome: 'Analyse the evidence first.', locked: true };
      const r = Cases.checkDecision(Cases.byId(id), optionId);
      s.decideTries++;
      if (s.decideFirst === null) s.decideFirst = r.ok;
      s.lastFeedback = r.outcome;
      if (r.ok) { s.step = 'learn'; s.decision = optionId; }
      return r;
    };

    // Acknowledging LEARN files the intel. Filing twice does nothing.
    op.file = id => {
      const s = get(id);
      if (s.step !== 'learn' || s.status === 'completed') return false;
      s.status = 'completed'; s.step = 'done'; s.filedAt = op.files.length;
      op.files.push(id);
      op.autoActive();
      return true;
    };

    // What the Case Files screen may show: only what has been discovered.
    op.caseFile = id => {
      const c = Cases.byId(id), s = get(id), done = s.status === 'completed';
      const decided = s.step === 'learn' || done;
      return {
        id, file: c.file, npc: c.npc, role: c.role, location: c.location,
        status: done ? 'RESOLVED' : s.status === 'active' ? 'IN PROGRESS · ' + s.step.toUpperCase() : 'NOT STARTED',
        marker: op.markerState(id),
        objective: c.objective,
        technique: decided ? c.technique : null,
        observed: s.status === 'available' ? null : c.observe.text,
        evidence: s.evidence.map(e => ({ id: e, ...c.evidence[e] })),
        risk: decided ? c.learn.risk : null,
        control: decided ? c.learn.control : null,
        intel: done ? c.intel : null,
      };
    };

    // ── CIPHER ─────────────────────────────────────────────
    op.cipherStep = () => op.cipher.done ? null : Cases.CIPHER.steps[op.cipher.step];
    op.cipherAnswer = answer => {
      if (!op.cipherUnlocked()) return { ok: false, locked: true, feedback: 'CIPHER only talks to agents holding all five files.' };
      const step = op.cipherStep();
      if (!step) return { ok: false, feedback: 'Already concluded.' };
      const r = Cases.checkCipherStep(step, answer);
      const i = op.cipher.step;
      op.cipher.tries[i] = (op.cipher.tries[i] || 0) + 1;
      if (op.cipher.firstTry[i] === undefined) op.cipher.firstTry[i] = r.ok;
      if (r.ok) {
        op.cipher.answers[step.id] = answer;
        op.cipher.step++;
        if (op.cipher.step >= Cases.CIPHER.steps.length) { op.cipher.done = true; op.autoActive(); }
      }
      return { ...r, cipher: r.ok ? step.cipher : null };
    };
    op.complete = () => op.cipher.done;

    // Plain counts for the report; nothing hidden.
    op.summary = () => {
      const list = Cases.CASES.map(c => cases[c.id]);
      return {
        files: op.files.length, required: REQUIRED,
        techniques: op.files.map(id => Cases.byId(id).technique),
        controls: list.filter(s => s.status === 'completed').length,
        firstTryAnalyses: list.filter(s => s.inspectFirst === true).length,
        firstTryDecisions: list.filter(s => s.decideFirst === true).length,
        finalSteps: Cases.CIPHER.steps.length,
        finalFirstTry: op.cipher.firstTry.filter(Boolean).length,
        networkIdentified: op.cipher.done,
      };
    };

    return op;
  }

  return { STEPS, REQUIRED, createOperation };
});
