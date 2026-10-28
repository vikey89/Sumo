export function $<T extends HTMLElement = HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

/** The app id of the row, chip or line that was clicked, if any. */
export function clickedId(event: Event): string | undefined {
  return (event.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
}

export const ICONS = {
  soundOn: '<path d="M4 9h3l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  soundOff: '<path d="M4 9h3l5-4v14l-5-4H4z"/><path d="m16 9 5 6m0-6-5 6"/>',
  bout: '<circle cx="12" cy="12" r="8"/><path d="M9.5 12h5M12 4v2m0 12v2"/>',
  fans: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C11 6.5 11.7 3 14.3 3c2.4 0 2.9 3.2.9 5-1 .9-2 1.6-3.2 2.2M13.6 12.9c3.7 1 6.4 3.4 5.1 5.6-1.2 2.1-4.2.9-4.8-1.7-.3-1.3-.3-2.6-.3-3.9M10.4 12.9c-2.7 2.7-6.2 3.8-7.5 1.6-1.2-2.1 1.3-4.1 3.9-3.3 1.3.4 2.4 1 3.6 1.7"/>',
  recap: '<path d="M8 21h8m-4-4v4M6 4h12v4a6 6 0 0 1-12 0zM6 6H3v1a3 3 0 0 0 3 3m12-4h3v1a3 3 0 0 1-3 3"/>',
  guide: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 17h.01"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5.5 8.5h1.5M5.5 12h1.5"/>',
  zen: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  chevron: '<path d="m15 6-6 6 6 6"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5"/>',
  collapse: '<path d="M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5"/>',
};

export function icon(paths: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}
