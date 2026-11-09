import { useSyncExternalStore } from 'react';

const subscribe = (): (() => void) => () => undefined;

/**
 * False in the server render and until the client has hydrated. Forms render their fields only
 * once this is true, so a field that can be seen is a field that works (text typed before
 * hydration would otherwise be overwritten when React takes over).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
