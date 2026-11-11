'use client';

import { lazy, Suspense } from 'react';
import type { ConsentProps } from './consent-types';

// The split happens here: a dynamic import inside a Server Component would not code-split a
// Client Component (contracts/consent.md > Components). Each module is its own chunk.
const Banner = lazy(() => import('./ConsentBanner'));
const Gate = lazy(() => import('./ConsentGate'));

export function ConsentLoader(props: ConsentProps) {
  return (
    <Suspense fallback={null}>
      <Banner {...props} />
      <Gate {...props} />
    </Suspense>
  );
}
