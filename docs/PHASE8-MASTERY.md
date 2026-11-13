# Phase 8 — Learning Mastery, Knowledge Transfer & Rewards

Phase 7 made every mission feed one Knowledge Vault. Four of its eleven concepts — cascading failures, model inversion, fairness and hallucination — appeared in only one scenario, so they could be understood but never mastered. Phase 8 adds an optional **mastery challenge** for each of them: a short (2–3 min) scenario, set in a new situation, launched from the Vault. It also makes mastery evidence authoritative, keeps first-attempt history, and polishes the Vault, the reward feedback, audio and accessibility.

No Level 06 was added, no mission's gameplay was replaced, and no dependency was added.

## 1. Mastery challenges

All four run on one page, [`mastery.html`](../mastery.html)`?c=<id>`, from the data and evaluators in [`js/knowledge/challenges.js`](../js/knowledge/challenges.js). Each has the same shape: a brief, evidence documents (tabs; Domino also has a dependency map whose nodes open details), two to four decision steps, **RUN VERIFICATION**, then a consequence timeline, checks, a residual-risk note and the lesson.

| Challenge (`id`) | Concept | Setting | The player must… | Verification shows |
|---|---|---|---|---|
| THE DOMINO PROTOCOL (`domino`) | Cascading Failures | CityOS · harbour logistics grid, 6 services | classify each degraded service as origin / cascaded symptom / unrelated; configure containment (target, action, queue quarantine) | whether new bad manifests stop, whether dependents recover, whether unaffected services keep running |
| THE PRIVACY LEAK (`privacy`) | Training-Data Privacy | AI Incident Lab · SKINSCAN-API | classify five API clients as legitimate or extraction; choose up to three controls | the attack replayed against the chosen controls: reconstruction similarity to patient #0193, legitimate clients, evidence preserved |
| FAIRNESS UNDER PRESSURE (`fairness`) | Bias & Fairness | AI Incident Lab · TALENT-SCREEN | assess two rate differences (supported / explained / insufficient); justify B; name the limits of the evidence; choose up to two next steps | re-measured recall, shortlist rate and precision per group against a 5-point recall policy, with the trade-off stated |
| THE FABRICATED REPORT (`report`) | Hallucination & Grounding | AI Incident Lab · REPORT-GEN, incident IR-2291 | mark eight report claims supported / contradicted / insufficient against five case files; choose up to two generator controls | the re-drafted report: which claims were corrected, flagged, or are still there |

Design rules applied to all four:

- **Plausible wrong answers have real consequences, not just a red X.** Restarting the loudest service fails again within a minute; shutting down the origin stops the port; blocking one API key moves the attack to the second key; a global rate limit breaks the clinic and research clients; deleting logs destroys the evidence; forcing equal shortlist rates leaves qualified B applicants missed; lowering temperature or adding a disclaimer leaves contradicted claims in the report.
- **Several defensible combinations pass.** E.g. Privacy passes with output minimisation, monitoring, or both (plus optional, harmless extras such as differential-privacy retraining); Domino passes only with rollback + quarantine at the origin, because revoking or shutting down stops the port.
- **Marking everything the same way never passes** (explicitly checked in Report; impossible to pass by construction in the others).
- **No step names the answer.** Hints point at what to compare ("Compare first-anomaly times…"), never at an option.
- Every result ends with a **residual risk** (what the fix does not solve) and the lesson.

## 2. Authoritative evidence

The challenge page never tells the Vault "passed". It sends the player's **raw answers** with an attempt id:

```js
K.Progress.record({ source: 'C:fairness', stage: 'apply', result: 'verified' | 'failed', answers, attemptId, guided, durationMs })
```

[`learning-events.js`](../js/knowledge/learning-events.js) rejects a challenge `apply` without `answers` or `attemptId`. [`progress.js`](../js/knowledge/progress.js) sanitises the answers against the challenge definition (unknown ids dropped, choice limits enforced) and **recomputes the verdict** with `Challenges.evaluate()`. The claimed `result` is ignored: a forged `verified` with wrong answers is recorded as a failed attempt. The same `attemptId` is counted once, so reloading or double-clicking cannot inflate attempts.

