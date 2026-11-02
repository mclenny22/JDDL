// Images and MP4s share CMS assignments, thumbnails and layout metadata.
export function isVideo(media) {
  return media?.mime_type === 'video/mp4';
}

let observer;
let motion;
const videos = new Map();

function syncVideo(video, state) {
  if (!video.isConnected) return;
  const visible = state.visible && !document.hidden && !video.closest('[hidden]');
  if (visible && !video.getAttribute('src')) {
    video.preload = 'auto';
    video.src = state.url;
    video.load();
  }
  const playing = visible && !motion.matches;
  if (playing && !state.playing) video.play()?.catch(() => {});
  else if (!playing && (!visible || state.playing)) video.pause();
  state.playing = playing;
}

function observeVideo(video, url) {
  if (!observer) {
    motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => videos.forEach((state, item) => syncVideo(item, state));
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const state = videos.get(entry.target);
        if (state) { state.visible = entry.isIntersecting; syncVideo(entry.target, state); }
      }
    });
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    new MutationObserver(() => {
      for (const [item] of videos) {
        if (!item.isConnected) { item.pause(); observer.unobserve(item); videos.delete(item); }
      }
      sync();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  videos.set(video, { url, visible: false, playing: false });
  observer.observe(video);
}

export function createMedia(media, label = '', controls = false) {
  const element = document.createElement(isVideo(media) ? 'video' : 'img');
  element.draggable = false;
  if (isVideo(media)) {
    element.muted = true;
    element.defaultMuted = true;
    element.loop = true;
    element.playsInline = true;
    element.preload = 'metadata';
    element.controls = controls;
    element.setAttribute('aria-label', media.alt_text || label);
    observeVideo(element, media.url);
  } else {
    element.src = media.url;
    element.alt = media.alt_text || label;
    element.loading = 'lazy';
    element.decoding = 'async';
  }
  return element;
}
