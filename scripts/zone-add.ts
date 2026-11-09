// pnpm zone:add --code WORLD --name-he "…" --name-en "…" --countries US,GB,…
// Adds a disabled USD shipping zone for the listed countries (maintainer command, research.md
// R18). The owner enables it on the settings screen once every published product has a USD price.
import { parseArgs } from 'node:util';
import { db } from '@/server/db/client';
import { addZone } from '@/server/settings/zone-add';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

const USAGE = 'Usage: pnpm zone:add --code WORLD --name-he "…" [--name-en "…"] --countries US,GB,…';

let values: { code?: string; 'name-he'?: string; 'name-en'?: string; countries?: string };
try {
  values = parseArgs({
    options: {
      code: { type: 'string' },
      'name-he': { type: 'string' },
      'name-en': { type: 'string' },
      countries: { type: 'string' },
    },
  }).values;
} catch {
  console.error(USAGE);
  process.exit(1);
}

try {
  const result = await addZone(db, {
    code: values.code ?? '',
    nameHe: values['name-he'] ?? '',
    nameEn: values['name-en'],
    countries: (values.countries ?? '').split(',').filter((country) => country.trim() !== ''),
  });
  if (!result.ok) {
    if (result.error === 'invalid') {
      console.error(USAGE);
      console.error(
        'The code is capital letters, digits or _ (2-20 characters); countries are two-letter codes.',
      );
    } else if (result.error === 'code_taken') {
      console.error('A zone with this code already exists.');
    } else {
      console.error(`Already in another zone: ${result.countries.join(', ')}.`);
    }
    process.exit(1);
  }
  console.log(
    `Zone ${result.code} created (USD, disabled) for ${result.countries.join(', ')}. Enable it on the settings screen once every published product has a USD price.`,
  );
  process.exit(0);
} catch (error) {
  console.error('Could not create the zone:', error instanceof Error ? error.message : error);
  process.exit(1);
}
