const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const animation = window.lottie.loadAnimation({
  container: document.querySelector('.logo-highlight'),
  renderer: 'svg',
  path: '/assets/ad4k-1.json',
  loop: false,
  autoplay: !reducedMotion.matches,
  rendererSettings: { preserveAspectRatio: 'xMinYMin meet' },
});

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) animation.stop();
  else animation.play();
});
