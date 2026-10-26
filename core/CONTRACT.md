# play-zenith core contract (for experience authors)

Status: **stable for TASK-02..06** as of 24 Oct 2026. Additive changes only from here; anything breaking goes through the core owner.

## Clarifications (no interface changed)
- **2026-10-24 Clarification 1: `[hidden]` always hides.** `tokens.css` now has `[hidden] { display: none !important; }`. Before this, a component rule like `.box { display: grid }` beat the `hidden` attribute, and the sample's share card was reachable before the follow gate. Still: never style a gated element with `display` unless you use `:not([hidden])`, and add an e2e check that the reward is hidden before unlock (see `test/core/e2e.spec.js`).
- **2026-10-24 Clarification 2: bus wire format** is now documented in section 4 (event shapes, allowed keys, limits, response). The bus also cleans text server-side (140 chars, links removed, profanity masked) and rate-limits each session; neither changes the API.
- **2026-10-24 Clarification 3: `kit.api` errors and 429.** See section 3: 429 waits exactly `Retry-After` and then retries; other 4xx throw. Server side, return `res.status(400).json({ error: 'bad_input', message: '<Hinglish>' })` for validation errors. Default `SESSION_LIMIT` is now 40 per 10 min, counter staff phones are exempt once paired at `/staff` (section 5), and `?demo=hero` requests are exempt (fixtures, no cost).
- **2026-10-24 Clarification 4: Express 5 routes.** Section 2: path syntax rules.
- **2026-10-24 Clarification 5: files.** Section 2: an experience writes no files except through core helpers.
- **2026-10-24 Clarification 6: "Doston ko bhejo".** The sample now has the button; section 3 shows the 3 lines. Every experience shows it next to the share card, after the gate.
- **2026-10-24 Clarification 7: public link routes `/p/:token` and `/stop`.** `register(ctx)` may call `ctx.publicRoute('/p/:token', handler)` and `ctx.publicRoute('/stop', handler)` (also available as `ctx.core.publicRoute`). Only these two paths exist; each can be taken by one experience (Career Studio uses both). Any method is accepted; JSON and form bodies (64 KB) are parsed. Core sends `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`, and never logs these URLs (an error is logged as `/p/:token` without the token). Handlers must not log the token either.
- **2026-10-24 Clarification 8: counter map v2.** 1-2 `jyotish`, 3 `career`, 4 `shark`, 5 `reel`, 6 `asli` (`COUNTER_MAP` in `core/server/config.js`). The hub, `/api/core/experiences`, the admin labels and the TV use it. `/tv/<exp>` without `?c=` uses the experience's first counter; a `?c=` that belongs to another experience shows a staff warning.
- **2026-10-24 Clarification 9: agent `label`.** Agents may have a short `label` (max 12 chars, e.g. `VC`, `MKTG`, `CFO`). It is the mission-log tag and the roster prefix ("VC · Shark"). Without it the tag is the role when the role is 12 characters or fewer, else the first word of the name. The orchestrator's tag is always `LEAD`.
- **2026-10-24 Clarification 10: bus privacy and abuse limits.** Image values (`data:image/...`, e.g. the palm photo) are dropped from the server's replay buffer when the session ends (an `end` event or the next visitor) or 3 minutes after they arrived, whichever comes first; the TV page drops them from its own copies at `end` too. Replays show the overlay without the photo, so send overlays (paths, points) separately from the image. The publish limit is keyed on the server's session cookie + IP (120 POSTs / 1500 events per minute) plus the IP alone (1200 POSTs per minute), not on the body `sid`. The profanity mask splits punctuation off first and also catches spaced (`f u c k`), dotted, starred (`f*ck`), leetspeak and vowel-dropped (`fck`, `chtya`) forms; an allow-list keeps "sex ratio", "MC Stan", "3000 BC" and "sab chod diya".
- **2026-10-24 Clarification 11: the follow gate is honour-based by design.** Anyone can open the console and call a hidden button's handler; that is accepted. Never put anything behind the gate that would be a problem if a visitor saw it without following.
- **2026-10-24 Clarification 12: kit defaults.** On TV layouts the camera minimums (names 36 px, roles and chips 24 px, log 22 px at 1080p) are enforced by core with `!important`; experience CSS cannot lower them (use the orchestra `scale` option to go bigger). `tvToggle(onChange, { hint, label })` takes your own reassurance line. `makeShareCard` shrinks the title (112 to 72 px) and the lines (42 to 30 px, then fewer rows per line) before it shortens anything with an ellipsis, draws up to 6 lines and never drops one silently; its result has `layout { titleSize, lineSize, rowsPerLine, given, rendered, shortened }`. `/favicon.ico` is the Zenith shield. `npm test` runs `test/core`, then `test/<id>/*.test.js` for every experience folder that has tests, then every `test/<id>/playwright.config.js`; `npm run test:core` runs only the core suite. Root aliases `npm run asli:check|asli:add|asli:list|asli:approve|asli:voices` run the AI ya Asli? content tools.
- **2026-10-24 Clarification 14: core TV labels.** Every core-owned TV label (top bar, counter badge, QR caption, hook line, chips, spotlight kicker and footer, orchestra kicker, LIVE/NOW tags, stat labels, log head, operator alert) is at least 22 px at 1080p, and the "For fun only" chip is at least 24 px, enforced with `!important` floors in every TV layout (e2e scans every visible text node on the TV).
- **2026-10-24 Clarification 13: re-check 2 hardening (no interface change).** The profanity mask now also matches word families (plurals, Hindi endings like -pa -iya -ke -ka -on -yan, compounds like fuckwit and dumbfuck) and Devanagari (after NFC, nukta- and vowel-sign-tolerant). Short or ambiguous roots match whole words only. An allow-list covers names and harmless phrases (Dick as a name, Moby Dick, Lund University, BC Roy, Gand Sahab, Harami Pass, pussy willow, Loda Mavi, chhod do, chakka, sab chod diya). The link stripper never eats degree abbreviations (B.Com, B.Tech, M.Sc, Ph.D). It is defence in depth: still never send visitor-typed text to the TV. Staff can wipe a TV at once: key **B** on the TV page, or **Clear counter N** on `/admin` (key-gated; TVs get an SSE `clear` message and drop the live and last session). `/P/x`, `/STOP` and `/stop/` get the same public-route guard as the lowercase forms. The TV size floors also cover `.orx-lines li`, `.orx-msg`, roster rows and their chips. Fresh clone: `npm install && npm run setup` (installs experiences/*, reel-worker and print, plus Playwright Chromium); `npm test` stops with a clear message when setup has not run. Tests may not read files outside the repo and may not hard-code ports (core e2e picks free ports; `PZ_E2E_*_PORT` are optional overrides).

Reference implementation: `experiences/_sample/` (copy it to start). Run `npm run mock` and open `http://localhost:8790/_sample/?c=9` and `http://localhost:8790/tv/_sample?c=9`.

## Additions
- **2026-10-24 Addition 3: public pages, counter map v3, spend budgets** (TASK-20, CHANGE-02). New section 14: `ctx.publicPage()` serves `/<letter>/:code` pages (Startup Studio uses `/s/:code`) rendered by core from a vetted template with typed slots, noindex, expiry and a Report button. Status: **final and implemented** (14.1 to 14.6 public pages, 14.7 counter map v4 with flags, 14.8 per-experience daily budgets).
- **2026-10-24 Addition 2: shared safety** (TASK-16, CHECK_build item 12). New section 13: public text only from vetted banks and templates, a judge pass for phone-only AI text, and the self-harm care path. **All 5 experiences migrate to it.** `PUBLIC_TEXT_STRICT` starts in warn mode and is switched on once every experience has migrated. Status: **final** (approved by the lead 24 Oct), implemented in `core/server/safety.js`, `core/web/care.js`, `core/web/care-words.js`.
- **2026-10-24 Addition 1: Stage API** (TASK-12, CHANGE-01). New, additive: section 12 below. Every TV becomes a stage when idle, and experiences get leaderboards, "Big screen pe khelo" turns, the anchor / record card and the reward token from core. All features are behind flags that default on. Nothing already in this contract changes. Status: **final** (approved by the lead 24 Oct) and **implemented** (`core/server/stage.js`, `core/web/stage.js`, the TV loop in `core/web/tv.js`); see Addition 2 for the `extra` text rule. `ctx.stage.core === true` tells an experience that core stage mode is present.

## 1. Folder layout

```
experiences/<id>/
  server.js            optional. export default function register(ctx) { ... }  (may be async)
  web/index.html       the phone app, served at /<id>/   (/<id>?c=3 redirects to /<id>/?c=3)
  web/tv.js            optional TV renderer hook (section 6)
  fixtures/<set>.json  offline/demo answers, an array shaped exactly like your Claude schema (or { "items": [...] })
  demo/hero.json       fictional filming profile (section 7)
  meta.json            optional { name, hook, icon, forFun } for ids not in the hub list (config.js EXPERIENCES)
```
Ids: `jyotish`, `career`, `reel`, `shark` (public name **"AI Sharks"**, never "Shark Tank"), `asli`. Pattern `^[a-z_][a-z0-9_-]{0,30}$`.

## 2. Server: `register(ctx)`

`ctx` fields (all already bound to your experience id):

| field | what |
|---|---|
| `app` | an Express Router mounted at `/api/<id>/`. `app.post('/reading', ...)` is `POST /api/<id>/reading`. JSON bodies up to 4 MB are parsed. |
| `claude.run({ task, system, messages, schema, mock, maxTokens=2000, effort='low' })` | returns the parsed JSON matching `schema`. Throws `DemoFallback` (see below). `mock` = object or `(args) => object`, used when `CLAUDE_MOCK=1`; it is checked against `schema`. |
| `claude.image(base64Jpeg)` | builds a vision content block. Downscale in the browser first (`kit.downscaleImage`, max 768 px). |
| `claude.mode()` | `live` / `mock` / `demo` / `no_key` / `spend_cap` |
| `demo.wrap(set, { seed, req }, fn)` | runs `fn` (your `claude.run`), on `DemoFallback` answers `fixtures/<set>.json` picked by `seed` (same seed, same fixture). With `?demo=hero` it always answers the hero fixture. Returns `{ data, demo, reason }`. |
| `demo.pick(set, seed)`, `demo.register(set, array)`, `demo.hero()`, `demo.isHero(req)` | fixture helpers |
| `limits.guard()` | middleware for every Claude-backed route: per-session + per-IP rate limit and one global in-flight slot. Busy = `503 {error:'busy', queue:{ticket, ahead, retryMs}}`, over limit = `429 {error:'slow_down', retryMs}`. The web kit handles both. |
| `limits.rate()` | rate limit only (cheap routes, uploads) |
| `analytics.inc(event)` | standard events: `start complete gate_view gate_open_ig gate_unlock share ref_visit fallback error` (the web kit sends most of these for you) |
| `analytics.declare([names])`, `analytics.count(name, dim?)` | extra count-only events, e.g. `count('verdict_deal')`, `count('round_right', { round: 3 })`. `dim` = exactly one key with an int 0..99 or a short enum `[a-z0-9_]{1,16}`. Never free text. Declared names may also be counted from the browser with `kit.track(name, dim)`, unless you declare them server-only: `analytics.declare([names], { serverOnly: true })`. **`POST /api/core/track` takes only client-trackable events (CHECK-12 F2):** `start`, `complete`, `gate_view`, `gate_open_ig`, `gate_unlock`, `share`, `ref_visit`, `error` and your declared extras. `reward_given`, `care_shown` and `fallback` are counted by core itself, and extras named `lead_*` or `wa_*` are always server-only, so a phone can never inflate them (400 `server_only`). They appear in `/admin` and `/admin/export.csv` as extra columns. |
| `bus.publish(counter, sid, events)` | push TV events from server code (e.g. reel worker progress) |
| `bus.allowKeys([keys])` | extend the TV-safe allowlist for your result payload keys |
| `config` | read-only config without secrets (`model`, `publicUrl`, `demoMode`, `offline`, `mock`, ...) |
| `log(obj)` | JSON line to stdout. **Never log request bodies, prompts, answers, names, DOBs or images.** Core's access and error log lines carry only the matched route shape (`exp` plus the route pattern, e.g. `{ exp: 'jyotish', p: '/reading' }` or `{ p: '/api/core/stage/queue/:ticket' }`), or `p: 'unmatched'`, plus the status: never a raw path, path parameter or query string. Do the same in your own log lines. |
| `dir`, `exp` | your folder and id |

**Express 5 routes** (Clarification 4): paths are Express 5 / path-to-regexp v8. Use plain params (`'/file/:id'`). A bare `'*'` or `'/*'` is invalid; a wildcard needs a name (`'/*rest'`) and optional parts use braces (`'/item{/:id}'`). Regex strings in paths are not supported. `req.query` is read-only. Errors thrown in async handlers reach the core error handler (friendly JSON 500), so `try/catch` only where you want a different answer.

**Files** (Clarification 5): an experience never writes to disk itself: no `fs.writeFile`, no temp files with visitor content, nothing under `DATA_DIR`. Counts go through `analytics`, answers through `demo`/fixtures in your folder (read-only at runtime), TV data through `bus`. Visitor photos, audio and video stay in memory for the request only. The only exception is the Squad Reel worker (`reel-worker/`, TASK-04), which keeps reel files for at most 48 h under its own storage with its own sweeper.

**Sessions**: the anonymous `pz_sid` cookie identifies a visitor for limits; `claude.run` does not take a `sessionId` (the task brief's `sessionId` is handled by `limits.guard()` from the cookie). Never put the sid in a URL, log or TV payload.

**`demo.wrap` results**: `{ data, demo, reason }`. `reason` is `null` for a real (or mock) answer, `'hero'` for `?demo=hero`, or a `DemoFallback.reason`. The sample maps this to `source: 'claude' | 'mock' | 'fixture' | 'hero'` for its UI; copy that.

`DemoFallback.reason`: `demo_mode` (DEMO_MODE/offline), `no_key`, `spend_cap` (SPEND_CAP_USD reached, default $300, persisted in `DATA_DIR/spend.json`), `timeout` (25 s, 1 retry), `api_error`, `refusal`, `bad_json`, `no_mock`, `schema`. Use `demo.wrap` and you never handle it yourself.

Claude rules are enforced in `core/server/claude.js`: model `CLAUDE_MODEL` (default `claude-opus-5-5`), adaptive thinking, `output_config.effort` + `output_config.format` json_schema (objects get `additionalProperties:false` automatically), `fallbacks:"default"` with beta `server-side-fallback-2026-07-01`, no temperature/top_p. Cost metered from `usage` ($4 in / $20 out per MTok).

## 3. Web kit (plain ES modules, no build, no CDN; CSP is `self` only, so no inline `<script>`)

```html
<link rel="stylesheet" href="/core/tokens.css">     <!-- tokens, fonts, buttons, inputs, overlays; <body class="stage"> = dark -->
<link rel="stylesheet" href="/core/orchestra.css">  <!-- optional preload; orchestra.js injects it too -->
<script type="module" src="./app.js"></script>
```

`/core/kit.js`: `EXP`, `params`, `api(path, body)` (POST `/api/<exp>/<path>`, see "kit.api semantics" below), `track(event, dim, {once})`, `counter()` (from `?c=`), `sid()`, `isHero()`, `hero()`, `tvMirror(orx)`, `tvToggle(onChange)` ("Big screen pe dikhao", default on), `forFunLabel()`, `downscaleImage(file, 768)`, `h(tag, attrs, ...kids)`, `copy`, `retryScreen()`, `hideOverlay()`, `config()`.
Opening any page with `?ref=share&exp=<id>` counts one anonymous `ref_visit` and strips both params.

**kit.api semantics** (Clarification 3):

| server answer | what the visitor sees | what `api()` does |
|---|---|---|
| 2xx | nothing | resolves with the JSON |
| network error | one silent retry, then "Network thoda slow hai" with a button | waits for the tap, retries |
| 503 `{error:'busy', queue}` | "Line mein ho: N log aage" | waits `queue.retryMs`, retries with the `x-queue-ticket` header |
| 429 `{error:'slow_down', retryMs, message}` + `Retry-After` | countdown of exactly `Retry-After` with the server's message | retries when the countdown ends; if the visitor taps "Theek hai, baad mein" it throws `Error` with `.status = 429` |
| 5xx | one silent retry, then "Oops, chhota sa glitch" with a button | waits for the tap, retries |
| other 4xx (400, 403, 404, 413) | nothing (you decide) | throws `Error` with `.status`, `.data` (the JSON) and `.message` = the server's `message` |

So validation errors should be `res.status(400).json({ error: 'bad_input', message: 'Naam mein sirf letters chahiye.' })` and the page shows `err.message` and stays on the form (the sample returns to the form). Never return 5xx for bad input: it would show the glitch screen.

**`[hidden]`** (Clarification 1): `tokens.css` makes `[hidden]` win over any `display`. Gate rewards (share card, future predictions, 2030 job, reel download) start `hidden` and are revealed only after `await gate(...)`.

**"Doston ko bhejo"** (Clarification 6), after the gate, next to the Story share button:
```js
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
const card = await makeShareCard({ kicker, title, lines, footer: 'For fun only' });
friendsBtn.onclick = () => sendToFriends(card, { exp: EXP, filename: `zenith-${EXP}.png` }); // default filename uses EXP
```
It shares the PNG + Hinglish text + `https://play.zenithschool.ai/<exp>?ref=share&exp=<exp>` (Web Share), else opens WhatsApp (`wa.me`), else copies the link. Counts `share`. No friend data is ever collected.

`/core/orchestra.js` (the signature visual):
```js
const orx = new Orchestra(el, { title, orchestrator: { id, name, role, icon }, agents: [{ id, name, role, icon, color? }], mode: 'phone' | 'tv', layout?: 'phone'|'landscape'|'portrait' });
orx.assign(id, task); orx.status(id, 'idle'|'thinking'|'working'|'done'|'retry'); orx.log(id, text);
orx.handoff(fromId, toId, label); orx.progress(0..1); orx.done(summary); await orx.step(id, task, asyncFn);
orx.serialize(); orx.apply(event); await orx.replay(events, { speed: 0.5 }); orx.on(fn); orx.destroy();
```
Icons: `spark brain star eye pen chart clock palm camera film music scale shield search code chat bolt heart rocket compass card dice crown target wand check` (anything else renders as 1-2 characters).
**Rule: every agent shown maps to real work (a Claude call, a computation, or a section of the structured answer). Log lines come from real data. Never echo free-text input (it may be a name) into logs.**

`/core/gate.js`: `await gate(exp, { reward })` follow-to-unlock sheet (local QR to instagram.com/zenith_school_of_ai, "Instagram kholo", "Maine follow kar liya"). Honour-based, no Instagram calls. Remembers unlock per session. Counts gate_view / gate_open_ig / gate_unlock.

`/core/sharecard.js`: `await makeShareCard({ exp, kicker, title, lines: [max 4], footer })` -> `{ blob, url, width: 1080, height: 1920 }`; `shareCard(card)` (Web Share with file, else download), `sendToFriends(card)` ("Doston ko bhejo": Web Share with file + text + link, else wa.me, else copy link), `shareLink(exp)` = `https://play.zenithschool.ai/<exp>?ref=share&exp=<exp>`. Both count `share`. Put "For fun only" in `footer` for Jyotish, AI Sharks and anything predictive.

`/core/qr.js`: `qrSvg(text, opts)`, `qrElement`, `qrCanvas`.

## 4. Bus events (phone -> TV)

`kit.tvMirror(orx)` forwards every orchestra event automatically. Then call `mirror.result(payload)` once the result is ready and `mirror.end()` when the visitor leaves/restarts.
**Wire format** (Clarification 2). `POST /api/core/bus/<exp>/<c>` with body `{ "sid": "<random id of this play, max 64 chars>", "events": [ ... ] }`. Every event is an object with a type field **`t`** (not `type`), an optional `ts` (ms since the run started) and only these keys:

| `t` | keys | notes |
|---|---|---|
| `init` | `title`, `orchestrator {id,name,role,icon,color}`, `agents [{id,name,role,icon,color}]` | max 12 agents; strings cut to 32/40/60/24 chars |
| `assign` | `id`, `task` | |
| `status` | `id`, `state` | `idle thinking working done retry` |
| `log` | `id`, `text` | |
| `handoff` | `from`, `to`, `label` | |
| `progress` | `value` | 0..1 |
| `done` | `summary` | |
| `reset` | (none) | |
| `result` | `payload` | object; keys from the TV-safe allowlist (+ `bus.allowKeys`) at any depth |
| `custom` | `name`, `data` | for your TV hook; same allowlist as `payload` |
| `end` | (none) | the visitor finished; the TV goes idle after the spotlight |

Limits: max 100 events per POST, 8 KB per event (450 KB for `result`, which may carry one opt-in `data:image/jpeg`), arrays up to 60 items, nesting depth 6. Per phone (session cookie + IP, not the body `sid`): 120 POSTs and 1500 events per minute, and 1200 POSTs per minute per IP, else `429`. Image values are dropped from the replay buffer at `end`, at the next visitor or after 3 minutes (Clarification 10). Every text value is cleaned server-side: cut to 140 characters, links removed (except zenithschool.ai and the Zenith IG profile; `qr`, `url` and `image` values are kept as they are), Hindi and English profanity masked as `***`.
Response: `{ "accepted": <n>, "rejected": [ { "i": <index>, "reason": "..." } ], "held": <true if a pinned TV is holding another session> }`. Rejected events are dropped; the others still go through.
Server code publishes with `ctx.bus.publish(counter, sid, events)` (same rules, same return value). The TV subscribes at `GET /api/core/bus/<exp>/<c>/stream` (SSE messages `hello`, `session`, `events`, `pin`). In-memory, single node by design (play-web runs scale 1).

**Order on the phone**: run the orchestra (`assign`/`status`/`log`/`handoff`), call `orx.done(summary)`, then `mirror.result(payload)` right after (the TV shows the spotlight on `result`), and `mirror.end()` when the visitor restarts or leaves.

**TV safety rule:** the TV never shows a visitor's name, DOB, birth place, phone number or IG username. The bus rejects any key in the deny list (`name, dob, birthplace, place, city, phone, email, ig, instagram, username, handle, school, ...`) at any depth, any key outside the allowlist (`kicker title subtitle lines footer badge label score scores items text emoji icon tag stats image overlay paths points x y w h qr url forFun theme color kind type id rank round verdict sign number past future tabs skills split percent duration progress agent state note ...` plus your `bus.allowKeys`), and values that look like a phone number (spaces, dots, dashes or brackets), email, @handle (other than @zenith_school_of_ai) or a date (numeric or worded, like "4 March 2006"). A pattern scan cannot catch a free-text name inside an allowed field: never build TV strings from visitor input. Rejections come back to the phone (console warning) so you notice in development. `image` may be a `data:image/jpeg` (max ~450 KB per result), only with the visitor's TV opt-in.

## 5. TV: `/tv/<exp>?c=<n>`

Idle attract loop (big QR to `PUBLIC_URL/<exp>?c=<n>`, "Scan karo, khelo"), live orchestra mirror, result spotlight, back to idle 22 s after `end`.
Flags: `capture=1` (no QR / URL / counter chrome, bigger graph), `layout=portrait` (1080x1920 stage), `replay=1` (replay last session on load), `speed=0.5`.
Staff keys: `P` pin (holds this session; other phones are held off for up to 15 min), `B` blank this TV now (clears the session), `R` replay, `1`/`2`/`5` = speed 1x, 1/2x, 1/5x, `C` capture toggle, `H` help, `Esc` stop replay. The stage is always a centred 16:9 or 9:16 box, so the graph stays centred for crops. **`P`, `B` and `A` need a staff TV (CHECK-12 F1, 24 Oct): pair each counter TV browser once** (it gets the `pz_staff` cookie). The routes `/api/core/bus/<exp>/<c>/pin`, `.../clear` and `/api/core/stage/<exp>/<c>/tv/hide` need that cookie (or the admin key in `x-admin-key`) plus the channel token; the token alone is public. A TV without the cookie shows "Staff TV nahi: is browser mein ek baar /staff kholo aur pairing code daalo".

**Staff devices: pairing codes (24 Oct), so the admin key never lands in a TV's or phone's history.**
- On `/admin?key=...` (the admin's own browser), **Pair a staff device** shows a **6-digit code, valid 10 minutes, single use** (`STAFF_PAIR_TTL_MS`; at most 20 open codes).
- On the TV or staff phone, open **`/staff`** and type the code: the browser gets the same **4-day HttpOnly `pz_staff` cookie** (no rate limit, TV keys P/B/A, operator view, safety panel). 10 tries per IP per 10 minutes (then 429). `/staff/off` removes the cookie. All staff pages send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.
- Fallback: `/admin/staff?key=...` still sets the cookie but **redirects at once** (303 to `/staff/done`), so the key does not stay in the address bar and is never sent on as a referrer (`&off=1` removes it).
- **All-counters safety panel: `/admin/alerts`** (staff browser, or `?key=` which the page strips at once). Phone-friendly list of care alerts and filter alerts from every counter: time, counter, experience and kind only; "Theek hai" dismisses; an optional **Sound + vibration** toggle chimes on a new alert. Data: `GET /api/core/ops/alerts` (staff cookie or `x-admin-key`). One shift "safety lead" can watch everything from one phone.
- **Operator view on a phone:** `/tv/<exp>?c=<n>&op=1` under 900 px wide (phone portrait or landscape) shows the panels only (queue, Next/Skip/Clear/Pin, guest star + consent, record, hide anchor card, token field, care alert), 16 px text and 44 px targets, no stage graphics.

## 6. TV hook (optional): `experiences/<id>/web/tv.js`

```js
export default {
  mount(ctx) {}, event(ev, ctx) {}, reset(ctx) {},
  result(payload, ctx) { /* render into ctx.spotlight */ return true; /* false = default card */ },
};
// ctx = { exp, counter, stage, live, spotlight, orchestra, meta, layout, capture, speed }
```
Default spotlight renders `{ kicker, title, lines[], footer, forFun, qr }`.

## 7. Hero demo profile: `?demo=hero`

`experiences/<id>/demo/hero.json`: `{ "label": "Demo profile (fictional, for filming)", "profile": { ...form values... }, "fixtures": { "<set>": <index or full object> } }`.
The web app calls `await hero()` and, if present, pre-fills the form and runs the flow. `kit.api` sends `x-pz-demo: hero`; `demo.wrap` answers from fixtures without calling Claude. Hero runs are not counted in analytics. No visitor data ever appears in footage.

## 8. Fixtures

`fixtures/<set>.json`: array of objects exactly matching the schema your `claude.run` uses. 6+ entries recommended; picked deterministically by `seed` (for example sign + number) so offline still feels personal. `npm run offline` (DEMO_MODE=1, OFFLINE=1) uses only fixtures and blocks every outbound request.

## 9. Copy and privacy rules (summary of _COMMON_RULES)

Hinglish, positive, PG; no em-dashes or en-dashes; no job, placement, salary, medical or exam guarantees; "For fun only" where predictive; programme line "B.Tech in AI + mini-MBA. Ek degree, KRMU ki." (share-card footer: "@zenith_school_of_ai · B.Tech in AI + mini-MBA. Ek degree, KRMU ki."). No photo/audio/video stored or logged (Squad Reel worker files max 48 h). Analytics are counts only.

## 10. Ops endpoints

`/healthz`, `/status.json` (`ok, version, commit, demo, offline, mock, claude, spentUsd, capUsd, limits, experiences, reelWorker`), `/admin?key=ADMIN_KEY`, `/admin/export.csv?key=`, `/admin/stats.json?key=`, `npm run stats [-- --csv]`.

## 11. Tests you can copy

`test/core/server.test.js` (HTTP against a server on a random port via `test/core/helpers.js` `startServer({ CLAUDE_MOCK: '1' })`), `test/core/offline.test.js` (offline mode in its own file, it patches global fetch), `test/core/e2e.spec.js` (Playwright: phone 375x812 flow, TV mirror, gate, share card, console errors, no external requests) and `test/core/load.mjs` (N concurrent sessions following queue tickets). Put yours under `test/<id>/`. Core suite: `npm test` (node:test + Playwright), `npm run loadtest [-- --sessions 150]`, `npm run shots`.

## 12. Stage API (Addition 1, 2026-10-24)

Goal: every counter TV is worth watching from 5 m when nobody plays, and a visitor can choose to play **on the big screen** under a generated nickname. Core owns the stage loop, the queue, nicknames, the anchor / record card and the reward token. Experiences only declare boards and post scores.

### 12.1 Flags (env, all default on)
`STAGE_LOOP` (idle loop on TVs), `STAGE_QUEUE` (big-screen queue), `STAGE_ANCHOR` (anchor / record card), `STAGE_REWARD` (reward token). Set one to `0` to switch that feature off; the API then answers `{ ok: false, reason: 'off' }` and the kit hides the button. Nothing else changes when a flag is off.

### 12.2 Nicknames (core only, never free text)
- Generated by core: CamelCase Hinglish adjective + noun, optionally 2 digits, **at most 12 characters**, letters and digits only. Never an `@handle`, never phone-like (at most 2 digits), never a real name (nouns are animals, food and things: `TurboJugnu`, `ChillSamosa42`). Visitors pick 1 of 3 options; there is no text box.
- `GET /api/core/stage/nicknames` -> `{ options: [{ id, text }, x3] }` (ids are one-use, bound to the visitor's `pz_sid`).
- `POST /api/core/stage/nickname { id }` -> `{ ok, nickname }`. The choice is kept in memory for the session (2 h) and is what leaderboards and the TV show. It is never stored with anything personal.
- Server side (for an experience with its own picker screen): `ctx.stage.nicknames(req)` -> 3 options, `ctx.stage.pickNickname(req, id)` -> `{ ok, nickname }`, `ctx.stage.nickname(req)` -> the session's nickname or `null`. Same rules, same store.

### 12.3 Leaderboards (server-side only)
In `register(ctx)`:
```js
ctx.stage.declare({
  boards: [{ id: 'score', title: 'Aaj ke top scores', unit: '/10', order: 'desc', min: 0, max: 10, decimals: 0 }],
  panels: { leaderboard: 'score' },   // which board the TV loop shows (omit for none)
});
// after a scored turn, in your route (never trust a score sent by the phone; compute it on the server):
const r = ctx.stage.post(req, 'score', { score: 8, extra: { time: 41 } });
// -> { ok: true, rank: 3, best: 9 } | { ok: false, reason: 'no_nickname' | 'unknown_board' | 'bad_score' | 'bad_extra' | 'off' }
ctx.stage.board('score', { limit: 10 }); // -> [{ rank, nickname, score, extra, at }] for today (IST)
```
- `nickname` is never passed in: core uses the nickname this session picked (12.2). No pick, no entry (`no_nickname`).
- **(2026-10-24 Addition)** `tieBreak: { key: 'time', order: 'asc' }` on a board ranks equal scores by that number in `extra` (here: faster first), then by who posted first. `ctx.stage.count('score')` returns today's number of entries on the board (all of them, not only the top 50 kept).
- **Nicknames in TV text:** a phone's own bus posts may only use its own nickname (13.2). Server-side publishes (`ctx.bus.publish`, e.g. a duel TV naming both players) and `publicText()` accept any nickname core generated and a session picked today.
- `score` must be a finite number within `min`..`max`. `extra` is optional, max 400 bytes, TV-safe (section 4 allowlist + text filter), e.g. `{ time: 41 }`, `{ verdict: 'Deal' }`, `{ line: 'Green flag energy' }`.
- **Text in `extra` (Addition 2, section 13):** any text value (e.g. `line`, `verdict`) must be a `publicText()` result (a bank line or a template), never a free string. Numbers and enumerated values (from your own fixed list) stay as they are. With `PUBLIC_TEXT_STRICT` on, `post()` answers `bad_extra` for free text.
- Boards are per day (IST), top 50 kept per board, stored in `DATA_DIR/stage.json` (nicknames and scores only). Jyotish-style "most green-flag energy" is a fun board, not a ranking of people: give it a playful title.

### 12.4 Big-screen turns ("Big screen pe khelo")
Phone (`/core/stage.js`):
```js
import { bigScreenButton, bigScreen, rewardToken } from '/core/stage.js';
bigScreenButton(el);                    // renders the button where you want it (hidden when STAGE_QUEUE=0 or no ?c=)
const turn = await bigScreen();         // nickname picker -> queue screen ("Line mein ho: 2 aage") -> resolves on your turn
// turn = { id, counter, nickname, anchor: null | { name }, record: false } or null if the visitor cancelled
// ... run your normal flow; kit.tvMirror(orx) shows the nickname on the TV automatically during the turn ...
mirror.end();                            // or ctx.stage.post(): either one ends the turn
await rewardToken(turn);                 // shows the token card: 4-character code + QR, text "Counter pe dikhao"
```
- Queue per counter, at most 10 waiting; a waiting entry expires after 3 min without a poll, a running turn after 4 min. While a turn runs, only that phone's mirror reaches the TV (others are held, like a pin).
- HTTP (used by the kit): `POST /api/core/stage/queue { exp, c }` -> `{ ticket, ahead }` | `{ ok:false, reason:'full'|'no_nickname'|'off' }`; `GET /api/core/stage/queue/:ticket` -> `{ status: 'waiting'|'your_turn'|'done'|'expired', ahead, turn }`; `POST /api/core/stage/turn/:id/end`.
- Server side, `ctx.stage.turn(req)` returns the running turn for this session (or `null`), so a route can tell whether this play is on the big screen.
- **2026-10-24 addition:** `ctx.stage.end(req | sessionId, why?)` ends that session's running big-screen turn from the server (for example the host of a duel walkover), exactly like the phone's `POST /api/core/stage/turn/:id/end`: the TV is released, the next turn starts, and a token is issued if the turn lasted at least 20 s. Only turns of your own experience; returns `{ ok: true, ended: true, id }`, or `{ ok: true, ended: false }` when there is no running turn. `why` is an optional short tag (`[a-z_]`, e.g. `'walkover'`). No loopback HTTP call needed.

### 12.5 Anchor mode and the record card
- Staff only (operator view or `/admin`): "Guest star turn" for counter N, with the display name picked from a fixed list (**Ayushman Pandita, Gaurav Taneja, Manika Vishwakarma**) and a required "consent confirmed by staff" tick. The next big-screen turn on that counter is the anchor's. Its posted result is pinned on that counter's stage as **"Beat [name] ka score"** until staff clear it.
- Without an anchor, staff can mark a turn as a record turn: its result shows as **"Zenith ka record"**.
- **Nothing about an anchor exists unless such a turn was actually played**: no card, no name, no placeholder.
- `ctx.stage.anchor(counter)` -> `{ kind: 'anchor' | 'record', title, name, board, score, extra, at }` or `null`.
- Hide at once: "Hide anchor card" on the operator view, or TV staff key **A**.

### 12.6 Reward token
After a big-screen turn the phone shows a 4-character code (letters and digits without 0/O/1/I) and its QR, with the text "Counter pe dikhao". No item names anywhere until Avi confirms. The operator view has "Reward given", which counts `reward_given` in analytics (counts only; the token is not stored after that).

### 12.7 TV stage loop (when idle)
Rotates every 9 s, camera minimums hold (section 5 sizes):
1. big QR + counter
2. live counters from our analytics only: "Aaj X logon ne khela" (`start`), "Aaj X logon ne follow karke result dekha" (`gate_unlock`; never the word "followers"), shares
3. the experience's leaderboard (`panels.leaderboard`)
4. the anchor or record card, only if one exists (12.5)
5. "About this stall": the configured public hero line (`PUBLIC_HERO_LINE`, now "Zenith first-years ne AI agents ke saath banaye") with its short form (`PUBLIC_HERO_LINE_HI`, now "Zenith first-years x AI agents")

Experience hook (optional) in `web/tv.js`: `stagePanels(ctx)` returns extra panels `[{ id, render(el) }]` added to the rotation.
`GET /api/core/stage/<exp>/<c>` -> `{ counters: { played, followedAndSaw, shares }, board: [...], anchor, about }` (what the TV loop shows).

### 12.8 Operator view: `/tv/<exp>?c=<n>&op=1`
Needs the staff cookie (pair the browser at `/staff`, section 5), on the operator phone and **on each counter TV browser once** (TV keys P, B and A need it, section 5). Shows the queue (nicknames only) with **Next**, **Skip**, **Pin**, **Clear**; **Guest star turn** (name + consent tick); **Mark next turn as record**; **Hide anchor card**; **Reward given** for the last token, plus a **4-character token field** to redeem any token from the last 30 minutes (the code the visitor shows). TV staff keys stay as in section 5, plus **A** (hide/show anchor card).
- **Guest star / record turns (CHECK-12 WARN-B):** a pending guest-star or record turn applies **only to the turn the operator starts with Next**. While one is pending the queue does not start turns by itself (so a random visitor can never inherit an anchor's name); it expires after 5 minutes if unused, and **Clear** drops it.
- **Reward tokens (WARN-C):** a turn shorter than 20 s earns no token (`STAGE_MIN_TURN_S`, default 20). Tokens can be redeemed for 30 minutes, once, on their own counter.
- **Memory (WARN-A):** `/api/core/stage/nicknames` is limited to 20 calls per session and 300 per IP per minute (429 with `Retry-After`); one offer set per session, offers expire after 10 min, at most 5,000 kept; finished turns and tickets are dropped after 30 min.

### 12.9 Messaging lines (core sets them)
- Share-card footer for every experience: "@zenith_school_of_ai · B.Tech in AI + mini-MBA. Ek degree, KRMU ki."
- Hub, About card and share cards carry **one configured public hero line** (Avi, 24 Oct): `PUBLIC_HERO_LINE` (default "Zenith first-years ne AI agents ke saath banaye") and the short form `PUBLIC_HERO_LINE_HI` (default "Zenith first-years x AI agents"). Changing it is one setting, no code change. Outside that line, never any who-coded-what wording: no "first-years", "agents ke saath", "directed and tested", "direct aur test", "3 din", and no claim that students coded alone or did not code ("students ne code kiya", "students didn't code"). Bank and template registration refuses these (the configured hero line is always allowed), and a test scans every served page.

### 12.10 Friend rooms (AI ya Asli duel)
Room logic belongs to the experience (`experiences/asli`). Core only guarantees the TV can show two live scores via `result`/`custom` events and that the load test covers 25 two-player rooms (core stubs the room API in its own load test if asli's is not ready).

## 13. Shared safety (Addition 2, 2026-10-24)

> **2026-10-24 Change (CHECK-16 hardening):**
> - **Care detection** now matches concepts (a death or ending word near a self, desire, plan or negation word, spacing-insensitive: "marjaunga", "jump off my hostel roof", "marne ka plan", "sab kuch khatam kar dunga", Devanagari forms). (Superseded 24 Oct by the live gate below: the check now runs on all free text with `{ crisis, confidence }`; use `await ctx.safety.inputLive()`, the sync `input()` is deprecated.)
> - **TV side channels closed** (bus, all modes): agent ids are short lowercase ids (`/^[a-z][a-z0-9_-]{0,23}$/`) and `log`/`assign`/`status`/`handoff` may only use ids from this session's `init`; with strict on, every agent needs a name and, if you call `ctx.safety.agents([...ids])`, only those ids are allowed; `status.state` must be one of the 5 states; `qr` and `url` only point to our own site (`https://play.zenithschool.ai`, `https://zenithschool.ai`, the exact configured `PUBLIC_URL` origin with its own scheme and port, e.g. `http://192.168.1.20:8790` on the offline stall laptop, or a relative path such as `/api/reel/file/abc`) or `instagram.com/zenith_school_of_ai`; `image` only an inline `data:image/jpeg|png|webp;base64` picture. The TV never prints a raw id (unknown ids show `SYS`). **Numbers (CHECK-19 / CHECK-20 F6):** every string is normalised first (NFKC, zero-width and format characters removed) and only the normalised value is checked and published. Refused anywhere in a TV event: a number with more than 4 digits in all (decimals count: `9876.54321`), a string with a run of 5+ digits split only by spaces, dots or dashes (also zero-width, fullwidth or Devanagari digits), and a string that is only a number with 5+ digits and any separators (`"9,876,543,210"`, `"98765/43210"`). Exceptions: a key with a range (core: `duration`/`time`/`progress` 0..9999, `x`/`y`/`w`/`h`/`points`/`paths` -9999..9999, decimals allowed, so two adjacent fields can never spell a phone number; yours with `ctx.bus.numbers({ score: [0, 250000] })`, under 1e9), a year range (`1797-1869`), and registered public text (a bank line or a template whose number slots hold at most 4 digits each, e.g. `"12 + 15 + 12 beats"`). Template slots: `count` and `int:a..b` hold at most 4 digits (registration refuses wider int ranges); a plain number is public text only up to 4 digits. `ts` must be a number. **Server-only event types:** `ctx.bus.serverOnly(['result', 'custom:board'])` makes those types (or one custom event name) refused from phones (`POST /api/core/bus/...`); your server code still sends them with `ctx.bus.publish()`.
> - **Nickname slots check provenance:** on the bus the value must equal the phone's own core-generated nickname; server side (`publicText`) it must be a nickname core generated.
> - **Share cards:** `kicker` and `footer` take `publicText()` lines only, like `title` and `lines` ("For fun only" is a core line and always allowed).
> - **Judge:** line ids must be unique; a line that shares its id is flagged.
> - **`ctx.admin.check(req)`**: true for the admin key (`?key=` or `x-admin-key`) or the staff cookie.
>
> **2026-10-24 Change (CHECK_build item 13): no visitor-typed text ever reaches a TV, a leaderboard, a share card or a reel.**
> `PUBLIC_TEXT_STRICT` now **defaults to 1** (on everywhere, including staging); set `PUBLIC_TEXT_STRICT=0` only on a local laptop while migrating. Untemplated bus text is **dropped** (the event is rejected) and non-`publicText` share-card lines are **dropped**, each with a count-only warning (`{ kind: 'public_text', exp, untemplated, dropped }` in the log, `/admin/public-text` counts). Template slots are restricted to int, enum, count, nickname and numbered label (13.1). New helper `ctx.safety.ideaLabel(req, 'Idea')` gives a stable per-session label ("Idea #142") for things a visitor made, so a TV or share card can name a pitch without its text.

