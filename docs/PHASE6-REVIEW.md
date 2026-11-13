# Phase 6 — Gameplay & Learning Experience Review

This document records the learning objectives of each mission, the structured usability review carried out for Phase 6, and what changed as a result. It is an engineering review, not a learner study: **none of the learning outcomes below have been validated with real learners yet.** The "verification" column says how each change was checked (automated test, scripted browser run or code review), not that it improves learning.

## 1. Learning objectives

Objectives describe what a player can *demonstrate* in the game. Each is mapped to the mechanic that asks for it.

| Level | The player can… | Mechanic that requires it |
|---|---|---|
| 01 FSYNDICATE | Trace an agent's behaviour from observation to execution using its activity log | Scanning the Scout in two states and opening the log (`Q`, `I`) |
| 01 | Restrict an agent's tool call to its role and target scope | Sheriff's Office terminal: choosing the control for the Enforcer's request |
| 01 | Verify a message's sender, integrity and authority before acting on it | Telegraph Station terminal: the Signal's message checks |
| 01 | Tell combat success apart from security decision quality | Separate combat report and AI security score; containment toast now states the security outcome |
| 02 AI Incident Lab | Separate evidence from conclusions and diagnose an AI failure from evidence alone | Analyzer: evidence → diagnosis (six diagnosis styles; answers never shown before diagnosis) |
| 02 | Choose controls that address the diagnosed cause, and recognise a control that does nothing | Mitigation + verification replay; passing sets now flag ineffective controls |
| 02 | Accept a fix only after verification | Incidents only resolve after VERIFY passes |
| 03 Operation Ghost | Identify a social-engineering technique from what was observed and said | OBSERVE → TALK → INSPECT per case |
| 03 | Verify a claimed identity through a channel already trusted | DECIDE step and CIPHER's verified-vs-claimed step |
| 03 | Connect separate incidents into one campaign using collected evidence | CIPHER's final investigation, now with the player's intel files beside each question |
| 04 Neon Grand Prix | Keep external content as data rather than instructions | Lap 1 decision (route broadcast) |
| 04 | Cross-check a model's prediction against independent signals | Lap 2 decision (camera vs LIDAR and map) |
| 04 | Approve only in-role tool calls and hold safety-system writes for a human | Lap 3 decision (pit agent) |
| 05 Digital Mayhem | Read a tool request, its policy findings and its enforcement mode, and predict what will execute | Inspector: POLICY CHECK and the AGENT OBSERVABILITY trace |
| 05 | Contain an unsafe agent without stopping its legitimate work | Responses evaluated by the real policy engine; the trace shows legitimate work continuing or stopping |
| 05 | Distinguish containment from recovery and verify a recovery against criteria | Recovery plan → recovery step → live verification criteria |
| 05 | Trace a cascade to its origin and restore services in dependency order | Dependency map + ordered restoration in INC-05 |

## 2. Usability review — findings and changes

Priorities: **P0** correctness or softlock, **P1** learning/workflow clarity, **P2** polish. Status: ✅ fixed in Phase 6, ⏳ open (see §4).

### Level 01 — FSYNDICATE

| Pri | Location | Problem | Player impact | Change | Verification | Status |
|---|---|---|---|---|---|---|
| P0 | `containAgent`, `hitPlayer` | Board/defeat timers from a previous run could fire after RESTART (TypeError or a defeat screen in the new run, softlocked bounty) | Broken restart | Run-scoped `later()` timers cleared in `resetMission` | `tests/arena.test.js` source check; smoke + gameplay | ✅ |
| P0 | `hitPlayer` | A pulse in flight could add a breach after the last bounty was contained | Win turned into loss | `matchOver` set at the final containment; `hitPlayer` ignores hits once decided | Code review; gameplay | ✅ |
| P0 | `pauseGame`, `showResults` | Music kept playing while paused and under the results | Inconsistent with other levels | Loop stopped on pause/results and restarted on resume (no `suspend()` stacking) | Source check test; gameplay | ✅ |
| P1 | Duel HUD | Terminals, scanning and the log were undiscoverable unless found by chance | Players killed agents without the security objective | Contextual next-step line (aim → scan → log → terminal with distance), disappearing as each is done | Manual run | ✅ |
| P1 | `containAgent` | A kill said "BOUNTY COMPLETE" even when the security objective was missed | Combat and security conflated | Containment note states the security outcome | Manual run | ✅ |
| P1 | Report labels | "Exploited" (unsafe action executed) read as "NEEDS REVIEW", like a partial answer | Misleading feedback | Label `UNSAFE · EXECUTED`, red ✕ | `tests/arena.test.js` | ✅ |
| P1 | Terminal | No way to leave without deciding, though the README says undecided requests stay held | Forced choice | `Esc` leaves; request stays held | Manual run | ✅ |
| P1 | Report | No practical takeaway | Weak learning transfer | IN THE REAL WORLD / WHAT TO VERIFY per objective; rows to learn from open by default | `tests/arena.test.js` | ✅ |
| P2 | HUD | Charges shown only as dimmed dots; music button had no state | Colour-only state | Text count and aria-label; `aria-pressed` on music; objective is a live region | Code review | ✅ |
| P2 | Mouse | The click that recaptures the cursor may also fire (suspected) | Accidental shot | **Phase 7:** the recapture click no longer fires once pointer lock has worked; source-checked (headless browsers cannot lock the pointer) | Source check; manual | ✅ |

