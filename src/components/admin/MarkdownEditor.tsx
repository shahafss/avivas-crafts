'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorSummary } from '@/components/ui/ErrorSummary';
import { Markdown } from '@/components/ui/Markdown';
import { Notice } from '@/components/ui/Notice';
import { Prose } from '@/components/ui/Prose';
import { TextArea } from '@/components/ui/TextArea';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { applyTool, type MarkdownTool } from '@/lib/markdown-tools';
import type { RenderedHtml } from '@/lib/rendered-html';
import type { ActionResult } from '@/server/catalog/result';
import type { ContentSlug } from '@/server/content/slugs';
import { useHydrated } from './useHydrated';

/** The Server Actions of `content/[slug]/actions.ts`, passed in by the page. */
export interface MarkdownEditorApi {
  updateContentPage: (input: {
    slug: ContentSlug;
    expectedVersion: number;
    titleHe: string;
    bodyHe: string;
    titleEn: string;
    bodyEn: string;
  }) => Promise<ActionResult<{ version: number; unchanged: boolean }>>;
  previewContent: (input: { body: string }) => Promise<ActionResult<{ html: RenderedHtml }>>;
}

export interface MarkdownEditorProps {
  slug: ContentSlug;
  /** The version the page had when it was loaded; sent back so a concurrent change is noticed. */
  version: number;
  titleHe: string;
  bodyHe: string;
  titleEn: string;
  bodyEn: string;
  /** Terms and Privacy Policy: a link to the version history. */
  versioned: boolean;
  actions: MarkdownEditorApi;
}

type Lang = 'he' | 'en';
type Values = { titleHe: string; bodyHe: string; titleEn: string; bodyEn: string };

const STALE_KEY = 'admin.content.errors.stale';
const FIELD_IDS = {
  titleHe: 'content-field-titleHe',
  bodyHe: 'content-field-bodyHe',
  titleEn: 'content-field-titleEn',
  bodyEn: 'content-field-bodyEn',
} as const;
const LANG_OF: Record<keyof Values, Lang> = {
  titleHe: 'he',
  bodyHe: 'he',
  titleEn: 'en',
  bodyEn: 'en',
};
const ORDER: (keyof Values)[] = ['titleHe', 'bodyHe', 'titleEn', 'bodyEn'];
const TOOLS: { tool: MarkdownTool; label: 'toolHeading' | 'toolBold' | 'toolList' | 'toolLink' }[] =
  [
    { tool: 'heading', label: 'toolHeading' },
    { tool: 'bold', label: 'toolBold' },
    { tool: 'list', label: 'toolList' },
    { tool: 'link', label: 'toolLink' },
  ];

const PANELS = [
  { lang: 'he', title: 'titleHe', body: 'bodyHe', dir: 'rtl' },
  { lang: 'en', title: 'titleEn', body: 'bodyEn', dir: 'ltr' },
] as const;

const TAB = 'inline-flex min-h-11 items-center rounded-pill px-5 text-[15px] font-bold';

/**
 * Editor island of the content screens (storefront.md §12.6, research R6): Hebrew / English
 * tabs, a four-button toolbar that inserts Markdown at the selection, a preview rendered by the
 * server (so it equals the public page), and a save bar.
 */
