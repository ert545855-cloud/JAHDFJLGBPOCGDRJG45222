#!/usr/bin/env bash
# Swipe Race derlemesi -> public/race/
#   ./build.sh                        yalnız kodu derler (modeller public/race/assets.json içinde hazır)
#   ./build.sh <racing-kit> <toy-kit> model paketini de yeniden üretir
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../public/race
mkdir -p "$OUT"
if [ $# -eq 2 ]; then python3 -I tools/pack.py "$1" "$2" "$OUT/assets.json"; fi
npx --yes esbuild@0.24.0 src/main.js --bundle --minify --format=iife --target=es2019 \
  --outfile="$OUT/game.js" --log-level=warning
cp src/index.html "$OUT/index.html"
ls -la "$OUT"
