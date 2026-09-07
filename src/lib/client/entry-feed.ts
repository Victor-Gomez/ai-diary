import { showToast } from './toast';

/**
 * Seamless infinite scroll for the diary feed. Pages of rendered cards are
 * fetched from the `/diary/cards` partial as a sentinel nears the viewport and
 * appended in place. Virtualization itself is handled by CSS `content-visibility`
 * on the cards (see /diary/index.astro), so the DOM grows but off-screen cards
 * cost almost nothing to keep around.
 */
export function initEntryFeed(): void {
  const feed = document.getElementById('entry-feed');
  const sentinel = document.getElementById('entry-sentinel');
  if (!feed || !sentinel) return;

  const pageSize = Math.max(1, Number(feed.dataset.pageSize ?? 25));
  const total = Number(feed.dataset.total ?? 0);
  let loading = false;
  let done = false;

  const loaded = () => feed.querySelectorAll(':scope > a.card').length;

  const finish = () => {
    done = true;
    observer.disconnect();
    sentinel.remove();
  };

  const loadMore = async (): Promise<void> => {
    if (loading || done) return;
    loading = true;
    const offset = loaded();
    try {
      const res = await fetch(`/diary/cards?offset=${offset}&limit=${pageSize}`);
      // Middleware redirects to /unlock (302) when the vault has locked.
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = (await res.text()).trim();
      if (!html) {
        finish();
        return;
      }
      feed.insertAdjacentHTML('beforeend', html);
      if (loaded() >= total) finish();
    } catch {
      // Transient failure: keep the sentinel and re-arm so a later scroll retries.
      showToast('Could not load more entries — scroll to retry', 'error');
      window.setTimeout(() => {
        if (done) return;
        observer.unobserve(sentinel);
        observer.observe(sentinel);
      }, 2000);
    } finally {
      loading = false;
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) void loadMore();
      }
    },
    { rootMargin: '600px 0px' },
  );

  if (loaded() >= total) {
    finish();
    return;
  }
  observer.observe(sentinel);
}
