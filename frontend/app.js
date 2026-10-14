import { loadPortfolio } from './projects.js';
import { createOrbitGrid } from './orbit.js';
import { createProjectView } from './project-view.js';

async function start() {
  const { projects, settings } = await loadPortfolio();
  const about = document.querySelector('.about');
  const copy = String(settings.about || '');
  const [name, ...rest] = copy.split(/\s+/);
  const studioName = document.createElement('strong');
  studioName.textContent = name;
  about.replaceChildren(studioName, document.createTextNode(rest.length ? ` ${rest.join(' ')}` : ''));
  for (const [key, fallback] of [['contact', 'Contact'], ['address', 'Orbitstreet 666, Berlin'], ['email', 'Info (at) orbit.com']]) {
    document.querySelector(`#footer-${key}`).textContent = settings[`footer_${key}`] ?? fallback;
  }
  document.title = `${name || 'JDDL'} — Independent design studio`;
  const nav = document.querySelector('.menu');
  const menuTrigger = document.querySelector('.mobile-menu-trigger');
  const mobileViewport = matchMedia('(max-width: 600px)');
  let menuOpen = false;
  function setMobileMenu(open, restoreFocus = false) {
    menuOpen = open;
    nav.classList.toggle('mobile-menu-open', open);
    menuTrigger.setAttribute('aria-expanded', String(open));
    if (restoreFocus) menuTrigger.focus({ preventScroll: true });
  }
  menuTrigger.addEventListener('click', () => setMobileMenu(!menuOpen));
  nav.addEventListener('click', () => setMobileMenu(false));
  document.addEventListener('click', event => {
    if (menuOpen && !nav.contains(event.target) && !menuTrigger.contains(event.target)) setMobileMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (menuOpen && event.key === 'Escape') { event.preventDefault(); setMobileMenu(false, true); }
  });
  mobileViewport.addEventListener('change', () => setMobileMenu(false));
  const logo = document.querySelector('.studio-logo');
  function sizeLogo() {
    logo.style.setProperty('--logo-scale', String(logo.getBoundingClientRect().width / 287.999));
  }
  new ResizeObserver(sizeLogo).observe(logo);
  sizeLogo();
  const masthead = document.querySelector('.masthead');
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--index-top', `${masthead.getBoundingClientRect().bottom + 24}px`);
  }).observe(masthead);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--footer-height', `${document.querySelector('.site-footer').getBoundingClientRect().height}px`);
  }).observe(document.querySelector('.site-footer'));
  nav.replaceChildren();
  function randomShape(choices, previous) {
    const candidates = choices.filter(value => value !== previous);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  const menuLabels = ['Selected', 'Index', 'Projects', 'random'];
  const menu = Array.from({ length: Math.max(4, projects.length) }, (_, index) => {
    const project = projects[index];
    const button = document.createElement('button');
    const number = document.createElement('span');
    number.className = 'menu-number';
    number.textContent = String(index + 1);
    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = menuLabels[index] || project?.title || '';
    button.append(number, label);
    button.dataset.project = String(index);
    function varyHoverShape() {
      if (!button.classList.contains('selected')) button.dataset.hoverShape = randomShape(['triangle', 'square', 'circle'], button.dataset.hoverShape);
    }
    button.addEventListener('pointerenter', varyHoverShape);
    button.addEventListener('focus', varyHoverShape);
    button.setAttribute('aria-label', index === 1 ? 'Index — Explore all images' : index === 2 ? 'Projects — Open active project' : `${menuLabels[index] || project?.title || ''}${project ? ` — Show ${project.title}` : ''}`);
    nav.append(button);
    button.style.setProperty('--menu-label-width', `${label.scrollWidth}px`);
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
  const portfolio = document.querySelector('.portfolio');
  const indexView = document.querySelector('#gallery');
  let orbit;
  let showingIndex = false;
  let detailProject = null;
  let returnHash = '';
  const detail = createProjectView(projects, settings, matchMedia('(prefers-reduced-motion: reduce)'), closeProject);
  function closeProject(updateURL = true) {
    if (!detailProject) return;
    const source = detail.close();
    detailProject = null;
    portfolio.hidden = showingIndex;
    indexView.hidden = !showingIndex;
    orbit?.setVisible(showingIndex);
    source?.focus({ preventScroll: true });
    updateMenu();
    if (updateURL) history.pushState(null, '', `${location.pathname}${location.search}${returnHash}`);
    previous = performance.now();
  }
  function openProject(project, image, source = null) {
    if (!detailProject) returnHash = showingIndex ? '#index/field' : '';
    clearPageMotion();
    pageTransition = null;
    stopWheel();
    detailProject = project;
    updateMenu();
    detail.open(project, image, source);
    portfolio.hidden = true;
    indexView.hidden = true;
    orbit?.setVisible(false);
    const hash = `#project/${encodeURIComponent(project.slug || project.id)}/${encodeURIComponent(image.id)}`;
    if (location.hash !== hash) history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
  }
  let savedRailPosition = 0;
  function showIndex(visible) {
    if (visible === showingIndex) return;
    if (visible && !showingIndex) savedRailPosition = rail.scrollLeft;
    const returning = showingIndex && !visible;
    showingIndex = visible;
    stopWheel();
    portfolio.hidden = visible;
    indexView.hidden = !visible;
    if (visible && !orbit) orbit = createOrbitGrid(projects);
    orbit?.setVisible(visible);
    if (returning) rail.scrollLeft = savedRailPosition;
    if (!visible) measure(returning);
    updateMenu();
    (visible ? indexView : rail).focus({ preventScroll: true });
  }
  indexView.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      transitionTo(active, false, menu[1]);
    }
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let pageTransition = null;
  const transitionClasses = ['page-out', 'page-out-back', 'page-in', 'page-in-back'];
  function clearPageMotion() {
    for (const view of [portfolio, indexView]) {
      transitionClasses.forEach(name => view.classList.remove(name));
      view.inert = false;
      view.style.setProperty('--page-exit-opacity', '1');
      view.style.setProperty('--page-exit-transform', 'none');
    }
  }
  function updateViewURL() {
    const hash = showingIndex ? '#index/field' : '';
    if (location.hash !== hash) history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
  }
  function openURLView() {
    const parts = location.hash.match(/^#project\/([^/]+)(?:\/([^/]+))?$/);
    if (parts) {
      const project = projects.find(item => encodeURIComponent(item.slug || item.id) === parts[1]);
      if (project) openProject(project, project.images.find(item => encodeURIComponent(item.id) === parts[2]) || project.images[0]);
      return;
    }
    if (!['', '#index', '#index/field'].includes(location.hash)) return;
    closeProject(false);
    clearPageMotion();
    pageTransition = null;
    const index = location.hash.startsWith('#index');
    showIndex(index);
    if (index && location.hash !== '#index/field') history.replaceState(null, '', `${location.pathname}${location.search}#index/field`);
  }
  function applyDestination(destination) {
    const returningToGallery = showingIndex && !destination.indexView && destination.project === active;
    showIndex(destination.indexView);
    if (!destination.indexView && !returningToGallery) navigate(destination.project, true);
    updateViewURL();
    (destination.focus || (destination.indexView ? indexView : rail)).focus({ preventScroll: true });
  }
  function transitionTo(project, index = false, focus = null) {
    closeProject();
    const destination = { project, indexView: index, focus };
    if (reducedMotion.matches) {
      clearPageMotion();
      pageTransition = null;
      applyDestination(destination);
      return;
    }
    // A second choice during the exit replaces the destination without flashing
    // an intermediate page. During entrance, fade out from the current position.
    if (pageTransition?.phase === 'out') {
      pageTransition.destination = destination;
      return;
    }
    if (!pageTransition && index === showingIndex && (index || project === active)) return;
    const outgoing = showingIndex ? indexView : portfolio;
    const interrupted = pageTransition?.phase === 'in' ? getComputedStyle(outgoing) : null;
    const exitOpacity = interrupted?.opacity || '1';
    const exitTransform = interrupted?.transform || 'none';
    clearPageMotion();
    stopWheel();
    const backwards = showingIndex && !index || !showingIndex && !index && project < active;
    outgoing.style.setProperty('--page-exit-opacity', exitOpacity);
    outgoing.style.setProperty('--page-exit-transform', exitTransform);
    outgoing.inert = true;
    outgoing.classList.add(backwards ? 'page-out-back' : 'page-out');
    pageTransition = { destination, backwards, phase: 'out', started: performance.now() };
  }
  function advancePageTransition(now) {
    if (!pageTransition) return;
    if (reducedMotion.matches) {
      const { destination } = pageTransition;
      clearPageMotion();
      pageTransition = null;
      applyDestination(destination);
      return;
    }
    const elapsed = now - pageTransition.started;
    if (pageTransition.phase === 'out' && elapsed >= 400) {
      const transition = pageTransition;
      // Switch only once the old content has faded away. Both views stay in
      // their original layout so the rail's fractional geometry is preserved.
      applyDestination(transition.destination);
      clearPageMotion();
      const incoming = showingIndex ? indexView : portfolio;
      incoming.classList.add(transition.backwards ? 'page-in-back' : 'page-in');
      pageTransition.phase = 'in';
      pageTransition.started = now;
    } else if (pageTransition.phase === 'in' && elapsed >= 800) {
      clearPageMotion();
      pageTransition = null;
    }
  }
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
  let hovering = false;
  let railSpeed = 18;
  let manualUntil = 0;
  let pointerDown = false;
  function manualInteraction() { manualUntil = performance.now() + 3500; rail.classList.remove('drifting'); }
  rail.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') hovering = true; });
  rail.addEventListener('pointerleave', () => { hovering = false; });
  rail.addEventListener('focusin', () => { hovering = true; });
  rail.addEventListener('focusout', () => { hovering = false; });
  window.addEventListener('pointerup', () => { pointerDown = false; });
  window.addEventListener('pointercancel', () => { pointerDown = false; });

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
      tile.tabIndex = -1;
      tile.setAttribute('role', 'link');
      const open = () => openProject(project, project.images[state[index].slide], tile);
      tile.addEventListener('click', open);
      tile.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); open(); } });
      project.images.forEach((image, slide) => {
        const img = new Image();
        img.src = image.url;
        img.alt = image.alt_text || `${project.title} — image ${slide + 1} of ${project.images.length}`;
        img.draggable = false;
        img.classList.toggle('visible', slide === 0);
        tile.append(img);
      });
      const caption = document.createElement('div');
      caption.className = 'tile-caption';
      const heading = document.createElement('p');
      heading.textContent = project.title;
      const copy = document.createElement('p');
      copy.textContent = project.description;
      caption.append(heading, copy);
      tile.append(caption);
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
        manualInteraction();
        navigate(active);
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

  function measure(preservePosition = false) {
    stopWheel();
    if (showingIndex || detailProject) return;
    const savedProject = step ? (preservePosition === true ? rail.scrollLeft / step : Math.round(rail.scrollLeft / step)) % projects.length : active;
    // offsetLeft rounds to whole pixels; repeated tiles amplify that rounding
    // into a visible mismatch with CSS snapping. Keep the live fractional geometry.
    const first = tiles[0].getBoundingClientRect();
    step = tiles[1].getBoundingClientRect().left - first.left;
    document.querySelector('.project-context').style.width = `${first.width}px`;
    cycle = step * projects.length;
    rail.scrollLeft = middle * cycle + savedProject * step;
    onScroll();
  }

  function onScroll() {
    if (showingIndex || detailProject) return;
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
    tiles.forEach((tile, index) => {
      const visible = index >= Math.floor(rail.scrollLeft / step) && index < Math.ceil((rail.scrollLeft + rail.clientWidth) / step);
      tile.setAttribute('aria-hidden', String(!visible));
      tile.tabIndex = visible ? 0 : -1;
    });
    updateMenu();
  }

  function updateMenu() {
    menu.forEach(button => {
      const index = Number(button.dataset.project);
      const selected = detailProject ? index === 2 : showingIndex ? index === 1 : index === 0;
      if (selected && !button.classList.contains('selected')) {
        button.dataset.selectedShape = randomShape(['rounded', 'beveled', 'scalloped', 'curved'], button.dataset.selectedShape);
      }
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  function navigate(index, immediate = false) {
    manualInteraction();
    stopWheel();
    const base = Math.floor(rail.scrollLeft / cycle) * cycle;
    const options = [base - cycle, base, base + cycle].map(offset => offset + index * step);
    const target = options.reduce((best, value) => Math.abs(value - rail.scrollLeft) < Math.abs(best - rail.scrollLeft) ? value : best);
    rail.scrollTo({ left: target, behavior: immediate || reducedMotion.matches ? 'instant' : 'smooth' });
  }
  menu.forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.project);
    if (index === 2) {
      const project = detailProject || projects[active];
      openProject(project, project.images[state[projects.indexOf(project)].slide]);
      return;
    }
    transitionTo(Math.min(index, projects.length - 1), index === 1);
  }));
  rail.addEventListener('scroll', onScroll, { passive: true });
  rail.addEventListener('scrollend', () => {
    if (wheelTarget !== null || rail.classList.contains('drifting') || detailProject) return;
    const target = Math.round(rail.scrollLeft / step) * step;
    if (Math.abs(rail.scrollLeft - target) > .5) {
      rail.scrollTo({ left: target, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
  });
  rail.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    manualInteraction();
    stopWheel();
    if (event.key === 'Home' || event.key === 'End') return navigate(event.key === 'Home' ? 0 : projects.length - 1);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    rail.scrollTo({ left: (Math.round(rail.scrollLeft / step) + direction) * step, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
  // Keep horizontal gestures native inside the rail. Route ordinary mouse-wheel
  // input (and gestures over the fixed header) into that same scroll container.
  document.addEventListener('wheel', event => {
    if (showingIndex || detailProject || pageTransition || event.ctrlKey) return; // Preserve browser pinch-to-zoom.
    manualInteraction();
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
  rail.addEventListener('pointerdown', () => { pointerDown = true; manualInteraction(); stopWheel(); }, { passive: true });

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
      [...tile.children].slice(0, projects[Number(tile.dataset.project)].images.length).forEach((img, index) => img.classList.toggle('visible', index === current));
    });
  }
  function renderProgress() {
    const current = state[active];
    bars.forEach((bar, index) => {
      const fill = index < current.slide ? 1 : index === current.slide ? current.elapsed / duration : 0;
      // Change physical width rather than scaling (which distorts the end caps).
      bar.firstElementChild.style.width = `${fill * 100}%`;
      bar.setAttribute('aria-pressed', String(index === current.slide));
    });
  }
  document.addEventListener('visibilitychange', () => { previous = performance.now(); });
  function animate(now) {
    const delta = Math.min(now - previous, 100);
    previous = now;
    const transitioning = Boolean(pageTransition);
    advancePageTransition(now);
    glide(now, delta);
    const drifting = !menuOpen && !showingIndex && !detailProject && !transitioning && !pageTransition && !reducedMotion.matches && !document.hidden && !pointerDown && wheelTarget === null && now >= manualUntil;
    rail.classList.toggle('drifting', drifting);
    if (drifting) {
      railSpeed += ((hovering ? .35 : 18) - railSpeed) * (1 - Math.exp(-delta / 350));
      rail.scrollLeft += railSpeed * delta / 1000;
      onScroll();
    }
    let changed = false;
    // Inactive projects retain their slide and progress until they return left.
    if (!menuOpen && !showingIndex && !detailProject && !transitioning && !pageTransition && !reducedMotion.matches && !document.hidden) {
      const gallery = state[active];
      gallery.elapsed += delta * (hovering ? .02 : 1);
      if (gallery.elapsed >= duration) {
        gallery.elapsed %= duration;
        gallery.slide = (gallery.slide + 1) % projects[active].images.length;
        changed = true;
      }
    }
    if (changed) renderSlides();
    if (!showingIndex && !detailProject && !document.hidden) renderProgress();
    requestAnimationFrame(animate);
  }
  renderDescription();
  new ResizeObserver(measure).observe(rail);
  measure();
  renderProgress();
  openURLView();
  window.addEventListener('hashchange', openURLView);
  document.querySelector('.studio-logo').addEventListener('click', event => { event.preventDefault(); transitionTo(0); });
  requestAnimationFrame(animate);

}
start().catch(error => {
  console.error(error);
  const status = document.querySelector('#status');
  status.hidden = false;
  status.textContent = 'The portfolio could not be loaded. Please refresh to try again.';
  document.querySelector('.project-context').hidden = true;
});
