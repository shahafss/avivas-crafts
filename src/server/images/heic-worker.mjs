// Plain ES module on purpose: neither Turbopack nor Vitest has to transform it. It runs in a
// short-lived worker thread that the caller terminates after each image, which frees the
// WebAssembly heap of libheif.
import { parentPort, workerData } from 'node:worker_threads';
import decode from 'heic-decode';

try {
  const { width, height, data } = await decode({ buffer: Buffer.from(workerData.buffer) });
  // Transfer the pixel buffer itself (no 200 MB copy). Copy only if it is a view into a larger buffer.
  const whole = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
  const pixels = whole ? data.buffer : new Uint8Array(data).buffer;
  parentPort.postMessage({ ok: true, width, height, pixels }, [pixels]);
} catch (error) {
  parentPort.postMessage({ ok: false, message: String(error?.message ?? error) });
}
