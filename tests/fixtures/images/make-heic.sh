#!/usr/bin/env bash
# Regenerates the committed HEIC fixtures. macOS only (uses `sips`); Linux CI uses the committed files.
#   sample.heic - small photo-like image for the unit test
#   large.heic  - >= 48 MP image for scripts/measure-image-memory.ts (over HEIC_MAX_PIXELS: must be refused)
#   heic-16mp.heic / heic-12mp.heic - textured (3-6 MB) HEIC_MAX_PIXELS candidates for scripts/measure-app-memory.ts (T052)
# Run from the repository root: bash tests/fixtures/images/make-heic.sh
set -euo pipefail
source ~/.nvm/nvm.sh >/dev/null
nvm use >/dev/null
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

node --input-type=module -e "
import sharp from 'sharp';
const make = async (w, h, out, grain = 0) => {
  // Smooth colour field with a little structure, so the HEIC stays small but is a real picture.
  const svg = Buffer.from(
    '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"' + w + '\" height=\"' + h + '\">' +
    '<defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4b43c\"/><stop offset=\"1\" stop-color=\"#8a3a2a\"/></linearGradient></defs>' +
    '<rect width=\"100%\" height=\"100%\" fill=\"url(#g)\"/>' +
    '<circle cx=\"' + w / 2 + '\" cy=\"' + h / 2 + '\" r=\"' + Math.min(w, h) / 4 + '\" fill=\"#fff8f0\"/></svg>');
  let image = sharp(svg);
  if (grain > 0) {
    // Camera-like sensor grain at full resolution: a real phone HEIC is 3-6 MB, not 80 KB, and
    // the memory gate (T052) must see realistic input.
    const noise = await sharp({ create: { width: w, height: h, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: grain } } }).png().toBuffer();
    image = sharp(await image.png().toBuffer()).composite([{ input: noise, blend: 'soft-light' }]);
  }
  await image.jpeg({ quality: 92 }).toFile(out);
};
await make(640, 480, '$work/sample.jpg');
await make(8160, 6144, '$work/large.jpg');
await make(4608, 3456, '$work/heic-16mp.jpg', 35); // 15.9 MP, a 16 MP phone photo
await make(4000, 3000, '$work/heic-12mp.jpg', 35); // 12.0 MP
"
sips -s format heic "$work/sample.jpg" --out "$here/sample.heic" >/dev/null
sips -s format heic "$work/large.jpg" --out "$here/large.heic" >/dev/null
sips -s format heic "$work/heic-16mp.jpg" --out "$here/heic-16mp.heic" >/dev/null
sips -s format heic "$work/heic-12mp.jpg" --out "$here/heic-12mp.heic" >/dev/null
ls -l "$here"/*.heic
