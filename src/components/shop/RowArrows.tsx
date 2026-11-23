'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/ClientIcon';
import { IconButton } from '@/components/ui/IconButton';

/** Under this many pixels from an end counts as being at the end (fractional scroll positions). */
const TOLERANCE = 2;

interface Measure {
  canPrevious: boolean;
  canNext: boolean;
}

/**
 * Previous / next buttons for the home row (storefront.md §7.32, research D18). The row itself
 * works without them; they are not rendered until the track has been measured, and not at all
 * when nothing overflows. Shown from 900 px. A press scrolls one page of cards (the visible width
 * minus the track's start padding) toward the reading end (next) or start (previous); RTL tracks
 * have a negative `scrollLeft`. No timers.
 */
export function RowArrows({
  trackId,
  labels,
}: {
  trackId: string;
  labels: { previous: string; next: string };
}) {
  const [measure, setMeasure] = useState<Measure | null>(null);

  useEffect(() => {
    const track = document.getElementById(trackId);
    if (track === null) return;
    const update = (): void => {
      const reach = track.scrollWidth - track.clientWidth;
      // `scrollLeft` is 0 at the reading start and moves to -reach in RTL, to +reach in LTR.
      const offset = Math.abs(track.scrollLeft);
      setMeasure(
        reach > TOLERANCE
          ? { canPrevious: offset > TOLERANCE, canNext: offset < reach - TOLERANCE }
          : null,
      );
    };
    update();
    track.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [trackId]);

  function go(toward: 1 | -1): void {
    const track = document.getElementById(trackId);
    if (track === null) return;
    const style = getComputedStyle(track);
    const sign = style.direction === 'rtl' ? -1 : 1;
    // One page of cards: the visible width minus the room the track keeps at its start.
    const page = track.clientWidth - (Number.parseFloat(style.paddingInlineStart) || 0);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({
      left: toward * sign * page,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  if (measure === null) return null;
  return (
    <div className="hidden items-center lg:flex">
      <IconButton
        label={labels.previous}
        aria-controls={trackId}
        disabled={!measure.canPrevious}
        onClick={() => {
          go(-1);
        }}
        data-testid="home-row-previous"
      >
        <Icon name="chevron" direction="start" />
      </IconButton>
      <IconButton
        label={labels.next}
        aria-controls={trackId}
        disabled={!measure.canNext}
        onClick={() => {
          go(1);
        }}
        data-testid="home-row-next"
      >
        <Icon name="chevron" direction="end" />
      </IconButton>
    </div>
  );
}
