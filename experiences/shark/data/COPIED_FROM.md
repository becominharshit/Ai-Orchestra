# Copied data (read-only copy)

- Source: `Zenith School of AI/Lead Magnet/04_Data/app_json/cf_data_v60/zenith.json` (data version `cf_data_v60`, `"src": "zenith_site_2026_10_07"`, i.e. as published on zenithschool.ai on 7 Oct 2026; data built 2026-10-10T12:56:28+00:00 per `latest.json`)
- Copied on: 24 Oct 2026, by the TASK-05 shark builder, with `cp -p` (bytes unchanged; file mode set to 644). Same bytes as Career Studio's copy.
- Used for: the mini-MBA lesson line in `lib/lessons.js` (course names from `skill_map`, the usp "4 mandatory real-world live projects with 30+ companies"). The tests check `lessons.js` against this copy and never read outside the repo.
- Never edit this copy (it holds one en dash inside a course name we do not show; it stays byte-equal to the source). A data change means a new `cf_data_vN`, copied again, with the hash below updated.
- Proof of byte-for-byte equality with the source: `node experiences/shark/ops/check-data.mjs [--source <path to zenith.json>]` (exit 0 = identical).

SHA-256 at copy time:
- zenith.json 35ab0a628425bb989cf8f96b9a4492c8eb94915316784b8677b63fd8902d7c80
