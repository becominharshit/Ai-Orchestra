# AI Startup Studio ("Apni startup, 90 second mein")

Counter 2, behind the flag `STARTUP_STUDIO=1` (default off: core then skips this folder, and the hub, TV and counters stay on the old map).

## What happens
1. **Chips only.** The visitor picks a problem area (18), who it is for (4) and a vibe (4). In **live** safety mode an optional one-liner box appears; it stays on the phone, goes through core's live crisis check (`inputLive`) and only helps the model choose between reviewed options. In **degraded** mode (no key, mock, offline, spend cap, live check down) the box is hidden and the server refuses typed text with `409 chips_only`.
2. **Agent Orchestra.** The Founder Agent assigns Research, Product, Brand, Finance and Pitch. Each agent logs its own section of the server's answer (registered bank lines and templates), so the TV shows the company being born agent by agent.
3. **Generation.** `POST /api/startup/build` makes **one** structured model call (`lib/live.js`, `claude-opus-5-5`, effort low). The schema is built per area from enums of reviewed ids, so the model can only answer ids and two integers (price, rough market). Bad ids and out-of-bounds numbers fall back to the composed startup (`lib/compose.js fromModel`). A short `note` is the only free model text: phone only, after core's judge. Without a model (degraded mode), `compose()` assembles the startup from the same banks with a random seed (30+ distinct startups per area, tested).
4. **Name.** `lib/names.js` glues an area prefix and a suffix ("Thali" + "Dost"). Every combination is checked at boot against about 850 well-known brands, apps, shows, creators, chains and people (`lib/names.js` + `lib/brands.js`), a list of double meanings, and a monogram stoplist (BS, SS, PP, BC, MC ...). About 700 names survive, 30+ per area. The chosen name also goes through the judge; a flagged name falls back to a reviewed one. The phone-only `note` also passes `lib/note.js` (no money, funding, brands, handles, links or numbers).
5. **Website.** `site.create()` (core `ctx.publicPage`, CONTRACT 14) makes `/s/<CODE>` from `page/site.html` with typed slots only. Core serves it with noindex, the self-only CSP, the 7-day expiry, the footer and the Report button. Styles: `web/site.css`.
6. **Result.** A startup card in its own palette, the follow gate, then the website link, the share card "Meri startup: <name>", "Doston ko bhejo", and an optional link "Isse AI Sharks ko pitch karna hai?" that opens `/shark/?c=<shark counter>&idea=<idea type>` (chip ids only).
7. **TV.** `web/tv.js` renders the spotlight (palette, logo, name, tagline, research, 3 features, price and margin, pitch), revealed section by section. In the idle loop it adds "Aaj ki startups": the last names made today and the count of startups made today (`GET /api/startup/today`). The count is the server-only event `startup_made` (a phone cannot post it), persisted per IST day by core analytics; at boot the server seeds today's tally from core's analytics snapshot (read only).
8. **Typed line and the TV.** When the visitor typed a line, the phone waits for the server's answer (and its live crisis check) before it creates the orchestra or the TV mirror, so a crisis line never starts anything on the TV.

## Files
| path | what |
|---|---|
| `lib/content.js` | every reviewed line: 18 areas (prefixes, taglines, research, features, plan, pitch, price and market bounds), who, vibes, orchestra text |
| `lib/names.js`, `lib/brands.js` | name generator, brand and person blocklist, monogram stoplist |
| `lib/note.js` | rule backstop for the phone-only model note |
| `lib/compose.js` | seeded composition, model-pick validation, finance maths |
| `lib/text.js` | registers banks, lists and templates with core (`ctx.safety`), builds the public lines |
| `lib/live.js` | the model call: system prompt, per-area schema, user message, mock |
| `page/site.html` | the public page template (core renders it) |
| `web/` | phone app, TV hook, `logo.js` (palettes + logo marks, shared with the server), styles |
| `demo/hero.json` | the fictional filming startup (ThaliDost) |

## Run
```
STARTUP_STUDIO=1 npm run mock      # or: STARTUP_STUDIO=1 npm run offline
phone  http://localhost:8790/startup/?c=2
TV     http://localhost:8790/tv/startup?c=2      (filming: &capture=1, &layout=portrait, ?demo=hero on the phone)
tests  node --test --test-concurrency=1 test/startup/*.test.js
       node test/startup/e2e.mjs [--shots]       (mock, offline and fake live; shots go to docs/shots/TASK-18/)
```

## Changing things
- **Add a problem area:** copy one block in `lib/content.js` (6 prefixes, 4 taglines, 3 research lines, 6 features, 4 plan steps, 3 pitch lines, bounds), then run the tests. Registration fails at boot if a line breaks the copy rules (dashes, profanity, care words), and the brand test fails if a line or name collides with a real brand or person.
- **Reword a line:** edit it in `lib/content.js`. Keep Hinglish, positive, no dashes, no guarantees, no real company or person names.
- **New palette or logo:** `web/logo.js` and the `.pal-N` / `.logo-N` classes in `web/site.css`, plus the `enum:` slot in `server.js PAGE_SPEC`.
- TODO(student): a fifth logo template; per-area icons on the area cards.
