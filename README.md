# HACK THE PLANET

> *"Systems don't change the world… people do."* — Urcuqui

![HACK THE PLANET gameplay trailer: FSYNDICATE duel, AI Incident Lab, Operation Ghost, Neon Grand Prix, Digital Mayhem](trailer.gif)

<sub>Real gameplay of all five missions, captured from the current build with `python3 gen_gif.py`.</sub>

**HACK THE PLANET is five short browser games about securing AI systems.** Each mission is a different genre — a cyber-western shooter, a pixel-art investigation, a 3D espionage adventure, an arcade racer and a smart-city crisis simulator — and each one teaches AI security through what you investigate, decide and then *see happen*, not through quizzes. You play KUKY and GHOST against PandeCorp, a fictional corporation whose AI agents keep misbehaving.

**PLAY. INVESTIGATE. DEFEND. LEARN.**

- **Who it's for:** anyone curious about agentic AI security — tool permissions, prompt injection, data poisoning, identity and message verification, cascading failures. No prior security knowledge is needed; experienced players can skip the tutorials.
- **How long:** about 5–15 minutes per mission. Open `index.html` (or run `npm start`) and pick a mission in the **Mission Hub**, which saves your progress.
- **What you take away:** every mission feeds one **Knowledge Vault** in the Mission Hub. Concepts you meet in play become *discovered*, applying the right control makes them *understood*, and applying it again first time in a different mission makes them *mastered* — with learning XP, five specialist badges and a review of what to practise next. **PLAY. DISCOVER. UNDERSTAND. MASTER.**
- **What it is not:** an independent, experimental learning project. It is **not affiliated with or endorsed by TryHackMe** or any other company, and nothing in it measures a real system. The agents are transparent simulations (state machines and policies), not AI models.

Everything runs in the browser with plain HTML, CSS and JavaScript. There's no build step, no framework and no backend. All music and sound effects are generated live with the Web Audio API, so the game ships no audio files.

---

## Missions

| # | Mission | Type | Win condition |
|---|---------|------|---------------|
| 01 | **FSYNDICATE — The Agentic Frontier** (`level1.html`) | Cyber-western Three.js FPS + ~68 s cinematic intro | Contain three rogue agents (three bounties) before taking 3 breaches. *Separate report:* AI security score 0–3 |
| 02 | **Vulnerability Hunter — AI Incident Lab** (`level2.html`) | 2D top-down canvas lab: inspect, read evidence, diagnose, mitigate, verify | Verify all 6 AI incidents before your integrity reaches 0% |
| 03 | **Operation Ghost — Trust No Signal** (`level3.html`) | Three.js Cyber Miami Noir city: walk, drive, investigate five social-engineering plays | Close five cases (OBSERVE → TALK → INSPECT → DECIDE → LEARN), **then** prove to CIPHER they are one network |
| 04 | **Neon Grand Prix** (`level4.html`) | Canvas pseudo-3D racer, 8 AI rivals, one AI security decision per lap | Finish all 3 laps. *Bonus:* take P1. *Separate report:* AI security score 0–3 |
| 05 | **Digital Mayhem — City Under AI Control** (`level5.html`) | Three.js isometric smart-city crisis: real-time incident response across a living district, two roles (KUKY / GHOST), adaptive synthwave soundtrack | Contain, recover and verify all 5 incidents before a critical service fails. *Separate report:* best-practice first responses 0–5 |

### Campaign progression

- Only Level 1 is available at first. Beating a level's win condition unlocks the next one.
- Completed levels show **COMPLETED** in the hub and can be replayed. Replaying never re-locks anything.
- Progress is saved in your browser's `localStorage` (key `htp.progress`) and survives a page refresh. **RESET PROGRESS** in the hub wipes it after you confirm.
- The **Knowledge Vault** has its own save, `htp.knowledge` (concepts, learning XP, badges, a few evidence references). It never changes `htp.progress`, so saves from before Phase 7 keep working. **RESET PROGRESS** says explicitly that it wipes both, and does.
- Level 5 also remembers whether you finished or skipped its guide (`htp.mayhem.guide`) and its audio settings (`htp.mayhem.audio`, including REDUCED ALERTS); neither affects campaign progress.
- What gets saved: completed levels, the highest unlocked level, first and last completion times, and a few best results (Level 1: best AI security score; Level 2: highest integrity remaining and most diagnoses right first time; Level 3: most responses right first time; Level 4: best finishing position, best time and best AI security score; Level 5: best city stability and most best-practice first responses).
- Adding Level 5 didn't reset anything: saves from the four-level campaign keep their completions and best results, and anyone who had already beaten Level 4 finds Level 5 unlocked.
- Just opening a level page never marks it complete. Each game records completion itself, once, when its own win condition is met.
- Every level can still be opened directly by its URL, locked or not. Progress is a convenience, not access control.

---

## Running the game

```bash
git clone https://github.com/urcuqui/hack-the-planet.git
cd hack-the-planet
```

**Option A: local server (recommended)**

```bash
npm start            # or: node tools/serve.js
# open http://127.0.0.1:8080/
```

The server needs only Node.js (≥ 22) and has no npm dependencies. It binds to `127.0.0.1` by default; set `HOST` and `PORT` to change that.

**Option B: open the file directly**

Open `index.html` in a browser. Everything works from `file://`, including saved progress, because the shared module is a classic script and not an ES module. A few browsers isolate `localStorage` for `file://` pages, so if progress doesn't stick, use Option A.

### Browser requirements

- A current Chrome, Edge, Firefox or Safari with WebGL (Levels 1, 3 and 5) and the Web Audio API.
- An internet connection on first load: Levels 1, 3 and 5 load **three.js r128** from cdnjs (pinned version, Subresource Integrity checked).
- On machines without a GPU (virtual machines, remote desktops) browsers may turn WebGL off. Level 5 then shows a page explaining how to turn it back on (in Firefox: `webgl.force-enabled` = `true` in `about:config`).
- Audio only starts after you click or press a key, as browser autoplay rules require.
- Built for desktop with a keyboard and mouse. The hub is responsive, but the games themselves aren't designed for touch.

