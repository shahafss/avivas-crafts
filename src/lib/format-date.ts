/** Admin dates are shown in Israel time with a 24-hour clock (002 research R14). */
const TIME_ZONE = 'Asia/Jerusalem';

type DateLocale = 'he' | 'en';

const INTL_LOCALE: Record<DateLocale, string> = { he: 'he-IL', en: 'en-GB' };

export function formatDateTime(date: Date, locale: DateLocale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function formatDate(date: Date, locale: DateLocale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

/** `YYYY-MM-DD` of the Israel-local day of `date` (file names, 003 contracts/server-actions.md). */
export function isoDateInIsrael(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** A `YYYY-MM-DD` date moved by `days` calendar days (a plain date, no zone involved). */
export function addDays(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}
