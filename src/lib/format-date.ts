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
