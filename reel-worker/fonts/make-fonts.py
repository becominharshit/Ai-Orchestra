# Makes the static TTF fonts ffmpeg drawtext needs, from the fonts already vendored in core (no download).
#   python3 fonts/make-fonts.py      (needs fontTools + brotli: pip install fonttools brotli)
# Input:  ../core/web/vendor/fonts/*.woff2 (variable fonts, OFL)
# Output: fonts/*.ttf (one static weight each). The licence travels with them (LICENSE-OFL.txt).
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, '..', '..', 'core', 'web', 'vendor', 'fonts')
# Each instance gets its own family name (ZR ...), so libass (the ASS subtitle renderer ffmpeg uses for the
# burned-in text) can pick it by name from fontsdir without mixing up weights.
jobs = [
    ('plus-jakarta-sans-latin-wght-normal.woff2', 800, 'PlusJakartaSans-ExtraBold.ttf', 'ZR Jakarta ExtraBold'),
    ('plus-jakarta-sans-latin-wght-normal.woff2', 600, 'PlusJakartaSans-SemiBold.ttf', 'ZR Jakarta SemiBold'),
    ('newsreader-latin-wght-normal.woff2', 600, 'Newsreader-SemiBold.ttf', 'ZR Newsreader SemiBold'),
    ('newsreader-latin-wght-italic.woff2', 500, 'Newsreader-MediumItalic.ttf', 'ZR Newsreader Italic'),
    ('jetbrains-mono-latin-wght-normal.woff2', 700, 'JetBrainsMono-Bold.ttf', 'ZR JetBrains Bold'),
]
for name, wght, out, family in jobs:
    f = TTFont(os.path.join(src, name))
    if 'fvar' in f:
        f = instancer.instantiateVariableFont(f, {'wght': wght}, updateFontNames=False)
    n = f['name']
    for rec in list(n.names):
        if rec.nameID in (16, 17, 21, 22, 25):
            n.removeNames(nameID=rec.nameID)
    n.setName(family, 1, 3, 1, 0x409); n.setName('Regular', 2, 3, 1, 0x409)
    n.setName(family, 4, 3, 1, 0x409); n.setName(family.replace(' ', ''), 6, 3, 1, 0x409)
    n.setName(family, 1, 1, 0, 0); n.setName('Regular', 2, 1, 0, 0); n.setName(family, 4, 1, 0, 0); n.setName(family.replace(' ', ''), 6, 1, 0, 0)
    f['OS/2'].fsSelection = (f['OS/2'].fsSelection & ~0b1100001) | 0b1000000  # REGULAR bit only
    f['head'].macStyle = 0
    f.flavor = None
    f.save(os.path.join(here, out))
    print('wrote', out)
