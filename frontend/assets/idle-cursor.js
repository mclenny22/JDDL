(() => {
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!finePointer.matches || !window.lottie) return;

  const root = document.documentElement;
  const cursor = document.createElement('div');
  cursor.className = 'idle-cursor';
  cursor.hidden = true;
  cursor.setAttribute('aria-hidden', 'true');
  document.body.append(cursor);

  const animation = window.lottie.loadAnimation({
    container: cursor,
    renderer: 'svg',
    path: '/assets/ad4k-cursor1.json',
    autoplay: false,
    loop: true,
  });
  let ready = false;
  let idle = false;
  let timer;

  function show() {
    if (!idle || !ready || cursor.hidden || reducedMotion.matches || document.hidden) return;
    root.classList.add('cursor-idle');
    animation.goToAndPlay(0, true);
  }

  function reset() {
    clearTimeout(timer);
    if (idle && ready) animation.stop();
    idle = false;
    root.classList.remove('cursor-idle');
  }

  function release() {
    reset();
    cursor.hidden = true;
    root.classList.remove('cursor-managed');
  }

  function track(event) {
    if (event.pointerType === 'touch' || !finePointer.matches || document.hidden) {
      release();
      return;
    }
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursor.hidden = false;
    root.classList.add('cursor-managed');
    reset();
    if (event.buttons || reducedMotion.matches) return;
    timer = setTimeout(() => {
      idle = true;
      show();
    }, 2000);
  }

  animation.addEventListener('DOMLoaded', () => {
    ready = true;
    show();
  });
  root.addEventListener('pointerenter', track);
  root.addEventListener('pointermove', track, { passive: true });
  root.addEventListener('pointerup', track);
  root.addEventListener('pointerdown', reset);
  root.addEventListener('pointerleave', release);
  root.addEventListener('pointercancel', release);
  document.addEventListener('visibilitychange', release);
  window.addEventListener('blur', release);
  finePointer.addEventListener('change', release);
  reducedMotion.addEventListener('change', reset);
})();
