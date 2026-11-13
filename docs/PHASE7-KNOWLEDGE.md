# Phase 7 — Knowledge, Rewards & Game Experience

**PLAY → DISCOVER → UNDERSTAND → MASTER.** Phase 7 adds one shared system that turns what players already do in the five missions into visible, reviewable learning progress: a concept registry, learning events, three learning states, learning XP, specialist badges, a Knowledge Vault in the Mission Hub, and in-game unlock cards.

Nothing here measures real-world competence. XP and badges describe decisions made in these games, and **no learning effect has been validated with learners**.

## 1. Architecture

```
js/knowledge/
  concepts.js          canonical concept registry (stable ids)
  learning-events.js   gameplay sources → concepts, validation, event expansion
  rewards.js           XP values and badge predicates
  progress.js          state machine, idempotent apply, XP, review, storage (htp.knowledge)
  vault-ui.js          icons, unlock notifier, reward sounds, Vault + Achievements views
js/a11y.js             shared modal focus trap (Levels 1, 2, 4, 5)
```

All of these are classic scripts (the game still opens from `file://` with no build step) and load in Node for testing. The knowledge save is a separate key, `htp.knowledge`; the campaign save `htp.progress` is never read or written by it, so old campaign saves are unaffected.

### Integration points (where levels report)

A level never decides what the player learned. It reports what happened at a verified transition of its own game logic, and the shared module decides.

| Level | Transition in the existing game logic | Report |
|---|---|---|
| 01 | `doScan()` succeeds on THE SCOUT | `L1:scout` discover |
| 01 | Scout objective becomes `complete` (two states scanned + log opened) | `L1:scout` apply `complete` |
| 01 | `chooseConsole()` → `security.decide()` (Enforcer / Signal terminals) | `L1:enforcer` / `L1:signal` apply with the decision's outcome |
| 02 | `lab.diagnose()` returns `ok` | `L2:<case>` discover (after the reasoning, so the name never spoils it) |
| 02 | `lab.verify()` | `L2:<case>` apply `verified`/`failed`; first try = no wrong diagnosis and no failed verification |
| 03 | `op.decide()` returns `ok` | `L3:<case>` apply `correct`; first try = analysis and response both right first time |
| 03 | `op.cipherAnswer()` on the IDENTITIES step returns `ok` | `L3:cipher-identities` apply `correct`, first try from `op.cipher.firstTry` |
| 04 | `security.choose()` on a decision card | `L4:<event>` apply with the option's outcome |
| 05 | `sim.respond()` (policy-engine graded) | `L5:INC-0n` apply with the grade; first try = first response; `guided` = the guided first incident |
| 05 | Mission won | `L5:city` apply `restored-clean` (no service fell to CRITICAL) or `restored` |

Discovery is reported no earlier than the moment the concept's name stops being a hint: Level 2 after a correct diagnosis, Level 3/4/5 with the decision, Level 1 at the scan whose tip already names observability.

## 2. Learning states

| State | Evidence required | Never from |
|---|---|---|
| **DISCOVERED** | The player examined the evidence (a diagnosis, a decision, a scan) | Opening a screen |
| **UNDERSTOOD** | A decision with an *accepted* result for that source (best / complete / mitigated / verified / correct). Learning through feedback counts. | Unsafe, failed, over-restricted or safe-but-costly results — these are recorded as attempts |
| **MASTERED** | After UNDERSTOOD, a **first-try, unguided** accepted result in a **different scenario** — a different level for `cross-level` concepts, a different case for `cross-scenario` ones | Completing a mission; repeating the same scenario; the guided tutorial |

Concepts with no independent scenario (`mastery: 'none'`) stay at UNDERSTOOD, and the Vault says so. MASTERED counts are shown out of the masterable concepts only.

> **Phase 8 update:** the four `none` concepts below now use `mastery: 'challenge'` and are mastered through an optional challenge (an unguided pass after understanding the concept in its mission). All 11 concepts are masterable. See [`PHASE8-MASTERY.md`](PHASE8-MASTERY.md).

## 3. Concept catalog

