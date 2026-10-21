// Existing seven-column placements remain supported without rewriting CMS data.
export function imagePlacement(image, index, layout = {}) {
  const presets = [{ column: 5, span: 3, row: 1 }, { column: 3, span: 2, row: 8 },
    { column: 1, span: 2, row: 14 }, { column: 5, span: 1, row: 20 },
    { column: 4, span: 1, row: 32 }, { column: 3, span: 2, row: 44 }];
  const fallback = presets[index % presets.length];
  const saved = layout?.[image.id] || {};
  const integer = (value, min, max, otherwise) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : otherwise;
  const span = integer(saved.span, 1, 7, fallback.span);
  return { span, column: integer(saved.column, 1, 8 - span, Math.min(fallback.column, 8 - span)),
    row: integer(saved.row, 1, 1000, fallback.row + Math.floor(index / presets.length) * 60) };
}

// Figma's full, paired, three/four-up and mixed rows, filled with CMS images.
export function projectRows(images) {
  const patterns = [
    { spans: [4, 4, 4], height: 575 }, { spans: [4, 8], height: 575 },
    { spans: [6, 6], height: 523 }, { spans: [12], height: 793 },
    { spans: [3, 3, 3, 3], height: 455 }, { spans: [8, 4], height: 575 },
  ];
  const result = [];
  let offset = 0;
  let row = 0;
  while (offset < images.length) {
    const pattern = patterns[row++ % patterns.length];
    const count = Math.min(pattern.spans.length, images.length - offset);
    for (let index = 0; index < count; index++) {
      const span = count < pattern.spans.length ? 12 / count : pattern.spans[index];
      const full = span === 12 || span === 8;
      result.push({ image: images[offset++], span, ratio: (span * 118.75 - 15) / pattern.height,
        mobileSpan: full ? 2 : 1, mobileRatio: span === 12 ? 1 : span === 8 ? 16 / 9 : span === 3 ? 3 / 4 : 4 / 5 });
    }
  }
  return result;
}