### Level 02 — AI Incident Lab

| Pri | Location | Problem | Player impact | Change | Verification | Status |
|---|---|---|---|---|---|---|
| P0 | `showResults` | Map music kept playing over the results | Audio inconsistency | `stopMapMusic()` on results | Code review; gameplay | ✅ |
| P0 | Analyzer at 0 % integrity | TRY AGAIN / ADJUST CONTROLS were still offered, so a 0 % lab could still "win" | Fail state not enforced | Only END MISSION is offered at 0 % | Code review; smoke defeat path | ✅ |
| P0 | Final report | Cases never opened revealed their diagnosis | Answers leaked | `revealed` only for diagnosed/mitigated/verified/needs-review cases | `tests/incident.test.js` | ✅ |
| P1 | Verification | A placebo control in a passing set was never criticised | Wrong lesson ("all three helped") | Passing sets list ineffective controls | `tests/incident.test.js` | ✅ |
| P1 | INVERTOR diagnosis | The right client was the only option without a description | Answer guessable by layout | Neutral description added; test guards the pattern | `tests/incident.test.js` | ✅ |
| P1 | Analyzer | No visible phase flow | Unclear where you are | EVIDENCE ▸ DIAGNOSE ▸ MITIGATE ▸ VERIFY stepper (text + `aria-current`) | Code review | ✅ |
| P1 | Lab | Nothing on the canvas said which robot could be inspected | Lost first minute | `[E] INSPECT` label over the nearest robot until the first inspection | Manual run | ✅ |
| P1 | Mitigation | A 4th control click silently did nothing | Confusing | Message: "Up to 3 controls — deselect one first" | Code review | ✅ |
| P1 | Verification replay | Focus fell to `<body>` while the replay re-rendered; replay timer had no owner | Keyboard users lost | Focus kept in the analyzer; replay bound to its session | Code review | ✅ |
| P2 | Report | No practical takeaway | Weak transfer | IN THE REAL WORLD / WHAT TO VERIFY for worked cases | `tests/incident.test.js` | ✅ |
| P2 | Dialogs | No `aria-modal`/focus trap; some 8–10 px canvas labels | Accessibility | **Phase 7:** `aria-modal` + shared focus trap; 9–10 px CSS text raised to 11–12 px (two decorative 8 px sprite words remain) | Smoke; code review | ✅ |

### Level 03 — Operation Ghost

| Pri | Location | Problem | Player impact | Change | Verification | Status |
|---|---|---|---|---|---|---|
| P0 | Case Files keys | `Tab` closed Case Files, so keyboard users could reach only one file | Keyboard softlock of a feature | `Esc` closes; `Tab` cycles within the screen | Code review; gameplay | ✅ |
| P0 | CIPHER final step | An `Esc` in the 900 ms before results could leave the player walking while results opened | Jarring state | Input locked while results are pending; timer bound to the session | Code review | ✅ |
| P1 | CIPHER | "OPEN CASE FILES [TAB]" hint did nothing | Wrong affordance | Key hint removed | Code review | ✅ |
| P1 | Restart | Stale case/selection/boss state and old toasts survived a restart | Odd leftovers | Reset in `restartMission` | Code review | ✅ |
| P1 | First minute | The first target was 66 m away behind the player; walking, `E` and cars were never introduced | Lost first minute | Start on the nearest case; first-minute hint line (walk → E → car tip), fades as each happens | Manual run; gameplay | ✅ |
| P1 | CIPHER | The final analysis did not show the evidence collected | Evidence not linked to the conclusion | "YOUR INTEL FILES" beside every CIPHER question | Code review | ✅ |
| P1 | Learn / results | No real-world verification step | Weak transfer | IN REAL LIFE, VERIFY per case, also in results | `tests/social.test.js` | ✅ |
| P2 | HUD | Whole HUD was `aria-live`, re-announcing distances every metre | Screen-reader noise | Live region moved to toasts and the hint line | Code review | ✅ |
| P2 | Camera | `prefers-reduced-motion` not applied to camera swings | Motion discomfort | **Phase 7:** the camera cuts instead of swinging (walk, drive, conversation) | `tests/social.test.js` | ✅ |

### Level 04 — Neon Grand Prix

