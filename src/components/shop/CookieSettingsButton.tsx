'use client';

import { SETTINGS_EVENT, SETTINGS_REQUESTED_ATTR } from './consent-types';

/**
 * The footer's "Cookie settings" button (storefront.md §7.21). The label is translated on the
 * server. It asks the banner (a separate chunk) to open its dialog; when that chunk is still
 * loading it leaves a mark on `<html>` that the banner reads when it mounts.
 */
export function CookieSettingsButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      data-testid="footer-cookie-settings"
      onClick={() => {
        document.documentElement.setAttribute(SETTINGS_REQUESTED_ATTR, '');
        window.dispatchEvent(new Event(SETTINGS_EVENT));
      }}
      className="flex min-h-11 items-center text-start"
    >
      {label}
    </button>
  );
}