---

## Controls

| Level | Controls |
|-------|----------|
| **Hub** | `Tab` / arrow keys to move between missions · `Enter` to launch |
| **01 The Agentic Frontier** | `W A S D` move / strafe · mouse look (click to capture, Pointer Lock) · left click or `F` fire the Pulse Revolver (6 charges) · `R` reload · `Space` jump · `Q` scan · `I` activity log · `E` terminal · `Esc` / `P` pause · `M` music · classic: `↑ ↓` move, `← →` turn · sensitivity and invert Y in **CONTROLS** |
| **02 AI Incident Lab** | `WASD` / arrows move · `E` inspect system · `Tab` incident log · `1`–`9` pick an option in the analyzer · `Tab` / `Enter` move between and press buttons · `Esc` close panel / pause · `M` music |
| **03 Operation Ghost** | `WASD` move relative to the camera (A/D strafe) · `↑ ↓` forward/back · `← →` turn the camera · mouse drag look · `E` talk / enter or exit car · driving: `W S` throttle/brake, `A D` steer, `F` recover a stuck car · `Tab` case files · `M` city map · `1–9` choose in a case · `Esc` close / pause (music, controls and camera settings are in the pause menu) |
| **04 Neon Grand Prix** | `W` / `↑` accelerate · `S` / `↓` brake · `A D` / `← →` steer · `Space` boost · `Esc` pause / resume · `M` music · decisions: `1`–`3` or `↑ ↓` + `Enter` |
| **05 Digital Mayhem** | A **guided first incident** walks you through one real incident (skip it with SKIP GUIDE or untick it on the title screen); the strip under the top bar always shows your objective and next step · click a place, map label or incident card to investigate · drag / `W A S D` / arrows pan · mouse wheel / `+ −` zoom · `1`–`4` choose a response or recovery step · `G` switch KUKY ⇄ GHOST · `L` activity log · `R` CITYOS radio · `Space` pause / resume the simulation · `Esc` close panel / pause menu (volumes, radio, voice) · `M` music. `Tab` keeps moving keyboard focus, so the log is on `L` |

Every level has a **MISSION HUB** link on its start screen and on its end screens (success, and failure where a level can be lost).

**Onboarding.** No level opens with a tutorial page. Each one teaches through the first interaction and then gets out of the way: Level 1 shows one next step at a time (aim → scan → open the log → the terminal with a pending request, with its distance); Level 2 labels the robot you can inspect until your first inspection and shows the analyzer's EVIDENCE ▸ DIAGNOSE ▸ MITIGATE ▸ VERIFY steps; Level 3 starts you on the nearest case with a walk → talk → drive hint; Level 4 announces each AI anomaly on screen well before its decision; Level 5 has the guided first incident and an always-visible objective. Hints disappear once you have done what they describe.

---

## Knowledge Vault

The Mission Hub has three tabs: **MISSIONS**, **KNOWLEDGE VAULT** and **ACHIEVEMENTS**. Each mission reports what the player actually did at real decision points — a terminal decision, a verified fix, a case response, a race decision, a policy response — and a shared system turns that into progress on 11 AI security concepts:

