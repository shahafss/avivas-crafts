import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';

const rootDir = dirname(fileURLToPath(import.meta.url));

// Physical Tailwind utilities are banned: use logical ones (ms-/me-/ps-/pe-/start-/end-/
// text-start/text-end/rounded-s/e/border-s/e). Applied to every string and template literal.
const PHYSICAL_UTILITY =
  '(^|\\s|:)-?(m[lr]|p[lr]|scroll-m[lr]|scroll-p[lr])-|(^|\\s|:)(left|right)-|text-(left|right)\\b|rounded-[lr]\\b|rounded-[lr]-|rounded-(tl|tr|bl|br)\\b|rounded-(tl|tr|bl|br)-|border-[lr]\\b|border-[lr]-|float-(left|right)\\b';

const physicalUtilityMessage =
  'Physical Tailwind utility: use the logical equivalent (ms-/me-/ps-/pe-/start-/end-/text-start/text-end/rounded-s/e/border-s/e).';

const noPhysicalUtilities = [
  {
    selector: `Literal[value=/${PHYSICAL_UTILITY}/]`,
    message: physicalUtilityMessage,
  },
  {
    selector: `TemplateElement[value.raw=/${PHYSICAL_UTILITY}/]`,
    message: physicalUtilityMessage,
  },
];

const noDangerousHtml = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message:
    'dangerouslySetInnerHTML is only allowed in src/components/ui/Markdown.tsx and src/components/shop/JsonLd.tsx.',
};

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      '.data/**',
      'next-env.d.ts',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'specs/**',
      '.specify/**',
      '.claude/**',
      '.impeccable/**',
      'src/server/db/migrations/**',
    ],
  },
  ...coreWebVitals,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
    rules: {
      // Plain <img> is the rule (images are pre-processed WebP from a separate origin).
      '@next/next/no-img-element': 'off',
      // Strict CSP: no inline styles.
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
      'no-restricted-properties': [
        'error',
        {
          object: 'sql',
          property: 'raw',
          message: 'sql.raw is banned: use parameterised Drizzle queries.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'drizzle-orm',
              importNames: ['raw'],
              message: 'Raw SQL is banned: use parameterised Drizzle queries.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', noDangerousHtml],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    plugins: { i18next },
    rules: {
      'no-restricted-syntax': ['error', noDangerousHtml, ...noPhysicalUtilities],
      'i18next/no-literal-string': [
        'error',
        {
          // Plain text in JSX markup plus the user-visible attributes below.
          mode: 'jsx-only',
          'jsx-attributes': {
            include: ['aria-label', 'alt', 'placeholder', 'title'],
            exclude: [
              'aria-.*',
              'data-.*',
              'className',
              'style',
              'type',
              'key',
              'id',
              'name',
              'value',
              'width',
              'height',
              'href',
              'src',
              'srcSet',
              'sizes',
              'role',
              'lang',
              'dir',
              'rel',
              'target',
              'method',
              'action',
              'htmlFor',
              'autoComplete',
              'inputMode',
              'loading',
              'decoding',
              'fetchPriority',
              'viewBox',
              'd',
              'fill',
              'stroke',
              'strokeLinecap',
              'strokeLinejoin',
              'xmlns',
              'tabIndex',
              'variant',
              'tone',
              'size',
              'as',
              'locale',
              'accept',
              'pattern',
            ],
          },
        },
      ],
    },
  },
  {
    files: ['src/components/ui/Markdown.tsx', 'src/components/shop/JsonLd.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...noPhysicalUtilities],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
