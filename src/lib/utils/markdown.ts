/**
 * Minimal, safe Markdown -> HTML renderer.
 *
 * Deliberately dependency-free (no marked/markdown-it) to keep the app fully
 * offline and reduce supply-chain surface. Input is HTML-escaped first, so the
 * output is safe to inject. Supports the subset useful for journaling:
 * headings, bold/italic, inline code, fenced code, lists, blockquotes, links,
 * horizontal rules and paragraphs. Works in both server and browser contexts.
 */
export function renderMarkdown(src: string): string {
  const escaped = escapeHtml(src);
  const lines = escaped.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length === 0) return;
    out.push(`<p>${inline(buf.join('<br>'))}</p>`);
    buf.length = 0;
  };

  const paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block (``` or ~~~)
    if (/^(?:```|~~~)/.test(line.trim())) {
      flushParagraph(paragraph);
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^(?:```|~~~)/.test(lines[i]!.trim())) {
        code.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // closing fence if present
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }

    // Indented code block (4 spaces or 1 tab)
    if (/^(?: {4}|\t)/.test(line) && paragraph.length === 0) {
      flushParagraph(paragraph);
      const code: string[] = [];
      while (i < lines.length && (/^(?: {4}|\t)/.test(lines[i]!) || lines[i]!.trim() === '')) {
        code.push(lines[i]!.replace(/^(?: {4}|\t)/, ''));
        i++;
      }
      while (code.length > 0 && code[code.length - 1] === '') {
        code.pop();
      }
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }

    // Consecutive full-line backtick blocks (`line1` \n `line2`)
    if (/^`[^`]+`$/.test(line.trim())) {
      let j = i;
      while (j < lines.length && /^`[^`]+`$/.test(lines[j]!.trim())) {
        j++;
      }
      if (j - i > 1) {
        flushParagraph(paragraph);
        const code: string[] = [];
        while (i < j) {
          code.push(lines[i]!.trim().slice(1, -1));
          i++;
        }
        out.push(`<pre><code>${code.join('\n')}</code></pre>`);
        continue;
      }
    }

    // Horizontal rule
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph(paragraph);
      out.push('<hr>');
      i++;
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote (consecutive)
    if (/^\s*(?:>|&gt;)\s?/.test(line)) {
      flushParagraph(paragraph);
      const quote: string[] = [];
      while (i < lines.length && /^\s*(?:>|&gt;)\s?/.test(lines[i]!)) {
        quote.push(lines[i]!.replace(/^\s*(?:>|&gt;)\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inline(quote.join('<br>'))}</blockquote>`);
      continue;
    }

    // Lists (unordered / ordered)
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph(paragraph);
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      while (i < lines.length && re.test(lines[i]!)) {
        items.push(`<li>${inline(lines[i]!.match(re)![1]!)}</li>`);
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    // Blank line -> paragraph break
    if (line.trim() === '') {
      flushParagraph(paragraph);
      i++;
      continue;
    }

    paragraph.push(line);
    i++;
  }
  flushParagraph(paragraph);
  return out.join('\n');
}

function inline(text: string): string {
  return text
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^A-Za-z0-9])_([^_]+)_(?=[^A-Za-z0-9]|$)/g, '$1<em>$2</em>');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
