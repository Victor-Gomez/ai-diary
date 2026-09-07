/** Small text helpers shared across search, cards and analysis. */

/** Strip Markdown syntax to plain text (good enough for excerpts/titles). */
export function stripMarkdown(md: string): string {
  return md
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ') // code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/[*_~>#-]/g, ' ') // emphasis / list / quote markers
    .replace(/\s+/g, ' ')
    .trim();
}

/** First non-empty line of an entry, used as a display title. */
export function deriveTitle(content: string, fallback = 'Untitled entry'): string {
  const firstLine = content
    .split('\n')
    .map((l) => stripMarkdown(l).trim())
    .find((l) => l.length > 0);
  if (!firstLine) return fallback;
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export function excerpt(content: string, max = 180): string {
  const text = stripMarkdown(content);
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** Build a short excerpt centred on the first matching query term. */
export function highlightExcerpt(content: string, query: string, max = 180): string {
  const text = stripMarkdown(content);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    idx = lower.indexOf(t);
    if (idx >= 0) break;
  }
  if (idx < 0) return excerpt(content, max);
  const start = Math.max(0, idx - Math.floor(max / 3));
  const slice = text.slice(start, start + max).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + max < text.length ? '…' : ''}`;
}

export function wordCount(content: string): number {
  const t = stripMarkdown(content);
  return t ? t.split(/\s+/).length : 0;
}
