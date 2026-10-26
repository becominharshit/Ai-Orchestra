# AI ya Asli? content inbox (drop folder)

Raw files go here. Nothing in this folder is committed or deployed (see `../../.gitignore`). `npm run asli:add` converts each file, copies the result to `content/media/` with a neutral id, adds it to `manifest.json` as `approved: false`, and moves the original to `inbox/_done/` (delete that folder after the fest).

```
inbox/real/voice/E3_02.m4a          a student's own voice, reading line E3 (line codes below)
inbox/real/image/chai_01.jpg        a student's own photo
inbox/ai/image/higgsfield_chai_01.png   AI image (name starts with higgsfield_ or firefly_)
inbox/ai/voice/heygen_E3.m4a        AI voice from another tool (optional; we already have 10 from macOS say)
inbox/items.txt                     text and code items (format at the bottom)
```

## The request for Zenith students (send this as is)

**Consent line (every student agrees, WhatsApp "haan" is fine; under 18 = parent agrees too):**
"Main (student) confirm karta/karti hoon ki yeh photo/awaaz meri apni hai, isme kisi aur ka chehra, naam ya personal info nahi hai, aur Zenith School of AI isse Ideas 4.0 stall game, TV screen aur Zenith ke Instagram videos mein use kar sakta hai. Main kabhi bhi hatwa sakta/sakti hoon."

**1. Real voices (needed for voice rounds at launch): 12 to 16 clips from at least 6 different students.**
- Each student reads 2 lines from the list below, one line per clip. Mix of voices please.
- 2 to 4 seconds per clip. Phone voice recorder (iPhone Voice Memos, Android Recorder) in a normal room. No music, no studio, no filters.
- Send the file itself as .m4a, .mp3 or .wav (on WhatsApp send it as a Document). WhatsApp voice notes (.opus) do not convert.
- File name = line code + number, for example `E3_02.m4a`. Do not say your name, college, phone number or anything personal in the clip.
- Minimum to switch voice rounds on: 4 clips (2 English, 2 Hindi). 10+ keeps the game balanced with the 10 AI clips.

| code | line |
|---|---|
| E1 | Hi! I just built my first chatbot, and it actually works. |
| E2 | Welcome to Ideas four point oh. Come play with us! |
| E3 | My favourite subject is maths. Don't tell anyone. |
| E4 | The canteen chai today was really good. |
| E5 | Can you guess if this voice is real or AI? |
| E6 | Our robot team meets every Friday after class. |
| H1 | Aaj canteen mein samose bahut achchhe the. |
| H2 | Mera pehla project ek chhota sa robot tha. |
| H3 | Chalo, aaj library mein saath padhte hain. |
| H4 | Kya tum bata sakte ho ki yeh awaaz asli hai? |

**2. Real photos (for photo rounds): 10 to 12 photos you took yourself.**
- No faces or people at all, no number plates, no phone or laptop screens, no documents, no big brand logos, no religious or political symbols.
- Subjects AI is also good at: chai, samosa, thali, street food, campus corners, sky or sunset, plants, your own pet, a desk setup, an empty road.
- JPG or HEIC straight from the phone, at least 1080 px. File name `subject_nn.jpg`, e.g. `chai_01.jpg`. Location and camera data are removed automatically.

**3. Real text (strongly recommended): 15 to 20 short lines written fresh, in your own style.**
- WhatsApp-style messages (no real names or numbers), product reviews, Insta captions, one-line shayari. Max 140 characters each. PG. Hinglish welcome, typos welcome (that is the point).
- Why: today all "modern" lines are AI-written, so players could learn "modern = AI". Your lines fix that.

**4. Real code (nice to have): 6 to 10 snippets from your own assignments.** Max 8 lines, max 70 characters per line, no names, emails or keys.

**5. AI images (bonus, team only, Higgsfield or Adobe Firefly): 10 to 12 images on the same subjects as the photos.** No people, no faces, no text in the image. PNG or JPG, at least 1080 px. Name `higgsfield_chai_01.png` or `firefly_chai_01.png`.

## items.txt format

```
type: text
answer: real
credit: Zenith student (B.Tech AI, year 1)
style: modern
reveal: Asli! Ek student ka message. Double question mark aur 'plsss': insaan wala style.
body:
yaar kal ka quiz postpone hua kya?? koi batao plsss
===
type: code
answer: real
credit: Zenith student (own code)
body:
for i in range(3):
    print("hello", i)  # meri pehli loop
```
`reveal:` is optional (a default tip is used). Credit names are optional; "Zenith student" is enough.

## After the drop

```
cd experiences/asli
npm run asli:add -- --consent        # --consent = you confirm every real file's owner agreed to the line above
npm run asli:list                    # look at / listen to every file in content/media/<id>
npm run asli:approve -- a011 i001 t057
npm run asli:check                   # must say "All good."
git add content/manifest.json content/media && git commit -m "asli: student content" -- content/manifest.json content/media
```
Then redeploy. The running server picks up manifest changes within 5 seconds (no restart needed on the stall laptop).