Campaign events keep their Phase 7 sources; each mission still reports from validated game state at its decision points.

### Event schema additions

Every expanded event now carries:

| Field | Values |
|---|---|
| `context` | `'campaign'` or `'challenge'` |
| `scenarioId` | the level scenario or challenge setting |
| `challengeId` | challenge id, or `null` |
| `guided` | the player opened a hint / the tutorial guided the decision |
| `firstTry` | for challenges, derived from the stored attempt number (attempt 1), not from the page |
| `verificationResult` | `{ pass, checks:[{label, ok}] }` for challenges, `null` otherwise |

Challenge event ids include the attempt id, so two genuine attempts are two events and a repeated attempt is one.

## 3. Mastery policy

| Mastery type | Concepts | Mastered when |
|---|---|---|
| `cross-level` | least privilege, identity, observability, prompt injection, poisoning, adversarial inputs | a later first-try, unguided accepted result in a different **level** |
| `cross-scenario` | social engineering | the same, in a different Level 3 case |
| `challenge` | cascading failures, model inversion, fairness, hallucination | an **unguided pass of its challenge**, after the concept was **understood in its mission** |

- **All 11 concepts are now masterable.** `mastery: 'none'` remains a valid value but no concept uses it.
- A challenge concept can only be mastered through its challenge (`contextOk`), and a challenge cannot master a concept the player has not understood in its mission. Playing a challenge first still discovers and understands the concept; the result screen says mastery needs the mission too.
- **Retry after remediation counts.** A failed attempt shows what went wrong (timeline + failed checks with explanation). A later unguided pass masters the concept — the feedback is the remediation.
- **First-attempt history is never rewritten.** `state.challenges[id].firstAttempt` stores the first attempt's result, time and whether it was guided; later passes do not overwrite it.
- **Excellence** is a separate mark (`excellenceAt`, shown as ★ EXCELLENCE in the Vault) for mastering on the very first attempt, unguided. It gives no extra XP; mastery XP is the same 150 either way.
- **Hints** are optional, one click per step. Using one marks the attempt guided: it can pass and is recorded, but does not count towards mastery, and the result says so.
- **Replays** of a mastered challenge are welcome, are recorded as attempts, and add no XP.

## 4. Security Insight feedback

The KNOWLEDGE UNLOCKED card now includes, when the event came with real game state, a short **SECURITY INSIGHT**: what the player did and what happened, e.g. *"You: Isolate the target and roll back… — INVENTORY-SYNC-02; queue quarantined → Origin contained, poisoned queue quarantined, dependents recovered and verified."* Insight text is built from the verdict (challenges) or the values the level passed in at the decision point; it is never generic praise, and a card without game state shows no insight line. The latest insight per source is stored (`{source, accepted, at, action, outcome}`) so the Vault detail can show **ACTION YOU TOOK** and **WHAT HAPPENED**.

Reward cards have three visual tiers — discovered, understood, mastered (with excellence called out) — differing in border, glow and icon, all with text labels, never colour alone. Reduced motion removes the entry animation.

## 5. Knowledge Vault UX

Top to bottom:

1. **Summary** — discovered / understood / mastered (out of 11), learning XP, badges, plus the honesty note "XP and badges reflect what you did in these games — not real-world competence".
2. **CONTINUE LEARNING** — one deterministic recommendation, in this order: (1) an understood concept whose challenge is waiting; (2) an understood concept masterable in another unlocked mission; (3) a discovered concept to practise in an unlocked mission; (4) an unlocked mission with undiscovered concepts; (5) optional review of a mastered concept's challenge. It links to a mission or a challenge, never to an answer.
3. **WHAT YOU KNOW / WHAT YOU CAN PRACTISE** — short lists with the reason for each (e.g. "Your last challenge attempt did not pass verification — re-read its evidence and try again").
4. **NEEDS PRACTICE** — cards for every concept with something left to do.
5. **MASTERED CONCEPTS** — the collection, with ★ EXCELLENCE marks.
6. **ALL CONCEPTS** — category filter, roving-tabindex grid of cards.

