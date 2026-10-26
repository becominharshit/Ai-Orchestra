# Copied data (read-only copy)

- Source: `Zenith School of AI/Lead Magnet/04_Data/app_json/cf_data_v60/` (data version `cf_data_v60`, built 2026-10-10T12:56:28+00:00 per `latest.json`)
- Copied on: 24 Oct 2026, by the TASK-03 career builder, with `cp -p` (bytes unchanged; only the file mode of the copies was set to 644)
- Files: `careers.json`, `interest_map.json`, `zenith.json`, `sources.json` (only the files Career Studio reads)
- The Lead Magnet folder was not modified. Never edit these copies: a data change means a new `cf_data_vN` from the data pipeline, copied again.
- Proof of byte-for-byte equality: `node experiences/career/ops/check-data.mjs` (exit 0 = identical), and `test/career/ops.test.js` checks the copies against the SHA-256 values below (inside the repo only).
- Display rules followed (from the source README): source tooltip with year on every number, `card_line` falls back to `reason`, task modes Done by AI / Done with AI / Led by people, Zenith wording exactly as in `zenith.json` ("As published on zenithschool.ai"), never a college score, rank, rating or fee. Career Studio also never shows pay.

SHA-256 at copy time:
- careers.json 109aacb71bbbf95ac028ccabec38275a87a36e61d0d19f7c07cfa9bd71b2d5f6
- interest_map.json 57857a4e5ded750812fa68ff3e8591350519fbfc4e6aa263039d774182acebde
- sources.json 7574b8893275c18c5fc3471115c34bdb925f977fc2eee56a57be66d24ce14f20
- zenith.json 35ab0a628425bb989cf8f96b9a4492c8eb94915316784b8677b63fd8902d7c80