BRAIN rule (CHECK_build item 12): anything that can reach a TV, a share card, a reel or any public or on-camera surface is **templated or chosen from vetted line banks**. Free AI text appears **only on the visitor's own phone**, and only after the shared **judge** pass. The **care path** triggers on the visitor's input in every mode.

### 13.1 Server: `ctx.safety`
```js
// 1. Register your public text once in register(ctx). Banks = fixed, reviewed lines. Templates = fixed text with typed slots.
ctx.safety.bank('past', { p001: 'Class 8 mein ek teacher ne tumhari talent pehchani thi.', p002: '...' });
ctx.safety.list('personas', ['Seth Dhanraj', 'Riya Rao', 'Kabir Mehta']);           // a reusable value list
ctx.safety.template('verdict', '{persona} ne kaha: {verdict}', { persona: 'list:personas', verdict: ['Deal', 'Main out hoon'] });
ctx.safety.template('sign', 'Sun sign: {sign}', { sign: 'list:signs' });            // core list (12 rashi + 12 English signs)
ctx.safety.template('score8', 'Score {n}/10', { n: 'int:0..10' });
ctx.safety.template('score', '{nickname} ne {score}/10 score kiya', { nickname: 'nickname', score: 'int:0..10' });
ctx.safety.bank('orx', { a1: 'Rashi Agent', a2: 'Sun sign nikalo', l1: 'Sun sign: Leo' }); // agent names, tasks, log lines

// 2. Get public text (server side). Returns { pt, text } or throws for an unknown id / bad slot.
ctx.safety.publicText('past', 'p001');                                   // bank line
ctx.safety.publicText('verdict', { persona: 'Riya Rao', verdict: 'Deal' }); // template

// 3. Judge phone-only AI text before it goes to the phone (never needed for bank text).
ctx.safety.ideaLabel(req, 'Idea');                                       // 'Idea #142', stable per session

// 3b. Judge phone-only AI text before it goes to the phone.
const { ok, flagged } = await ctx.safety.judge([{ id: 'l1', text: aiLine1 }, { id: 'l2', text: aiLine2 }]);
// ok = the lines that passed; flagged = every other id. Replace flagged lines with bank lines.

// 4. Check visitor input on the server too (the kit already checks in the browser).
if (await ctx.safety.inputLive(req, body.pitch, body.answer)) return ctx.safety.careResponse(res); // -> 200 { care: true }
```
- Bank and template ids are namespaced by the experience automatically (`<exp>.<id>`). Lines must pass the copy rules (no em/en dashes, PG, positive); `npm test` checks every registered bank.
- Slot types (CHECK_build 13: **only these, never a free-string slot**): `int:a..b`, an enum (an array of allowed strings, or `list:<name>` for a list you registered with `ctx.safety.list(name, values)` or a core list: `signs`, `sources`), `count` (a non-negative integer), `nickname` (a core-generated nickname, section 12.2), and `label:<Word>`, a numbered label like `Idea #142` from `ctx.safety.ideaLabel(req, 'Idea')` (stable per session). Decimals are two int slots: `'{sec}.{tenth}s'`. Dynamic log lines are templates: `'Sun sign: {sign}'` with `list:signs`, `'Score {n}/10'` with `int:0..10`.
- **Judge, fail-closed by design**: one small `claude-opus-5-5` call (effort low, strict schema `{ approved: [ids] }`) that returns the ids it **approves**; a line is approved only if it is not negative about a person, violent, sexual, identifying a person or a school, medical, romantic, or un-PG. **Every line not approved is flagged**, including lines the model omits, and the model can only approve lines that also pass core's deterministic rules. In mock and offline mode it is that rule pass alone. Any failure (timeout, API error, refusal, bad JSON) flags every line.