The concept **detail dialog** follows a fixed sequence: what it means → where you encountered it (evidence observed, action you took, what happened) → why it matters → real-world application / what to verify → **practice / mastery** (challenge status, START CHALLENGE, exact mastery criteria) → learning objectives. Locked cards still never show a name or answer.

Returning from a challenge (browser back or the vault link) restores the Vault tab and focus to the card or button that launched it (`sessionStorage` `htp.hub.tab` / `htp.hub.focus`).

## 6. Audio

- **Level 1** reward cues used to go straight to `audioCtx.destination`. They now go through a new effects bus (`sfxOut()`), shared with Level 1's other effects, with a **SFX** mute button (`htp.l1.sfx`).
- Level 5 cues use its SFX bus (volume + mute). Levels 2–4 already routed through their effects path.
- The Hub and challenge page have a **REWARD SOUNDS: ON/OFF** toggle; it is one shared preference (`htp.prefs` → `rewardSounds`), checked before any cue in every page.
- Cues wait while a level is paused (`isBusy` includes `paused` in Levels 1–4) as well as while fighting, racing or driving.
- No sound before a user gesture; cues are under a second, each milestone sounds different, every oscillator is stopped.

## 7. Accessibility

- The challenge page is fully keyboard-operable: native radio groups for classify steps, checkboxes with an enforced maximum for choose steps, a select + toggle for configure steps; evidence tabs with arrow keys; dependency-map nodes are buttons.
- **RUN VERIFICATION** with unanswered steps lists what is missing and moves focus to the first one. After verification, focus moves to the verdict heading; ADJUST AND RETRY keeps the answers and focuses the first step, START OVER clears them.
- Results and reward messages are announced through polite live regions. Every pass/fail is text plus a symbol (✓ / ✗), not colour alone.
- `prefers-reduced-motion` is read live (not only at load), so changing the setting takes effect without a reload.
- Still not tested with assistive technology; canvas gameplay in the levels has no non-real-time alternative (unchanged from Phase 7).

## 8. Analytics

Local only. `htp.knowledge` gains `challenges.<id>` (`attempts`, `passes`, `hintsUsed`, `firstAttempt`, `lastResult`, `bestMs`, `lastAt`) and `stats.challengeAttempts` / `challengePasses`. Nothing is sent anywhere. The save remains `VERSION 1`: all new fields are optional and `normalize()` fills or drops them, so Phase 7 saves load unchanged and corrupt values are discarded field by field. `htp.progress` (campaign) is never touched.

## 9. Tests

| Suite | What it covers |
|---|---|
| `tests/challenges.test.js` | definitions are complete and spoiler-free; every evaluator passes its reference solution and fails each tempting wrong strategy with the expected consequence; sanitising; forged `verified` is rejected; attempt dedupe; retry-after-failure mastery; excellence only on attempt 1 unguided; guided passes don't master; first attempt preserved; mastery requires the mission first; replays add no XP; review order |
| `tests/knowledge-audio.test.js` | cue routing only into the given bus, no lingering oscillators, distinct cues, no cue without context/bus; shared preference safe without or with corrupt storage; every page routes through an effects path and holds cues while paused |
| `tests/knowledge.test.js` | updated: `challenge` mastery type, every concept masterable, related levels from campaign sources only, review recommendations |
| `tests/browser/smoke.browser.js` | mastery challenge from the Vault: fail, retry, master, return — keyboard, focus restore, reduced motion |
| `tests/browser/gameplay.browser.js` | THE DOMINO PROTOCOL with real keyboard/mouse input: inspect the map, open a hint, fail, retry unguided, master, back to the Vault |

## 10. Known limitations

- The four challenges are fixed, hand-written scenarios: the same evidence and the same correct reasoning every time. Replaying one teaches nothing new after it is mastered.
- Challenges are decision exercises (classify, choose, configure, verify), not real-time play; they are shorter and more text-heavy than the missions.
- Evaluators are deterministic rules written for these cases. The numbers in their timelines (similarity, recall, precision) are illustrative, not measured on real systems.
- Fairness uses one measure (recall parity for qualified applicants) chosen for that context; the residual note says so, but the challenge does not explore conflicting fairness metrics.
- No learner study has been run; learning effects are not claimed.
