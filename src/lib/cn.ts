/** Joins class names, skipping falsy parts. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}
