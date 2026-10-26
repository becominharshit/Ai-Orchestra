# Squad Reel Studio (counter 6)

2-5 friends pick a template, record 3 prompted shots on one phone, and 5 agents make a 9:16 reel with a Zenith end card. Download via the phone (behind the follow gate) or the QR on the TV. Files auto-delete after 48 h.

- Phone: `/reel/?c=6` · TV: `/tv/reel?c=6` (`&capture=1`, `&layout=portrait`) · filming: `/reel/?c=6&demo=hero` (fictional squad, abstract generated footage, runs by itself)
- A friend who scans the TV QR lands on `/reel/?get=<id>` (same gate).

## Agents (each does real work)
| Agent | Where | Work |
|---|---|---|
| Director (lead) | worker `plan.js` | beat plan from clip lengths, queue position |
| Captions | here, Claude via core | picks 3 caption ids (one per shot, within the shot's character budget) + a post line id from the vetted bank |
| Hook | here, Claude via core | picks the 0-2 s hook id; its style tag is the log line |
| Editor | worker `render.js` | ffmpeg cut, crop, burn-in, end card, mix; live % from ffmpeg |
| Thumbnail | worker `render.js` | scores one frame per shot, saves the cover |

Public text rule (CHECK_build 12/13): everything on the reel, the TV and the share card is a vetted line from `banks/<template>.json` (per template 42 captions over 3 shots, 40 hooks with a style, 12 post lines; the only slot is `{n}` = squad size 2-5) or a fixed orchestra template in `public.js`. Claude never writes that text, `/render` takes ids only, and visitors never type anything. `public.js` registers all of it with core's `ctx.safety` (CONTRACT section 13: banks, `list:` enums, templates with int/count/list slots) and resolves every TV, burn-in and share-card line with `publicText`; the share card gets `{ pt, text }` objects from `/api/reel/card` and `/api/reel/captions`. Tested with `PUBLIC_TEXT_STRICT=1`. Mock (`CLAUDE_MOCK=1`) and offline (`DEMO_MODE`/`OFFLINE`) pick from the same banks (`fixtures/captions_<template>.json`, `fixtures/hook_<template>.json` hold 6 id picks each).

## Files
`server.js` (routes under `/api/reel/`, proxy to the worker), `public.js` (banks + orchestra templates, publicText), `banks/` (reviewed lines), `templates.js` (names, prompts, seconds), `web/` (phone app, TV hook `tv.js` + `tv.css`), `fixtures/`, `demo/hero.json`.

## Env (play-web)
`REEL_WORKER_URL` (empty locally = embedded worker), `REEL_SHARED_SECRET` (same as the worker), `REEL_EMBED=0` (no embedded worker), `ADMIN_KEY` (staff list of reels with repost consent: `/api/reel/staff/reposts?key=...`), `REEL_MAX_CLIP_MB` / `REEL_MAX_CLIP_S` / `REEL_MIN_CLIP_S` (shown on the phone; keep equal to the worker's).

## Copy and consent
Hinglish, kind ("Hostel Roast" roasts the situation, never a person). The counter TV shows the orchestra live, but the result (hook, captions, download QR) only after the phone's follow gate, and the reel itself (faces, maybe under 18) only when the squad turns on "Big screen pe reel chalao" on the result screen (default off). Queue retries do not count against the rate limit, but only with the ticket this server issued to that session on its 503 busy answer. Shots must be 2 to 30 s. Template first, no form before the fun part (CHANGE-01); squad size is optional chips on the shots screen. Repost consent checkbox "Zenith ise repost kar sakta hai" is off by default; ticking it shows that under-18 squads need a teacher's or parent's OK. The post caption says "tag your squad" and @zenith_school_of_ai. Squad size is only a count (2-5).

TODO(student): a 5th template (see `templates.js`), a GarageBand music bed (`reel-worker/beds/README.md`).
