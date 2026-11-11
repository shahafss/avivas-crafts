'use client';

import { useEffect } from 'react';
import type { ConsentProps } from './consent-types';

/**
 * Appends the scripts of every category the visitor has accepted, once each, with the page nonce.
 * `effectiveChoices` is all `false` while a choice is needed, so nothing optional loads then
 * (003 FR-022). A script that has run cannot be unloaded; the action already expired its cookie.
 */
export default function ConsentGate({ categories, effectiveChoices, nonce }: ConsentProps) {
  useEffect(() => {
    for (const category of categories) {
      if (effectiveChoices[category.id] !== true) continue;
      for (const { src } of category.scripts) {
        if (Array.from(document.scripts).some((script) => script.dataset.consentSrc === src)) {
          continue;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        // After `router.refresh()` this nonce is stale; the script still loads because the CSP's
        // `script-src` has 'strict-dynamic' (src/server/security/headers.ts).
        script.nonce = nonce;
        script.dataset.consentSrc = src;
        document.head.append(script);
      }
    }
  }, [categories, effectiveChoices, nonce]);
  return null;
}
