# AI ya Asli? (counter 7)

A 60 to 75 second quiz: 10 rounds of "AI ne banaya ya asli hai?" (text, code, voice, and photos once students send them), a Detector Agent that guesses too, and a live leaderboard on the counter TV. Play solo, or as a **1v1 duel** with a friend (room code + QR, the same 10 rounds, both scores live on the TV, a winner card "Maine ChillSamosa42 ko AI ya Asli mein haraya").

## Run it

```
npm run mock                      # from the repo root (no Claude key needed)
open http://localhost:8790/asli/?c=7         # phone
open http://localhost:8790/tv/asli?c=7       # counter TV (leaderboard + live rounds)
```
Filming (stall closed or a spare counter number): phone `/asli/?c=7&demo=hero` plays a fictional run by itself (8/10, with a generated nickname); TV `/tv/asli?c=7&capture=1&board=demo` (add `&layout=portrait` for 9:16) shows it on the fictional demo board. Hero runs never touch the live board or analytics.

## Duel (TASK-14)

1. The host taps "Dost ke saath duel": a 4-character room code (no 0/O/1/I/L) and a QR to `/asli/?c=7&room=CODE`.
2. The friend scans (the link opens the name picker, then the join screen with the code filled in) or taps "Duel code hai?" and types the 4 letters. Max 2 players; rooms nobody joins expire after 10 min.
3. A 4 s countdown to a shared start, then both play the **same 10 rounds** at their own pace, each round timed on the server for that player. Live scores on both phones (`/api/asli/duel/:code/stream`, SSE) and on the TV.
4. Winner: more right answers, then less total time (within 0.5 s = tie). Someone silent for 60 s mid-game loses by walkover. Finished rooms are dropped after 3 min. In memory only.
5. The result sits behind the follow gate on each phone. The share card uses the friend's **generated nickname** only (nothing typed, CHECK_build 13). Both players' scores go on the leaderboard (score + time). Counts: `duel_start`, `duel_complete`, `duel_abandoned`.
6. **The TV in a duel is driven by the server**, not by a phone: one TV session per room with the orchestra, both live scores, the host's rounds and the winner. A phone may only put its own nickname on the TV (core bus rule), and this also stops the two phones fighting over the screen. The host's "Big screen pe dikhao" switch decides whether the room goes on the TV.

## Big screen (core queue, CONTRACT 12.4 / 12.5)

- Counter 7's TV only shows **big-screen turns**: a visitor taps "Big screen pe khelo" (solo) or, as duel host, "Duel big screen pe dikhao". They join core's queue (`/api/core/stage/queue`), see "Line mein ho: N aage", and on their turn the game (or the duel room) goes on the TV. "Akele khelo" games stay on the phone. So solo players and duels take turns instead of fighting over the screen. With `STAGE_QUEUE=0` (or no `?c=`) the old "Big screen pe dikhao" switch is back.
- Core ends a turn the moment a score is posted and starts the next one at once, so a big-screen run posts its score only after the result has been on the TV: the phone calls `POST /api/asli/turn-done` about 6 s after the result (or the server does it after `ASLI_TURN_POST_MS`, default 15 s). Then core shows the reward token ("Counter pe dikhao") on the phone.
- Anchor and record turns are staff-only (operator view `/tv/asli?c=7&op=1`, "Guest star turn" with the consent tick). The anchor plays a normal big-screen turn; the deferred post lands while the turn is still running, so core pins "Beat <name> ka score".
- Idle TV: core's stage loop rotates QR, scoreboard, our **crowd round** (a stage-loop panel from `web/tv.js` `stagePanels`, never overlapping the QR block) and About. Our leaderboard panel stays on the right.

## Nicknames, leaderboard, public text

- Nicknames: pick 1 of 3 generated names (`/api/asli/nicknames`, `/api/asli/nickname`), served by core's stage module (`ctx.stage`, CONTRACT 12); `lib/stage.js` falls back to a local copy with the same surface if core's stage is off. Nobody types a name.
- Leaderboard: core board `score` (/10) with `extra.time` (seconds) and `tieBreak: { key: 'time', order: 'asc' }`; players today from `ctx.stage.count`. Our own TV panel (`/api/asli/board/stream`) shows the top 10 with score and time, so the board is not declared as a core loop panel (no duplicate).
- Public text (CONTRACT 13, `PUBLIC_TEXT_STRICT`): `lib/public.js` registers every item line (text, code lines, transcripts, tips, credits), agent names and tasks, enum values and about 40 templates (log lines, Detector lines, result, share card and duel lines). The phone builds its TV strings with `web/lines.js` (same shapes); `test/asli/public.test.js` checks every shape against core safety.

