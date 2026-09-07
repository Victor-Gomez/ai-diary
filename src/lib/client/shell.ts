import { apiGet } from './api';
import type { SearchResult } from '@/types';

/** Global app-shell behaviour: theming, shortcuts and the command palette. */
export function initShell(): void {
  initTheme();
  initPalette();
  initGlobalShortcuts();
  initLock();
}

function initLock(): void {
  const lockBtn = document.getElementById('lock-vault-btn');
  lockBtn?.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/lock', { method: 'POST' });
    } catch {
      /* ignore */
    }
    window.location.href = '/unlock';
  });
}

// --- Theme -----------------------------------------------------------------

function effectiveTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme(): void {
  const toggle = document.getElementById('theme-toggle');
  toggle?.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('diary-theme', next);
    } catch {
      /* ignore */
    }
  });
}

// --- Command palette (quick search) ----------------------------------------

let paletteResults: SearchResult[] = [];
let selectedIndex = 0;

function initPalette(): void {
  const palette = document.getElementById('palette');
  const input = document.getElementById('palette-input') as HTMLInputElement | null;
  const list = document.getElementById('palette-results');
  if (!palette || !input || !list) return;

  let debounce: number | undefined;

  const render = () => {
    if (paletteResults.length === 0) {
      list.innerHTML = `<li class="px-3 py-6 text-center" style="color: var(--text-faint)">${
        input.value.trim() ? 'No matching entries' : 'Type to search your entries'
      }</li>`;
      return;
    }
    list.innerHTML = paletteResults
      .map((r, i) => {
        const date = new Date(r.entry.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        return `<li>
          <a href="/diary/${r.entry.id}" data-idx="${i}"
             class="palette-item block rounded-lg px-3 py-2.5 ${i === selectedIndex ? 'is-active' : ''}">
            <div class="text-[11px] font-medium" style="color: var(--text-faint)">${date}</div>
            <div class="truncate">${escapeHtml(r.excerpt)}</div>
          </a></li>`;
      })
      .join('');
  };

  const runSearch = async (q: string) => {
    try {
      paletteResults = await apiGet<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
    } catch {
      paletteResults = [];
    }
    selectedIndex = 0;
    render();
  };

  input.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void runSearch(input.value.trim()), 160);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, paletteResults.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      const target = paletteResults[selectedIndex];
      if (target) window.location.href = `/diary/${target.entry.id}`;
    }
  });

  palette.addEventListener('click', (e) => {
    if (e.target === palette) closePalette();
  });

  render();
}

function openPalette(): void {
  const palette = document.getElementById('palette');
  const input = document.getElementById('palette-input') as HTMLInputElement | null;
  if (!palette) return;
  palette.classList.remove('hidden');
  palette.classList.add('flex');
  input?.focus();
  input?.select();
}

function closePalette(): void {
  const palette = document.getElementById('palette');
  if (!palette) return;
  palette.classList.add('hidden');
  palette.classList.remove('flex');
}

// --- Global shortcuts ------------------------------------------------------

function initGlobalShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (mod && e.key.toLowerCase() === 'n') {
      // Don't hijack when typing in the editor unless it's a global new-entry.
      e.preventDefault();
      window.location.href = '/diary/new';
    } else if (e.key === 'Escape') {
      const palette = document.getElementById('palette');
      if (palette && !palette.classList.contains('hidden')) {
        closePalette();
      } else {
        document.dispatchEvent(new CustomEvent('diary:escape'));
      }
    }
  });
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
