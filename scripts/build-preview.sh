#!/bin/zsh
# Render docs/workshop-preview.svg to the 1024x1024 PNG the Workshop page wants.
set -e
cd "$(dirname "$0")/.."
rsvg-convert -w 1024 -h 1024 docs/workshop-preview.svg -o docs/workshop-preview.png
echo "wrote docs/workshop-preview.png ($(sips -g pixelWidth -g pixelHeight docs/workshop-preview.png | tail -2 | tr -d ' \n'))"
