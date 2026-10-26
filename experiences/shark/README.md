# AI Sharks (`experiences/shark/`)

Public name **AI Sharks** (never "Shark Tank"). Counter 3 TV: `/tv/shark?c=3`. Phone: `/shark?c=3`. For fun only, no real money.

## Versions
- **v2 (default, TASK-13)**: `/shark/` -> `web/boot.js` -> `/shark/v2/`. Fictional panel (Seth Dhanraj, Riya Rao, Kabir 'Scale' Mehta, and Mummy Angel Investor in about 1 game in 5), a 4-card pitch (Idea, Customer, Problem, Paisa; 15 s each, voice first, "Type karo" always visible), review, 3 follow-ups in character (10 s), a 4-axis scorecard (Idea, Customer, Money, Pitch energy /10), per-shark Deal / Main out hoon, co-founder mode, a leaderboard (`total` /40) and big-screen turns via core's Stage API.
- **v1**: `SHARK_V2=0` (or open `/shark/v1/`): one 60 s pitch, 3 sharks, scores /10.

## Safety modes (core `safetyMode`, lead decision after CHECK-13b)
- **degraded** (no live AI crisis check: no key, mock, offline, API down, spend cap): **chips only**. The visitor picks an idea type and one reviewed answer per card and per follow-up. There is no typing or voice; the server refuses free-text cards and answers (409 `chips_only`), and v1 (free text only) refuses and sends the visitor to v2.
- **live**: voice first, typing, and the chip path as an option. Every visitor field (cards, answers, the re-sent pitch, v1 and v2) goes through `await ctx.safety.inputLive(...)` (core's live crisis check), then our rules, then the model's `safe` field.
- Care (self-harm, crisis) is judged by core's `care.detect` only. `lib/safety.js` has no care rules of its own.
- Tests: `node --test --test-concurrency=1 test/shark/*.test.js` (degraded on mock; live through `test/shark/fake-live.mjs`, a fake live client that records what the crisis check sees), `node test/shark/e2e-v2.mjs` (mock, offline, live), `node test/shark/e2e.mjs` (v1 on the fake live server).

## Safety (CHECK-05b, CHECK_build items 12 and 13)
- **TV and share card: templates only.** Every string that can reach the TV or a share card is in `web/tvtext.js` (banks + templates), registered with core's public-text registry (`registerPublicText` in `server.js`). The server returns `tv` and `share` blocks; the phone mirrors only those. The visitor's words and the model's lines never reach the TV.
- **Phone text**: every model line goes through `lib/guard.js` (full text first; NFKC, leetspeak, honorifics, Devanagari echo, unknown proper nouns, put-downs, our safety rules, core textfilter), then the judge (`ctx.safety.judge`, live mode), then is replaced from the template bank if flagged.
- **Visitor input**: care path first (core `care.detect` / care card with Tele-MANAS 14416; our `lib/safety.js` care rules as fallback), then `lib/safety.js` for the other unsafe kinds, in every mode, on every card and answer. Regression sets in `test/shark/pitches.js`.
- `lib/coreapi.js` uses core's `ctx.safety` / `ctx.stage` when present and a same-shape local fallback otherwise.

## v1 flow
1. Pitch in 60 s by voice (browser Web Speech API, `en-IN`, live transcript) or by typing. Idea prompts for people who freeze. Audio never reaches our server, only text.
2. Agent Orchestra: **Host Agent** (orchestrator) -> **Safety Agent** (local word filter, `lib/safety.js`, runs before any Claude call) -> **Shark VC / Shark Marketing / Shark Finance** (one Claude call, one question each) -> visitor answers each in about 15 s (voice, quick chip, or text; "Pass" is fine).
3. Scoring (one Claude call): score /10 per shark with one line why, catchphrase, compliment, one fix; **Lesson Agent** picks the mini-MBA concept. DEAL = at least 2 of 3 sharks at 7+.
4. Follow gate, then the reveal (phone and TV together): cards flip, total, DEAL / MAIN OUT HOON stamp, mini-MBA lesson, share card (1080x1920), "Doston ko bhejo".

## Files
| file | what |
|---|---|
| `server.js` | routes `GET /api/shark/prompts`, `POST /api/shark/questions`, `POST /api/shark/verdict`; counts `verdict_deal`, `verdict_out`, `pitch_mode`, `safety_redirect` (counts only) |
| `lib/prompts.js` | Claude system prompts + JSON schemas (model `claude-opus-5-5`, effort low, via `core/server/claude.js`) |
| `lib/safety.js` | Safety Agent word rules (adult, violence, drugs, betting, cheating, privacy, hate, language, care) + kind redirect copy |
| `lib/engine.js` | offline / mock / hero answers: 12 fixture ideas + a generic scorer for any typed idea |
| `lib/lessons.js` | mini-MBA concept -> Zenith course name. **Zenith wording only from zenith.json / zenithschool.ai.** |
| `lib/guard.js` | output guard on every model line: core textfilter, no negativity, no echo of the visitor's own words (names, schools, places) |
| `data/zenith.json` | vendored read-only copy of Lead Magnet `cf_data_v60/zenith.json` (see `data/COPIED_FROM.md`); `node experiences/shark/ops/check-data.mjs` proves it equals the source |
| `lib/text.js` | cleaning: no dashes, no handles/phones/emails, self-introduced names become "founder" |
| `fixtures/pitches.json` | the 12 fixture pitches (prompt chips + their questions) |
| `demo/hero.json` | fictional filming pitch (`?demo=hero`), with a fixed 9/8/6 DEAL verdict |
| `web/` | phone app (`index.html`, `app.js`, `style.css`), `sharks.js` (the 3 SVG shark avatars), `voice.js`, TV hook `tv.js` + `tv.css` |

## Run and test
```
npm run mock          # no key needed; open http://localhost:8790/shark/?c=3 and /tv/shark?c=3
npm run offline       # fixtures only, no network
node --test --test-concurrency=1 test/shark/*.test.js   # unit + HTTP (mock and offline)
node test/shark/e2e.mjs                                  # v1 Playwright tour (fake live server), shots -> docs/shots/TASK-05
node test/shark/e2e-v2.mjs                               # v2 Playwright tour (solo, voice, co-founders, Mummy, care, hero, TV), shots -> docs/shots/TASK-13
```
Filming: `/shark/?c=3&demo=hero` runs the fictional pitch end to end by itself; TV `?capture=1&layout=portrait`, `R` replays.

## Changing things
- Questions or scoring tone: `lib/prompts.js`. Keep scores 4 to 10, never mock the visitor.
- Add a fixture idea: append to `fixtures/pitches.json` (`keywords[0]` = its own phrase), run the tests.
- TODO(student): add Hinglish spellings to `lib/safety.js` that you hear at the stall; add more prompt ideas.
