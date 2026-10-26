# Career Studio (counter 5, plus 4 while Agent Builder is off)

Two parts, one page at `/career/` (TV: `/tv/career?c=5`):

- **A. Career Forecast preview**: pick 1 of 5 interest areas, see the top Growing / Changing careers with the work split (Done by AI / Done with AI / Led by people) and a source tooltip on every figure. CTA "Poora forecast + PDF chahiye? Counter pe WhatsApp karo", the "WhatsApp pe chahiye?" form, a PDF preview on the phone, and "Doston ko bhejo".
- **B. Job Time Machine 2026 vs 2030** (about 90 s): pick a job, Round 1 "2026" = 3 quick tasks by hand, follow gate, Round 2 "2030" = Manager Agent + Research / Draft / Analyst / Review agents do the AI-able parts (one Claude call, one section per agent), then 2 human-only calls come back to the visitor. Result: "Tumhara 2030 skill stack" + share card "2026 ka marketer vs 2030 ka marketer".

## Run
```
npm install && npm --prefix experiences/career install     # pdf-lib lives in this folder
npm run mock        # http://localhost:8790/career/?c=5   and   /tv/career?c=5
npm run offline     # fixtures only, no network (all 6 jobs playable)
open "http://localhost:8790/career/?c=5&demo=hero"           # seeded fictional run for filming
node --test --test-concurrency=1 test/career/*.test.js       # unit, ops, WhatsApp (fake AiSensy), browser e2e
node test/career/shots.mjs                                   # docs/shots/TASK-03
node experiences/career/ops/check-data.mjs                   # copied data == Lead Magnet source, byte for byte
```

## Files
| Path | What |
|---|---|
| `server.js` | routes under `/api/career/`: `bundle`, `agents` (Claude via core, gives a play token), `preview` (play token), `lead`, `wa/status`, `stop`, `p?t=`, `preview.pdf`, `admin/whatsapp`; public `/p/:token` and `/stop` |
| `lib/play.js` | play tokens and per-IP windows |
| `lib/data.js` | reads the copied `data/cf_data_v60/` (careers, interest_map, zenith, sources); display rules |
| `lib/jobs.js` | the 6 jobs, their careers.json ids, tasks, agents, human calls, skills; Claude schema + prompt |
| `lib/leads.js` | the WhatsApp form: fields, consent text + version, u18 tag, encrypted record |
| `lib/envelope.js` | RSA-OAEP-256 + AES-256-GCM envelope (public key on the server), AES box for the server's own lists |
| `lib/whatsapp.js` | live send: guards, caps, queue (concurrency 4), job status, stop list, PDF sweeper |
| `lib/ledger.js` | shared counter / sent list / stop list / switch in the store (live server and batch use the same) |
| `lib/sendpdf.js`, `lib/pdf.js`, `lib/aisensy.js`, `lib/links.js`, `lib/store.js` | one send: PDF (pdf-lib), upload, signed URL, 30-day link, AiSensy request |
| `ops/` | `leads-keygen.mjs`, `leads-export.mjs`, `leads-purge.mjs`, `whatsapp-batch.mjs`, `check-data.mjs` (run on Avi's Mac) |
| `web/` | phone app (`index.html`, `app.js`, `style.css`), TV hook (`tv.js`, `tv.css`), STOP page (`stop/`) |
| `fixtures/agents_<job>.json`, `demo/hero.json` | offline answers (2 per job) and the filming profile |
| `COUNTER_LAPTOP.md` | running the full Career Forecast POC on the counter laptop |

## WhatsApp settings (env; secrets via `node ops/set-secret.mjs <NAME>`)
`WHATSAPP_PDF_ON` (off; runtime switch: `POST /api/career/admin/whatsapp {"on":true}` with header `x-admin-key`), `WHATSAPP_DAILY_CAP` 700 (IST day), `WHATSAPP_TOTAL_CAP` 2000 (persisted in the bucket, shared with the batch), `WHATSAPP_SESSION_CAP` 2, `WHATSAPP_ALLOWLIST` (test mode), `AISENSY_API_KEY`, `AISENSY_PDF_STUDENT_CAMPAIGN` "Pdf student", `AISENSY_PDF_STUDENT_TEMPLATE` cf_pdf_student_v4, `AISENSY_PDF_STUDENT_PARAMS` "name,link", `AISENSY_PDF_DOCUMENT` on, `AISENSY_USER_NAME` (fixed label "Career Studio"; `first_name` sends the first name), `PDF_LINK_BASE` (default `https://play.zenithschool.ai/p/`), `STOP_URL_TEXT` (default `play.zenithschool.ai/stop`), `WHATSAPP_IP_LIVE_CAP`, `LEAD_IP_LIMIT`, `STOP_IP_LIMIT`, `PLAY_MIN_MS_FC`, `PLAY_MIN_MS_JTM`, `LEADS_PUBLIC_KEY`, `LINK_HMAC_SECRET`, `PHONE_PEPPER`, `MERITTO_ON` (off: CSV import).

## Abuse guards (no OTP at the stall; CHECK-03)
- **Play token:** `/lead` needs a server-signed, single-use token (HMAC with `LINK_HMAC_SECRET`, 30 min) that the phone gets only from a play: `POST /api/career/preview` (forecast opened, usable after `PLAY_MIN_MS_FC` 5 s) or `POST /api/career/agents` (Job Time Machine round, usable after `PLAY_MIN_MS_JTM` 15 s). One play buys one lead. No cookies needed.
- **Per-IP windows** (generous for mobile CGNAT, the hero header is no exemption): `/lead` `LEAD_IP_LIMIT` 30 per 10 min, live sends `WHATSAPP_IP_LIVE_CAP` 30 per hour (more go to the batch), `/stop` `STOP_IP_LIMIT` 10 per hour.
- **Atomic guards:** the 24 h per-number check, the session count and the IP count are claimed in one synchronous step before any await, so parallel requests send once.
- **Allow-list fails closed:** `+91`, spaces and dashes are fine; one entry that is not a mobile number means nobody gets a live send (count-only warning in the log). `off` or empty = no allow-list.
- **No probing:** `/lead` answers only "live" or "batch" with the same shape for every number; numbers already sent (24 h) or on the stop list get a decoy job.
- Links: `https://play.zenithschool.ai/p/<token>` and `play.zenithschool.ai/stop` (core public routes, never logged).

## Privacy rules in this folder
No parent fields, no school, no free text. The number and name go only into the encrypted lead record and the AiSensy request. Never in a log, analytics (counts only), the bus or the TV. Round-1 typed text never leaves the phone.

TODO(student): add a job (copy a block in `lib/jobs.js`, add `fixtures/agents_<id>.json`); add Hindi copy; a Meritto Lead API adapter once Nalin has the keys and field mapping.
