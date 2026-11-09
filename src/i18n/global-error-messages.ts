// The two strings sets `global-error.tsx` needs. A small module on purpose: importing the full
// message files there would put both of them into a client chunk loaded on every page.
// tests/unit/i18n-parity.test.ts asserts they match `errors.generic` in the JSON files.
export const globalErrorMessages = {
  he: {
    title: 'משהו השתבש',
    text: 'לא הצלחתי לטעון את העמוד. נסו שוב, ואם זה חוזר, חזרו לדף הבית.',
    retry: 'נסו שוב',
    home: 'לדף הבית',
  },
  en: {
    title: 'Something went wrong',
    text: 'I could not load this page. Please try again, and if it keeps happening, go back to the home page.',
    retry: 'Try again',
    home: 'Back to the home page',
  },
} as const;