| Pri | Location | Problem | Player impact | Change | Verification | Status |
|---|---|---|---|---|---|---|
| P0 | Decision card | Releasing Space (held for boost) clicked option 1 — usually the unsafe one | Choice made for the player | Card focuses its title; choices armed only after held keys are released; auto-repeat ignored | `tests/racer.test.js` source check; gameplay | ✅ |
| P0 | Window focus | Keys stayed held after alt-tab | Stuck throttle | `blur` releases keys and pauses | Source check | ✅ |
| P0 | Audio | Music kept playing on pause, in hidden tabs and after the finish | Inconsistent | Context suspended on pause and the loop re-armed on resume; music fades out on the finish | Source check; gameplay | ✅ |
| P1 | Event timing | The anomaly appeared ~3 s before the decision at top speed | Decisions felt arbitrary | Warning lead doubled (≥ 6 s at top speed); centre-screen "AI ANOMALY · SEE TELEMETRY" cue | `tests/racer.test.js` | ✅ |
| P1 | Decision card | Did not say why the AI was asking now | Disconnected from what was seen | WHY NOW row linking to the billboard / markings / pit agent | `tests/racer.test.js` | ✅ |
| P1 | Narrow screens | Telemetry hidden entirely below 760 px | No build-up | Telemetry kept as a full-width strip | Code review | ✅ |
| P2 | HUD | "SCORE 0/3" unexplained; telemetry changes not announced | Unclear | "SECURITY 0/3"; polite live region on telemetry changes; countdown hint and beeps | Code review | ✅ |
| P2 | Report | Mistakes collapsed; no practical takeaway | Weak transfer | Non-mitigated rows open; IN THE REAL WORLD / WHAT TO VERIFY | `tests/racer.test.js` | ✅ |

### Level 05 — Digital Mayhem

| Pri | Location | Problem | Player impact | Change | Verification | Status |
|---|---|---|---|---|---|---|
| P1 | First incident | The whole loop (policy, containment, recovery, verification) was presented at once | Highest onboarding load in the campaign | **Guided first incident** on the real INC-01: each step is derived from simulation state and highlights the real control; skippable, remembered, never acts for the player | `tests/mayhem.test.js` (guide never calls the simulation); scripted browser run | ✅ |
| P1 | Inspector | Requested → policy → authorised → executed → outcome was spread across the log | Hard to see why a response worked | AGENT OBSERVABILITY trace from the policy engine, including the agent's legitimate work | `tests/mayhem.test.js` | ✅ |
| P1 | Response feedback | Toast said "CONTAINED" without saying what changed | Generic feedback | POLICY UPDATED toast: agent, action blocked/held/still executing, impact, next step | Scripted browser run | ✅ |
| P1 | After containment | Not obvious that containment is not resolution | Players stopped early | Recovery plan: blocked now, still degraded (with the cause), next step, then live criteria | `tests/mayhem.test.js` | ✅ |
| P1 | Always | No single place saying what to do next | Lost between incidents | Objective strip with verified count and next step; one-shot tips introduce GHOST, the dependency map, the log and pressure when first relevant | Scripted browser run | ✅ |
| P1 | City | Consequences visible but not located | Missed cause and effect | Consequence pings at the facility on detection, damage, response, recovery and verification (static under reduced motion) | Manual run | ✅ |
| P2 | Audio | Sirens/alerts could be too intense for some players | Discomfort | REDUCED ALERTS option (no sirens/pings, softer alarms), persisted | `tests/mayhem-audio.test.js` | ✅ |
| P2 | Focus | Closing the inspector dropped focus to `<body>` | Keyboard users lost | Focus returns to the opener or the map | Scripted browser run | ✅ |
| P2 | Debrief | No practical takeaway | Weak transfer | REAL-WORLD APPLICATION / WHAT TO VERIFY per incident, in LEARN and the results | `tests/mayhem.test.js` | ✅ |

### Campaign and presentation

| Pri | Location | Problem | Change | Status |
|---|---|---|---|---|
| P3 | Trailer | Showed four levels | Five-level trailer from real captures, 7.6 s, new titles, PLAY NOW card | ✅ |
| P3 | `package.json`, README, hub | Four-level wording; purpose and independence unclear | Five-mission description, purpose line, independence disclaimer | ✅ |

## 3. Scores: what is measured where

Each level keeps four things separate: **mission completion** (the level's win condition, the only thing that unlocks the next level), **operational result** (combat, integrity, race position, city stability), **educational accuracy** (best-practice first responses or decisions, shown with how it is counted) and **optional bonuses** (e.g. P1 in Level 4). No level penalises reading time, and each report says how its counts are made.

## 4. Open items for human playtesting

1. Level 05 pacing with real players: does a first run land in 8–12 minutes, and is the guide's step 2 short enough to read?
2. Level 01: does the new hint line make terminals discoverable without breaking the duel's tension? Is the Scout still too easy to kill before scanning?
3. Level 04: with a longer warning, do decisions now feel anticipated? Is the centre-screen cue distracting in curves?
4. Level 03: is the first-minute hint enough to get new players to the first conversation in under a minute?
5. Accessibility with assistive technology: focus traps in Levels 1–3 dialogs, screen-reader testing of every level, and 3D/canvas interactions that have no DOM alternative (aiming in Level 1, walking in Levels 2–3, driving in Level 4).
6. Learning transfer: a small study (pre/post questions on the concepts in §1) would be needed before claiming any learning effect.
