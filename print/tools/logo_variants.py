"""Make print variants of the official Zenith logo (run once; outputs are committed).

Input : assets/logo/zenith_logo_original.png  (official PNG, black wordmark, transparent bg)
Output: assets/logo/zenith_logo_white.png     (same logo, wordmark turned white for dark backgrounds)
        assets/logo/zenith_logo_ink.png       (trimmed original, for light backgrounds)
        assets/logo/zenith_shield.png         (shield mark only, trimmed)
Run   : python3 tools/logo_variants.py   (needs Pillow)
"""
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, '..', 'assets', 'logo')
src = Image.open(os.path.join(LOGO, 'zenith_logo_original.png')).convert('RGBA')
W, H = src.size

def trim(im):
    return im.crop(im.getbbox())

# Wordmark pixels are near-black and unsaturated; the shield gradient is saturated.
white = src.copy()
px = white.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        mx, mn = max(r, g, b), min(r, g, b)
        if mx < 140 and (mx - mn) < 40:
            px[x, y] = (255, 255, 255, a)
trim(white).save(os.path.join(LOGO, 'zenith_logo_white.png'), optimize=True)
trim(src).save(os.path.join(LOGO, 'zenith_logo_ink.png'), optimize=True)

# Shield: left part of the artwork (the wordmark starts at about 40% of the width).
shield = src.crop((0, 0, int(W * 0.37), H))
trim(shield).save(os.path.join(LOGO, 'zenith_shield.png'), optimize=True)
print('ok', trim(white).size, trim(shield).size)
