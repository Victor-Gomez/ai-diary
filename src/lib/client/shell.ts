import { apiGet } from './api';
import type { SearchResult } from '@/types';

/** Global app-shell behaviour: theming, shortcuts and the command palette. */
export function initShell(): void {
  initTheme();
  initPalette();
  initGlobalShortcuts();
  initLock();
  initResizers();
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
    const mod = e.ctrlKey;
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

// --- Resizable Sidebars ---------------------------------------------------

interface ResizableConfig {
  handleId: string;
  targetId: string;
  storageKey: string;
  cssVar: string;
  side: 'left' | 'right';
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

function initResizers(): void {
  // Left Navigation Sidebar
  setupResizable({
    handleId: 'sidebar-resizer',
    targetId: 'app-sidebar',
    storageKey: 'diary-sidebar-width',
    cssVar: '--sidebar-width',
    side: 'left',
    defaultWidth: 248,
    minWidth: 180,
    maxWidth: 460,
  });

  // Right Context Sidebar
  setupResizable({
    handleId: 'context-resizer',
    targetId: 'context-sidebar',
    storageKey: 'diary-context-sidebar-width',
    cssVar: '--context-sidebar-width',
    side: 'right',
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 600,
  });

  // Chat Draft Panel
  setupResizable({
    handleId: 'draft-resizer',
    targetId: 'draft-panel',
    storageKey: 'diary-chat-draft-width',
    cssVar: '--chat-draft-width',
    side: 'right',
    defaultWidth: 380,
    minWidth: 280,
    maxWidth: 650,
  });
}

function setupResizable(config: ResizableConfig): void {
  const handle = document.getElementById(config.handleId);
  const target = document.getElementById(config.targetId);
  if (!handle || !target) return;

  // Double-click to reset to default
  handle.addEventListener('dblclick', () => {
    document.documentElement.style.setProperty(config.cssVar, config.defaultWidth + 'px');
    target.style.width = config.defaultWidth + 'px';
    try {
      localStorage.removeItem(config.storageKey);
    } catch {
      /* ignore */
    }
  });

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const startX = e.clientX;
    const startWidth = target.getBoundingClientRect().width;
    let currentWidth = startWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    handle.classList.add('opacity-100');

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      let newWidth: number;
      if (config.side === 'left') {
        newWidth = startWidth + delta;
      } else {
        newWidth = startWidth - delta;
      }

      newWidth = Math.max(config.minWidth, Math.min(config.maxWidth, newWidth));
      currentWidth = Math.round(newWidth);

      document.documentElement.style.setProperty(config.cssVar, currentWidth + 'px');
      target.style.width = currentWidth + 'px';
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        handle.releasePointerCapture(upEvent.pointerId);
      } catch {
        /* ignore */
      }
      handle.classList.remove('opacity-100');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      try {
        localStorage.setItem(config.storageKey, String(currentWidth));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
}

