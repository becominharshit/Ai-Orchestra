# Build Your Own AI Agent (`/agent`, TASK-19, CHANGE-02a)

"Apna AI agent banao": a visitor picks one of 16 curated templates, designs the agent in about a minute with chips, and watches it do one real task.

- Flag: `AGENT_BUILDER=1` (default off). Core skips this folder while the flag is off. The counter comes from core's map (counter map v4: counter 4 when on). Never hard-code it.
- Run locally: `AGENT_BUILDER=1 npm run mock`, then open `http://localhost:8790/agent/?c=4` (phone) and `http://localhost:8790/tv/agent?c=4` (TV). Offline: `AGENT_BUILDER=1 npm run offline`. Filming: add `&demo=hero` to the phone URL.
- Tests: `node --test --test-concurrency=1 test/agent/*.test.js` (also part of `npm test`). Browser tour and screenshots: `node test/agent/e2e.mjs` (mock, offline, fake live) writes `docs/shots/TASK-19/`.

## Templates (CHANGE-02a: no open prompt)
Hackathon Teammate is a day plan only (09:00 to 21:00, lunch, dinner and a break at least every 2 h; CHECK-19 F4).
Padhai: JEE Prep Tutor, Boards Planner, Concept Explainer, Micro-Lecture Series Designer, Mock Test Strategist. Skills: Skill Roadmap, App Idea to MVP Planner, Hackathon Teammate. Startup: Startup Co-founder, D2C Brand Marketer. Creator aur campus: Content Creator Coach, Fest Event Planner, Debate Prep Coach. Career: Career Explorer, College Questions Coach. Khel: Cricket Strategy Analyst.
Each template (`lib/jobs.js`) has a fixed task, chip inputs only, the tools its output needs (`needs`, locked on), and a fixed output structure (`lib/compose.js`) built from reviewed data (`data/lookup.json`) and tool outputs. Study templates end with "Apne teacher/mentor se bhi discuss karo".

## Flow
1. **Template** (16, grouped). 2. **Task chips** (subjects, chapter, class, settings). 3. **Personality**: 3 sliders and a fun voice. 4. **Tools** (the template's required ones locked on), a generated name (1 of 3), the optional first name, the TV switch. 5. **Run**: the Agent Orchestra. 6. **Result** on the phone; follow gate; Agent card PNG (1080x1350) and story card (1080x1920: the agent's name, template and role only).

## How the agent works (agentic, but safe)
- `lib/plan.js`: ONE `claude-opus-5-5` call (effort low, structured output, closed schema, enums only) plans the steps and knobs, and picks reviewed line ids (an intro, one reason per step, 3 tips). It never writes text: the schema has no free string field (CHECK-19 F3). Core's proxy has no tool definitions, so the plan is strict JSON and our code runs the tools. Our own deadline (13 s, `Promise.race`) and the 20 s run budget hold whatever the SDK does.
- `repairPlan()` is the authority. `lib/tools.js`: calculator, calendar (day by day, spaced revision, or a timed event day), curated lookup, notes. All deterministic and tested on every configuration (`test/agent/tools.test.js`).
- Offline, mock, hero or a failed, slow or hung call: the banked plan for the visitor's personality (`fixtures/plan_*.json`), with the same real tools and reviewed data, so every chip combination of every template has a banked result.

## TV (CHECK-19 F1)
- The phone never posts to the TV. `server.js` publishes the whole run to the counter TV (`ctx.bus.publish`) on the same timeline the phone plays (`web/timeline.js`). Core refuses every agent TV event type from phones (`ctx.bus.serverOnly`).
- The TV hook (`web/tv.js`) shows a run only after its run id checks out at `GET /api/agent/tv/:id`, and draws the result card from the server's copy, never from the bus. `web/tvcheck.js` range-checks every number and length-checks every label.

## Safety (CHECK_build 12 and 13)
- TV, cards and the orchestra: only `publicText()` lines (registered in `lib/text.js`), small bounded numbers.
- Phone wording comes only from reviewed banks (`lib/banks.js`: 6 intros per voice, 6 lines per tool, 8+ tips per template with chip-specific ones first), picked by id. `lib/guard.js` and core's judge stay as a backstop on the composed lines; every bank line passes both (`test/agent/banks.test.js`).
- Optional first name (`lib/name.js`), CHECK-19 round 6: shown (phone and Agent card) only if it is on the allow-list (`data/names.json`) AND passes shape, core's profanity filter, the blocklist and bad tokens, core's crisis gate and the live AI check. Anything else, in every mode, and anyone who skips the name, gets the same friendly picker on the result: "Apne agent ke liye ek naam chuno" with 3 core-generated nicknames (`POST /api/agent/nickname`); the picked one goes on the phone and the card. No wording ever says a name was rejected. The list: 4,002 curated Indian Latin + 786 curated Devanagari + 1,145 vetted spelling variants (5,933 Indian) + 809 Western names that are not English words; rebuild with `node experiences/agent/ops/build-names.mjs` (sources in `data/names-src/`).
- The Agent card is drawn on the phone's own canvas from server `publicText` (plus the checked first name); a modified phone could draw anything on its own PNG, which is the same trust level as any client.
- Nothing is stored or logged. Analytics are counts only.

## Cost (for the $350 cap)
Per use: 2 model calls (plan + judge backstop); with a first name 4 (+ core's live crisis check on the name + the name check). Plan about 2,100 input tokens (it now sees the reviewed lines it picks from) and 200 to 1,500 output (JSON plus adaptive thinking at effort low); judge about 380 in and up to 400 out; name check about 200 in and up to 300 out. About $0.02 to $0.03 per use typical, about $0.05 worst case.

## Files
`server.js` routes (`GET /api/agent/bundle`, `POST /api/agent/run`, `GET /api/agent/tv/:id`, `POST /api/agent/tv/end`) · `lib/jobs.js` templates and validation · `lib/plan.js` planner, repair, execute · `lib/tools.js` tools · `lib/compose.js` each template's sections · `lib/text.js` public text and phone banks · `lib/banks.js` reviewed wording · `lib/guard.js` backstop guard · `lib/name.js` first name · `data/lookup.json` curated data · `data/names.json` first-name allow-list · `web/` phone app, Agent card, timeline, TV hook and its checks.
TODO(student): add a template (a block in `lib/jobs.js`, its data in `data/lookup.json`, its sections in `lib/compose.js`, then the tests).
