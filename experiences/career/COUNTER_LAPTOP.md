# Counter laptop: the full Career Forecast next to Career Studio

Career Studio (phones + TV) shows a light preview. Visitors who want everything (all careers in their area, skills by year, their course check) use the **full Career Forecast POC** on the counter laptop. Do not change the POC or the Lead Magnet folder.

## Start (once in the morning, about 2 minutes)
1. Plug in the laptop and connect to the stall Wi-Fi (or a phone hotspot).
2. Open Terminal and paste:
   `zsh "$HOME/Documents/Zenith School of AI/Lead Magnet/06_POC/scripts/start_demo.sh"`
3. Wait for **PUBLIC LINK**. On the laptop itself use `http://127.0.0.1:8787` (works without internet once started).
4. Keep the laptop on charge. The script keeps it awake while the server runs.

## During the day
- New visitor: open `http://127.0.0.1:8787/new` (clears the previous session). Hindi: add `/?lang=hi`.
- The POC does **not** send WhatsApp. For the PDF on WhatsApp, the visitor fills "WhatsApp pe chahiye?" in Career Studio on their own phone (or the staff phone) at `play.zenithschool.ai/career`.
- "STOP" requests: open `play.zenithschool.ai/stop` and type the number, or note it for the team.
- Never type a visitor's number into anything except the Career Studio form. Never photograph screens with names.

## Stop (evening)
`zsh "$HOME/Documents/Zenith School of AI/Lead Magnet/06_POC/scripts/stop_demo.sh"`

## If something breaks
- "Data check failed": do not fix data at the stall. Use Career Studio's preview only and tell Avi.
- No internet: the laptop link `http://127.0.0.1:8787` still works; Career Studio runs in offline mode on the stall laptop (`npm run offline`, see `ops/stall-offline.md`).
- Logs: `Lead Magnet/06_POC/logs/`. Leads from the POC: `~/ZenithPOC_private` (never copy them to a USB or chat).