| agent | where | real work |
|---|---|---|
| Quizmaster (orchestrator) | `web/app.js` | runs the 10 rounds, timer, mirror to the TV |
| Curator | `lib/content.js` `curate()` | 10 rounds: 8 text + 2 code today; 2 voice and 2 photo rounds switch on by themselves once there are 2+ AI and 2+ real items of that type. 4 to 6 AI answers, unseen items first, never the same voice line twice, text first, no 4 same answers in a row |
| Detector Agent | `lib/detector.js` (text/code style model, about 87% right offline), Claude once per item when a key is live (cached in memory; the TV and phone only show templated lines built from its guess + confidence, never Claude's free text), browser noise-floor check for voice clips | its own guess + confidence after each answer ("AI bhi confuse ho gaya") |
| Scorekeeper | `server.js` | 100 per right answer + up to 50 speed bonus, today's rank, leaderboard |

Light anti-cheat: the server keeps the answers (the phone gets one only after it sends its pick), issues rounds one at a time (`POST /api/asli/round`) and times each one itself from that moment (the client's time is ignored; a pick more than 8 s after the round's limit counts as time up), and limits `/start` to 12 per session and 240 per IP per 10 minutes (hero runs exempt). Good enough for a fest leaderboard, not for prizes. Nicknames are generated (`lib/nick.js`), never typed, so the TV can show them. Score and rank sit behind the follow gate; the share card says "Main AI pakad leta hoon: 8/10".

Leaderboard: `lib/board.js`, today's top 10, in memory only (experiences write no files, CONTRACT Clarification 5), resets at midnight IST and on a server restart; the day's score counts stay in analytics (`game_score`). TVs get updates over SSE (`/api/asli/board/stream`) within milliseconds.

Analytics (counts only): `game_complete`, `round_right` / `round_wrong` with `round=1..10`, `score_10`, `game_score` with `score=0..10`, plus the standard start / complete / gate / share events. See `/admin` and `/admin/export.csv`.

## Content

- `content/manifest.json`: every item `{ id, type: text|code|audio|image, body|src, answer: ai|real, reveal_line, credit, approved }`. Only `approved: true` is played. Ids are neutral (`t001`, `c001`, `a001`, `i001`).
- "Real" text is public domain only (Kabir, Ghalib, Tagore, Sarojini Naidu, Ada Lovelace, Babbage, Turing, Austen, Carroll, Dickens, Shakespeare, the 1947 Mark II bug log), real code is Apollo 11 guidance code (NASA, public domain) and the SQLite blessing (public domain). AI items are written by Claude and credited "AI (Claude)". AI voices: macOS `say` (Rishi, Aman, Tara, Lekha), `npm run asli:voices`.
- `content/inbox/README.md` = the brief for students + the add / review / approve steps.

```
cd experiences/asli
npm run asli:check        # validator: credits, 40-60% AI, no em/en-dashes, length limits, blocked words, TV-safe
npm run asli:add -- --consent && npm run asli:list && npm run asli:approve -- <ids>
npm run asli:voices       # re-make the AI voice clips (macOS only)
npm test                  # unit + HTTP tests (test/asli): content, public text, solo, duel, load (25 rooms + 50 solo)
npm run e2e               # Playwright tour: phone + TV, mock + offline, hero, failures, screenshots to docs/shots/TASK-06
node ../../test/asli/e2e-duel.mjs   # two-phone duel tour, mock + offline, PUBLIC_TEXT_STRICT, docs/shots/TASK-14
```

## Where to change things

- Round times: `roundMs()` in `lib/content.js`. Quotas per type: `quotas()`. Blocked words: `BANNED`.
- Points and badges: `points()`, `badge()` in `server.js`.
- Detector signals: `lib/detector.js` (keep it good but beatable: `asli:check` prints its accuracy).
- Phone look: `web/style.css`. TV look: `web/tv.css` (leaderboard, round card, crowd teaser, result).
- TODO(student): a Hindi (Devanagari) text round, a "streak" bonus, a weekly hall of fame.
