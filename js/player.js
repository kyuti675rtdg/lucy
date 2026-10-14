/* Project Lucy — playback policy for the vertical feed.
 * Original design. No external dependencies. */

export function applyPlaybackPolicy(videoEls, activeIndex) {
  if (!videoEls || !videoEls.length) return;
  videoEls.forEach((v, i) => {
    if (!v) return;
    try {
      if (i === activeIndex) {
        v.preload = 'auto';
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else if (i === activeIndex + 1 || i === activeIndex + 2) {
        v.preload = 'auto';
        try { v.load(); } catch (e) { /* ignore */ }
      } else if (i === activeIndex - 1) {
        v.pause();
      } else {
        v.pause();
        v.preload = 'none';
      }
    } catch (e) { /* ignore */ }
  });
}

export function pauseAll(videoEls) {
  if (!videoEls || !videoEls.length) return;
  videoEls.forEach((v) => {
    if (!v) return;
    try { v.pause(); } catch (e) { /* ignore */ }
  });
}

export function bindVisibility(onHide) {
  const handler = () => {
    if (document.hidden) {
      try { onHide(); } catch (e) { /* ignore */ }
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
