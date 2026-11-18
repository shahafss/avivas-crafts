import type { CategoryId } from '@/lib/consent/registry';

/** What `ConsentRoot` hands to the client loader, the banner and the gate (all serialisable). */
export interface ConsentProps {
  categories: { id: CategoryId; scripts: { src: string }[] }[];
  /** What the cookie says (pre-sets the switches); empty without a valid cookie. */
  choices: Record<string, boolean>;
  /** What may run now (all `false` while a choice is needed). */
  effectiveChoices: Record<string, boolean>;
  needsChoice: boolean;
  /** A choice is needed and the request carries an optional cookie (even an `HttpOnly` one). */
  staleOptional: boolean;
  nonce: string;
  cookiesHref: string;
}

/** `<html>` attribute set by the footer button when the banner chunk had not loaded yet. */
export const SETTINGS_REQUESTED_ATTR = 'data-consent-settings-requested';
export const SETTINGS_EVENT = 'ac:consent-settings';