export function MarkdownEditor({
  slug,
  version: loadedVersion,
  titleHe,
  bodyHe,
  titleEn,
  bodyEn,
  versioned,
  actions,
}: MarkdownEditorProps) {
  const t = useTranslations('admin.content.editor');
  const messages = useTranslations();
  const router = useRouter();
  const hydrated = useHydrated();
  const busyRef = useRef(false);
  const [values, setValues] = useState<Values>({ titleHe, bodyHe, titleEn, bodyEn });
  const [version, setVersion] = useState(loadedVersion);
  const [tab, setTab] = useState<Lang>('he');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [failures, setFailures] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  // Preview.
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<RenderedHtml | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const body = tab === 'he' ? values.bodyHe : values.bodyEn;
  useEffect(() => {
    if (!previewing) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      actions
        .previewContent({ body })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setPreview(result.data.html);
            setPreviewFailed(false);
          } else {
            setPreviewFailed(true);
          }
        })
        .catch(() => {
          if (!cancelled) setPreviewFailed(true);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [previewing, body, actions]);

  // Toolbar: the new text goes through state, the selection is put back once it is rendered.
  const pendingSelection = useRef<{ field: keyof Values; start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    if (pending === null) return;
    pendingSelection.current = null;
    const element = document.getElementById(FIELD_IDS[pending.field]);
    if (element instanceof HTMLTextAreaElement) {
      element.focus();
      element.setSelectionRange(pending.start, pending.end);
    }
  }, [values]);

  function insertSyntax(tool: MarkdownTool): void {
    const field = tab === 'he' ? 'bodyHe' : 'bodyEn';
    const element = document.getElementById(FIELD_IDS[field]);
    if (!(element instanceof HTMLTextAreaElement)) return;
    const edit = applyTool(
      tool,
      values[field],
      element.selectionStart,
      element.selectionEnd,
      t('linkText'),
    );
    pendingSelection.current = { field, start: edit.start, end: edit.end };
    setValues((current) => ({ ...current, [field]: edit.value }));
  }

  // A failed save moves focus to the summary, so the problems are read out first.
  const focusAfterFailure = useRef<string>('content-error-summary');
  useEffect(() => {
    if (failures > 0) document.getElementById(focusAfterFailure.current)?.focus();
  }, [failures]);

  /** Switches the tab; the preview of the other language is dropped at once. */
  function selectTab(lang: Lang): void {
    if (lang === tab) return;
    setTab(lang);
    setPreview(null);
  }

  // A field inside a hidden tab can only be focused once its tab is shown.
  const pendingFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  }, [tab]);

  function goToField(fieldId: string): void {
    const field = ORDER.find((name) => FIELD_IDS[name] === fieldId);
    if (field === undefined) return;
    if (LANG_OF[field] === tab) {
      document.getElementById(fieldId)?.focus();
      return;
    }
    pendingFocus.current = fieldId;
    selectTab(LANG_OF[field]);
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>): void {
    let next: Lang;
    if (event.key === 'Home') next = 'he';
    else if (event.key === 'End') next = 'en';
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      next = tab === 'he' ? 'en' : 'he';
    } else return;
    event.preventDefault();
    selectTab(next);
    document.getElementById(`content-tab-${next}`)?.focus();
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setStale(false);
    setErrors({});
    try {
      const result = await actions.updateContentPage({ slug, expectedVersion: version, ...values });
      if (result.ok) {
        setVersion(result.data.version);
        setToast(result.data.unchanged ? t('unchanged') : t('saved'));
        router.refresh();
        return;
      }
      const fieldErrors = result.fieldErrors ?? {};
      const found: Partial<Record<keyof Values, string>> = {};
      for (const field of ORDER) {
        const key = fieldErrors[field];
        if (key !== undefined) found[field] = messages(key);
      }
      if (Object.keys(found).length > 0) {
        setErrors(found);
        const first = ORDER.find((field) => found[field] !== undefined);
        if (first !== undefined) selectTab(LANG_OF[first]);
        focusAfterFailure.current =
          Object.keys(found).length > 1 || first === undefined
            ? 'content-error-summary'
            : FIELD_IDS[first];
        setFailures((count) => count + 1);
        return;
      }
      if (result.formError === STALE_KEY) setStale(true);
      else setNotice(messages(result.formError ?? 'admin.failed'));
    } catch {
      setNotice(messages('admin.failed'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (!hydrated) return null;

  const summaryItems = ORDER.filter((field) => errors[field] !== undefined).map((field) => ({
    fieldId: FIELD_IDS[field],
    message: messages('admin.content.editor.errorIn', {
      language: LANG_OF[field] === 'he' ? t('tabHe') : t('tabEn'),
      message: errors[field] ?? '',
    }),
  }));
  const hasError = (lang: Lang): boolean =>
    ORDER.some((field) => LANG_OF[field] === lang && errors[field] !== undefined);

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="grid gap-4"
      data-testid="content-editor"
    >
      <ErrorSummary
        id="content-error-summary"
        heading={t('errorSummary')}
        items={summaryItems.length > 1 ? summaryItems : []}
        data-testid="content-error-summary"
        onSelect={goToField}
      />
      {stale ? (
        <Notice tone="alert" role="alert">
          <div data-testid="content-stale" className="grid gap-2">
            <p>{messages(STALE_KEY)}</p>
            <div>
              <Button
                variant="secondary"
                className="h-11 px-4 text-[15px]"
                data-testid="content-reload"
                onClick={() => {
                  window.location.reload();
                }}
              >
                {t('reload')}
              </Button>
            </div>
          </div>
        </Notice>
      ) : null}
      {notice === null ? null : (
        <Notice tone="alert" role="alert">
          {notice}
        </Notice>
      )}

      <div role="tablist" aria-label={t('tabsLabel')} className="flex gap-2">
        {PANELS.map(({ lang }) => (
          <button
            key={lang}
            type="button"
            role="tab"
            id={`content-tab-${lang}`}
            aria-selected={tab === lang}
            aria-controls={`content-panel-${lang}`}
            tabIndex={tab === lang ? 0 : -1}
            data-testid={`content-tab-${lang}`}
            onClick={() => {
              selectTab(lang);
            }}
            onKeyDown={onTabKey}
            className={cn(
              TAB,
              tab === lang ? 'bg-ink text-paper' : 'border-[1.5px] border-field bg-paper text-ink',
            )}
          >
            {lang === 'he' ? t('tabHe') : t('tabEn')}
            {hasError(lang) ? <span className="sr-only"> ({t('tabHasError')})</span> : null}
          </button>
        ))}
      </div>

      {PANELS.map(({ lang, title: titleField, body: bodyField, dir }) => {
        return (
          <div
            key={lang}
            role="tabpanel"
            id={`content-panel-${lang}`}
            aria-labelledby={`content-tab-${lang}`}
            hidden={tab !== lang}
            className="grid gap-4"
          >
            <TextField
              id={FIELD_IDS[titleField]}
              label={t('titleLabel')}
              lang={lang}
              dir={dir}
              value={values[titleField]}
              error={errors[titleField]}
              data-testid={`content-title-${lang}`}
              onChange={(event) => {
                setValues((current) => ({ ...current, [titleField]: event.target.value }));
              }}
            />
            <div className="grid gap-2">
              <div role="toolbar" aria-label={t('toolbarLabel')} className="flex flex-wrap gap-2">
                {TOOLS.map(({ tool, label }) => (
                  <Button
                    key={tool}
                    variant="secondary"
                    className="h-11 px-4 text-[15px]"
                    data-testid={`content-tool-${lang}-${tool}`}
                    onClick={() => {
                      insertSyntax(tool);
                    }}
                  >
                    {t(label)}
                  </Button>
                ))}
              </div>
              <TextArea
                id={FIELD_IDS[bodyField]}
                label={t('bodyLabel')}
                hint={t('bodyHint')}
                rows={16}
                lang={lang}
                dir={dir}
                value={values[bodyField]}
                error={errors[bodyField]}
                data-testid={`content-body-${lang}`}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [bodyField]: event.target.value }));
                }}
              />
            </div>
          </div>
        );
      })}

      <div className="grid gap-3">
        <div>
          <Button
            variant="secondary"
            aria-pressed={previewing}
            data-testid="content-preview-toggle"
            onClick={() => {
              setPreviewing((current) => !current);
            }}
          >
            {t('previewShow')}
          </Button>
        </div>
        {previewing ? (
          <section
            aria-label={t('previewLabel')}
            data-testid="content-preview"
            className="rounded-card border border-line bg-paper p-4"
          >
            {previewFailed ? (
              <Notice tone="alert" role="alert">
                {t('previewFailed')}
              </Notice>
            ) : body.trim() === '' ? (
              <p className="text-ink-2">{t('previewEmpty')}</p>
            ) : preview === null ? null : (
              <Prose>
                <Markdown html={preview} lang={tab} dir={tab === 'he' ? 'rtl' : 'ltr'} />
              </Prose>
            )}
          </section>
        ) : null}
      </div>

      {versioned ? (
        <Link
          href={`/admin/content/${slug}/versions`}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-[15px] font-bold underline underline-offset-[3px]"
        >
          {t('versionsLink')}
        </Link>
      ) : null}

      <div className="sticky bottom-0 z-header -mx-4 border-t border-line bg-paper px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button
          type="submit"
          busy={busy}
          busyLabel={t('saving')}
          className="w-full sm:w-auto"
          data-testid="content-save"
        >
          {t('save')}
        </Button>
      </div>
      <Toast message={toast} onDismiss={dismissToast} />
    </form>
  );
}
