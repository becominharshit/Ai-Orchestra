# play-zenith: Zenith stall experiences for KRMU Ideas 4.0 (27-28 Oct 2026)

One Node 22 app serves 5 AI experiences at play.zenithschool.ai. Visitors play on their own phones (QR at each counter).
Counter TVs open the same app in big-screen mode (`/tv/<experience>?c=<counter>`).

| Folder | What |
|---|---|
| `core/` | server (Express, Claude proxy, limits, spend cap, analytics, live bus), shared web kit (design tokens, Agent Orchestra UI, follow gate, share card, TV shell) |
| `experiences/jyotish` | AI Jyotish (counters 1-2) |
| `experiences/career` | Career Studio: Career Forecast preview + Job Time Machine (counter 3) |
| `experiences/reel` | Squad Reel Studio (counter 5), with `reel-worker/` (ffmpeg) |
| `experiences/shark` | AI Sharks (counter 4) |
| `experiences/asli` | AI ya Asli? quiz (counter 6) |
| `ops/` | AWS Lightsail deploy (resources prefixed `play-`), Claude key script, load test |
| `print/` | QR standees and print assets |
| `docs/` | operator README sources (rendered to PDF) |

Commands (filled in by the core task): `npm run dev` (live, needs ANTHROPIC_API_KEY in .env), `npm run offline` (no network, demo answers), `npm test`.

Student builders: look for `TODO(student)` comments. Each one is a self-contained improvement.
