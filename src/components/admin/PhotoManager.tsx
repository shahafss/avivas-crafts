'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FieldError, errorId } from '@/components/ui/Field';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { MAX_IMAGES } from '@/lib/validation/product';
import type { ActionResult } from '@/server/catalog/result';

export interface PhotoItem {
  id: string;
  /** Same-origin preview URL (400 px) of the private image. */
  url: string;
  altHe: string | null;
  altEn: string | null;
}

export interface PhotoActions {
  reorderImages: (productId: string, imageIds: string[]) => Promise<ActionResult>;
  setMainImage: (productId: string, imageId: string) => Promise<ActionResult>;
  removeImage: (productId: string, imageId: string) => Promise<ActionResult>;
  setImageAlt: (
    productId: string,
    imageId: string,
    alt: { altHe?: string | null; altEn?: string | null },
  ) => Promise<ActionResult>;
}

const PHOTOS_ID = 'product-photos';
const PHOTOS_ERROR_ID = errorId(PHOTOS_ID);

/** Upload errors of `POST /api/admin/images` (contracts/http-endpoints.md) that have their own message. */
const UPLOAD_ERRORS = new Set([
  'unsupported_type',
  'too_large',
  'too_many_pixels',
  'too_many_images',
  'corrupt',
  'bad_request',
  'not_found',
]);

/**
 * Android browsers sometimes send an empty or generic MIME type for HEIC, so the extension counts too.
 */
export function isHeic(file: Pick<File, 'type' | 'name'>): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** Translation key (under `admin.images.errors`) for a failed upload. */
export function uploadErrorKey(status: number, code: unknown, heic: boolean): string {
  if (status === 401) return 'unauthorized';
  if (typeof code !== 'string' || !UPLOAD_ERRORS.has(code)) return 'bad_request';
  return code === 'too_many_pixels' && heic ? 'too_many_pixels_heic' : code;
}

interface Upload {
  key: number;
  name: string;
  state: 'waiting' | 'uploading' | 'failed';
  error?: string;
}

interface Uploaded {
  id: string;
  previewUrl: string;
}

function readUploaded(body: unknown): Uploaded | null {
  if (typeof body !== 'object' || body === null) return null;
  const { id, previewUrl } = body as Record<string, unknown>;
  return typeof id === 'string' && typeof previewUrl === 'string' ? { id, previewUrl } : null;
}

function PhotoAlt({
  productId,
  item,
  actions,
  onFeedback,
}: {
  productId: string;
  item: PhotoItem;
  actions: PhotoActions;
  onFeedback: (message: string, tone: 'success' | 'error') => void;
}) {
  const t = useTranslations('admin.products.photos');
  const common = useTranslations();
  const [altHe, setAltHe] = useState(item.altHe ?? '');
  const [altEn, setAltEn] = useState(item.altEn ?? '');
  const [saving, startSaving] = useTransition();

  function save(): void {
    startSaving(async () => {
      const result = await actions.setImageAlt(productId, item.id, { altHe, altEn });
      if (result.ok) onFeedback(common('admin.saved'), 'success');
      else onFeedback(common(result.formError ?? 'admin.failed'), 'error');
    });
  }

  return (
    <details className="rounded-chip border border-line px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-bold">
        {t('altSummary')}
      </summary>
      <div className="grid gap-3 pb-3">
        <p className="text-[13px] text-ink-2">{t('altHint')}</p>
        <FormField
          label={t('altHe')}
          value={altHe}
          maxLength={200}
          onChange={(event) => {
            setAltHe(event.target.value);
          }}
        />
        <FormField
          label={t('altEn')}
          value={altEn}
          maxLength={200}
          dir="ltr"
          onChange={(event) => {
            setAltEn(event.target.value);
          }}
        />
        <div>
          <Button variant="secondary" busy={saving} busyLabel={t('altSave')} onClick={save}>
            {t('altSave')}
          </Button>
        </div>
      </div>
    </details>
  );
}

/**
 * Photos of one product: camera-roll upload (one file at a time, so a phone never sends twelve
 * 20 MB files at once), thumbnails, main photo, up/down order and removal with confirmation.
 */