export function createProjectView(projects, settings, reducedMotion, onClose) {
  const view = document.querySelector('#project-detail');
  const content = document.querySelector('.project-detail-content');
  const info = document.querySelector('.project-detail-info');
  const hero = document.querySelector('.project-hero');
  const grid = document.querySelector('.project-grid');
  let layout = {};
  try { layout = JSON.parse(settings.project_layout || '{}') || {}; } catch { /* Older content has no layout. */ }
  let sourceLink = null;
  let transition = null;
  let pending = null;
  let fallback = null;
  let flyingImage = null;
  let cleanupNames = () => {};

  function stopFallback() {
    fallback?.cancel();
    fallback = null;
    flyingImage?.remove();
    flyingImage = null;
    hero.style.visibility = '';
  }
  function finish() {
    cleanupNames();
    cleanupNames = () => {};
    transition = null;
    document.documentElement.classList.remove('project-transitioning');
    if (pending) { const next = pending; pending = null; next(); }
  }
  function imageFor(source) { return source?.querySelector('img.visible') || source?.querySelector('img'); }
  function transitionView(update, from, getTarget) {
    if (transition) {
      pending = () => transitionView(update, from, getTarget);
      transition.skipTransition();
      return;
    }
    stopFallback();
    const origin = from?.getBoundingClientRect();
    if (!reducedMotion.matches && document.startViewTransition) {
      document.documentElement.classList.add('project-transitioning');
      if (from) from.style.viewTransitionName = 'project-image';
      let target;
      cleanupNames = () => {
        if (from) from.style.viewTransitionName = '';
        if (target) target.style.viewTransitionName = '';
      };
      try {
        transition = document.startViewTransition(() => {
          if (from) from.style.viewTransitionName = '';
          update();
          target = getTarget();
          if (target) target.style.viewTransitionName = 'project-image';
        });
        // A skipped animation (background tab, resize or a rapid second choice)
        // still runs its DOM callback and must not leave names or a paused rail.
        transition.ready.catch(() => {});
        transition.finished.then(finish, finish);
        return;
      } catch { cleanupNames(); transition = null; document.documentElement.classList.remove('project-transitioning'); }
    }
    update();
    const target = getTarget();
    if (!reducedMotion.matches && origin?.width && target && typeof target.animate === 'function') {
      const destination = target.getBoundingClientRect();
      if (!destination.width || !destination.height) return;
      const clone = new Image();
      clone.src = from.currentSrc || from.src;
      clone.alt = '';
      clone.className = 'project-flying-image';
      document.body.append(clone);
      flyingImage = clone;
      if (target === hero) hero.style.visibility = 'hidden';
      fallback = clone.animate([
        { left: `${origin.left}px`, top: `${origin.top}px`, width: `${origin.width}px`, height: `${origin.height}px` },
        { left: `${destination.left}px`, top: `${destination.top}px`, width: `${destination.width}px`, height: `${destination.height}px` },
      ], { duration: 850, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      fallback.onfinish = stopFallback;
    }
  }
  function pair(value, label) {
    const block = document.createElement('span');
    block.className = 'meta-pair';
    const text = document.createElement('span');
    text.className = 'meta-value';
    text.textContent = value;
    const name = document.createElement('span');
    name.className = 'meta-label';
    name.textContent = label;
    block.append(text, name);
    return block;
  }
  function render(project, image) {
    info.replaceChildren();
    const identity = document.createElement('div');
    identity.className = 'project-meta';
    identity.append(pair(project.title, 'Project'));
    if (project.client) identity.append(pair(project.client, 'Client'));
    const services = [...new Set(project.images.flatMap(item => item.tags || []))].join(', ');
    const categories = document.createElement('div');
    categories.className = 'project-meta project-categories';
    if (services) categories.append(pair(services, 'Categories'));
    const formats = new Set(project.images.map(item => Number(item.aspect_ratio) > 1.1 ? 'Landscape' : Number(item.aspect_ratio) < .9 ? 'Portrait' : 'Square'));
    categories.append(pair(formats.size > 1 ? 'Various' : [...formats][0], 'Format'));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'project-info-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'project-description');
    const label = document.createElement('span');
    label.textContent = 'Project Info';
    const indicator = document.createElement('span');
    indicator.textContent = '+';
    indicator.setAttribute('aria-hidden', 'true');
    toggle.append(label, indicator);
    const description = document.createElement('p');
    description.id = 'project-description';
    description.className = 'project-description';
    description.textContent = project.description || '';
    description.hidden = true;
    toggle.hidden = !project.description;
    toggle.addEventListener('click', () => {
      description.hidden = !description.hidden;
      toggle.setAttribute('aria-expanded', String(!description.hidden));
      indicator.textContent = description.hidden ? '+' : '−';
    });
    info.append(identity, categories, toggle, description);
    hero.src = image.url;
    hero.alt = image.alt_text || project.title;
    grid.replaceChildren();
    const remaining = project.images.filter(item => item.id !== image.id);
    const custom = remaining.some(item => layout[item.id] && Object.keys(layout[item.id]).length);
    grid.classList.toggle('custom-layout', custom);
    projectRows(remaining).forEach(({ image: item, span, ratio, mobileSpan, mobileRatio }, index) => {
      const figure = document.createElement('figure');
      if (custom) {
        const placement = imagePlacement(item, index, layout);
        figure.style.gridColumn = `${placement.column} / span ${placement.span}`;
        figure.style.gridRow = `${placement.row} / span 1`;
      }
      figure.style.setProperty('--columns', String(span));
      figure.style.setProperty('--ratio', String(ratio));
      figure.style.setProperty('--mobile-columns', String(mobileSpan));
      figure.style.setProperty('--mobile-ratio', String(mobileRatio));
      const img = new Image();
      img.src = item.url;
      img.alt = item.alt_text || project.title;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 1000;
      img.height = Math.round(1000 / (Number(item.aspect_ratio) || 1));
      figure.append(img);
      grid.append(figure);
    });
    view.hidden = false;
    view.scrollTop = 0;
    document.documentElement.classList.add('project-open');
    view.focus({ preventScroll: true });
    content.setAttribute('aria-label', project.title);
  }
  function open(project, selectedImage, source = null, onSwitch = () => {}) {
    const image = selectedImage || project.images[0];
    const origin = imageFor(source);
    transitionView(() => {
      sourceLink = source;
      render(project, image);
      onSwitch();
    }, origin, () => hero);
  }
  function close(onSwitch = () => {}) {
    if (transition) {
      pending = () => close(onSwitch);
      transition.skipTransition();
      return sourceLink;
    }
    const source = sourceLink;
    // A return to a different image or an offscreen source uses a quiet fade.
    const target = imageFor(source);
    const rect = hero.getBoundingClientRect();
    const visibleHero = rect.bottom > 0 && rect.top < window.innerHeight;
    transitionView(() => {
      view.hidden = true;
      document.documentElement.classList.remove('project-open');
      onSwitch(source);
    }, target && visibleHero ? hero : null, () => target && hero.src === target.src ? target : null);
    return source;
  }
  function cancelMotion() { stopFallback(); transition?.skipTransition(); }
  document.querySelector('.project-close').addEventListener('click', () => onClose());
  view.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  });
  view.addEventListener('scroll', stopFallback, { passive: true });
  window.addEventListener('resize', cancelMotion);
  reducedMotion.addEventListener('change', cancelMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelMotion(); });
  return { open, close, isTransitioning: () => Boolean(transition) };
}