### 13.2 What the bus accepts (`PUBLIC_TEXT_STRICT`)
Every text value in a TV event (`init` title/names/roles/labels, `assign.task`, `log.text`, `handoff.label`, `done.summary`, every string inside `result.payload` and `custom.data`) must be **exactly** a registered bank line or **match** a registered template of that experience (or a core line). Numbers are fine. `qr`, `url` and `image` keep their own rules.
- `PUBLIC_TEXT_STRICT=1`: anything else is rejected (the phone gets the reason, like other bus rejections).
- `PUBLIC_TEXT_STRICT=0` (migration default): it passes, and core logs a count-only warning per experience (`{ kind: 'public_text', exp, untemplated: n }`) plus `GET /admin/public-text?key=` lists counts per experience. The lead switches strict on when every experience shows 0.
- Phones keep sending plain strings: the bus verifies them against your registered text, so you do not change your orchestra calls; you only register the text you use. Log lines with real data go through templates (`'{letters} letters, {vowels} vowels -> number {n}'`).
- Share cards and reels: build their lines only from `publicText()` results that your server returned. In the browser, `makeShareCard` warns (and in strict mode drops) any line that is not a `{ pt, text }` object.

### 13.3 Care path (self-harm and crisis)
- `care.detect(text)` (server `ctx.safety.care.detect`, browser `import { detect } from '/core/care.js'`) -> `true` when the text suggests self-harm or crisis, in English, Hinglish (Roman) and Devanagari, including disguised spellings (same normalisation as the profanity filter). It errs towards triggering.
- **Check the visitor's text first:** call `guardText(...fields)` from `/core/kit.js` on every free-text input **before** you start the orchestra or the TV mirror (it returns `false` and shows the care card on a hit), so nothing ever reaches the TV.
- **The server is the authority.** The browser check is a convenience. A modified client that skips it still gets `{ care: true }` from `await ctx.safety.inputLive()` + `careResponse()`, with no game and no score. From then on the bus drops everything from that phone's session for 15 minutes, and core wipes any TV currently showing it. Every experience route that takes visitor text must call `await ctx.safety.inputLive(req, ...fields)` first, with every visitor field (pitch, every typed answer, re-sent text).
- **The kit checks every visitor text before it leaves the phone:** `kit.api()` scans every string in the request body, and `guardText(text)` does the same for text you only use locally. On a hit the kit shows the care card and does not send the request; `api()` rejects with an error that has `.care = true` (catch it like other errors and go back to your start screen). The server-side `await ctx.safety.inputLive()` is the second line.
- **Care card** (`core/web/care.js`, also `showCare()`): full screen, calm, no game, no score: "Tum akele nahi ho. Kisi bade se ya kisi apne se baat karo. Tele-MANAS (free, 24x7): 14416", a tap-to-call button (`tel:14416`) and "Wapas". Counted as `care_shown` (count only). The TV gets nothing: the kit ends the mirror and the TV shows its idle stage.
- **Always-on safety net** (CHECK-16b, lead decision, wording by BRAIN; independent of detection): the kit puts a small, calm 14 px line (16 px in a soft card in degraded mode) right under every **long** free-text input on the phone: "Kabhi bhi baat karni ho: Tele-MANAS 14416 (free, 24x7)", tap-to-call `tel:14416`. Long means a `<textarea>`, a contenteditable box, or an `<input>` you mark `data-care-net` (a plain text input also counts when its `maxlength` is 60 or more). It never appears under nickname pickers, choice taps or single-word name fields. Mark open answer fields (pitch text, typed answers, birth place) with `data-care-net` when they are `<input>`s; use `data-care-net="off"` to opt a field out. Never on a TV page (`body.tv`) and never drawn into a share card.
- **Detection rules** (`core/web/care-words.js` + `core/web/care-categories.js`, CHECK-16b): phrase rules plus CATEGORY rules in Roman Hinglish, English and Devanagari: farewell + finality, method words, wishing death, not wanting to exist, meaninglessness plus self. Strong rules trigger alone; weak signals (a farewell said to a person, "hamesha ke liye", "mere jaane ke baad", "sab khatam", "maaf kar dena") trigger only when two different kinds meet, and a farewell to a thing ("plastic ko alvida") never counts. One-edit typos of suicide, khudkushi, aatmahatya, marna and maut are tolerated, with guards for common words (mat, karna, mauj, maun).
- **Live AI crisis check = the main gate** (combined re-check, BRAIN 24 Oct). In live mode every free-text string a route checks goes to one small Claude call (schema `{ crisis, confidence }`, crisis when `crisis` is true or `confidence >= 0.4`), with a **6 s deadline** (`CARE_LIVE_TIMEOUT_MS`) and one fast retry when the first attempt errors (not when it is slow). **A line whose check times out FAILS CLOSED (CHECK-21 L1):** `inputLive()` returns `'unchecked'` (truthy, so `if (hit) return ctx.safety.careResponse(res)` refuses the text) and `careResponse` answers `{ unchecked: true, chips: true, message }`; the kit shows a calm notice with the care line prominent and rejects with `err.unchecked` / `err.chips`, so your phone offers its chips path. The text is never used on rules alone, and the same holds when the check still errors after its retry (N21a). **Read the result with the helpers, never by truthiness (CHECK-20 F8):**
```js
const hit = await ctx.safety.inputLive(req, ...fields);
if (ctx.safety.isUnchecked(hit)) return ctx.safety.uncheckedResponse(res); // calm notice + chips path, not a crisis, not counted
if (ctx.safety.isCrisis(hit)) return ctx.safety.careResponse(res);      // the care card
```
`careResponse(res)` also answers `unchecked` when the request was unchecked, so the short form `if (hit) return ctx.safety.careResponse(res)` stays safe; your own crisis redirect must use `isCrisis`. **Care-checked strings:** every string field, including ones that start with `data:`; only a real base64 image payload in an image field (`image`, `photo`, `palm`, `frame`, `dataUrl`, ...) is skipped (N20a). A rule hit is answered at once without a call. Use **`await ctx.safety.inputLive(req, ...fields)`** on every route that takes visitor text (it waits for the check, at most 3 s, so a live-only crisis gets the care card on the same request). The live call sees up to **16 strings of 1,200 characters** per request; the rules always scan the whole text. **The sync `ctx.safety.input()` is deprecated for visitor text (CHECK-16d, 24 Oct):** it answers from the rules only and runs the live check in the background, so a live-only crisis reaches the session's NEXT request, never the line itself. Core logs a count-only warning (`{ kind: 'safety', warn: 'sync_input_deprecated', exp, calls }`, first call and every 100th, never the text) and counts it in `safety.stats().syncInput`. Keep it only where a wait is impossible. `_sample/server.js` shows the pattern. The rules (phrases + categories) are the offline backstop.
- **Safety mode: `'live' | 'degraded'`.** Degraded whenever the live check is really unavailable: no key, mock, demo or offline mode, spend cap reached, **3 or more failed or timed-out checks in 60 s, or an auth or quota error (then for 10 minutes)** (CHECK-21 L2). One slow call is handled per request (fail closed) and does not darken the site.
- **Care first, in core (CHECK-21 L3):** every `POST`/`PUT`/`PATCH` body to `/api/<exp>/...` runs the care rules **before any of your routes** (before a degraded-mode or chips-only refusal, validation, or a 404). A crisis line always gets `{ care: true }`, counted and alerted like any care hit. Exposed as `safetyMode` in `/status.json` and `/api/core/config`, in the kit as `await safetyMode()` (from `/core/kit.js`), and on the server as **`ctx.safety.safetyMode()`** (the same rule, including "a live check failed in the last minute"; do not re-derive it), so experiences can adapt (AI Sharks defaults to idea-type chips). In degraded mode: (a) the care line under long text inputs is more prominent (16 px, a soft highlight card, still calm); (b) **every rule-based care or language hit raises the quiet operator alert** (`kind: 'care' | 'language'`, time and experience only; a language hit does not care-lock or show the card). The operator view shows "Filter ne ek gaali roki" for language alerts.
- **Acceptance (CHECK_build item 12, with BRAIN):** at least 95% of a fresh 60-line crisis set must trigger **via the live check on the deployed site** (real key). The rules are the backstop for degraded mode and are tested offline against every checker set so far (0 misses, 0 false positives on the safe sets at the time of writing); they are not expected to reach 95% on new phrasings by themselves.
- **Quiet operator alert**: the counter's operator view (`/tv/<exp>?c=<n>&op=1`, staff cookie) shows a small amber dot "Ek visitor ko support card dikha" with the time only (no visitor data), which staff can dismiss. Operator docs tell staff to check on the person kindly.
- Sad-but-safe lines ("exam ka tension hai", "mood off hai") do not trigger; experiences keep their replies positive.

