import { loadPortfolio } from './projects.js';

async function start() {
  const { projects, settings } = await loadPortfolio();
  const about = document.querySelector('.about');
  const copy = String(settings.about || '');
  const [name, ...rest] = copy.split(/\s+/);
  const studioName = document.createElement('strong');
  studioName.textContent = name;
  about.replaceChildren(studioName, document.createTextNode(rest.length ? ` ${rest.join(' ')}` : ''));
  document.title = `${name || 'JDDL'} — Independent design studio`;
  const nav = document.querySelector('.menu');
  nav.replaceChildren();
  const menu = projects.map((project, index) => {
    const button = document.createElement('button');
    button.textContent = index === 0 ? 'Highlights' : String(index + 1);
    button.dataset.project = String(index);
    button.setAttribute('aria-label', `Show ${project.title}`);
    nav.append(button);
    return button;
  });
  const status = document.querySelector('#status');
  if (!projects.length) {
    status.textContent = 'No published projects yet.';
    document.querySelector('.project-context').hidden = true;
    return;
  }
  status.hidden = true;

  const rail = document.querySelector('.rail');
  const track = document.querySelector('.track');
  const title = document.querySelector('#project-title');
  const description = document.querySelector('#project-copy');
  function renderDescription() {
    title.textContent = projects[active].title;
    description.textContent = projects[active].description;
  }
  const stories = document.querySelector('.stories');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 4500;
  const copies = 7;
  const middle = Math.floor(copies / 2);
  const state = projects.map(() => ({ slide: 0, elapsed: 0 }));
  const tiles = [];
  let active = 0;
  let step = 0;
  let cycle = 0;
  let previous = performance.now();
  let wheelTarget = null;
  let wheelOrigin = 0;
  let lastWheel = 0;
  let settling = false;

  function stopWheel() {
    wheelTarget = null;
    settling = false;
    rail.classList.remove('gliding');
  }

  for (let copy = 0; copy < copies; copy++) {
    projects.forEach((project, index) => {
      const tile = document.createElement('article');
      tile.className = 'tile';
      tile.dataset.project = index;
      tile.setAttribute('aria-label', project.title);
      tile.setAttribute('aria-hidden', 'true');
      project.images.forEach((image, slide) => {
        const img = new Image();
        img.src = image.url;
        img.alt = image.alt_text || `${project.title} — image ${slide + 1} of ${project.images.length}`;
        img.draggable = false;
        img.classList.toggle('visible', slide === 0);
        tile.append(img);
      });
      track.append(tile);
      tiles.push(tile);
    });
  }

  let bars = [];
  function buildProgress() {
    stories.replaceChildren();
    bars = Array.from({ length: projects[active].images.length }, (_, index) => {
      const button = document.createElement('button');
      button.className = 'story';
      button.setAttribute('aria-label', `Show image ${index + 1}`);
      button.innerHTML = '<span class="story-fill"></span>';
      button.addEventListener('click', () => {
        state[active].slide = index;
        state[active].elapsed = 0;
        renderSlides();
        renderProgress();
      });
      stories.append(button);
      return button;
    });
  }
  buildProgress();

  function measure() {
    stopWheel();
    const savedProject = step ? Math.round(rail.scrollLeft / step) % projects.length : active;
    step = tiles[1].offsetLeft - tiles[0].offsetLeft;
    cycle = step * projects.length;
    rail.scrollLeft = middle * cycle + savedProject * step;
    onScroll();
  }

  function onScroll() {
    // Rebase by exact whole cycles, keeping identical pixels under the viewport.
    const shift = rail.scrollLeft < cycle * 2 ? cycle * 2 : rail.scrollLeft >= cycle * 5 ? -cycle * 2 : 0;
    if (shift) {
      rail.scrollLeft += shift;
      if (wheelTarget !== null) { wheelTarget += shift; wheelOrigin += shift; }
    }
    const nearest = Math.round(rail.scrollLeft / step);
    const next = nearest % projects.length;
    if (active !== next) {
      active = next;
      renderDescription();
      buildProgress();
      renderProgress();
    }
    tiles.forEach((tile, index) => tile.setAttribute('aria-hidden', String(index !== nearest)));
    menu.forEach(button => {
      const selected = Number(button.dataset.project) === active;
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  function navigate(index) {
    stopWheel();
    const base = Math.floor(rail.scrollLeft / cycle) * cycle;
    const options = [base - cycle, base, base + cycle].map(offset => offset + index * step);
    const target = options.reduce((best, value) => Math.abs(value - rail.scrollLeft) < Math.abs(best - rail.scrollLeft) ? value : best);
    rail.scrollTo({ left: target, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }
  menu.forEach(button => button.addEventListener('click', () => navigate(Number(button.dataset.project))));
  rail.addEventListener('scroll', onScroll, { passive: true });
  rail.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    stopWheel();
    if (event.key === 'Home' || event.key === 'End') return navigate(event.key === 'Home' ? 0 : projects.length - 1);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    rail.scrollTo({ left: (Math.round(rail.scrollLeft / step) + direction) * step, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
  // Keep horizontal gestures native inside the rail. Route ordinary mouse-wheel
  // input (and gestures over the fixed header) into that same scroll container.
  document.addEventListener('wheel', event => {
    if (event.ctrlKey) return; // Preserve browser pinch-to-zoom.
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (rail.contains(event.target) && (horizontal || event.shiftKey)) { stopWheel(); return; }
    const delta = horizontal ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1;
    if (wheelTarget === null) wheelOrigin = rail.scrollLeft;
    wheelTarget = (wheelTarget ?? rail.scrollLeft) + delta * unit;
    lastWheel = performance.now();
    settling = false;
    rail.classList.add('gliding');
  }, { passive: false });
  rail.addEventListener('pointerdown', stopWheel, { passive: true });

  function glide(now, elapsed) {
    if (wheelTarget === null) return;
    if (!settling && now - lastWheel > 140) {
      let destination = Math.round(wheelTarget / step);
      const origin = Math.round(wheelOrigin / step);
      // An intentional short wheel gesture still moves to the next project.
      if (destination === origin && Math.abs(wheelTarget - wheelOrigin) > 24) {
        destination += Math.sign(wheelTarget - wheelOrigin);
      }
      wheelTarget = destination * step;
      settling = true;
    }
    const distance = wheelTarget - rail.scrollLeft;
    const ease = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / (settling ? 95 : 65));
    rail.scrollLeft += distance * ease;
    onScroll();
    if (settling && Math.abs(wheelTarget - rail.scrollLeft) < .75) {
      rail.scrollLeft = wheelTarget;
      stopWheel();
      onScroll();
    }
  }
  function renderSlides() {
    tiles.forEach(tile => {
      const current = state[Number(tile.dataset.project)].slide;
      [...tile.children].forEach((img, index) => img.classList.toggle('visible', index === current));
    });
  }
  function renderProgress() {
    const current = state[active];
    bars.forEach((bar, index) => {
      const fill = index < current.slide ? 1 : index === current.slide ? current.elapsed / duration : 0;
      bar.firstElementChild.style.transform = `scaleX(${fill})`;
      bar.setAttribute('aria-pressed', String(index === current.slide));
    });
  }
  document.addEventListener('visibilitychange', () => { previous = performance.now(); });
  function animate(now) {
    const delta = Math.min(now - previous, 100);
    previous = now;
    glide(now, delta);
    let changed = false;
    // Inactive projects retain their slide and progress until they return left.
    if (!reducedMotion.matches && !document.hidden) {
      const gallery = state[active];
      gallery.elapsed += delta;
      if (gallery.elapsed >= duration) {
        gallery.elapsed %= duration;
        gallery.slide = (gallery.slide + 1) % projects[active].images.length;
        changed = true;
      }
    }
    if (changed) renderSlides();
    renderProgress();
    requestAnimationFrame(animate);
  }
  renderDescription();
  new ResizeObserver(measure).observe(rail);
  measure();
  renderProgress();
  requestAnimationFrame(animate);

}
start().catch(error => {
  console.error(error);
  const status = document.querySelector('#status');
  status.hidden = false;
  status.textContent = 'The portfolio could not be loaded. Please refresh to try again.';
  document.querySelector('.project-context').hidden = true;
});
