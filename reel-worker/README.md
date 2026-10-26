# reel-worker (play-reel)

Squad Reel Studio render worker: a small Node service in front of ffmpeg. Only play-web talks to it, with the shared secret header `x-reel-secret`. Lightsail container service `play-reel`, container `worker`, port 8080, health `/healthz`.

## Run
```
cd reel-worker && npm install            # installs ffmpeg-static (no system ffmpeg needed, also in Docker)
PORT=8813 REEL_SHARED_SECRET=dev-secret npm start
# in the repo root, play-web pointing at it:
PORT=8803 CLAUDE_MOCK=1 REEL_WORKER_URL=http://127.0.0.1:8813 REEL_SHARED_SECRET=dev-secret npm start
```
Without `REEL_WORKER_URL` (and not in production) play-web starts this worker inside its own process on the first reel request, so `npm run mock` / `npm run offline` alone also work on the stall laptop (run `npm install` in `reel-worker/` once).

Docker (what TASK-07 deploys): `docker build --platform linux/amd64 -t play-reel:local reel-worker` (node:22-slim + the ffmpeg-static npm binary, no apt). Built and run with `--cpus=1` on 24 Oct (amd64 and arm64).

## How a reel is made (src/)
| File | Agent / job |
|---|---|
| `plan.js` | **Director**: beat-aligned shot lengths from the template + real clip lengths (whole beats, bar lines, never past the clip, total at most 26 s) |
| `subs.js` | the burned-in text as one ASS file (hook, captions, handle) rendered by libass with the vendored fonts; also the end card text. (The linux ffmpeg-static 7.x has no drawtext.) |
| `render.js` | **Editor**: one ffmpeg pass: seek/trim, scale+crop 1080x1920, template look, flash on each cut, hook (0-2 s) + captions + handle burned in (`ass=`), concat with the 2 s end card, squad audio + music bed, H.264 High yuv420p + AAC, `+faststart`. **Thumbnail**: scores one frame per shot (detail x brightness), saves `cover.jpg` |
| `jobs.js` | queue (concurrency `REEL_CONCURRENCY`), live orchestra events per job, deletes inputs right after the render |
| `store.js` | random letter ids, files on disk, the **sweeper** (reels after `REEL_TTL_HOURS`, unused clips after `REEL_INPUT_TTL_MIN` (10 min); fake clock in tests) |
| `assets.js` | made at boot with ffmpeg only: synth music beds, the Zenith end card, 3 abstract hero clips for `?demo=hero` |
| `templates.js` | beat, look, caption style and bed per template (phone copy is in `experiences/reel/templates.js`) |
| `ffmpeg.js` | runner with `-progress` parsing, probe without ffprobe |
| `server.js` | HTTP API (see the header comment) |

Captions and Hook are Claude calls on play-web (core proxy), not here. They only pick ids from the vetted banks in `experiences/reel/banks/`; play-web resolves the text and sends it here, so nothing free-form is ever burned in (CHECK_build 12/13). Every orchestra line this worker emits matches a template in `experiences/reel/public.js` (tested).

## Privacy
Uploaded clips live in `storage/in/` only until their render (or 10 min if never rendered). Finished reels live in `storage/jobs/<id>/` for 48 h. Logs hold ids, states, sizes and timings only: no captions, no file names, no request bodies. No visitor data is sent to Claude (captions are written from the template, never from the footage).

## Fonts and music
`fonts/*.ttf` are static instances of the OFL fonts already vendored in core, renamed `ZR ...` so libass picks each weight by name (`python3 fonts/make-fonts.py`). Music beds are synthesised (see `beds/README.md` for the GarageBand slot, TODO(student)).

## Tests
`npm test` (from here) runs `test/reel/*.test.js` (it stops early with "run npm run setup" if the ffmpeg binary is missing or broken; render time target 30 s is printed, the test fails only above 90 s). `npm run load -- --jobs 10` is the worker queue load test; `node ../test/reel/sessions.mjs --sessions 50` runs 50 visitor sessions through play-web; `node ../test/reel/shots.mjs` is the browser run with screenshots.