| Concept (id) | Category | Taught in | Mastery |
|---|---|---|---|
| Least Privilege & Tool Scope (`least-privilege`) | Agentic AI | L1 Enforcer · L4 pit agent · L5 INC-01, INC-02 | cross-level |
| Identity & Message Verification (`identity-verification`) | Agentic AI | L1 Signal · L3 MARCUS, CIPHER identities · L5 INC-03 | cross-level |
| Agent Observability (`agent-observability`) | Agentic AI | L1 Scout · L5 INC-05 (tracing delegations to the origin) | cross-level |
| Cascading Failures (`cascading-failures`) | Agentic AI | L5 INC-05 | none |
| Prompt Injection (`prompt-injection`) | Model security | L2 INJECTOR-9 · L4 lap 1 | cross-level |
| Data Poisoning & Provenance (`data-poisoning`) | Model security | L2 POISONER-X · L5 INC-04 | cross-level |
| Adversarial Inputs (`adversarial-inputs`) | Model security | L2 ADVERSAR-1 · L4 lap 2 | cross-level |
| Training-Data Privacy (`model-inversion`) | Model security | L2 INVERTOR-Z | none |
| AI-Assisted Social Engineering (`social-engineering`) | Social engineering | L3 all five cases | cross-scenario |
| Bias & Fairness (`fairness`) | Responsible AI | L2 BIASBOT-7 | none |
| Hallucination & Grounding (`hallucination`) | Responsible AI | L2 HALLUCIN-8 | none |

