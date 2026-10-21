import { loadPortfolio } from './projects.js';
import { createOrbitGrid } from './orbit.js';
import { createProjectView } from './project-view.js';

async function start() {
  const { projects, settings } = await loadPortfolio();
  const about = document.querySelector('.about');
  const copy = String(settings.about || '');
  const split = copy.match(/^(.+?[.!?])(?:\s+|$)([\s\S]*)/);
  const headline = document.createElement('strong');
  headline.textContent = split ? split[1] : copy;
  about.replaceChildren(headline, document.createTextNode(split ? split[2] : ''));
  const footerValues = [['contact', 'Contact'], ['email', ''], ['address', '']];
  const projectFooter = document.querySelector('.project-footer');
  for (const [key, fallback] of footerValues) {
    const value = settings[`footer_${key}`] ?? fallback;
    const footerField = document.querySelector(`#footer-${key}`);
    footerField.textContent = value;
    const text = document.createElement('p');
    text.textContent = value;
    projectFooter.append(text);
    if (key === 'contact') {
      for (const field of [footerField, text]) {
        const link = document.createElement('a');
        link.href = '/imprint.html';
        link.className = 'footer-imprint';
        link.textContent = 'Imprint';
        field.append(link);
      }
    }
  }
  const baseTitle = 'AD4K — Independent design studio';
  document.title = baseTitle;
  const nav = document.querySelector('.menu');
  const menuTrigger = document.querySelector('.mobile-menu-trigger');
  const mobileViewport = matchMedia('(max-width: 600px)');
  let menuOpen = false;
  function setMobileMenu(open, restoreFocus = false) {
    menuOpen = open;
    nav.classList.toggle('mobile-menu-open', open);
    menuTrigger.textContent = open ? 'CLOSE' : 'MENU';
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
  const masthead = document.querySelector('.masthead');
  new ResizeObserver(() => {
    const top = masthead.getBoundingClientRect().bottom + 24;
    document.documentElement.style.setProperty('--index-top', `${top}px`);
    document.documentElement.style.setProperty('--rail-top', `${top - (mobileViewport.matches && menuOpen ? 64 : 0)}px`);
  }).observe(masthead);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--footer-height', `${document.querySelector('.site-footer').getBoundingClientRect().height}px`);
  }).observe(document.querySelector('.site-footer'));
  nav.replaceChildren();
  function randomShape(choices, previous) {
    const candidates = choices.filter(value => value !== previous);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  const menuLabels = ['Selected', 'Index', 'Project', 'About'];
  const menu = Array.from({ length: 4 }, (_, index) => {
    const button = document.createElement('button');
    const number = document.createElement('span');
    number.className = 'menu-number';
    number.textContent = String(index + 1);
    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = menuLabels[index];
    button.append(number, label);
    button.dataset.project = String(index);
    function varyHoverShape() {
      if (!button.classList.contains('selected')) button.dataset.hoverShape = randomShape(['triangle', 'square', 'circle'], button.dataset.hoverShape);
    }
    button.addEventListener('pointerenter', varyHoverShape);
    button.addEventListener('focus', varyHoverShape);
    button.setAttribute('aria-label', ['Selected — View projects', 'Index — Explore all images', 'Project — Open a random project', 'About the studio'][index]);
    nav.append(button);
    button.style.setProperty('--menu-label-width', `${label.scrollWidth}px`);
    return button;
  });
  const status = document.querySelector('#status');
  if (!projects.length) {
    status.textContent = 'No published projects yet.';
    return;
  }
  status.hidden = true;

  const rail = document.querySelector('.rail');
  const track = document.querySelector('.track');
  const portfolio = document.querySelector('.portfolio');
  const indexView = document.querySelector('#gallery');
  let orbit;
  let showingIndex = false;
  let detailProject = null;
  let returnHash = '';
  let showingAbout = false;
  const studioView = document.querySelector('#studio-detail');
  const studioCopy = document.querySelector('.studio-detail-copy');
  for (const [label, value] of [[settings.eyebrow || 'About', settings.about], ['Selected clients', settings.clients]]) {
    if (!value) continue;
    const heading = document.createElement('h2');
    heading.textContent = label;
    const text = document.createElement('p');
    text.textContent = value;
    studioCopy.append(heading, text);
  }
  const filters = document.querySelector('.index-filters');
  const tags = [...new Set(projects.flatMap(project => project.images.flatMap(image => image.tags)))];
  const filterButtons = [];
  for (const tag of [null, ...tags]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tag || 'All';
    button.setAttribute('aria-pressed', String(tag === null));
    button.addEventListener('click', () => {
      filterButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      orbit?.setFilter(tag);
    });
    filterButtons.push(button);
    filters.append(button);
  }
  function syncShell() {
    document.documentElement.classList.toggle('index-open', showingIndex && !detailProject && !showingAbout);
    filters.hidden = !showingIndex || Boolean(detailProject) || showingAbout;
    studioView.hidden = !showingAbout || Boolean(detailProject);
  }
  function showAbout(visible) {
    showingAbout = visible;
    portfolio.hidden = visible || showingIndex;
    indexView.hidden = visible || !showingIndex;
    orbit?.setVisible(showingIndex && !visible);
    syncShell();
    updateMenu();
    if (visible) studioView.focus({ preventScroll: true });
  }
  const detail = createProjectView(projects, settings, matchMedia('(prefers-reduced-motion: reduce)'), closeProject);
  function closeProject(updateURL = true, after = null) {
    if (!detailProject && !detail.isTransitioning()) { after?.(); return; }
    if (updateURL && history.state?.portfolioProject && typeof history.back === 'function') {
      history.back();
      return;
    }
    detail.close(source => {
      detailProject = null;
      portfolio.hidden = showingIndex || showingAbout;
      indexView.hidden = !showingIndex || showingAbout;
      orbit?.setVisible(showingIndex && !showingAbout);
      syncShell();
      source?.focus({ preventScroll: true });
      if (!source) (showingIndex ? indexView : rail).focus({ preventScroll: true });
      document.title = baseTitle;
      updateMenu();
      if (updateURL) history.replaceState(null, '', `${location.pathname}${location.search}${returnHash}`);
      manualInteraction();
      previous = performance.now();
      after?.();
    });
  }
  function openProject(project, image, source = null) {
    if (detailProject?.id === project.id && document.querySelector('.project-hero').src.endsWith(image.url)) return;
    if (!detailProject) returnHash = history.state?.returnHash || (showingIndex ? '#index/field' : showingAbout ? '#about' : '');
    clearPageMotion();
    pageTransition = null;
    stopWheel();
    detail.open(project, image, source, () => {
      detailProject = project;
      const returnView = returnHash.startsWith('#index') ? 'index' : returnHash === '#about' ? 'about' : 'selected';
      const back = document.querySelector('.project-close');
      back.textContent = `Back to ${returnView} ↗`;
      back.setAttribute('aria-label', `Return to ${returnView === 'selected' ? 'selected projects' : returnView}`);
      updateMenu();
      syncShell();
      portfolio.hidden = true;
      indexView.hidden = true;
      orbit?.setVisible(false);
      document.title = `${project.title} — AD4K`;
      const hash = `#project/${encodeURIComponent(project.slug || project.id)}/${encodeURIComponent(image.id)}`;
      if (location.hash !== hash) history.pushState({ portfolioProject: true, returnHash }, '', `${location.pathname}${location.search}${hash}`);
    });
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
    if (visible && !orbit) orbit = createOrbitGrid(projects, openProject);
    orbit?.setVisible(visible);
    syncShell();
    if (returning) rail.scrollLeft = savedRailPosition;
    if (!visible) measure();
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
    for (const view of [portfolio, indexView, studioView]) {
      transitionClasses.forEach(name => view.classList.remove(name));
      view.inert = false;
      view.style.setProperty('--page-exit-opacity', '1');
      view.style.setProperty('--page-exit-transform', 'none');
    }
  }
  function updateViewURL() {
    const hash = showingAbout ? '#about' : showingIndex ? '#index/field' : '';
    if (location.hash !== hash) history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
  }
  function openURLView() {
    const parts = location.hash.match(/^#project\/([^/]+)(?:\/([^/]+))?$/);
    if (parts) {
      const project = projects.find(item => encodeURIComponent(item.slug || item.id) === parts[1]);
      if (project) openProject(project, project.images.find(item => encodeURIComponent(item.id) === parts[2]) || project.thumbnail);
      return;
    }
    if (!['', '#index', '#index/field', '#about'].includes(location.hash)) return;
    const restore = () => {
      clearPageMotion();
      pageTransition = null;
      const index = location.hash.startsWith('#index');
      showAbout(false);
      showIndex(index);
      showAbout(location.hash === '#about');
      if (index && location.hash !== '#index/field') history.replaceState(null, '', `${location.pathname}${location.search}#index/field`);
    };
    if (detailProject || detail.isTransitioning()) closeProject(false, restore);
    else restore();
  }
  function applyDestination(destination) {
    const returningToGallery = destination.project === active;
    showAbout(false);
    showIndex(destination.indexView);
    showAbout(Boolean(destination.about));
    if (!destination.indexView && !destination.about && !returningToGallery) navigate(destination.project, true);
    updateViewURL();
    (destination.focus || (destination.about ? studioView : destination.indexView ? indexView : rail)).focus({ preventScroll: true });
  }
  function transitionTo(project, index = false, focus = null, aboutView = false) {
    const destination = { project, indexView: index, focus, about: aboutView };
    if (detailProject || detail.isTransitioning()) { closeProject(false, () => applyDestination(destination)); return; }
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
    if (!pageTransition && aboutView === showingAbout && index === showingIndex && (index || aboutView || project === active)) return;
    const outgoing = showingAbout ? studioView : showingIndex ? indexView : portfolio;
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
      const incoming = showingAbout ? studioView : showingIndex ? indexView : portfolio;
      incoming.classList.add(transition.backwards ? 'page-in-back' : 'page-in');
      pageTransition.phase = 'in';
      pageTransition.started = now;
    } else if (pageTransition.phase === 'in' && elapsed >= 800) {
      clearPageMotion();
      pageTransition = null;
    }
  }
  const copies = 7;
  const middle = Math.floor(copies / 2);
  const tiles = [];
  let active = 0;
  let step = 0;
  let cycle = 0;
  let previous = performance.now();
  let wheelTarget = null;
  let hovering = false;
  const idleRailSpeed = 10;
  let railSpeed = idleRailSpeed;
  let driftPosition = null;
  let manualUntil = 0;
  let pointerDown = false;
  let needsMeasure = false;
  function manualInteraction() { driftPosition = null; manualUntil = performance.now() + 3500; rail.classList.remove('drifting'); }
  rail.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') hovering = true; });
  rail.addEventListener('pointerleave', () => { hovering = false; });
  rail.addEventListener('focusin', () => { hovering = true; });
  rail.addEventListener('focusout', () => { hovering = false; });
  window.addEventListener('pointerup', () => { pointerDown = false; });
  window.addEventListener('pointercancel', () => { pointerDown = false; });

  function stopWheel() {
    wheelTarget = null;
    rail.classList.remove('gliding');
  }

  for (let copy = 0; copy < copies; copy++) {
    projects.forEach((project, index) => {
      const tile = document.createElement('a');
      tile.className = 'tile';
      tile.dataset.project = index;
      tile.href = `#project/${encodeURIComponent(project.slug || project.id)}/${encodeURIComponent(project.thumbnail.id)}`;
      tile.setAttribute('aria-label', project.title);
      tile.setAttribute('aria-hidden', 'true');
      tile.tabIndex = -1;
      tile.setAttribute('role', 'link');
      const open = event => {
        if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey) return;
        event?.preventDefault?.();
        openProject(project, project.thumbnail, tile);
      };
      tile.addEventListener('click', open);
      tile.addEventListener('keydown', event => { if (event.key === ' ') { event.preventDefault(); open(event); } });
      const image = project.thumbnail;
      const img = new Image();
      img.src = image.url;
      img.alt = image.alt_text || project.title;
      img.draggable = false;
      img.classList.add('visible');
      tile.append(img);
      const caption = document.createElement('div');
      caption.className = 'tile-caption';
      const values = document.createElement('p');
      values.className = 'caption-values';
      for (const [text, label] of [[project.title, 'Project'], [project.client, 'Client']]) {
        if (!text) continue;
        const pair = document.createElement('span');
        pair.className = 'meta-pair';
        const value = document.createElement('span');
        value.className = 'meta-value';
        value.textContent = text;
        const name = document.createElement('span');
        name.className = 'meta-label';
        name.textContent = label;
        pair.append(value, name);
        values.append(pair);
      }
      const services = document.createElement('p');
      services.className = 'tile-services';
      services.textContent = [...new Set(project.images.flatMap(item => item.tags))].join(', ');
      caption.append(values, services);
      tile.append(caption);
      track.append(tile);
      tiles.push(tile);
    });
  }

  function measure() {
    const oldStep = step;
    const oldPosition = rail.scrollLeft;
    driftPosition = null;
    stopWheel();
    if (showingIndex || showingAbout || detailProject || detail.isTransitioning()) { needsMeasure = true; return; }
    needsMeasure = false;
    const savedProject = step ? (rail.scrollLeft / step) % projects.length : active;
    // Preserve the fractional position through resizing and whole-cycle rebasing.
    const first = tiles[0].getBoundingClientRect();
    step = tiles[1].getBoundingClientRect().left - first.left;
    cycle = step * projects.length;
    rail.scrollLeft = oldStep === step ? oldPosition : middle * cycle + savedProject * step;
    onScroll();
  }

  function onScroll() {
    if (showingIndex || showingAbout || detailProject || detail.isTransitioning()) return;
    // Rebase by exact whole cycles, keeping identical pixels under the viewport.
    const shift = rail.scrollLeft < cycle * 2 ? cycle * 2 : rail.scrollLeft >= cycle * 5 ? -cycle * 2 : 0;
    if (shift) {
      rail.scrollLeft += shift;
      if (wheelTarget !== null) wheelTarget += shift;
      if (driftPosition !== null) driftPosition += shift;
    }
    const nearest = Math.round(rail.scrollLeft / step);
    const next = nearest % projects.length;
    active = next;
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
      const selected = detailProject ? index === 2 : showingAbout ? index === 3 : showingIndex ? index === 1 : index === 0;
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
      const alternatives = projects.filter(project => project.id !== detailProject?.id);
      const choices = alternatives.length ? alternatives : projects;
      const project = choices[Math.floor(Math.random() * choices.length)];
      openProject(project, project.thumbnail);
      return;
    }
    transitionTo(active, index === 1, button, index === 3);
  }));
  rail.addEventListener('scroll', onScroll, { passive: true });
  rail.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    manualInteraction();
    stopWheel();
    if (event.key === 'Home' || event.key === 'End') return navigate(event.key === 'Home' ? 0 : projects.length - 1);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    rail.scrollTo({ left: rail.scrollLeft + direction * step, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
  // Keep horizontal gestures native inside the rail. Route ordinary mouse-wheel
  // input (and gestures over the fixed header) into that same scroll container.
  document.addEventListener('wheel', event => {
    if (showingIndex || showingAbout || detailProject || detail.isTransitioning() || pageTransition || event.ctrlKey) return; // Preserve browser pinch-to-zoom.
    manualInteraction();
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (rail.contains(event.target) && (horizontal || event.shiftKey)) { stopWheel(); return; }
    const delta = horizontal ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1;
    wheelTarget = (wheelTarget ?? rail.scrollLeft) + delta * unit;
    rail.classList.add('gliding');
  }, { passive: false });
  rail.addEventListener('pointerdown', () => { pointerDown = true; manualInteraction(); stopWheel(); }, { passive: true });

  function glide(elapsed) {
    if (wheelTarget === null) return;
    const distance = wheelTarget - rail.scrollLeft;
    const ease = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 65);
    rail.scrollLeft += distance * ease;
    onScroll();
    if (Math.abs(wheelTarget - rail.scrollLeft) < .05) {
      rail.scrollLeft = wheelTarget;
      stopWheel();
      onScroll();
    }
  }
  document.addEventListener('visibilitychange', () => { previous = performance.now(); });
  function animate(now) {
    const delta = Math.max(now - previous, 0);
    previous = now;
    const transitioning = Boolean(pageTransition);
    if (needsMeasure && !detailProject && !detail.isTransitioning() && !showingIndex && !showingAbout) measure();
    advancePageTransition(now);
    glide(delta);
    const drifting = !menuOpen && !showingIndex && !showingAbout && !detailProject && !detail.isTransitioning() && !transitioning && !pageTransition && !reducedMotion.matches && !document.hidden && !pointerDown && wheelTarget === null && now >= manualUntil;
    rail.classList.toggle('drifting', drifting);
    if (drifting) {
      railSpeed += ((hovering ? .35 : idleRailSpeed) - railSpeed) * (1 - Math.exp(-delta / 350));
      driftPosition = (driftPosition ?? rail.scrollLeft) + railSpeed * delta / 1000;
      rail.scrollLeft = driftPosition;
      onScroll();
    } else {
      driftPosition = null;
    }
    requestAnimationFrame(animate);
  }
  new ResizeObserver(measure).observe(rail);
  measure();
  openURLView();
  window.addEventListener('hashchange', openURLView);
  document.querySelector('.studio-close').addEventListener('click', () => transitionTo(active));
  studioView.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); transitionTo(active); } });
  document.querySelector('.studio-logo').addEventListener('click', event => { event.preventDefault(); transitionTo(active); });
  requestAnimationFrame(animate);

}
start().catch(error => {
  console.error(error);
  const status = document.querySelector('#status');
  status.hidden = false;
  status.textContent = 'The portfolio could not be loaded. Please refresh to try again.';
});
