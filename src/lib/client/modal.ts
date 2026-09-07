/**
 * Styled confirm/prompt dialogs that match the app shell, replacing the
 * native `confirm()` / `prompt()` (which clash with the custom UI).
 * Each returns a Promise that resolves when the user acts.
 */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as a destructive action. */
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

function buildOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[16vh] backdrop-blur-sm';
  return overlay;
}

/** Ask the user to confirm an action. Resolves `true` on confirm, `false` otherwise. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
  } = options;

  return new Promise((resolve) => {
    const overlay = buildOverlay();
    const previouslyFocused = document.activeElement as HTMLElement | null;

    overlay.innerHTML = `
      <div class="card w-full max-w-sm overflow-hidden animate-in" role="dialog" aria-modal="true"
           aria-label="${escapeAttr(title)}" style="box-shadow: var(--shadow)">
        <div class="px-5 pt-5 pb-4">
          <h2 class="text-sm font-semibold tracking-tight">${escapeHtml(title)}</h2>
          ${message ? `<p class="mt-1.5 text-sm" style="color: var(--text-muted)">${escapeHtml(message)}</p>` : ''}
        </div>
        <div class="flex justify-end gap-2 border-t px-5 py-3" style="border-color: var(--border); background: var(--surface-2)">
          <button type="button" data-act="cancel" class="btn btn-ghost border px-3 py-1.5 text-xs" style="border-color: var(--border)">${escapeHtml(cancelLabel)}</button>
          <button type="button" data-act="confirm" class="btn ${danger ? 'btn-danger' : 'btn-primary'} border px-3 py-1.5 text-xs">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

    const close = (result: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-act="cancel"]')?.addEventListener('click', () => close(false));
    overlay.querySelector('[data-act="confirm"]')?.addEventListener('click', () => close(true));

    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector<HTMLButtonElement>('[data-act="confirm"]')?.focus();
  });
}

/** Ask the user for a text value. Resolves the string, or `null` if cancelled. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  const {
    title,
    message,
    placeholder = '',
    initialValue = '',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
  } = options;

  return new Promise((resolve) => {
    const overlay = buildOverlay();
    const previouslyFocused = document.activeElement as HTMLElement | null;

    overlay.innerHTML = `
      <div class="card w-full max-w-sm overflow-hidden animate-in" role="dialog" aria-modal="true"
           aria-label="${escapeAttr(title)}" style="box-shadow: var(--shadow)">
        <div class="px-5 pt-5 pb-4">
          <h2 class="text-sm font-semibold tracking-tight">${escapeHtml(title)}</h2>
          ${message ? `<p class="mt-1.5 text-sm" style="color: var(--text-muted)">${escapeHtml(message)}</p>` : ''}
          <input type="text" data-field="value" class="input mt-3 w-full px-3 py-2 text-sm"
                 placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(initialValue)}" />
        </div>
        <div class="flex justify-end gap-2 border-t px-5 py-3" style="border-color: var(--border); background: var(--surface-2)">
          <button type="button" data-act="cancel" class="btn btn-ghost border px-3 py-1.5 text-xs" style="border-color: var(--border)">${escapeHtml(cancelLabel)}</button>
          <button type="button" data-act="confirm" class="btn btn-primary border px-3 py-1.5 text-xs">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

    const input = overlay.querySelector<HTMLInputElement>('[data-field="value"]')!;

    const close = (result: string | null) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        close(input.value);
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.querySelector('[data-act="cancel"]')?.addEventListener('click', () => close(null));
    overlay.querySelector('[data-act="confirm"]')?.addEventListener('click', () => close(input.value));

    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
