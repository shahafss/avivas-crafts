import 'server-only';

const ALLOWED_KEYS = [
  'event',
  'adminId',
  'orderNumber',
  'orderId',
  'pendingId',
  'kind',
  'status',
  'durationMs',
  'errorCode',
  'correlationId',
  'route',
  'count',
] as const;

type AllowedKey = Exclude<(typeof ALLOWED_KEYS)[number], 'event'>;
const ALLOWED = new Set<string>(ALLOWED_KEYS);

/**
 * `route` must hold the route pattern (e.g. `/[locale]/order/[token]`), never a concrete URL:
 * order and payment-return URLs contain secret tokens.
 */
export type LogFields = Partial<Record<AllowedKey, string | number | boolean | null>>;

function write(level: 'info' | 'warn' | 'error', event: string, fields: LogFields = {}): void {
  const entry: Record<string, unknown> = { time: new Date().toISOString(), level, event };
  for (const [key, value] of Object.entries(fields)) {
    // Anything outside the allow-list (email, phone, token, ip, name, address, ...) is dropped.
    if (ALLOWED.has(key) && key !== 'event') entry[key] = value;
  }
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export const log = {
  info: (event: string, fields?: LogFields): void => {
    write('info', event, fields);
  },
  warn: (event: string, fields?: LogFields): void => {
    write('warn', event, fields);
  },
  error: (event: string, fields?: LogFields): void => {
    write('error', event, fields);
  },
};