## 14. Public pages, counter map v4, spend budgets (Addition 3, 2026-10-24)

### 14.1 What it is
A public page is a small web page a visitor can share, at `play.zenithschool.ai/<letter>/<CODE>` (Startup Studio: `/s/<CODE>`). **Core renders it** from your template and **only validated values**, so visitor text can never appear on it. Core serves it with `X-Robots-Tag: noindex, nofollow` and `<meta name="robots" content="noindex,nofollow">`, the global self-only CSP (no scripts), expiry, a footer "Made at Zenith School of AI · Ideas 4.0" with the expiry date, and a **Report** button.

### 14.2 Register (in `register(ctx)`, at boot)
```js
safety.bank('names', { a: 'ChaiChain', b: 'NotesNinja' });            // every text a page can show is a bank line or template
safety.list('areas', ['hostel food', 'exam stress']);
const site = ctx.publicPage({
  prefix: 's',                    // one lowercase letter, one experience per letter ('p' is reserved)
  template: 'web/site.html',      // a body fragment in your folder; {{slot}} placeholders; no <script>, no on* handlers
  css: 'site.css',                // optional, served from your web/ folder (linked as /<exp>/site.css)
  ttlDays: 7,                     // 1..30, default 7
  title: 'name', description: 'tagline',   // slots used for <title> and og:title / og:description
  slots: { name: 'text', tagline: 'text', f1: 'text', price: 'int:0..9999', area: 'list:areas', plan: 'enum:basic|pro', color: 'color', logo: 'svg', day: 'date' },
  svgs: { cup: '<svg viewBox="0 0 10 10">...</svg>' },   // logo choices: plain inline SVG, no scripts, handlers or external links
});
```
- **Slot types:** `text` (must be public text for your experience: a bank line, a filled template or a generated nickname, pass the copy rules, contain a letter, and have **no run of 5 or more digits**, with any separators: never a phone number, pin or roll number; put numbers in `int` slots), `int:a..b` (at most 4 digits: bounds within -9999..9999), `enum:a|b|c`, `list:<name>` (a `safety.list`), `color` (`#rrggbb`), `date` (`YYYY-MM-DD` only, shown as given), `svg` (a key of `svgs`). Free strings are never accepted, and arrays or objects are refused for every slot.
- **Placement:** `text` and `svg` slots only in text content (never inside `<style>`, `<textarea>`, `<title>` or `<noscript>`); inside a tag only `enum`, `int`, `color`, `list` and `date`, and only inside a **quoted** attribute value (`style="--brand: {{color}}"`, `class="{{plan}}"`). All values are HTML-escaped.
- Registration throws on: a reserved or taken letter, a missing template, scripts, inline handlers or `javascript:` (also entity-encoded), `<meta>`, `<base>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<link>` or form fields, `srcdoc`, a placeholder with no type, an unknown type, a text slot inside a tag, an unquoted attribute slot, or template text that fails the copy rules (dashes, profanity, care words, who-coded-what lines).

