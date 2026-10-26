#!/bin/zsh
# Renders every docs/operator/*.html to a PDF next to it, with headless Chrome.
# Usage: zsh docs/operator/render.sh            (all)
#        zsh docs/operator/render.sh 01_ai_jyotish   (one)
# Then check: pdfinfo <file>.pdf (pages) and pdftotext <file>.pdf - piped to a grep for U+2012..U+2015 (must find none).
set -e
DIR="${0:A:h}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
names=("$@")
if (( ${#names} == 0 )); then names=("$DIR"/*.html); names=("${names[@]:t:r}"); fi
for n in "${names[@]}"; do
  ok=0
  for try in 1 2 3; do  # headless Chrome now and then exits early; retry
    if "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --allow-file-access-from-files \
      --print-to-pdf="$DIR/$n.pdf" "file://$DIR/$n.html" 2>/dev/null; then ok=1; break; fi
    sleep 1
  done
  (( ok )) || { echo "FAILED: $n" >&2; exit 1; }
  echo "$n.pdf"
done
