const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const logo = document.querySelector('.studio-logo');
const container = logo.querySelector('.logo-highlight');
const animation = window.lottie.loadAnimation({
  container,
  renderer: 'svg',
  path: '/assets/ad4k-1.json',
  loop: false,
  autoplay: !reducedMotion.matches,
  rendererSettings: { preserveAspectRatio: 'xMinYMin meet' },
});

logo.addEventListener('pointerenter', event => {
  if (event.pointerType !== 'touch' && !reducedMotion.matches && container.getClientRects().length) {
    animation.goToAndPlay(0, true);
  }
});

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) animation.stop();
  else animation.play();
});