export function PhotoManager({
  productId,
  initial,
  actions,
  onFeedback,
  error: requiredError,
  onCountChange,
}: {
  productId: string;
  initial: PhotoItem[];
  actions: PhotoActions;
  onFeedback: (message: string, tone: 'success' | 'error') => void;
  /** "Required" message from a failed publish; shown as a red outline and a line under the heading. */
  error?: string | undefined;
  /** Called with the number of photos whenever it changes. */
  onCountChange?: ((count: number) => void) | undefined;
}) {
  const t = useTranslations('admin.products.photos');
  const errors = useTranslations('admin.images.errors');
  const common = useTranslations();
  const [items, setItems] = useState<PhotoItem[]>(initial);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const counter = useRef(0);
  // After a move the buttons are re-rendered; keyboard focus follows the moved photo.
  const focusAfter = useRef<{ id: string; prefer: string[] } | null>(null);

  useEffect(() => {
    onCountChange?.(items.length);
  }, [items.length, onCountChange]);

  useEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    const row = document.querySelector(`[data-image-id="${target.id}"]`);
    for (const testId of target.prefer) {
      const button = row?.querySelector(`[data-testid="${testId}"]`);
      if (button instanceof HTMLElement) {
        button.focus();
        return;
      }
    }
  }, [items]);
  const busyUploading = uploads.some((upload) => upload.state !== 'failed');

  async function uploadAll(files: File[]): Promise<void> {
    const batch: Upload[] = files.map((file) => {
      counter.current += 1;
      return { key: counter.current, name: file.name, state: 'waiting' };
    });
    setUploads(batch);
    setDoneCount(0);
    setTotalCount(files.length);

    for (const [index, file] of files.entries()) {
      const entry = batch[index];
      if (entry === undefined) continue;
      setUploads((current) =>
        current.map((upload) =>
          upload.key === entry.key ? { ...upload, state: 'uploading' } : upload,
        ),
      );
      let failure: string | null = null;
      try {
        const form = new FormData();
        form.set('productId', productId);
        form.set('file', file);
        const response = await fetch('/api/admin/images', { method: 'POST', body: form });
        const body: unknown = await response.json().catch(() => null);
        if (response.ok) {
          const uploaded = readUploaded(body);
          if (uploaded === null) {
            failure = 'bad_request';
          } else {
            setItems((current) => [
              ...current,
              { id: uploaded.id, url: uploaded.previewUrl, altHe: null, altEn: null },
            ]);
          }
        } else {
          const code =
            typeof body === 'object' && body !== null
              ? (body as Record<string, unknown>).error
              : undefined;
          failure = uploadErrorKey(response.status, code, isHeic(file));
        }
      } catch {
        failure = 'bad_request';
      }
      setDoneCount((count) => count + 1);
      setUploads((current) =>
        failure === null
          ? current.filter((upload) => upload.key !== entry.key)
          : current.map((upload) =>
              upload.key === entry.key ? { ...upload, state: 'failed', error: failure } : upload,
            ),
      );
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) void uploadAll(files);
  }

  function apply(next: PhotoItem[], run: () => Promise<ActionResult>): void {
    const before = items;
    setError(undefined);
    setItems(next);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setItems(before);
        setError(
          common(result.formError ?? Object.values(result.fieldErrors ?? {})[0] ?? 'admin.failed'),
        );
      }
    });
  }

  function move(index: number, by: -1 | 1): void {
    const next = [...items];
    const current = next[index];
    const other = next[index + by];
    if (current === undefined || other === undefined) return;
    next[index] = other;
    next[index + by] = current;
    focusAfter.current = {
      id: current.id,
      prefer: by === -1 ? ['photo-up', 'photo-down'] : ['photo-down', 'photo-up'],
    };
    apply(next, () =>
      actions.reorderImages(
        productId,
        next.map((item) => item.id),
      ),
    );
  }

  function makeMain(index: number): void {
    const chosen = items[index];
    if (chosen === undefined) return;
    focusAfter.current = { id: chosen.id, prefer: ['photo-down', 'photo-remove'] };
    apply([chosen, ...items.filter((item) => item.id !== chosen.id)], () =>
      actions.setMainImage(productId, chosen.id),
    );
  }

  function confirmRemove(): void {
    const id = removing;
    if (id === null) return;
    setError(undefined);
    startTransition(async () => {
      const result = await actions.removeImage(productId, id);
      setRemoving(null);
      if (result.ok) {
        setItems((current) => current.filter((item) => item.id !== id));
      } else {
        setError(
          common(Object.values(result.fieldErrors ?? {})[0] ?? result.formError ?? 'admin.failed'),
        );
      }
    });
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        requiredError !== undefined &&
          'rounded-card outline-[1.5px] outline-offset-4 outline-alert',
      )}
    >
      {requiredError === undefined ? null : <FieldError id={PHOTOS_ID}>{requiredError}</FieldError>}
      <p className="text-ink-2">{t('hint')}</p>

      {error === undefined ? null : (
        <Notice tone="alert" role="alert">
          {error}
        </Notice>
      )}

      {items.length === 0 ? (
        <p className="text-ink-2">{t('empty')}</p>
      ) : (
        <ul aria-label={t('listLabel')} className="grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              data-testid="photo-item"
              data-image-id={item.id}
              data-main={index === 0 ? 'true' : undefined}
              className="grid gap-3 rounded-card border border-line bg-paper p-3"
            >
              <div className="flex gap-3">
                <span className="h-32 w-[102px] shrink-0 overflow-hidden rounded-chip bg-photo">
                  <img
                    src={item.url}
                    alt={t('photoLabel', { n: index + 1, total: items.length })}
                    width={400}
                    height={500}
                    decoding="async"
                    className="size-full object-cover"
                  />
                </span>
                <div className="grid min-w-0 flex-1 content-start gap-2">
                  {index === 0 ? (
                    <span className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-bold">
                      <Icon name="check" size={18} />
                      {t('main')}
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      className="h-11 px-4 text-[15px]"
                      onClick={() => {
                        makeMain(index);
                      }}
                      data-testid="photo-main"
                    >
                      {t('makeMain')}
                    </Button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {index === 0 ? null : (
                      <Button
                        variant="secondary"
                        className="h-11 px-4 text-[15px]"
                        onClick={() => {
                          move(index, -1);
                        }}
                        data-testid="photo-up"
                      >
                        {t('moveUp')}
                      </Button>
                    )}
                    {index === items.length - 1 ? null : (
                      <Button
                        variant="secondary"
                        className="h-11 px-4 text-[15px]"
                        onClick={() => {
                          move(index, 1);
                        }}
                        data-testid="photo-down"
                      >
                        {t('moveDown')}
                      </Button>
                    )}
                    <Button
                      variant="quiet"
                      className="text-alert"
                      onClick={() => {
                        setRemoving(item.id);
                      }}
                      data-testid="photo-remove"
                    >
                      {t('remove')}
                    </Button>
                  </div>
                </div>
              </div>
              <PhotoAlt
                key={`${item.id}-${item.altHe ?? ''}-${item.altEn ?? ''}`}
                productId={productId}
                item={item}
                actions={actions}
                onFeedback={onFeedback}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2">
        <label className="inline-flex h-12 w-fit cursor-pointer items-center justify-center gap-2 rounded-pill border-[1.5px] border-ink px-6 text-base font-bold has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink hover:bg-sage">
          <Icon name="plus" />
          {t('add')}
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            onChange={onPick}
            disabled={items.length >= MAX_IMAGES}
            className="sr-only"
            data-testid="photo-input"
            data-field="photos"
            {...(requiredError === undefined
              ? {}
              : { 'aria-invalid': true, 'aria-describedby': PHOTOS_ERROR_ID })}
          />
        </label>

        {busyUploading ? (
          <div className="grid gap-1.5" role="status">
            <progress value={doneCount} max={totalCount} className="h-2 w-full accent-ink">
              {t('progress', { done: doneCount, total: totalCount })}
            </progress>
            <p className="text-[13px] text-ink-2">
              {t('progress', { done: doneCount, total: totalCount })}
            </p>
            {uploads
              .filter((upload) => upload.state === 'uploading')
              .map((upload) => (
                <p key={upload.key} className="flex items-center gap-2 text-[15px]">
                  <Spinner />
                  <bdi>{t('uploading', { name: upload.name })}</bdi>
                </p>
              ))}
          </div>
        ) : null}

        {uploads
          .filter((upload) => upload.state === 'failed')
          .map((upload) => (
            <Notice
              key={upload.key}
              tone="alert"
              role="alert"
              id={`upload-error-${String(upload.key)}`}
            >
              {t('failed', { name: upload.name, reason: errors(upload.error ?? 'bad_request') })}
            </Notice>
          ))}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={t('removeTitle')}
        confirmLabel={t('removeConfirm')}
        busy={pending}
        onConfirm={confirmRemove}
        onCancel={() => {
          setRemoving(null);
        }}
      >
        {t('removeText')}
      </ConfirmDialog>
    </div>
  );
}
