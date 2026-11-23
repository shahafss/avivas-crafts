'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '@/components/ui/ClientIcon';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';

export interface GalleryImage {
  id: string;
  src400: string;
  src800: string;
  src1600: string;
  width: number;
  height: number;
  /** The owner's alt text for this photo in the page language; empty = use the default. */
  alt: string;
  /** `he` when `alt` is Hebrew text on an English page. */
  altLang?: 'he';
}

const MAIN_SIZES = '(min-width: 900px) 55vw, 100vw';
const OVERLAY = 'bg-paper/95 text-[13px] font-bold text-ink';
const SCROLL_LOCK = 'overflow-hidden';

/**
 * Photos of one product: a scroll-snap track (native swipe, works without JavaScript), a counter,
 * thumbnails and a full-screen zoom dialog.
 */
export function Gallery({ name, images }: { name: string; images: GalleryImage[] }) {
  const t = useTranslations('shop.gallery');
  const total = images.length;
  const [current, setCurrent] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Counter and thumbnail follow the swipe.
  useEffect(() => {
    const root = track.current;
    if (root === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (entry.isIntersecting && Number.isInteger(index)) setCurrent(index);
        }
      },
      { root, threshold: 0.6 },
    );
    for (const slide of root.querySelectorAll('[data-index]')) observer.observe(slide);
    return () => {
      observer.disconnect();
    };
  }, [total]);

  // Open and close the native dialog from the state; the page behind it does not scroll.
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (zoomOpen && !element.open) element.showModal();
    if (!zoomOpen && element.open) element.close();
    document.documentElement.classList.toggle(SCROLL_LOCK, zoomOpen);
    return () => {
      document.documentElement.classList.remove(SCROLL_LOCK);
    };
  }, [zoomOpen]);

  // When the previous/next button disappears at either end, focus moves to the remaining control.
  useEffect(() => {
    const element = dialog.current;
    if (!zoomOpen || element === null) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== element) return;
    const next = element.querySelector(
      '[data-testid="gallery-previous"], [data-testid="gallery-next"]',
    );
    const fallback = element.querySelector('[data-testid="gallery-close"]');
    const target = next ?? fallback;
    if (target instanceof HTMLElement) target.focus();
  }, [zoomOpen, zoomIndex]);

  const scrollBehavior = useCallback((): ScrollBehavior => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }, []);

  function goTo(index: number): void {
    setCurrent(index);
    const slide = track.current?.children.item(index);
    slide?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest', inline: 'start' });
  }

  function openZoom(from: HTMLElement | null): void {
    opener.current = from;
    setZoomIndex(current);
    setZoomed(false);
    setZoomOpen(true);
  }

  function step(by: -1 | 1): void {
    setZoomed(false);
    setZoomIndex((index) => Math.min(total - 1, Math.max(0, index + by)));
  }

  function onZoomKey(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    // The arrow that points the way the reader moves on: right in LTR, left in RTL.
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    step(event.key === forward ? 1 : -1);
    event.preventDefault();
  }

  const shown = images[zoomIndex];
  const label = (index: number): string => t('photoOf', { n: index + 1, total });

  return (
    <div className="min-w-0">
      {/* Phone corners: 15 px = the card's 16 px minus its 1 px border. */}
      <div className="relative isolate overflow-hidden rounded-ss-[15px] rounded-se-[15px] rounded-es-[12px] rounded-ee-[12px] bg-photo lg:rounded-photo">
        <div
          ref={track}
          data-testid="gallery-track"
          // A scrollable region needs a keyboard stop (axe scrollable-region-focusable, WCAG 2.1.1).
          tabIndex={0}
          role="group"
          aria-label={t('label', { product: name })}
          className="peer flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden focus-visible:outline-none overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, index) => (
            // Each slide sets its own square box and the photo fills it absolutely: iPhone Safari does
            // not resolve a child's percentage height against an aspect-ratio parent, so with
            // h-full the photo grew to its own height and the strip scrolled vertically.
            <div
              key={image.id}
              data-index={index}
              className="relative aspect-square w-full shrink-0 snap-center"
              onClick={(event) => {
                openZoom(event.currentTarget);
              }}
            >
              <img
                src={image.src800}
                srcSet={`${image.src400} 400w, ${image.src800} 800w, ${image.src1600} 1600w`}
                sizes={MAIN_SIZES}
                width={image.width}
                height={image.height}
                alt={image.alt === '' ? t('altDefault', { name, n: index + 1, total }) : image.alt}
                lang={image.alt === '' ? undefined : image.altLang}
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : undefined}
                decoding="async"
                className="absolute inset-0 size-full cursor-zoom-in object-cover"
              />
            </div>
          ))}
        </div>
        {/* The keyboard focus ring: a positioned overlay after the strip, because the photos are
            positioned and would paint over an outline on the strip itself. */}
        <span
          data-testid="gallery-focus-ring"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-3 peer-focus-visible:outline-ink peer-focus-visible:outline-solid"
        />
        {total > 1 ? (
          <span
            className={cn(
              OVERLAY,
              'pointer-events-none absolute start-3 bottom-3 rounded-pill px-3 py-1',
            )}
          >
            <bdi className="tnum">{`${String(current + 1)} / ${String(total)}`}</bdi>
          </span>
        ) : null}
        <span className="absolute end-3 bottom-3">
          <IconButton
            label={t('zoom')}
            className={cn(OVERLAY, 'hover:bg-paper')}
            onClick={(event) => {
              openZoom(event.currentTarget);
            }}
            data-testid="gallery-zoom"
          >
            <Icon name="zoom" />
          </IconButton>
        </span>
      </div>

      {/* 6 px of room on every side of the buttons (the row clips): the focus ring is 3 px at a 3 px
          offset. Phones: buttons 8 px from the card's edge and 8 px under the photo; from 900 px in
          line with the photo and 12 px under it. The bottom room overlaps the details' padding. */}
      {total > 1 ? (
        <ul
          aria-label={t('thumbnails')}
          data-testid="gallery-thumbnails"
          className="mx-0.5 mt-0.5 -mb-1.5 flex gap-2 overflow-x-auto p-1.5 lg:-mx-1.5 lg:mt-1.5"
        >
          {images.map((image, index) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                aria-label={label(index)}
                aria-current={current === index ? 'true' : undefined}
                onClick={() => {
                  goTo(index);
                }}
                className={cn(
                  'relative block h-[72px] w-[72px] overflow-hidden rounded-photo bg-photo',
                  current === index && 'ring-2 ring-forest ring-offset-2 ring-offset-paper',
                )}
              >
                <img
                  src={image.src400}
                  srcSet={`${image.src400} 400w`}
                  sizes="72px"
                  width={72}
                  height={90}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialog}
        aria-label={t('label', { product: name })}
        onClose={() => {
          setZoomOpen(false);
          opener.current?.focus();
        }}
        onKeyDown={onZoomKey}
        className="m-0 h-dvh max-h-none w-dvw max-w-none bg-photo p-0 text-ink backdrop:bg-ink/40 open:block"
      >
        {zoomOpen && shown !== undefined ? (
          <>
            <div
              className="size-full touch-pan-x touch-pan-y touch-pinch-zoom overflow-auto"
              onDoubleClick={() => {
                setZoomed((value) => !value);
              }}
            >
              <div className="grid min-h-full min-w-full place-items-center">
                <img
                  src={shown.src1600}
                  srcSet={`${shown.src1600} 1600w`}
                  sizes="100vw"
                  width={shown.width}
                  height={shown.height}
                  alt={shown.alt === '' ? label(zoomIndex) : shown.alt}
                  lang={shown.alt === '' ? undefined : shown.altLang}
                  decoding="async"
                  className={cn(
                    'object-contain',
                    zoomed
                      ? 'w-[200%] max-w-none cursor-zoom-out'
                      : 'max-h-dvh max-w-full cursor-zoom-in',
                  )}
                />
              </div>
            </div>
            <span className="absolute end-3 top-3">
              <IconButton
                label={t('close')}
                className="bg-paper/94 hover:bg-paper"
                onClick={() => {
                  dialog.current?.close();
                }}
                autoFocus
                data-testid="gallery-close"
              >
                <Icon name="close" />
              </IconButton>
            </span>
            {total > 1 ? (
              <>
                {zoomIndex > 0 ? (
                  <span className="absolute start-3 top-1/2 -translate-y-1/2">
                    <IconButton
                      label={t('previous')}
                      className="bg-paper/94 hover:bg-paper"
                      onClick={() => {
                        step(-1);
                      }}
                      data-testid="gallery-previous"
                    >
                      <Icon name="chevron" direction="start" />
                    </IconButton>
                  </span>
                ) : null}
                {zoomIndex < total - 1 ? (
                  <span className="absolute end-3 top-1/2 -translate-y-1/2">
                    <IconButton
                      label={t('next')}
                      className="bg-paper/94 hover:bg-paper"
                      onClick={() => {
                        step(1);
                      }}
                      data-testid="gallery-next"
                    >
                      <Icon name="chevron" direction="end" />
                    </IconButton>
                  </span>
                ) : null}
                <span
                  className={cn(
                    OVERLAY,
                    'pointer-events-none absolute start-3 top-5 rounded-pill px-3 py-1',
                  )}
                >
                  <bdi className="tnum">{`${String(zoomIndex + 1)} / ${String(total)}`}</bdi>
                </span>
              </>
            ) : null}
          </>
        ) : null}
      </dialog>
    </div>
  );
}