| State | How you get there |
|---|---|
| ◆ **DISCOVERED** | You examined the evidence (never just by opening a screen, and never before the concept's name would stop being a hint) |
| ✓ **UNDERSTOOD** | You applied the right control. Unsafe or over-restrictive choices count as attempts, not understanding |
| ★ **MASTERED** | Later, you applied it right first time, without the guide, in a *different* mission (or a different case, for social engineering). Concepts with no independent scenario stay at UNDERSTOOD |

Learning XP (25 / 75 / 150) is paid once per milestone and cannot be farmed by replaying. Five specialist badges — AGENT CONTAINMENT SPECIALIST, AI SECURITY INVESTIGATOR, IDENTITY DETECTIVE, SAFETY-FIRST DRIVER, CITY GUARDIAN — have explicit conditions; none is given for finishing a mission. In a mission, a short **KNOWLEDGE UNLOCKED** card (with an original sound cue) appears after the decision that earned it, and waits while you are fighting, racing or driving. Locked concept cards never reveal names or answers. The full design — catalog, event mappings, reward conditions — is in [`docs/PHASE7-KNOWLEDGE.md`](docs/PHASE7-KNOWLEDGE.md).

## Mission notes

**How every mission teaches.** Each security decision follows the same arc: **evidence → decision → observed consequence → explanation**, and every consequence comes from the level's own simulation (nothing is a canned animation). Every end-of-mission report adds two practical lines per concept — **in the real world** (where this shows up outside the game) and **what to verify** (what a practitioner would check) — next to the residual risk, because no single control guarantees security. Mission completion, the operational result (combat, integrity, race, city stability) and the educational score are always reported separately, and each report says how its counts are made. The learning objectives and the Phase 6 usability review are in [`docs/PHASE6-REVIEW.md`](docs/PHASE6-REVIEW.md).

**Level 1: FSYNDICATE — THE AGENTIC FRONTIER.** *Three bounties. Three rogue agents. One digital frontier.* The cinematic intro (11 scenes: matrix rain, the PandeCorp skyline, a surveillance scan, a terminal break-in, a world-map cyberattack and the logo shatter) is offered in full on the first visit; later visits open on the briefing, with **WATCH INTRO** always available. Having seen it is stored separately from campaign progress (`htp.introSeen`) and never completes the level.

The mission is a cyber-western FPS on **Main Street**, a small low-poly town: the Saloon, the Sheriff's Office (tool-review terminal), the Telegraph Station (message-verification terminal), the Data Vault, a water tower, wagons, crates and barrels, and the north gate (`MAIN_STREET_EXIT`). Every structure is built from the same boxes that block movement, Pulse Revolver shots and the agents' line of sight (`js/arena/world.js`).

The **Bounty Board** shows three WANTED posters (LOCKED → AVAILABLE → IN PROGRESS → CONTAINED). One duel runs at a time; each opens with a short quick draw (*AGENT DETECTED · STAND BY... · DRAW!*) that shows where the agent stands. The agents are **simulations** — declarative configs (identity, goal, tools, permissions, states, combat stats) run by one deterministic state machine, not AI models:

```
PATROL ──(sight)──► DETECT ──(classified)──► TRACK ──(in range, authorized)──► ATTACK ──(burst)──► RECOVER
```

Every observation, simulated inference, tool request, policy decision and execution goes into an audit log. `Q` scans the agent in sight (a snapshot in the HUD); `I` opens the **Agent Inspector**'s full activity log — ATTEMPTED → AUTHORIZED → EXECUTED — and freezes the duel.

| Bounty | Agent | Concept | What happens | Best decision |
|--------|-------|---------|--------------|---------------|
| 01 | THE SCOUT · fast, fragile | Agent observability | It detects you, classifies you and asks to attack — all logged | Scan it in 2 states and read its activity log |
| 02 | THE ENFORCER · slow, armoured | Tool misuse (OWASP ASI02) | It drops barriers across Main Street (no scope configured) and asks to `lock_gate` the town's exit to "contain a suspect" | Scope its tools to the Data Vault; out-of-scope calls are blocked and logged |
| 03 | THE SIGNAL · agile, ranged | Insecure inter-agent communication (ASI07) | An order claiming to come from FRONTIER-CONTROLLER asks it to override security policy. The evidence: no valid signature, a public relay, a reused nonce, a sender not authorized for that action | Reject it unless it is signed, fresh, on the authenticated channel and authorized |

Terminals have no timer and every choice changes what the policy lets the agent execute: the exit gate locks and barriers come faster, the Enforcer repairs itself, the Signal floods the street with decoys and jams your scanner — or the calls are blocked. Undecided requests stay held (the policy default) and are reported as *not completed*. Containing all three bounties wins whatever you decide; three breaches lose the mission. The **AI SECURITY SCORE** (0–3) is reported separately and saved as Level 1's best result.

**Level 2: INVESTIGATE. PATCH. VERIFY.** KUKY walks PandeCorp's AI lab: three zones (A · INPUT & DATA, B · MODEL SECURITY, C · TRUST & RELIABILITY) joined by a corridor, two misbehaving AI systems per zone. There are no battles. Walking near a robot only *detects* it; `[E] INSPECT SYSTEM` opens the **AI Incident Analyzer**, and each incident goes EXPLORE → INVESTIGATE → DIAGNOSE → MITIGATE → VERIFY. The vulnerability's name stays hidden until you diagnose it from the evidence. Each case uses a different diagnosis interaction:

| Robot | Zone | Concept | Diagnosis | Verification needs |
|-------|------|---------|-----------|--------------------|
| INJECTOR-9 | A | Prompt injection | Mark the hidden instruction in a retrieved document | Separate instructions from data, plus output validation or least privilege |
| POISONER-X | A | Data poisoning | Select the poisoned training records (one keyword trap) | Provenance or quarantine, plus a dataset audit |
| INVERTOR-Z | B | Model inversion | Pick the querying client and what it exposes | Query monitoring, plus access control or output minimisation |
| ADVERSAR-1 | B | Adversarial examples | Compare the original and altered input | Adversarial training, plus input validation or human review |
| BIASBOT-7 | C | Training-data bias | Read a fairness dashboard (one small-sample distractor) | Data rebalancing and disaggregated evaluation |
| HALLUCIN-8 | C | Hallucination / grounding | Label each claim against the sources | Grounding, output validation and abstention |

Incident states are UNDISCOVERED, DETECTED, INVESTIGATING, DIAGNOSED, MITIGATION APPLIED, VERIFIED and NEEDS REVIEW. A wrong diagnosis or a failed verification costs 10% integrity and explains what to re-read, without giving the answer away. An incident only counts as resolved after verification passes. **SECURITY STATUS** shows residual risk and only goes down: each open incident weighs 2 (HIGH) or 1 (MEDIUM); a load of 7+ is CRITICAL, 4–6 ELEVATED, 1–3 GUARDED and 0 STABILIZED. At 0% integrity the mission fails and RESTART resets it cleanly. The final report lists the incidents verified, integrity, the first-time counts, the six KNOWLEDGE UNLOCKED concepts and an expandable record per incident (what happened, the evidence, controls, the check performed and the risk that may remain).

**Level 3: EVERY IDENTITY TELLS A STORY. NOT EVERY STORY IS TRUE.** GHOST, an urban intelligence operative, works a Cyber Miami Noir city at sunset: six districts (Miami Beach, Downtown Office, Club Neon, Ocean Pearl Hotel, Little Havana Market, Hacker Convention) built from one declarative layout, so every wall you see is the wall you collide with. Walking and driving run on fixed time steps (the same at 30, 60 or 144 fps); the camera follows smoothly, pulls in front of buildings and frames the person you are talking to. The HUD always shows the intel count, the active case, where it is (distance and compass direction) and the next interaction; `M` opens a city map where you pick any open case, and the route is drawn along walkable streets.

Each target is being worked by someone else, and GHOST investigates: **OBSERVE → TALK → INSPECT EVIDENCE → DECIDE → LEARN**. The technique is only named in LEARN. Every case has its own kind of analysis:

| Target | District | Technique | Analysis | AI angle |
|--------|----------|-----------|----------|----------|
| COCO (tourist) | Miami Beach | Baiting | Separate the lure from what it really costs | Offer pushed to 400 phones in 3 minutes, personalised by automation |
| MARCUS (executive) | Downtown Office | Impersonation | Mark each identity claim VERIFIED or CLAIMED | A voice note in the CFO's (cloned) voice; a generated profile |
| RICO (doorman) | Club Neon | Pretexting | Mark the lines that try to skip a security control | The security chief's writing style copied from public posts |
| DIANA (receptionist) | Ocean Pearl Hotel | Quid pro quo | Sort the trade: what is offered, what is asked for | An instant, adaptive "IT support" chatbot |
| CARLOS (street vendor) | Little Havana Market | Elicitation | Pick the friendly questions that gathered sensitive information | A synthetic "food blogger" with mass-produced reviews |

Wrong analyses and responses explain what would happen and let you try again; nothing is lost, but the report counts what you got right first time. Detection never relies on spelling mistakes: the messages are fluent on purpose. With five files, **CIPHER — THE TRUST NETWORK** opens a five-step final investigation (correlate tonight's operation with your case files, connect the incidents, separate verified from claimed identities, pick the controls, present a conclusion). The level only completes, and only records progress, when that analysis is done. The lesson that ties it together: *a convincing communication does not prove its origin.*

**Level 4: DRIVE THE CIRCUIT. DEFEND THE AI.** You start last on the grid of a closed Miami circuit. Every lap is the same road, and the minimap is drawn from the same geometry you drive. Each lap, one AI system in PandeCorp's smart-mobility grid misbehaves. The **AI SECURITY TELEMETRY** panel reports the anomaly first; on the next long straight the race pauses (no timer) and you decide what the system may do. The decision card separates **observed data**, the **model's inference** and the **requested action**.

| Lap | Concept | What you see | Best decision |
|-----|---------|--------------|---------------|
| 1 | Prompt injection | A roadside broadcast tells the route assistant to "ignore safety checks" | Keep it as untrusted data; policy changes need the signed channel and authorization |
| 2 | Adversarial inputs / sensor spoofing | Painted patterns make the camera see a lane bending right that LIDAR and the map don't | Cross-check independent sensors; fall back to a slower safe mode while they disagree |
| 3 | Agent permissions & human oversight | A read-only pit agent asks to switch off traction control and flash brake firmware | Approve only in-role calls; block safety-system writes pending human sign-off |

Wrong choices have visible, recoverable consequences on the track (hijacked throttle, a spoofed-lane drift, reduced grip). Every choice lets you finish: the race result and the AI security report are scored separately, and the report explains what happened, the residual risk and the better practice for each event. Race time counts from **GO** and excludes pauses and decisions.

**Level 5: DIGITAL MAYHEM — THE CITY IS SMART. THE SYSTEM IS BROKEN.** PandeCorp's **CITYOS** runs the Coral District with six autonomous agents (traffic signals, grid optimisation, drone dispatch, traffic prediction, hospital logistics, and the orchestrator that tasks them). A compromised update, v4.2.1, has switched their policy enforcement to *monitor mode*: the policy engine still flags bad tool calls, but lets them run. Every call goes through a real policy check (`js/mayhem/policy.js`). Your responses only change the policy, and what then happens in the city is whatever that policy actually lets execute. An incident counts as contained only when the policy would refuse every one of its unsafe calls.

The loop is **DETECT → INVESTIGATE → DECIDE → CONTAIN → RECOVER**. The inspector shows the agent, its role and enforcement mode, the tool call, target, permissions (critical, revoked and review-only tools are marked), the policy check, the evidence and the risk. Only responses that are valid right now are offered. Containment is not the end: you still restore the service and **VERIFY** it against explicit criteria. A correct decision does not guarantee recovery, and a failed verification explains what is missing at no cost.

| # | Incident | Concept | What happens | Targeted response |
|---|----------|---------|--------------|-------------------|
| 01 | Traffic control failure | Tool misuse | A District 1 signal agent forces green on all approaches at INTERSECTION 04 (District 2) | Revoke `override_signal`, enforce scope; its in-scope timing keeps running |
| 02 | Power grid anomaly | Least privilege | An energy *optimiser* holding critical switching tools opens the hospital feeder and sheds Block C "to avoid peak tariff" | Revoke the critical tools, keep battery dispatch |
| 03 | Spoofed dispatch command | Agent authentication | An unsigned "EOC priority override" on a public relay wants the whole drone fleet at Pier 9; a signed hospital request waits behind it | Require verified senders: the hospital drone flies, the fake order is held |
| 04 | Poisoned city data | Data integrity | An unreviewed feed (S-12) reports an empty corridor; the model learns it and jams Bayfront | GHOST confirms the ground truth, then quarantine S-12 and roll the model back |
| 05 | Cascading agent failure | Cascading failures | Validly signed delegated tasks from the orchestrator hit traffic, dispatch, prediction and the hospital at once | Use the dependency map to find the origin, isolate it and revoke its delegation tokens, then restore in dependency order (power → traffic → dispatch → hospital) |

Every incident also has a tempting unsafe answer (approve it, retrain on everything, trust the signed coordinator) and a safe but costly one (human review of calls that should simply be denied, isolating a whole agent, holding all dispatch, disabling prediction, shutting down all automation). The costly ones contain the threat but push services to manual capacity or leave the hospital waiting. Unsafe answers execute in the city and leave the incident open, so you can still recover. Earlier choices carry forward: the privileges you remove in INC-02 block one branch of the cascade in INC-05.

- **The living city.** Cars stop at real signal phases, queue behind each other and jam where an executed call caused it. Signals blink amber in manual mode and go dark without power. Windows go dark when a block is shed, and the hospital switches to amber backup lighting. Drones fly only for dispatches that actually executed. Network packets travel from each agent to the CITYOS tower for every logged call: green when allowed, amber when held, red when stopped halfway.
- **SYSTEM PRESSURE (0–5)** is computed from simulation state only: unresolved incidents (by severity), agents that executed unsafe calls in the last 10 s, failed containment, degraded services and an active cascade. Every change pops up with a **CAUSE / IMPACT / NEXT ACTION** note. Opening a panel or reading never raises it.
- **Guided first incident.** On a first play, INC-01 is walked through step by step: open the incident, read the policy check and the observability trace, respond, recover, verify. Each step is derived from the real simulation state and highlights the real control; the guide never acts for you, can be skipped at any time, and is remembered. Later, one-shot tips introduce GHOST, the dependency map, the log and System Pressure when they first matter.
- **Agent observability.** The inspector's AGENT OBSERVABILITY table lists every call the incident's agents make — the unsafe ones and their legitimate work — with the policy decision it gets *right now* and its result (executes, refused, held). After a response, a POLICY UPDATED note says what was blocked, what still runs, the impact and the next step. After containment, a RECOVERY plan lists what is blocked, what is still degraded and why, and what to do next.
- **No reading timer.** The simulation holds while an incident decision, the GHOST task list or a field check is open. `Space` and the pause menu freeze everything.
- **Failure** happens only on visible thresholds: city stability below 20 %, MERIDIAN GENERAL at 0 %, or 45 s at CITY-WIDE CRISIS. A banner warns before each one.
- **Two roles.** KUKY runs the Security Control Center. GHOST does short field checks (substation, EOC, Bayfront sensor, tower server room): walk to each hotspot, observe, file the report. The INC-04 fix and its recovery need GHOST's ground truth; the other checks are optional extra evidence.
- **Activity log (`L`).** Every proposed, approved, blocked, held, executing, completed and failed call, with policy findings, delegation and message provenance, filterable to incidents or to blocked/held calls.
- **Audio.** An adaptive, original synthwave score in four looping states: CITY PULSE, SYSTEM ALERT, DIGITAL MAYHEM and RECOVERY. Tempo and arrangement follow System Pressure. A single look-ahead scheduler makes changes on the bar line, and there is a ~5 s MISSION COMPLETE sting (and a defeat sting). UI, security and drone effects, plus ambience driven by the simulation (traffic, transformer hum, drone rotors, sirens and alert pings that grow with pressure). Master, music and effects volumes, music on/off and radio on/off are saved locally. **FRONTIER FM — CITYOS RADIO** posts short fictional bulletins (never repeated within 40 s), with optional browser speech that is off by default.
- **Intro.** A ~10 s skippable cinematic in the same city, with a title sting; replay it from the title screen. With *reduce motion* on, there is no camera movement, shake or pulsing.

The CITYOS agents are transparent state machines and policies, not language models. The results screen keeps the simulation outcome (stability, incidents, blocked actions, services, critical failures) separate from the educational score.

The educational text is deliberately simplified. Where a mitigation reduces a risk rather than removing it (input filtering against prompt injection, RAG against hallucination, adversarial training against evasion), the game says so.

---

## Project structure

```
hack-the-planet/
├── index.html               # Mission Hub (campaign map, status, reset)
├── level1.html              # 01 The Agentic Frontier: intro, Main Street, HUD, board, inspector, terminals (logic in js/arena/)
├── level2.html              # 02 AI Incident Lab: canvas lab, HUD, analyzer, report (logic in js/incident/)
├── level3.html              # 03 Operation Ghost: page, HUD, case panel, case files, map, CIPHER, results (logic in js/social/)
├── level4.html              # 04 Neon Grand Prix: page, HUD, decisions, report (logic in js/racer/)
├── level5.html              # 05 Digital Mayhem: intro, HUD, inspector, dependency map, field checks, log, radio, results (logic in js/mayhem/)
├── js/
│   ├── progress.js          # Shared campaign state: level list, unlocks, localStorage
│   ├── a11y.js              # Shared modal focus trap
│   ├── knowledge/           # Shared Knowledge Vault (classic scripts, also loadable in Node)
│   │   ├── concepts.js      #   the concept registry (stable ids)
│   │   ├── learning-events.js #   gameplay sources → concepts, validation
│   │   ├── rewards.js       #   learning XP and badge conditions
│   │   ├── progress.js      #   DISCOVERED/UNDERSTOOD/MASTERED, idempotent events, review, htp.knowledge
│   │   └── vault-ui.js      #   icons, unlock cards, reward sounds, Vault and Achievements views
│   ├── arena/               # Level 1 modules (classic scripts, also loadable in Node)
│   │   ├── world.js         #   Main Street geometry, collisions, line of sight, navigation, barriers
│   │   ├── player.js        #   movement, mouse look, aim direction
│   │   ├── agents.js        #   the three agents (declarative configs), state machine, tools, audit log, inspector data
│   │   ├── projectiles.js   #   swept pulse collisions (cover, ground, sky, per-agent bodies)
│   │   ├── security.js      #   tool policy, the three objectives, decisions, report
│   │   └── bounties.js      #   the bounty board: order, one active duel, breaches
│   ├── incident/            # Level 2 modules (classic scripts, also loadable in Node)
│   │   ├── world.js         #   tile map, zones, collisions, BFS paths, spawn validation
│   │   ├── cases.js         #   the six declarative incidents: evidence, diagnosis, mitigations, verification
│   │   └── investigation.js #   incident state machine, integrity, security status, report
│   ├── social/              # Level 3 modules (classic scripts, also loadable in Node)
│   │   ├── world.js         #   city layout (single source for visuals + collisions), districts, nav grid, A* routes
│   │   ├── movement.js      #   fixed-step walking, driving, traffic and follow camera
│   │   ├── cases.js         #   the five investigations and CIPHER's final analysis (declarative)
│   │   ├── intelligence.js  #   case state machine, case files, CIPHER unlock, report counts
│   │   ├── character.js     #   jointed low-poly rig, poses (feet stay on the ground), GHOST + NPC outfits
│   │   └── city.js          #   three.js scene builder: districts, facades, props, lights, cars
│   ├── mayhem/              # Level 5 modules (classic scripts, also loadable in Node)
│   │   ├── policy.js        #   CITYOS policy engine: tools, agents, grants, ALLOW / DENY / REVIEW, operator controls
│   │   ├── incidents.js     #   the five declarative incidents: calls, evidence, responses, field checks, recovery, verification
│   │   ├── simulation.js    #   deterministic crisis sim: services, dependencies, pressure, containment, recovery, win/loss
│   │   ├── audio.js         #   adaptive procedural soundtrack, SFX, ambience, radio bus, persisted settings
│   │   └── city.js          #   layout data (validated in Node) + three.js district: buildings, traffic, signals, drones, network
│   └── racer/               # Level 4 modules (classic scripts, also loadable in Node)
│       ├── track.js         #   the circuit: single source of truth for road geometry + minimap
│       ├── physics.js       #   fixed-step car physics (frame-rate independent)
│       ├── opponents.js     #   grid, AI rivals, race order
│       ├── security.js      #   the three AI security events and the report
│       └── render.js        #   pseudo-3D Canvas renderer
├── tools/
│   ├── serve.js             # Hardened local static server
│   ├── check-scripts.js     # Syntax check for every inline <script>
│   └── capture-trailer.js   # Records real gameplay of the five levels for the trailer
├── tests/
│   ├── progress.test.js     # Progression, unlock and storage-failure tests
│   ├── arena.test.js        # Level 1: controls, cover, pulses, agents, tools/permissions, audit, bounties, objectives
│   ├── incident.test.js     # Level 2: spawns, zones, diagnosis styles, mitigations, verification, status
│   ├── social.test.js       # Level 3: layout, collisions, routes, walking, driving, camera, cases, CIPHER, rig
│   ├── racer.test.js        # Level 4: circuit, physics, rivals, security events, report
│   ├── mayhem.test.js       # Level 5: policy, simulation, pressure, cascade, recovery order, incidents, city layout
│   ├── mayhem-audio.test.js # Level 5: audio gating, transitions, mute, volumes, pause, restart, stings (fake AudioContext)
│   ├── knowledge.test.js    # Knowledge system: registry, events, learning states, mastery, persistence
│   ├── rewards.test.js      # Learning XP and badge conditions
│   ├── serve.test.js        # Static server: valid, missing, malformed, traversal
│   ├── pages.test.js        # Links, completion hooks, SRI, intro still present
│   └── browser/
│       ├── cdp.js               # Minimal DevTools Protocol client (no dependencies)
│       ├── smoke.browser.js     # Headless Chrome campaign run (hooks + navigation)
│       └── gameplay.browser.js  # Plays the levels with real keyboard/mouse input
├── gen_gif.py               # Builds trailer.gif from captured gameplay (needs Chrome + ImageMagick)
├── trailer.gif              # README trailer (7.6 s, 640×360, 12 fps)
├── docs/PHASE6-REVIEW.md    # Learning objectives, usability review findings and open playtest questions
├── docs/PHASE7-KNOWLEDGE.md # Knowledge system: catalog, learning events, rewards, Vault, a11y/camera/audio changes
├── trailer-contact-sheet.png  # Frames from each scene, for reviewing the trailer
├── preview.gif              # Earlier illustrated preview
├── package.json             # npm scripts only, no dependencies
└── LICENSE
```

Each level is still a self-contained HTML file with its own engine, rendering and audio. Level 5 reuses Level 3's jointed GHOST rig (`js/social/character.js`) for its field checks; otherwise the only shared code is `js/progress.js`, which exposes `window.HTPProgress`:

| Function | Purpose |
|----------|---------|
| `recordCompletion(levelId, result?)` | Called by a level when its win condition is met. Saves the completion and any best results |
| `load()` | Current state. Missing, corrupt or inaccessible storage gives a fresh campaign |
| `statusOf(state, id)` | `'locked'`, `'available'` or `'completed'` |
| `nextLevel(id)`, `HUB_URL`, `LEVELS` | Campaign order and navigation |
| `reset()`, `isPersistent()` | Hub reset and the "progress can't be saved" warning |

---

## Testing

```bash
npm test               # unit + static tests (Node built-in test runner, no browser)
npm run test:browser   # headless Chrome smoke test of the whole campaign (~30 s)
npm run test:gameplay  # headless Chrome, real keyboard/mouse input only (~8 min)
npm run check          # syntax check of all inline scripts only
```

On macOS, run the browser suites under `caffeinate -dimsu` (for example `caffeinate -dimsu npm run test:gameplay`) when the machine may be idle: App Nap / idle sleep can suspend the test process for many minutes. `HTP_ONLY="level 4"` runs only matching gameplay subtests, and `HTP_DEBUG=1` logs progress.

- `npm test` covers progression and unlock logic, corrupt and throwing `localStorage`, the static server (valid files, 404s, malformed URLs, `..` and encoded traversal, sibling-prefix paths, dotfiles, symlink escape) and page wiring. `tests/racer.test.js` checks that the circuit closes and is identical every lap, that the minimap turns where the road turns, that road edges and penalties share one boundary, that physics match at 30/60/144 fps, that rivals stay on the asphalt, that each security event fires once on its lap, and that every combination of choices finishes with a distinct score and report. `tests/arena.test.js` covers WASD and classic movement, frame-rate independence, the pitch limit and aim direction, solid buildings and cover, pulses stopping at structures/ground/sky and hitting each agent's own body, temporary barriers, the Scout's state sequence and audit chain, agents never seeing or firing through cover and routing around it, every Enforcer tool decision (allowed/blocked/held, with reasons), held requests resolving after review, the Signal's message checks and their consequences, the bounty board's order, the inspector reading real log entries, and an honest report. `tests/incident.test.js` checks that every robot spawns on a walkable, reachable, non-overlapping tile, collisions, the six distinct diagnosis styles, that no case names its vulnerability before diagnosis, the poisoning keyword trap and the bias small-sample distractor, that different mitigations give different verification results, that a failed verification means NEEDS REVIEW and −10%, that nothing counts twice, that security status only goes down, and that all six incidents can be completed. `tests/social.test.js` checks that the city layout validates (talk spots and cars free and reachable, nothing overlapping), that every visible building and obstacle is solid, that routes never cut through buildings, frame-rate-independent walking and driving, normalised diagonals, smooth acceleration and turning, sliding along walls, speed-dependent steering, stuck-car recovery and safe exits, traffic that yields, a camera that stays out of walls and frames conversations, that no case names its technique before LEARN, that wrong answers explain without revealing, that the five cases complete in any order with no duplicate files, that CIPHER is locked until five and needs every step, and that the rig keeps feet on the ground in every animation.
- `tests/mayhem.test.js` checks the Level 5 policy engine (identity, grants, scope, privilege tiers, monitor vs enforce, human review, one-time approval, sender verification, quarantined feeds, revoked delegation). It also checks that the simulation is deterministic, that incidents trigger on time or on progress, and that only valid state transitions are accepted. It verifies that pressure comes from state (opening a panel changes nothing) and that every change is explained. Further checks: blocked calls never execute while legitimate work continues, every call is logged with its states, approval escalates, review holds, verified senders launch the hospital drone and hold the spoof, and the field-gated poisoning fix works. In the cascade, the wrong agent fails, the origin contains it, and recovery is ordered. Finally, dependencies are announced, failed verification has no penalty, best and costly strategies both win (scored separately), ignoring the crisis loses on a visible threshold, a new mission starts clean, the incident data is consistent, and the city layout is valid (routes on asphalt, right-hand lanes, no overlaps, field paths clear of buildings). `tests/mayhem-audio.test.js` runs the audio engine against a fake `AudioContext`: nothing before a gesture, one scheduler, bar-line transitions, mute, clamped and persisted volumes, pause ducking, restart without lingering nodes, 4–6 s stings, routing for every effect, and no crash without Web Audio.
- `npm run test:browser` starts the local server and drives Chrome over the DevTools Protocol. It walks the hub and all five levels in order and checks that:
  - audio only starts after a real click
  - skipping the intro can't reopen the menu mid-match
  - Level 2 shows KUKY, starts CRITICAL · 6 OPEN, opens nothing by proximity alone, and records integrity and first-try diagnoses; defeat and restart work
  - Level 3's CIPHER is locked with fewer than five files, a case resumes where it was left, five files alone do not complete the level, and the final investigation records it once
  - Escape is safe during the boss
  - Level 4 records position, time and security score, and hands over to Level 5
  - Level 5 has no audio before a click, holds the simulation while a decision is open, records stability and score only on a win, and replays from a clean state
  - progress survives a reload and a confirmed reset clears it
  - no page logs a console error

  It needs Chrome or Chromium (`CHROME_PATH` to override) and network access to cdnjs, and skips itself if no browser is found.
- `npm run test:gameplay` plays with real key and mouse events only; it reads game state to steer and to assert, but never writes it. It covers:
  - the hub with Tab/arrows/Enter and reduced motion
  - the full Level 1 intro without skipping, then skip, the bounty board, the quick draw, WASD, a mouse shot along the crosshair, music, pause, and a keyboard-only run of all three bounties that scans, opens the activity log and uses both terminals
  - Level 2 walked with WASD to each robot, `E` inspect, evidence, diagnosis, mitigation and verification for all six incidents (including a wrong diagnosis and a failed verification), defeat and restart, pause, the `Tab` log and the music toggle
  - Level 3 walked and driven with WASD to all five targets (keys and clicks through every analysis, one wrong analysis and one wrong response), pause with music off and controls, the city map, case files, a car, the locked and then unlocked CIPHER, the final investigation and on to Level 4
  - Level 4 driven **from the screen alone**: steering from the rendered asphalt pixels, speed from the HUD, decisions from the on-screen text; plus pause/resume, the music toggle and the report
  - Level 5 played with clicks and keys: the full intro, controls, drag/wheel/WASD camera, `Space` hold, `M` (no new notes while muted), the `Esc` pause menu, a map-label click, an approved unsafe request, GHOST field checks via `G` and digits, the wrong agent then the origin in the dependency map, an out-of-order restore, an early verification, results, review and a clean replay
  - that each music toggle actually silences the scheduled music (an audio-graph probe, not listening)

  It uses the real GPU when headless Chrome can and falls back to software WebGL, which is much slower.

### Manual checks (things automation can't judge)

1. Play the whole Level 1 intro without skipping: scenes, narration and audio drone, then the briefing. In the duels, check mouse look with Pointer Lock at a few sensitivities, that cover feels useful, that each agent is recognizable at a distance, and that the three duels feel different.
2. Listen to the music in each level, and check that `M` (Levels 2 and 4), the pause menu's **MUSIC** (Level 3) and `♪ BGM` (Level 1) toggle it right away.
3. Play Level 3 by hand: does walking feel responsive, is driving comfortable at different speeds, is the camera predictable around buildings and during conversations, are the districts and the five characters recognisable, and do the cases feel like investigations rather than quizzes? Try the map, case files and pause menu with the keyboard only.
4. Race Level 4 by hand: is the road readable at speed, do curves feel anticipatable, and is P1 a fair challenge? The automated driver finishes around P3 reading only the screen, but feel needs a human.
5. Play Level 5 by hand, without help: can you tell from the city alone which system is failing, are the evidence and the dependency map enough to choose well, does the pace feel tense but fair (a first run should take about 8–12 minutes), and does the music clearly rise and settle with System Pressure? Try **SPOKEN RADIO** in the pause menu on a browser with speech synthesis.
6. In the hub and Level 5, turn on *reduce motion* in the OS. The matrix rain and title glitch should stop.
7. Resize the hub to phone width: cards stack in one column, with no horizontal scroll.

### Trailer GIF

The README trailer is built from real gameplay. `tools/capture-trailer.js` starts the local server, opens each level in headless Chrome and plays it with keyboard and mouse input only, the same way the gameplay test does. It reads game state to steer, never writes it, and the game itself has no trailer or demo mode. (For Level 5 it only stores the guide preference as already skipped, so the footage shows the plain HUD.) `gen_gif.py` then picks each shot from the recorded state (the Scout being contained, the analyzer's verification passing, the fastest stretch of the race, the first CITYOS incident being opened), adds the titles and transitions, and encodes the GIF with ImageMagick.

```bash
python3 gen_gif.py                          # capture + build ./trailer.gif and ./trailer-contact-sheet.png (~1 min)
python3 gen_gif.py out/teaser.gif           # any output path; HTP_GIF_OUTPUT also works
python3 gen_gif.py --capture-only footage/  # only record the footage (1280×720 JPEGs + manifest.json)
python3 gen_gif.py trailer.gif --frames footage/   # rebuild from saved footage, no browser needed
```

Needs Node 22+, Chrome or Chromium (`CHROME_PATH` to override; a GPU keeps the 3D levels smooth), network access to cdnjs for three.js, and ImageMagick 7. It uses system fonts (Impact and Courier New Bold, with DejaVu/Liberation fallbacks); set `HTP_FONT_DISPLAY` / `HTP_FONT_MONO` to use others. Temporary frames are written to the system temp directory and removed afterwards.

| Time | Scene | Footage |
|------|-------|---------|
| 0.0–0.6 s | Opening | HACK THE PLANET title card |
| 0.6–1.6 s | FSYNDICATE · *Cyber Western combat* | Duel with THE SCOUT, through its containment |
| 1.6–2.6 s | AI Incident Lab · *Security investigation* | KUKY reaches INJECTOR-9, controls chosen, verification passes |
| 2.6–3.6 s | Operation Ghost · *Cyber Miami espionage* | GHOST walks Central Ave toward the sunset and the Art Deco blocks |
| 3.6–4.6 s | Neon Grand Prix · *High-speed racing* | The fastest stretch of lap 1 in the pack, played at 1.2× |
| 4.6–5.8 s | Digital Mayhem · *City under AI control* | The first incident hits the live city; KUKY clicks its map label and the inspector opens |
| 5.8–7.6 s | Call to action | PLAY. INVESTIGATE. DEFEND. LEARN. over one frame from each level, PLAY NOW, then fades back into the loop |

Gameplay timing varies a little between runs, so each capture yields a slightly different (but equivalent) cut. Check `trailer-contact-sheet.png` after rebuilding.

---

## Security and provenance notes

- **Third-party code.** three.js r128 is the only external script. It's pinned to an exact version and loaded with `integrity` (SHA-384) and `crossorigin`, so a modified CDN file is refused. The trade-off is that the game needs the CDN; vendoring the file would make it fully offline.
- **Dynamic HTML.** Game UI that inserts data (end screens, intel log, race standings, car cards, hub cards) uses `textContent` and DOM nodes, not HTML string interpolation. No `eval` or dynamic code execution.
- **Local server.** Serves only known asset types from the repo root and refuses dotfiles, `tools/` and `tests/`. Paths are checked with `path.relative` after URL decoding and again after resolving symlinks. Binds to localhost by default and is meant for development only.
- **Progress storage.** Kept in `localStorage`, so players can edit it. It's a convenience, not a trust boundary.
- **Audio.** All music and SFX are synthesised in code; no audio files ship. Some tracks are written as *homages* (code comments mention a Mega Man X–style theme, a motif "inspired by" Linkin Park's *In The End*, and a "Vice City" feel). These are original note sequences, but anyone distributing the game commercially should confirm none of them reproduces a copyrighted melody closely.
- **Level 5 audio and art.** The soundtrack, stings, effects and city are original and procedural, written for this game. Its progressions and patterns are generic synthwave building blocks, not recreations of any existing track, and the hospital uses a green "H" rather than the protected red-cross emblem. All companies, agents and places in CITYOS are fictional.
- **Names.** Level 3's convention sign now reads *HACKER CONVENTION* (it used to show a real conference name), and Level 4 no longer mentions *Top Gear*. Level 3's people, companies, phone numbers (555) and domains (`.example`) are fictional; the district names are real Miami place names used as setting.

---

## Known limitations

- three.js is fetched from a CDN, so Levels 1, 3 and 5 need a network connection the first time.
- Built for desktop and keyboard; the levels don't have touch controls.
- Levels 1, 3 and 5 need WebGL. Very old GPUs or blocked WebGL show a blank scene in Levels 1 and 3; Level 5 explains how to enable WebGL instead. Software WebGL (no GPU) works, but more slowly; Level 5 then turns off shadows.
- Progress is stored per browser and per origin, so `file://` and `http://127.0.0.1:8080` keep separate progress.
- Level 1's agents are scripted simulations of agent behaviour, not AI models; the security score reflects in-game decisions only.
- The smoke test triggers win conditions programmatically. The gameplay test plays with real input, but its bots read exact positions, so it shows that a level can be beaten, not how hard it feels.
- Level 3's five cases and CIPHER's analysis are fixed, hand-written scenarios. Pedestrians walk through GHOST rather than around him, traffic only yields (no crashes), and the city is a compact, stylised Miami, not a map of the real one.
- Level 5's crisis is deterministic: the same five incidents in the same order every run, so the tests can replay it exactly. The district has cars and drones but no pedestrians, and GHOST's field checks are short guided scenes, not free movement. The radio's spoken announcements depend on the browser's speech voices.
- Accessibility has been improved (focus traps in every modal dialog, text plus symbols for every security and learning state, live regions, 11 px minimum CSS text, reduced motion including Level 3's camera, reduced alerts in Level 5) but **not tested with assistive technology**. Aiming (Level 1), walking (Levels 2–3) and driving (Level 4) have no alternative to real-time keyboard/mouse control. Full accessibility compliance is not claimed.
- Knowledge Vault: four concepts have only one scenario and cannot be mastered yet; XP and badges reflect decisions in these games, not real-world competence. The Level 1 pointer-lock fix and the reward sounds are not exercised by headless tests.
- The learning objectives in `docs/PHASE6-REVIEW.md` describe what each mission asks players to do; no learner study has been run, so learning effects are not claimed.
- Level 2's incidents are fixed, hand-written cases, and the same every run. The evidence is simplified for teaching, and SECURITY STATUS is a simple weighting rule for this lab, not a real risk model.

---

## License

[MIT](LICENSE) © 2026 Christian Urcuqui

> *The system is watching. Are you ready to break it?*
