/**
 * Modal state of the side drawers (research D21): while a drawer is open every top-level child of
 * `<body>` except that drawer is `inert`, so focus and the accessibility tree cannot leave it. The
 * state is plain data over a minimal element interface, so it is unit tested without a DOM.
 */

export interface InertTarget {
  inert: boolean;
  tagName: string;
}

/** Children that never take part (no content to reach). */
const SKIPPED = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT']);

export class ModalTracker<T extends InertTarget> {
  /** Drawers that are open or about to be, by id. */
  private readonly open = new Set<string>();
  /** The elements this tracker made inert (it removes only those). */
  private readonly marked = new Set<T>();

  constructor(private readonly bodyChildren: () => Iterable<T>) {}

  /** `beforetoggle` with `newState === 'open'`. */
  opened(id: string, drawer: T): void {
    this.open.add(id);
    for (const child of this.bodyChildren()) {
      if (SKIPPED.has(child.tagName.toUpperCase())) continue;
      if (child === drawer) {
        // An earlier drawer made this one inert while it was closed.
        if (this.marked.delete(child)) child.inert = false;
      } else if (!child.inert) {
        child.inert = true;
        this.marked.add(child);
      }
    }
  }

  /**
   * `beforetoggle` with `newState === 'closed'`. When one auto popover replaces another, the new
   * drawer's open event comes before the old one's close event, so the page is released only when
   * no drawer remains open.
   */
  closed(id: string): void {
    this.open.delete(id);
    if (this.open.size === 0) this.release();
  }

  /** After any `toggle`: the drawers that really are open now; none means nothing may stay inert. */
  reconcile(openIds: readonly string[]): void {
    for (const id of [...this.open]) if (!openIds.includes(id)) this.open.delete(id);
    if (this.open.size === 0) this.release();
  }

  private release(): void {
    for (const element of this.marked) element.inert = false;
    this.marked.clear();
  }

  /** Ids currently tracked as open (for tests). */
  get openIds(): string[] {
    return [...this.open];
  }
}
