// pnpm check:css - the shop must work in RTL and LTR, so CSS under src/ may only use logical
// properties. Exits non-zero and prints file:line for every physical declaration.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

const PHYSICAL = [
  /\bmargin-(left|right)\b/,
  /\bpadding-(left|right)\b/,
  /\bborder-(left|right)\b/,
  /\btext-align\s*:\s*(left|right)\b/,
  /\bfloat\s*:\s*(left|right)\b/,
  /(^|[;{\s])(left|right)\s*:/,
];

function* cssFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* cssFiles(full);
    else if (entry.name.endsWith('.css')) yield full;
  }
}

let violations = 0;
for (const file of cssFiles(join(root, 'src'))) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inComment = false;
  lines.forEach((raw, index) => {
    let line = raw;
    if (inComment) {
      const end = line.indexOf('*/');
      if (end === -1) return;
      line = line.slice(end + 2);
      inComment = false;
    }
    line = line.replace(/\/\*.*?\*\//g, '');
    const open = line.indexOf('/*');
    if (open !== -1) {
      line = line.slice(0, open);
      inComment = true;
    }
    if (PHYSICAL.some((pattern) => pattern.test(line))) {
      violations += 1;
      console.error(
        `${relative(root, file)}:${String(index + 1)}: physical CSS property: ${raw.trim()}`,
      );
    }
  });
}

if (violations > 0) {
  console.error(`\n${String(violations)} physical CSS declaration(s). Use logical properties.`);
  process.exit(1);
}
console.log('check:css ok');