Eleven concepts, every one backed by a playable scenario; seven can be mastered through existing independent scenarios. No new quiz was added: mastery reuses scenarios the game already had (spec §10 preference). Each entry has a short and detailed explanation, two learning objectives, real-world application, verification guidance, the three criteria and a non-spoiling locked hint (a test checks the hint never contains the concept's name).

## 4. Rewards

**Learning XP** (configurable in `rewards.js`): DISCOVERED 25 · UNDERSTOOD 75 · MASTERED 150, once per concept. XP is *derived* from milestone timestamps, never incremented, so replays and duplicate events cannot farm it and the total is identical after reload. XP never gates a mission.

**Badges** — explicit predicates over recorded evidence; finishing a mission alone never earns one:

| Badge | Condition |
|---|---|
| AGENT CONTAINMENT SPECIALIST (L1) | The Enforcer's tool request handled with the `complete` control |
| AI SECURITY INVESTIGATOR (L2) | ≥ 4 of 6 incidents verified with no wrong diagnosis and no failed verification |
| IDENTITY DETECTIVE (L3) | MARCUS's case and CIPHER's identity step, both first time |
| SAFETY-FIRST DRIVER (L4) | All three race decisions mitigated (across races allowed) |
| CITY GUARDIAN (L5) | First INC-05 response correct **and** a restore with no service falling to CRITICAL |

Each unlocked badge stores `unlockedAt` and `sourceEvidence` (the sources that satisfied it). Unearned badges show only a non-spoiling requirement, not the description of the winning action.

## 5. Events and idempotency

Each level report `{ source, stage, result, firstTry, guided, ref }` is validated against the registry (unknown sources, stages or concepts are rejected and change nothing) and expanded into one event per concept: `{ eventId, type, conceptId, levelId, sourceAction, evidenceReference, timestamp, result }` with `type` `knowledge.discovered` / `knowledge.understood` / `knowledge.attempted`. `eventId` is deterministic, processed ids are remembered (last 300), and milestones are set once, so applying the same event twice is a no-op. Storage keeps only milestone times, up to 8 evidence references per concept, the best result per source, badges, the last 8 unlocks and small counters (attempts, independent attempts, independent successes, and hints used — decisions made with Level 5's guide) — no raw logs, nothing personal, nothing transmitted.

## 6. Knowledge Vault and unlocks

* **Mission Hub tabs:** MISSIONS · KNOWLEDGE VAULT · ACHIEVEMENTS (ARIA tabs, arrow keys). The campaign panel shows learning XP, concepts discovered and badges.
* **Vault:** totals from real data (discovered / understood / mastered-of-masterable / XP / badges), a learning review (**concepts mastered**, **concepts to practise** with the missions to practise in, **next learning opportunity** linking to an unlocked mission — never an answer), recent unlocks, a category filter and concept cards with icon, title, category, a text + symbol status (◇ / ◆ / ✓ / ★), three progress pips and related missions. Locked cards show "UNDISCOVERED CONCEPT", the category and a vague hint only.
* **Detail panel** (native `<dialog>`, Esc closes, focus returns to the card): what it means, why it matters, then progressive sections — where you met it (scenario, evidence, what you did — shown only for decisions you actually got right — and what happened), in the real world (application + what to verify), mastery (criteria and the available challenge), learning objectives.
* **In-level unlock card** (≈2.8 s, static under reduced motion, `role=status`): KNOWLEDGE UNLOCKED / CONCEPT UNDERSTOOD / CONCEPT MASTERED / BADGE EARNED, icon, title, one-line explanation, XP and "added to Knowledge Vault". A discovery and understanding in one batch is merged into one card. Cards queue while play is intense — Level 1 during a duel, Level 4 while racing or counting down, Level 3 while driving, Level 2 during the verification replay — and appear at the next safe moment. Each level styles the card with its own accent and places it away from its key HUD.

## 7. Accessibility, camera and audio

* **Focus traps** in every modal dialog: Levels 1, 2, 4, 5 via `js/a11y.js`; Level 3 already had one (Phase 6). Level 1 and 2 dialogs now declare `aria-modal="true"`.
* **Readability:** every 9 px CSS text is now 11 px and every 10 px is 12 px, in the hub and all five levels. Two 8 px words remain inside Level 2's 32 px pixel-art server sprites ("DATA", "API"); they are decorative.
* **Level 1 Pointer Lock:** the click that recaptures the cursor no longer fires a shot, once pointer lock has worked in that browser. Where pointer lock never works (some embedded or headless browsers) clicks still fire, so the game stays playable — this is also why the change cannot be exercised by the headless test suite and is covered by a source check.
* **Level 3 reduced motion:** with `prefers-reduced-motion` the camera cuts instead of swinging — no automatic swing while walking, a rigid chase camera when driving (orientation kept), an instant cut to frame a conversation, no positional easing (unit-tested).
* **Reward sounds:** four short original cues (soft chime, two-note confirmation, rising motif, arcade sting), routed through each level's own effects path so they follow its volume and mute settings; Level 5 plays them on its SFX bus. They are queued with their card, so they never play during combat or driving. The Vault itself is silent and fully usable without sound.

## 8. Tests

* `tests/knowledge.test.js` — registry integrity (unique ids, complete entries, relatedLevels = the levels that teach it, mastery only where an independent scenario exists, no spoiling hints), source validation (no unsafe result is ever accepted), rejected events, discovery vs understanding, mastery rules (guided, not-first-try, same-level and same-case are all refused), XP not farmable across five replays, bounded storage, review never names solutions, persistence (campaign save untouched, reload consistent, corrupt/foreign/old/missing/throwing storage, reset).
* `tests/rewards.test.js` — XP constants, badge definitions, each badge's exact condition including "mission completion alone does not award it", unlock once, persistence.
* `tests/social.test.js` — reduced-motion camera.
* Smoke: Vault tabs by keyboard, card states, no spoilers, detail dialog, focus return, explicit reset of both saves.
* Gameplay (real input): Level 4 asserts Space on a decision card picks nothing, SAFETY-FIRST DRIVER is earned from the three decisions, and no unlock card is visible while racing; Level 5 asserts the five incident concepts are understood from real decisions, cascading failures is not mastered, CITY GUARDIAN is withheld after a wrong first INC-05 response, and an unlock card was shown.

## 9. Known limitations and follow-ups

1. Four concepts (cascading failures, training-data privacy, fairness, hallucination) have only one scenario, so they cannot be mastered yet. A small independent incident for each would make mastery possible.
2. Level 1's terminals and Level 4's decisions are single-choice, so their "first try" is always true; mastery there relies on the other level being first-try.
3. The Level 1 pointer-lock change and the reward sounds are not exercised by headless tests (no pointer lock, no audible output) — they are covered by source checks and a manual check is recommended.
4. Assistive-technology testing has not been done. Aiming (L1), walking (L2, L3) and driving (L4) still have no DOM-only alternative; WCAG compliance is not claimed.
5. Level 2's soundtrack predates this phase and is written as an homage (documented in the README); Phase 7 added only original cues.
6. Learning measurement is local only (attempts, independent attempts/successes, hints). Measuring real learning would need a study with pre/post assessment.