### 14.3 Create (server code, after your judge pass)
```js
const r = site.create(req, { name: 'ChaiChain', tagline: 'Hostel ka khana, ek tap mein', price: 49, area: 'hostel food', color: '#ff8fc0', logo: 'cup', ... });
// -> { ok: true, code: 'K7QX2M', path: '/s/K7QX2M', url: 'https://play.zenithschool.ai/s/K7QX2M', expiresAt: '2026-10-31T...' }
// -> { ok: false, reason: 'bad_slot', slot: 'name' } when any value fails its type (every slot is required)
site.get(code)     // -> { code, values, expiresAt } or null (expired / removed)
site.remove(code)  // take it down
```
Optional third argument `{ expiresAt }` (earlier than the ttl only). The page's counter (for report alerts) is the request's `x-pz-counter` **only if it is one of your experience's counters** in the counter map, else your experience's first counter. Codes are 6 characters from `A-Z2-9` without 0/O/1/I, case-insensitive in the URL. Pages are stored in `DATA_DIR/pages.json` (values only, no visitor data) and survive restarts; at most 20,000.

### 14.4 Serving
- `GET /<letter>/<CODE>`: the page (`200`, `Cache-Control: private, max-age=15`); unknown code `404` and expired `410`, both `no-store` and noindex, with a friendly Hinglish page and a "Khud try karo" link. At most **30 not-found answers per IP per 10 minutes**, then `429` (guessing codes).
- **Strict check on every render (CHECK-20):** the stored entry is untrusted. Its `code` must equal the URL's code and match the code format, `prefix` and `exp` must be the family's, `createdAt` and `expiresAt` must be numbers, `createdAt` not in the future and `expiresAt` no later than `createdAt + ttlDays`, the counter must be an integer, and every value is validated against its slot type again. Then every text node of the rendered page (footer included) must be template text or a validated value, and no text node may show a run of 5 or more digits, whatever slots produced it (N18: three adjacent `int` slots can not spell a phone number; ISO dates and year ranges aside). Anything else is a clean `404` (an expired valid entry `410`), never a `500` and never a served page; count-only log `{ kind: 'pages', warn }`.
- Page paths and codes are never written to the access log.

