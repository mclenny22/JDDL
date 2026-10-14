// Project detail content stays backed by the same published CMS images.
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

export function createProjectView(projects, settings, reducedMotion, onClose) {
  const view = document.querySelector('#project-detail');
  const content = document.querySelector('.project-detail-content');
  const info = document.querySelector('.project-detail-info');
  const hero = document.querySelector('.project-hero');
  const grid = document.querySelector('.project-grid');
  let layout = {};
  try { layout = JSON.parse(settings.project_layout || '{}'); } catch { /* Older content has no layout. */ }
  let animation = null;
  let flyingImage = null;
  let sourceLink = null;
  function finishAnimation() {
    animation?.cancel();
    animation = null;
    flyingImage?.remove();
    flyingImage = null;
    hero.style.visibility = '';
  }
  function open(project, selectedImage, source = null) {
    finishAnimation();
    sourceLink = source;
    const sourceImage = source?.querySelector('img.visible') || source?.querySelector('img');
    const origin = sourceImage?.getBoundingClientRect();
    const image = selectedImage || project.images[0];
    info.replaceChildren();
    const services = [...new Set(project.images.flatMap(item => item.tags || []))].join(', ');
    for (const [label, value] of [['Client', project.client || project.title], ['Services', services], ['Info', project.description]]) {
      const block = document.createElement('div');
      const heading = document.createElement('p');
      heading.textContent = label;
      const copy = document.createElement('p');
      copy.textContent = value || '—';
      block.append(heading, copy);
      info.append(block);
    }
    hero.src = image.url;
    hero.alt = image.alt_text || project.title;
    grid.replaceChildren();
    project.images.filter(item => item.id !== image.id).forEach((item, index) => {
      const placement = imagePlacement(item, index, layout);
      const figure = document.createElement('figure');
      figure.style.gridColumn = `${placement.column} / span ${placement.span}`;
      figure.style.gridRow = `${placement.row} / span 1`;
      const img = new Image();
      img.src = item.url;
      img.alt = item.alt_text || project.title;
      img.loading = 'lazy';
      img.width = 1000;
      img.height = Math.round(1000 / (Number(item.aspect_ratio) || 1));
      figure.append(img);
      grid.append(figure);
    });
    view.hidden = false;
    view.scrollTop = 0;
    document.documentElement.classList.add('project-open');
    view.focus({ preventScroll: true });
    if (origin && sourceImage && !reducedMotion.matches) {
      // Animate the actual clicked crop into the hero, keeping the image visible
      // while the dark background and metadata appear underneath it.
      const target = hero.getBoundingClientRect();
      const clone = new Image();
      clone.src = image.url;
      clone.alt = '';
      clone.className = 'project-flying-image';
      document.body.append(clone);
      flyingImage = clone;
      hero.style.visibility = 'hidden';
      animation = clone.animate([
        { left: `${origin.left}px`, top: `${origin.top}px`, width: `${origin.width}px`, height: `${origin.height}px` },
        { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px` },
      ], { duration: 850, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      animation.onfinish = finishAnimation;
    }
    content.setAttribute('aria-label', project.title);
  }
  function close() {
    finishAnimation();
    view.hidden = true;
    document.documentElement.classList.remove('project-open');
    return sourceLink;
  }
  document.querySelector('.project-close').addEventListener('click', onClose);
  view.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  });
  view.addEventListener('scroll', finishAnimation, { passive: true });
  window.addEventListener('resize', finishAnimation);
  reducedMotion.addEventListener('change', finishAnimation);
  return { open, close };
}
