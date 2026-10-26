# AI Jyotish (counters 1, 2 and 8; 2 is AI Startup Studio when its flag is on) + Dost compatibility

Name + DOB + birth place (+ optional time) + palm photo. Six agents read it live:
"Tum kaun ho", 3 past, 3 future (behind the follow gate), then Career / Dating / Health tabs.
The counter TV shows the palm with glowing line overlays and the reading typing out. For fun only.

## Run

```
npm run mock        # no API key: Claude answers are the fixture for that sign + number
npm run offline     # fixtures only, no network
PORT=8801 CLAUDE_MOCK=1 node core/server/index.js   # same as mock, on another port
```
Phone: `http://localhost:8790/jyotish?c=1` · TV: `http://localhost:8790/tv/jyotish?c=1`
Filming: phone `/jyotish?c=8&demo=hero` (fictional Aarav, illustrated palm, runs by itself),
TV `/tv/jyotish?c=8&capture=1&layout=portrait` (keys: `R` replay, `2` half speed, `P` pin).

Tests: `node --test test/jyotish/*.test.js` (maths, guard, routes, privacy) and
`node test/jyotish/e2e.mjs [--shots]` (Playwright, phone + TV, mock + hero + offline; shots in `docs/shots/TASK-02/`).

## The agents (each one is real work)

| Agent | Work | Where |
|---|---|---|
| Jyotish Guru | orchestrates, hands off | `web/app.js` |
| Rashi Agent | sun sign from the DOB (tropical dates, Hindi rashi name) | `web/lib/astro.js` |
| Ank Agent | life-path number, master numbers 11/22/33 kept | `web/lib/astro.js` |
| Hast Rekha Agent | Claude vision traces heart/head/life/fate as 0..1 points | `lib/prompts.js` READING, `web/lib/palmlines.js` |
| Kaal Agent | past x3 + future x3 (same call) | READING schema |
| Career Agent | AI-era career read, skills, roles, link to Career Studio | READING schema |
| Dating Agent, Health Agent | tabs; the model only **picks ids** from the curated banks; **phone only**, never on the TV, never in `?demo=hero` | VIBES schema, `lib/banks.js` |
| (judge) | second read of every model-written reading line; flagged lines replaced | JUDGE schema |

Live: reading + vibes in parallel, then the judge (`claude-opus-5-5`, effort low, structured JSON). Mock: same calls, canned. Offline: fixtures only.

## Public text (CONTRACT 13, CHECK_build items 12 and 13)

- The TV and the share cards show **only** reviewed bank lines and fixed templates from `lib/public.js`, `web/lib/publictext.js`, `lib/dost.js` and `web/lib/dosttext.js`. `server.js` registers all of them with `ctx.safety` and returns `{ pt, text }` objects in `public`; the phone sends those strings to the TV and the card.
- The model picks ids (`picks` in the reading schema, ids in Dost and vibes). It writes no text anywhere (bank-only).
- Nothing a visitor typed reaches the TV or a card: names stay on the phone, Dost uses generated nicknames.
- Every typed field (names included) goes through the care check (`web/lib/care.js`, core `kit.guardText` + local list).
- New TV text = add it to a bank or template first; `node test/jyotish/e2e.mjs` runs with `PUBLIC_TEXT_STRICT=1` and fails on any unregistered string.

## Dost compatibility (`/jyotish/dost.html`, TASK-15)

2 to 4 friends on one phone: first name (phone only), DOB, optional palm photo (phone only). The server gets sign, life path and age band per friend and answers a squad energy, a role per friend, two squad lines and a fun 70-99% score, all from `lib/dost.js` banks (the model picks ids). TV: energy, roles under generated nicknames, squad lines. Share card "Hamari squad ka AI vibe report" behind the follow gate. Stage board "Aaj ki green-flag squads" (`ctx.stage`, only for visitors who picked a big-screen nickname). Hero: `/jyotish/dost.html?demo=hero`.

## Bank-only (lead decision after CHECK-02c)

Every line a visitor reads, on the phone, the TV or a card, is a reviewed bank line: Tum kaun ho (40), Past (53),
Future (53), titles, career sets, palm meanings, Dating/Health and Dost. The model traces the palm (geometry) and picks
ids; it writes no text, and the schema has no free-text field. Offline/mock picks rotate by sign AND life path (144
combinations, all distinct, no repeated line within a reading). Core's judge checks the picked lines in live mode; an
unapproved pick falls back to the sign + number default. `lib/guard.js` stays as the copy check for the banks.
Care check (`web/lib/care.js`): every typed field, first names included, through core's detector and a local list.

## Files

- `server.js` routes: `POST /api/jyotish/reading`, `/vibes`, `/tvpalm`, `/end`, `GET /palm/:t`.
- `lib/prompts.js` system prompts + JSON schemas (counts are in descriptions; the guard enforces them).
- `lib/guard.js` output guard (see above). Add words to `RULES` and a probe to `test/jyotish/probes.js`.
- `lib/banks.js` curated Dating/Health banks. Append only (ids are positions); every line must pass the guard test.
- `fixtures/reading.json` 12 readings, one per sign (SIGNS order); also the replacement bank. `fixtures/vibes.json` 12 id picks, one per life path (1-9, 11, 22, 33). Offline also swaps in a life-path line, so sign + number feel personal.
- `demo/hero.json` fictional filming profile; `web/assets/hero-palm.svg` illustrated palm the stock line set matches.
- `web/palm.js` + `palm.css` overlay renderer (phone and TV). `web/tv.js` + `tv.css` TV hook (palm dock, spotlight, typing).

## Privacy (do not break these)

- The phone sends sign, number, age band, time bucket and the palm JPEG. **Never the name, DOB or birth place** (the place is only a badge on the phone).
- The Ank Agent log (mirrored to the TV) says only "digits reduce karke add kiye -> N", never the month/day/year roots.
- The palm is downscaled to 768 px and re-encoded in the browser (drops EXIF). The server keeps it in memory only:
  passed to Claude, and (TV switch on) a slot for the TV that the phone clears as soon as the reading is done (2 min max).
  The TV fetches it once into a blob URL and frees it when it goes back to idle. `tvpalm`/`end` do not use the rate limit.
- The TV gets generated text, line geometry and the image URL. Core's bus rejects names, DOBs, places, handles.
- Future lines and the share card are not in the page until "Maine follow kar liya" (honour-based gate).

TODO(student): a Vedic (sidereal) rashi toggle; more fixture variety per sign; a left/right hand hint on the photo step.