### 14.5 Report and takedown
- The footer's **Report** button posts to `/<letter>/<CODE>/report`. It raises a **staff alert** `kind: 'report'` with time, experience, counter and the page path (`ref: '/s/K7QX2M'`) only, never who reported. One alert per page per minute; 5 reports per IP per 10 minutes; a removed, expired or bad page answers 404 and raises nothing. **Reports have their own bucket** (last 50 overall), so they can never push a care or language alert out of a counter's list (last 20 per counter).
- Staff see it on `/admin/alerts` ("Page report hua: /s/K7QX2M", **Dekho** and **Hata do**) and on the TV operator view. `POST /api/core/ops/pages/<letter>/<CODE>/remove` (staff cookie or `x-admin-key`) takes the page down at once (then 404).

### 14.6 Your template
Use your own classes and CSS file; core adds `/core/tokens.css`, `/core/page.css` (frame and footer) and wraps your fragment in `<body class="pz-page">`. Keep all words in the template static and in Hinglish or English that passes the copy rules; everything that changes per visitor is a slot. Pure-number static text (`2026`, `01`, `· 3 ·`) is allowed as it is.

### 14.7 Counter map v4 (BRAIN 24 Oct 19:40) and the two flags
| Counter | Flags off (default) | `STARTUP_STUDIO=1` | `AGENT_BUILDER=1` |
|---|---|---|---|
| 1 | AI Jyotish | AI Jyotish | AI Jyotish |
| 2 | AI Jyotish | **AI Startup Studio** (`startup`) | AI Jyotish |
| 3 | AI Sharks | AI Sharks | AI Sharks |
| 4 | Career Studio | Career Studio | **Build Your Own AI Agent** (`agent`) |
| 5 | Career Studio | Career Studio | Career Studio |
| 6 | Squad Reel Studio | Squad Reel Studio | Squad Reel Studio |
| 7 | AI ya Asli? | AI ya Asli? | AI ya Asli? |
| 8 | AI Jyotish | AI Jyotish | AI Jyotish |
- Live Projects is **not** a counter (a side-wall poster); the follow QR is on every counter.
- The flags drive everything from `config.experiences` (`experiencesFor(flags)` in `core/server/config.js`): the hub list and its count, `/api/core/experiences`, `/api/core/exp/<id>`, the TV's default counter and mismatch note, admin labels and "Clear counter N" buttons, alerts and analytics names. A no-go (flag off) reverts counters 2 and 4 automatically.
- **Flag off = not loaded:** the folders `experiences/startup` and `experiences/agent` are skipped by the loader (no routes, no web) unless their flag is `1`; `/api/core/exp/<id>` is `404`. `/status.json` shows `flags`.
- **Flag off = the URLs revert (CHECK-20 F4):** `/<id>`, `/<id>/`, `/<id>/index.html` and `/tv/<id>` of a switched-off experience answer `302` (`no-store`) to the experience the map gives that counter, keeping the query: `/tv/startup?c=2` -> `/tv/jyotish?c=2`, `/agent?c=4` -> `/career/?c=4` (no or odd `?c=`: the flagged experience's own counter, 2 or 4). So the runbook's counter 2 and 4 TV URLs revert on their own at a no-go.
- **Never hard-code a counter (F5):** server code uses `ctx.counters.of(id?)` (that experience's counters, e.g. `[4, 5]` for Career when Agent Builder is off) and `ctx.counters.map()` (`{ counter: id }`); `/api/core/config` has `counters` (`{ id: [counters] }`); in HTML write `<span data-pz-counter-of="career">5</span>` and the kit fills in the current number(s) (the number inside is only the fallback); `kit.countersOf(id)` returns them.
- **Old `?c=` values stay harmless:** any `c=0..99` is accepted on any experience page, bus channel and TV; the experience comes from the path. A TV whose `?c=` is not one of its experience's counters only shows the staff note.
- Counter numbers in your own README, TV comments and tests: use the table above (the accepted five moved: Sharks 3, Career 4 + 5, Reel 6, Asli 7, Jyotish 1 + 2 + 8).

### 14.8 Per-experience daily spend budgets
- `BUDGET_USD_<EXP>=<usd per IST day>` (for example `BUDGET_USD_STARTUP=40`, `BUDGET_USD_AGENT=30`; `_sample` is `BUDGET_USD__SAMPLE`). **Unset = no per-experience budget. `0` = banked answers only, no model calls** for that experience (its care check and judge still run). Negative or non-numeric values are ignored. The global cap `SPEND_CAP_USD` is unchanged and still applies to everything.
- When an experience's calls today (plus the estimate of the call in flight) would pass its budget, `ctx.claude.run()` throws `DemoFallback('exp_budget')`, so `demo.wrap()` answers from its banked fixtures. **Only that experience** goes to banked mode; the others keep going, and the safety calls (the live crisis check and the judge) are never blocked by a budget, so `safetyMode` is not affected.
- `ctx.claude.budget()` -> `{ budgetUsd, spentTodayUsd, ok }` for your experience (`budgetUsd: null` when none is set). `/status.json` shows `budgets` per experience. Spend (total, per IST day, per experience) is kept in `DATA_DIR/spend.json` **and in the bucket** (`play-web/spend.json`, pushed every 30 s and on stop, restored at boot and merged by max), so the global cap and the daily budgets hold across redeploys (CHECK-21 L4). **If the bucket cannot be read at boot (N21b)** (an error, not "nothing there yet"), spend does not start from zero: the cap drops to the known local total plus half of what is left (with no earlier total on disk, a fixed `SPEND_UNKNOWN_CAP_USD`, default $75), nothing is pushed, the read is retried every 10 s (`SPEND_RESTORE_RETRY_MS`), and after 60 s (`SPEND_RESTORE_ALERT_MS`) staff get an alert (`kind: 'spend'` on `/admin/alerts`). When the bucket answers, the totals are merged and the configured cap comes back.

### 14.9 Tests and the real `.env` (CHECK-20 F7)
No test process reads the repo `.env` (it holds the real keys): core's config skips it under `node --test` (`NODE_TEST_CONTEXT`), Playwright workers (`TEST_WORKER_INDEX`) and `PZ_NO_DOTENV=1`; `npm test` sets `PZ_NO_DOTENV=1` for every suite. Ops scripts that load `.env` must do the same (Career's `ops/common.mjs` does). Checkers read staff endpoints with `node ops/admin-get.mjs <path> [--url <base>]`: it reads `ADMIN_KEY` itself and prints the JSON with secret-named fields and 5+ digit runs redacted, never the key.
