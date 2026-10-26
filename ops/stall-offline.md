# Running the stall offline (counter laptop + 4G hotspot)

Use this when play.zenithschool.ai is slow or down, or the venue network is bad. One counter laptop runs the
whole app; the TVs and the staff phones connect to it over the stall's 4G hotspot. No internet is needed:
in offline mode the server blocks every outbound request and serves the ready-made demo answers (fixtures).

## What changes for visitors

- Online, visitors scan the standee QR and play on their own phone on their own data.
- Offline, a visitor's phone can only reach the laptop if it joins the stall hotspot. So offline means:
  **staff phones or tablets at each counter** (already on the hotspot), or visitors who join the hotspot.
  The TV attract screen shows a QR to the laptop address (not play.zenithschool.ai) while offline.
- Answers are the demo fixtures, not live Claude. Everything else (Agent Orchestra, follow gate, share card,
  TV mirror, counters) works the same.

## 1. Start the laptop (5 minutes)

1. Plug the laptop into power. Turn on the hotspot on the stall phone and join it from the laptop.
2. Find the laptop's address on the hotspot:
   ```
   ipconfig getifaddr en0
   ```
   It looks like `172.20.10.2` (iPhone hotspot) or `192.168.43.20` (Android hotspot). Write it on the counter card.
3. Keep the laptop awake for the day (leave this Terminal tab open):
   ```
   caffeinate -dis &
   ```
4. Start the app in offline mode from the repo folder. `PUBLIC_URL` **must be the laptop's LAN address from
   step 2** (for example `http://192.168.43.20:8790`), not localhost and not play.zenithschool.ai: the TV QR codes
   are made from it, and the TVs only accept QR links to that address, so with a wrong value the QR codes do not
   show or point nowhere.
   ```
   cd ~/"Documents/Zenith School of AI/Ideas 4.0 builds/play-zenith"
   PUBLIC_URL=http://<laptop-address>:8790 npm run offline
   ```
   The first line says `mode: OFFLINE (fixtures only, no network)`. If macOS asks "Allow incoming connections
   for node?", click **Allow** (otherwise phones and TVs cannot connect).
5. Check from a phone on the hotspot: open `http://<laptop-address>:8790/healthz`. It must show `{"ok":true}`.

Squad Reel (counter 5) needs nothing extra: in offline mode the reel worker starts **inside** the app on the first
reel request (no `REEL_WORKER_URL`, no second Terminal tab). Leave `REEL_WORKER_URL` out of `.env` on this laptop.

The staff links below need `ADMIN_KEY` in the laptop's `.env` (made by `node ops/set-claude-key.mjs`, or set it with
any long random text). Without it `/admin` and `/admin/staff` are switched off.

## 2. Counter TVs

Each TV (a laptop, a mini PC or a smart TV browser on the hotspot) opens its counter page full screen:

| Counter | Experience | TV address |
|---|---|---|
| 1 | AI Jyotish | `http://<laptop-address>:8790/tv/jyotish?c=1` |
| 2 | AI Jyotish | `http://<laptop-address>:8790/tv/jyotish?c=2` |
| 3 | Career Studio | `http://<laptop-address>:8790/tv/career?c=3` |
| 4 | AI Sharks | `http://<laptop-address>:8790/tv/shark?c=4` |
| 5 | Squad Reel Studio | `http://<laptop-address>:8790/tv/reel?c=5` |
| 6 | AI ya Asli? (leaderboard) | `http://<laptop-address>:8790/tv/asli?c=6` |

(Counters as in `core/server/config.js`. If the stall plan changes, use the counter number on the standee.)

On a Mac TV machine, full screen with no browser bars:
```
open -na "Google Chrome" --args --kiosk "http://<laptop-address>:8790/tv/jyotish?c=1"
```
To leave kiosk mode: Cmd+Q.

The phone at a counter mirrors to the TV with the same counter number: open
`http://<laptop-address>:8790/jyotish/?c=1` on the counter 1 phone.

**Once on every counter TV browser and every filming or staff phone:** open
`http://<laptop-address>:8790/admin/staff?key=<ADMIN_KEY>` (the key from the laptop's `.env`). It marks that
browser as staff: the TV staff keys (pin, clear, hide) work and staff phones are not rate limited. It lasts
4 days in that browser. It is tied to the address, so a browser marked on play.zenithschool.ai must do it
again on the laptop address (and the other way round). In kiosk mode, open the link in normal Chrome first, then
start kiosk.

## 3. Going back online

1. Stop the offline app in its Terminal tab with Ctrl+C (counters are saved to `data/` on the way out).
2. TVs: switch their address back to `https://play.zenithschool.ai/tv/<exp>?c=<n>`.
3. The counters counted offline stay in the laptop's `data/analytics.json`. Read them with `npm run stats`
   and add them to the day's numbers by hand (the live site keeps its own counters).

## Limits to know (inference, not measured at the venue)

- A phone hotspot usually takes about 10 devices at once. With 6 TVs plus staff phones, use the second
  hotspot for the phones, or a small travel router.
- The laptop handles the stall load easily in mock and demo mode: the local load test
  (`node ops/loadtest/run.mjs --sessions 150`) passes with p95 under 50 ms on a MacBook.
- If the laptop sleeps or the lid closes, every TV freezes. Keep it on power with `caffeinate` running.
