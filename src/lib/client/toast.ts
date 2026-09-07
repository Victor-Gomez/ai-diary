/** Lightweight toast notifications rendered into #toast-host. */
export type ToastKind = 'info' | 'success' | 'error';

export function showToast(message: string, kind: ToastKind = 'info', ms = 3200): void {
  const host = document.getElementById('toast-host');
  if (!host) return;

  const el = document.createElement('div');
  el.className = 'toast animate-in pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow';
  el.style.background = 'var(--surface)';
  el.style.border = '1px solid var(--border-strong)';
  el.style.color = 'var(--text)';
  el.style.boxShadow = 'var(--shadow)';

  const dot = document.createElement('span');
  dot.style.width = '8px';
  dot.style.height = '8px';
  dot.style.borderRadius = '999px';
  dot.style.background =
    kind === 'success' ? 'var(--accent)' : kind === 'error' ? 'var(--danger)' : 'var(--text-faint)';
  el.appendChild(dot);

  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);

  host.appendChild(el);
  const remove = () => {
    el.style.transition = 'opacity .2s ease, transform .2s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  };
  setTimeout(remove, ms);
}
