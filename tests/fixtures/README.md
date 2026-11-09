# Test fixtures

## images/

- `sample.heic` (640x480), `large.heic` (8160x6144, about 50 MP) and the two candidate files below are real HEIC photos. They are
  generated on macOS by `images/make-heic.sh` (`sips -s format heic` from a sharp-made JPEG), because
  sharp's prebuilt binaries cannot encode HEVC-based HEIC. They are committed so Linux CI needs no
  `sips`; the images are synthetic gradients, so no third-party licence or personal data applies.
  `large.heic` is used by `scripts/measure-image-memory.ts` (memory early warning, research.md R7).
- `heic-16mp.heic` (4608x3456) and `heic-12mp.heic` (4000x3000) are the `HEIC_MAX_PIXELS` candidates (textured with sensor-like grain, 4.6 and 6.1 MB like real phone photos; a smooth gradient would be 80 KB and understate the memory use) that
  `scripts/measure-app-memory.ts` uploads to the whole app in a 512 MB container (T052, research.md R7).
  `large.heic` must be refused by the app (over `HEIC_MAX_PIXELS`).
- All other image fixtures (JPEG with EXIF GPS, PNG, WebP, GIF, oversized files) are generated inside
  `tests/unit/image-process.test.ts` with sharp.
