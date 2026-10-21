import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizePortfolio, loadPortfolio } from '../frontend/projects.js';
import { imagePlacement, projectRows } from '../frontend/project-view.js';

const seed = JSON.parse(fs.readFileSync(new URL('../backend/seed/content.json', import.meta.url)));

test('CMS projects use actual public assignments, image counts and content', () => {
  const projects = normalizePortfolio(seed);
  assert.equal(projects.length, 4);
  assert.equal(projects[0].title, "Nature's Calling");
  assert.equal(projects[0].images.length, 3);
  assert.equal(projects.reduce((count, project) => count + project.images.length, 0), 22);
  const modified = structuredClone(seed);
  modified.projects[0].published = 0;
  modified.images[0].archived = 1;
  modified.images[1].published = 0;
  modified.images[2].project_ids = [];
  const visible = normalizePortfolio(modified);
  assert.ok(visible.every(project => project.id !== modified.projects[0].id));
  assert.ok(visible.flatMap(project => project.images).every(image => !modified.images.slice(0, 3).some(hidden => hidden.id === image.id)));
  assert.deepEqual(normalizePortfolio({ projects: [], images: [] }), []);
});

test('loads fresh CMS content and reports API failures', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/public');
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => seed };
    };
    assert.equal((await loadPortfolio()).settings.about, seed.settings.about);
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    await assert.rejects(loadPortfolio(), /Could not load portfolio/);
  } finally { globalThis.fetch = original; }
});

class Element {
  constructor(step = 310) {
    this.step = step;
    this.children = []; this.dataset = {}; this.style = { writes: 0, setProperty(name, value) { this.writes++; this[name] = value; } }; this.attrs = {};
    this.value = '72'; this.hidden = false;
    this.listeners = {}; this.scrollLeft = 0; this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      contains: name => this.classes.has(name), add: name => this.classes.add(name), remove: name => this.classes.delete(name),
    };
  }
  append(...elements) { elements.forEach(element => { element.parent = this; this.children.push(element); }); }
  focus() { this.focused = true; }
  closest() { return null; }
  querySelector() { return this.children.find(child => child.classes?.has('visible')) || this.children[0] || null; }
  setPointerCapture(id) { this.capturedPointer = id; }
  hasPointerCapture(id) { return this.capturedPointer === id; }
  releasePointerCapture() { this.capturedPointer = null; }
  replaceChildren(...elements) { this.children = []; elements.forEach(element => this.append(element)); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(key, callback) {
    const previous = this.listeners[key];
    this.listeners[key] = previous ? event => { previous(event); callback(event); } : callback;
  }
  get offsetLeft() { return Math.round(this.parent.children.indexOf(this) * this.step + 16); }
  getBoundingClientRect() { return { left: (this.parent?.children.indexOf(this) || 0) * this.step + 16, width: this.step - 10, height: 700, top: 0, bottom: 700 }; }
  get firstElementChild() { return this.children[0]; }
  get clientWidth() { return 1000; }
  set innerHTML(value) { this.children = [new Element()]; }
  scrollTo({ left }) { this.scrollLeft = left; this.listeners.scroll?.(); }
  contains(element) { return element === this; }
}

async function mount(data = seed, reduced = false, step = 310, viewportWidth = 1000, initialHash = '', nativeTransitions = false) {
  const selectors = ['.rail', '.track', '.about', '.menu', '#status', '.portfolio', '#gallery', '#field', '.masthead', '.studio-logo', '.mobile-menu-trigger', '.site-footer', '#footer-contact', '#footer-address', '#footer-email', '#project-detail', '.project-detail-content', '.project-detail-info', '.project-hero', '.project-grid', '.project-close', '.project-footer', '#studio-detail', '.studio-detail-copy', '.studio-close', '.index-filters'];
  const elements = Object.fromEntries(selectors.map(selector => [selector, new Element(step)]));
  elements['#gallery'].getBoundingClientRect = () => ({ width: viewportWidth, height: 700 });
  const frames = new Map();
  let nextFrame = 0;
  let time = 0;
  const listeners = {};
  const document = {
    documentElement: new Element(step),
    querySelector: selector => elements[selector],
    createElement: () => new Element(step), createTextNode: text => ({ textContent: text }),
    addEventListener: (key, callback) => { const previous = listeners[key]; listeners[key] = previous ? event => { previous(event); callback(event); } : callback; }, hidden: false,
  };
  const location = { pathname: '/', search: '', hash: initialHash };
  const entries = [{ hash: initialHash, state: null }];
  let historyIndex = 0;
  const history = {
    get state() { return entries[historyIndex].state; },
    pushState(state, _title, url) {
      location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
      entries.splice(++historyIndex);
      entries.push({ hash: location.hash, state });
    },
    replaceState(state, _title, url) {
      location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
      entries[historyIndex] = { hash: location.hash, state };
    },
    back() { if (historyIndex > 0) { location.hash = entries[--historyIndex].hash; listeners.hashchange?.(); } },
    forward() { if (historyIndex < entries.length - 1) { location.hash = entries[++historyIndex].hash; listeners.hashchange?.(); } },
  };
  const transitions = [];
  if (nativeTransitions) document.startViewTransition = update => {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const ready = Promise.resolve().then(update);
    const transition = { ready, finished, finish, skipTransition() { ready.then(finish); } };
    transitions.push(transition);
    return transition;
  };
  const context = vm.createContext({
    innerHeight: 900, location, history, addEventListener: (key, callback) => { listeners[key] = callback; },
    getComputedStyle: () => ({ opacity: '.5', transform: 'matrix(1, 0, 0, 1, 12, 0)' }),
    console, document, performance: { now: () => time },
    loadPortfolio: async () => ({ projects: normalizePortfolio(data), settings: data.settings || {} }),
    matchMedia: () => ({ matches: reduced, addEventListener() {} }), Image: class extends Element { constructor() { super(step); } },
    ResizeObserver: class { observe() {} }, requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(new URL('../frontend/project-view.js', import.meta.url), 'utf8').replaceAll('export function', 'function'), context);
  vm.runInContext(fs.readFileSync(new URL('../frontend/orbit.js', import.meta.url), 'utf8').replace('export function', 'function'), context);
  const source = fs.readFileSync(new URL('../frontend/app.js', import.meta.url), 'utf8')
    .replace("import { loadPortfolio } from './projects.js';", '')
    .replace("import { createOrbitGrid } from './orbit.js';", '')
    .replace("import { createProjectView } from './project-view.js';", '');
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, listeners, tick: (delta = 100) => { time += delta; const pending = [...frames.values()]; frames.clear(); pending.forEach(frame => frame(time)); }, document, location, history, transitions };
}

test('each project keeps exactly one CMS thumbnail while the rail moves', async () => {
  const { elements, tick } = await mount();
  const tiles = elements['.track'].children;
  assert.equal(tiles.length, 28);
  const thumbnails = tiles.map(tile => tile.children[0].src);
  assert.ok(tiles.every(tile => tile.children.length === 2));
  assert.ok(tiles[0].children[1].children[1].textContent.length > 0);
  for (let frame = 0; frame < 1000; frame++) tick();
  assert.deepEqual(tiles.map(tile => tile.children[0].src), thumbnails);
  assert.ok(tiles.every(tile => tile.children[0].classes.has('visible')));
});

test('wheel glide stops at the requested offset and loop rebase preserves free motion', async () => {
  const { elements, listeners, tick } = await mount();
  const rail = elements['.rail'];
  let prevented = false;
  const wheel = delta => listeners.wheel({ ctrlKey: false, deltaX: 0, deltaY: delta,
    deltaMode: 0, target: rail, preventDefault: () => { prevented = true; } });
  const initial = rail.scrollLeft;
  wheel(120); tick(16);
  assert.ok(rail.scrollLeft > initial && rail.scrollLeft < initial + 120);
  for (let index = 0; index < 120; index++) tick(16);
  assert.equal(rail.scrollLeft, initial + 120);
  assert.ok(prevented);
  assert.ok(!rail.classes.has('gliding'));
  rail.scrollLeft = 1240 * 5 - 10; rail.listeners.scroll();
  wheel(400);
  for (let index = 0; index < 120; index++) tick(16);
  assert.equal(rail.scrollLeft % 310, 80);
  assert.ok(rail.scrollLeft >= 1240 * 2 && rail.scrollLeft < 1240 * 5);
  rail.scrollLeft = 100; rail.listeners.scroll(); assert.equal(rail.scrollLeft, 2580);
  prevented = false;
  listeners.wheel({ ctrlKey: false, deltaX: 100, deltaY: 0, target: rail,
    preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  listeners.wheel({ ctrlKey: true, preventDefault: () => assert.fail('Zoom intercepted') });
});

test('reduced motion disables drift but retains free manual scrolling and empty states', async () => {
  const { elements, listeners, tick } = await mount(seed, true);
  const rail = elements['.rail'];
  const initial = rail.scrollLeft;
  for (let frame = 0; frame < 60; frame++) tick();
  assert.equal(rail.scrollLeft, initial);
  listeners.wheel({ deltaX: 0, deltaY: 53, deltaMode: 0, target: rail, preventDefault() {} });
  tick();
  assert.equal(rail.scrollLeft, initial + 53);
  const empty = await mount({ projects: [], images: [], settings: {} });
  assert.equal(empty.elements['#status'].textContent, 'No published projects yet.');
});

test('fractional offsets survive wheel, keyboard, native scroll completion and wrapping', async () => {
  const step = 310.375;
  const { elements, listeners, tick } = await mount(seed, false, step);
  const rail = elements['.rail'];
  const initial = 12 * step;
  assert.equal(rail.scrollLeft, initial);
  rail.scrollLeft += 27.25;
  rail.listeners.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(rail.scrollLeft, initial + step + 27.25);
  listeners.wheel({ ctrlKey: false, deltaX: 0, deltaY: 120, deltaMode: 0, target: rail, preventDefault() {} });
  for (let frame = 0; frame < 120; frame++) tick(16);
  assert.equal(rail.scrollLeft, initial + step + 147.25);
  assert.equal(rail.listeners.scrollend, undefined);
  const cycle = 4 * step;
  rail.scrollLeft = 5 * cycle - 10; rail.listeners.scroll();
  const before = rail.scrollLeft;
  listeners.wheel({ ctrlKey: false, deltaX: 0, deltaY: 400, deltaMode: 0, target: rail, preventDefault() {} });
  for (let frame = 0; frame < 120; frame++) tick(16);
  assert.equal(rail.scrollLeft % cycle, (before + 400) % cycle);
});

test('rail has no story controls or CSS snapping', () => {
  const markup = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../frontend/styles.css', import.meta.url), 'utf8');
  assert.ok(!markup.includes('class="stories"'));
  assert.ok(!markup.includes('class="project-context"'));
  assert.ok(!styles.includes('scroll-snap-align: start'));
  assert.ok(!styles.includes('scroll-snap-type: x mandatory'));
});

test('saved CMS project order determines the landing project and its first visible image', async () => {
  const data = structuredClone(seed);
  const featured = data.projects[2];
  featured.sort_order = -20;
  const firstImage = data.images.find(image => image.project_ids.includes(featured.id) && image.published && !image.archived);
  const { elements } = await mount(data);
  assert.equal(elements['.track'].children[0].children[1].children[0].children[0].children[0].textContent, featured.title);
  const activeTile = elements['.track'].children.find(tile => tile.attrs['aria-hidden'] === 'false');
  assert.equal(activeTile.children[0].src, firstImage.url);
  assert.equal(activeTile.children[0].classes.has('visible'), true);
  featured.published = 0;
  const hidden = await mount(data);
  assert.equal(hidden.elements['.track'].children[0].children[1].children[0].children[0].children[0].textContent, normalizePortfolio(data)[0].title);
  featured.published = 1;
  data.images.filter(image => image.project_ids.includes(featured.id)).forEach(image => { image.archived = 1; });
  const empty = await mount(data);
  assert.equal(empty.elements['.track'].children[0].children[1].children[0].children[0].children[0].textContent, normalizePortfolio(data)[0].title);
});


test('Index pauses the rail and returns to the exact free scrolling position', async () => {
  const { elements, listeners, tick } = await mount();
  const menu = elements['.menu'];
  for (let index = 0; index < 10; index++) tick();
  const thumbnail = elements['.track'].children[0].children[0].src;
  const railPosition = elements['.rail'].scrollLeft;
  menu.children[1].listeners.click();
  tick(400);
  assert.equal(elements['.portfolio'].hidden, true);
  assert.equal(elements['#gallery'].hidden, false);
  assert.equal(elements['#gallery'].focused, true);
  assert.equal(menu.children[1].attrs['aria-current'], 'true');
  const images = elements['#field'].children.map(tile => tile.children[0]);
  const publicURLs = new Set(normalizePortfolio(seed).flatMap(project => project.images.map(image => image.url)));
  assert.ok(images.length >= publicURLs.size);
  assert.ok(images.every(image => publicURLs.has(image.src)));
  for (let index = 0; index < 50; index++) tick();
  assert.equal(elements['.track'].children[0].children[0].src, thumbnail);
  listeners.wheel({ ctrlKey: false, deltaY: 100, preventDefault: () => assert.fail('Hidden rail intercepted wheel') });
  elements['#gallery'].listeners.wheel({ ctrlKey: true, preventDefault: () => assert.fail('Zoom intercepted') });
  elements['#gallery'].listeners.keydown({ key: 'Escape', target: elements['#gallery'], preventDefault() {} });
  tick(400);
  tick(800);
  assert.equal(elements['.portfolio'].hidden, false);
  assert.equal(elements['#gallery'].hidden, true);
  assert.equal(elements['.rail'].scrollLeft, railPosition);
  assert.equal(menu.children[1].focused, true);
  tick();
  assert.ok(elements['.rail'].scrollLeft > railPosition);
});

test('Index remains available with one project and reduced motion responds directly to keys', async () => {
  const data = structuredClone(seed);
  data.projects.slice(1).forEach(project => { project.published = 0; });
  const { elements, tick } = await mount(data, true);
  elements['.menu'].children[1].listeners.click();
  tick();
  const tile = elements['#field'].children[0];
  const before = tile.style['--y'];
  elements['#gallery'].listeners.keydown({ key: 'ArrowDown', target: elements['#gallery'], preventDefault() {} });
  tick();
  assert.notEqual(tile.style['--y'], before);
  assert.equal(tile.style['--rotation'], '0.00deg');
  elements['.menu'].children[0].listeners.click();
  assert.equal(elements['.portfolio'].hidden, false);
});


test('Index grows with viewport width and keeps displayed image sides within 800px in motion', async () => {
  const data = structuredClone(seed);
  data.images[0].aspect_ratio = 0.08;
  const sizes = [];
  for (const width of [320, 1920, 7680]) {
    const { elements, tick } = await mount(data, false, 310, width);
    elements['.menu'].children[1].listeners.click();
    tick(400);
    sizes.push(elements['#field'].children.length);
    const assertCap = () => {
      for (const tile of elements['#field'].children) {
        const longest = Math.max(parseFloat(tile.style['--width']), parseFloat(tile.style['--height']));
        assert.ok(longest * Number(tile.style['--scale']) <= 800, `Image exceeds cap at viewport ${width}`);
      }
    };
    tick(); assertCap();
    elements['#gallery'].listeners.wheel({ deltaY: 400, deltaMode: 0, preventDefault() {} });
    for (let frame = 0; frame < 60; frame++) { tick(16); assertCap(); }
  }
  assert.ok(sizes[1] > sizes[0]);
  assert.ok(sizes[2] > sizes[1]);
});


test('menu transitions defer the switch, accept the latest choice, and clear motion', async () => {
  const { elements, tick } = await mount();
  const menu = elements['.menu'];
  const portfolio = elements['.portfolio'];
  const index = elements['#gallery'];
  const rail = elements['.rail'];
  const position = rail.scrollLeft;
  const thumbnail = elements['.track'].children[0].children[0].src;
  menu.children[1].listeners.click();
  assert.ok(portfolio.classes.has('page-out'));
  assert.equal(portfolio.inert, true);
  tick(300);
  assert.equal(rail.scrollLeft, position);
  assert.equal(elements['.track'].children[0].children[0].src, thumbnail);
  // A quick second click wins without briefly opening Index.
  menu.children[3].listeners.click();
  tick(100);
  assert.equal(rail.scrollLeft, position);
  assert.equal(portfolio.hidden, true);
  assert.equal(elements['#studio-detail'].hidden, false);
  assert.ok(elements['#studio-detail'].classes.has('page-in'));
  assert.equal(elements['#studio-detail'].inert, false);
  tick(800);
  assert.ok(!elements['#studio-detail'].classes.has('page-in'));
  menu.children[1].listeners.click();
  tick(400);
  assert.equal(index.hidden, false);
  assert.ok(index.classes.has('page-in'));
  // Returning during entrance replaces the animation and restores the rail.
  menu.children[0].listeners.click();
  assert.ok(index.classes.has('page-out-back'));
  assert.equal(index.style['--page-exit-opacity'], '.5');
  assert.equal(index.style['--page-exit-transform'], 'matrix(1, 0, 0, 1, 12, 0)');
  tick(400);
  assert.equal(index.hidden, true);
  assert.ok(portfolio.classes.has('page-in-back'));
  tick(800);
  assert.ok(!portfolio.classes.has('page-in-back'));
  assert.equal(rail.scrollLeft % 310, 0);
});

test('Index always opens the two-axis field with fixed 2px corners', async () => {
  const { elements, tick } = await mount(seed, true);
  elements['.menu'].children[1].listeners.click();
  tick();
  const gallery = elements['#gallery'];
  const snapshot = () => elements['#field'].children.map(tile => [tile.style['--x'], tile.style['--y']]);
  assert.equal(elements['#field'].style['--orbit-radius'], '2px');
  const initial = snapshot();
  gallery.listeners.wheel({ deltaX: 75, deltaY: 0, deltaMode: 0, preventDefault() {} });
  tick();
  assert.notDeepEqual(snapshot().map(tile => tile[0]), initial.map(tile => tile[0]));
  let before = snapshot();
  gallery.listeners.wheel({ shiftKey: true, deltaX: 0, deltaY: 100, deltaMode: 0, preventDefault() {} });
  tick();
  assert.notDeepEqual(snapshot().map(tile => tile[0]), before.map(tile => tile[0]));
  before = snapshot();
  gallery.listeners.keydown({ key: 'ArrowLeft', target: gallery, preventDefault() {} }); tick();
  assert.notDeepEqual(snapshot().map(tile => tile[0]), before.map(tile => tile[0]));
  before = snapshot();
  gallery.listeners.pointerdown({ pointerType: 'touch', pointerId: 1, target: gallery, clientX: 50, clientY: 50 });
  gallery.listeners.pointermove({ pointerId: 1, clientX: 150, clientY: 120 }); tick();
  assert.notDeepEqual(snapshot().map(tile => tile[0]), before.map(tile => tile[0]));
  assert.notDeepEqual(snapshot().map(tile => tile[1]), before.map(tile => tile[1]));
  gallery.listeners.pointercancel({ pointerId: 1, type: 'pointercancel' });
  assert.equal(gallery.capturedPointer, null);
});

test('Infinite field recycles in every direction, fills the viewport and keeps the image cap', async () => {
  const data = structuredClone(seed);
  data.images[0].aspect_ratio = 0.08;
  for (const reduced of [true, false]) {
    const { elements, tick } = await mount(data, reduced, 310, 1920);
    elements['.menu'].children[1].listeners.click(); tick(400);
    const gallery = elements['#gallery'];
    for (const sign of [-1, 1]) {
      gallery.listeners.wheel({ deltaX: sign * 1000000, deltaY: sign * 1000000, deltaMode: 0, preventDefault() {} });
      for (let frame = 0; frame < 20; frame++) {
        tick(16);
        for (const tile of elements['#field'].children) {
          const longest = Math.max(parseFloat(tile.style['--width']), parseFloat(tile.style['--height']));
          assert.ok(longest * Number(tile.style['--scale']) <= 800);
          assert.ok(Number.isFinite(parseFloat(tile.style['--x'])));
          assert.ok(Number.isFinite(parseFloat(tile.style['--y'])));
        }
      }
      const visible = elements['#field'].children.filter(tile => Number(tile.style['--opacity']) > 0.05);
      assert.ok(visible.length > 6, 'Field stays populated after crossing many cycles');
      assert.ok(new Set(visible.map(tile => tile.style['--scale'])).size > 3, 'Center lens varies image scale');
    }
    gallery.listeners.wheel({ ctrlKey: true, preventDefault() { assert.fail('Pinch zoom intercepted'); } });
  }
});

test('field settles after input and stops rewriting stationary styles', async () => {
  const { elements, tick } = await mount();
  elements['.menu'].children[1].listeners.click(); tick(400); tick(800);
  elements['#gallery'].listeners.wheel({ deltaX: 60, deltaY: 40, deltaMode: 0, preventDefault() {} });
  for (let frame = 0; frame < 900; frame++) tick(16);
  const tiles = elements['#field'].children;
  const writes = tiles.map(tile => tile.style.writes);
  for (let frame = 0; frame < 120; frame++) tick(16);
  assert.deepEqual(tiles.map(tile => tile.style.writes), writes);
});

test('field coasting and settling remain consistent at 60Hz and 120Hz', async () => {
  const runs = [];
  for (const interval of [1000 / 60, 1000 / 120]) {
    const { elements, tick } = await mount();
    elements['.menu'].children[1].listeners.click(); tick(400); tick(800);
    for (let elapsed = 0; elapsed < 1000; elapsed += interval) tick(interval);
    elements['#gallery'].listeners.wheel({ deltaX: 80, deltaY: 60, deltaMode: 0, preventDefault() {} });
    for (let frame = 0; frame < Math.round(1500 / interval); frame++) tick(interval);
    runs.push(elements['#field'].children.map(tile => ({
      x: parseFloat(tile.style['--x']), y: parseFloat(tile.style['--y']), scale: Number(tile.style['--scale']),
    })));
  }
  for (let index = 0; index < runs[0].length; index++) {
    assert.ok(Math.abs(runs[0][index].x - runs[1][index].x) < 1);
    assert.ok(Math.abs(runs[0][index].y - runs[1][index].y) < 1);
    assert.ok(Math.abs(runs[0][index].scale - runs[1][index].scale) < .002);
  }
});


test('stationary Index frames keep identical tile styles without repeated DOM writes', async () => {
  const { elements, tick } = await mount(seed, true);
  elements['.menu'].children[1].listeners.click(); tick();
  assert.equal(elements['#field'].style['--orbit-radius'], '2px');
  const tiles = elements['#field'].children;
  const before = tiles.map(tile => tile.style.writes);
  const gallery = elements['#gallery'];
  gallery.listeners.pointerdown({ pointerType: 'touch', pointerId: 1, target: gallery, clientX: 50, clientY: 50 });
  for (let frame = 0; frame < 10; frame++) tick(16);
  assert.deepEqual(tiles.map(tile => tile.style.writes), before);
  gallery.listeners.pointercancel({ pointerId: 1, type: 'pointercancel' });
});


test('both Index URLs open the field and browser history restores the view', async () => {
  const { elements, listeners, location, tick } = await mount(seed, false, 310, 1000, '#index/field');
  assert.equal(elements['.portfolio'].hidden, true);
  assert.equal(elements['#gallery'].hidden, false);
  assert.equal(elements['#field'].style['--orbit-radius'], '2px');
  assert.equal(elements['.menu'].children[1].attrs['aria-current'], 'true');
  elements['.menu'].children[0].listeners.click(); tick(400);
  assert.equal(location.hash, '');
  assert.equal(elements['.portfolio'].hidden, false);
  location.hash = '#index/field'; listeners.hashchange();
  assert.equal(elements['#gallery'].hidden, false);
  location.hash = '#index'; listeners.hashchange();
  assert.equal(elements['#gallery'].hidden, false);
  assert.equal(location.hash, '#index/field');
});

test('legacy Index links, unknown fragments and empty CMS content stay usable', async () => {
  const vertical = await mount(seed, true, 310, 1000, '#index');
  assert.equal(vertical.elements['#gallery'].hidden, false);
  assert.equal(vertical.location.hash, '#index/field');
  const unknown = await mount(seed, false, 310, 1000, '#unknown');
  assert.notEqual(unknown.elements['.portfolio'].hidden, true);
  const empty = await mount({ projects: [], images: [], settings: {} }, false, 310, 1000, '#index/field');
  assert.equal(empty.elements['#status'].textContent, 'No published projects yet.');
});


test('rail drifts continuously, hover approaches stillness, and reduced motion disables drift', async () => {
  const { elements, tick } = await mount();
  const rail = elements['.rail'];
  const initial = rail.scrollLeft;
  for (let frame = 0; frame < 10; frame++) tick();
  assert.ok(Math.abs(rail.scrollLeft - initial - 10) < .01);
  rail.listeners.pointerenter({ pointerType: 'mouse' });
  for (let frame = 0; frame < 25; frame++) tick();
  const hovered = rail.scrollLeft;
  for (let frame = 0; frame < 10; frame++) tick();
  assert.ok(rail.scrollLeft - hovered < 1);
  rail.listeners.pointerleave();
  for (let frame = 0; frame < 10; frame++) tick();
  assert.ok(rail.scrollLeft - hovered > 6 && rail.scrollLeft - hovered < 11);
  const reduced = await mount(seed, true);
  const stationary = reduced.elements['.rail'].scrollLeft;
  for (let frame = 0; frame < 100; frame++) reduced.tick();
  assert.equal(reduced.elements['.rail'].scrollLeft, stationary);
});

test('the fixed thumbnail becomes the hero; detail pauses the rail and Escape restores it', async () => {
  const { elements, tick, location } = await mount(seed, true);
  const rail = elements['.rail'];
  const position = rail.scrollLeft;
  const tile = elements['.track'].children[12];
  tile.listeners.click();
  assert.equal(elements['#project-detail'].hidden, false);
  assert.equal(elements['.portfolio'].hidden, true);
  assert.equal(elements['.project-hero'].src, normalizePortfolio(seed)[0].images[0].url);
  assert.equal(elements['.project-grid'].children.length, 2);
  assert.match(location.hash, /^#project\//);
  tick(5000);
  assert.equal(rail.scrollLeft, position);
  elements['#project-detail'].listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(elements['#project-detail'].hidden, true);
  assert.equal(elements['.portfolio'].hidden, false);
  assert.equal(location.hash, '');
  assert.equal(rail.scrollLeft, position);
  assert.equal(tile.focused, true);
});

test('project links reload the selected image and browser Back restores the gallery', async () => {
  const project = normalizePortfolio(seed)[0];
  const hash = `#project/${project.slug}/${project.images[2].id}`;
  const { elements, location, listeners } = await mount(seed, true, 310, 1000, hash);
  assert.equal(elements['.project-hero'].src, project.images[2].url);
  assert.equal(elements['.portfolio'].hidden, true);
  location.hash = ''; listeners.hashchange();
  assert.equal(elements['.portfolio'].hidden, false);
  assert.equal(elements['#project-detail'].hidden, true);
});

test('saved image positions use seven columns and invalid placements fall back inside the grid', () => {
  assert.deepEqual(imagePlacement({ id: 'one' }, 0, { one: { column: 2, span: 5, row: 12 } }), { column: 2, span: 5, row: 12 });
  for (const placement of [{ column: 7, span: 7, row: -10 }, { column: 0, span: 99, row: 2000 }]) {
    const value = imagePlacement({ id: 'one' }, 0, { one: placement });
    assert.ok(value.column >= 1 && value.column + value.span <= 8 && value.row >= 1 && value.row <= 1000);
  }
});


test('mobile menu opens on demand, dismisses with Escape and collapses after navigation', async () => {
  const { elements, listeners } = await mount(seed, true);
  const trigger = elements['.mobile-menu-trigger'];
  const menu = elements['.menu'];
  trigger.listeners.click();
  assert.equal(trigger.attrs['aria-expanded'], 'true');
  assert.ok(menu.classes.has('mobile-menu-open'));
  listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(trigger.attrs['aria-expanded'], 'false');
  assert.equal(trigger.focused, true);
  trigger.listeners.click();
  menu.children[1].listeners.click();
  menu.listeners.click();
  assert.equal(trigger.attrs['aria-expanded'], 'false');
  assert.equal(elements['#gallery'].hidden, false);
});


test('navigation has four destinations, and number hover chooses varying shapes', async () => {
  const { elements, tick } = await mount(seed, true);
  const menu = elements['.menu'].children;
  assert.equal(menu.length, 4);
  assert.equal(menu[3].children[1].textContent, 'About');
  for (let frame = 0; frame < 60; frame++) tick();
  assert.equal(menu[0].attrs['aria-current'], 'true');
  menu[1].listeners.pointerenter();
  const shape = menu[1].dataset.hoverShape;
  assert.ok(['triangle', 'square', 'circle'].includes(shape));
  menu[1].listeners.pointerenter();
  assert.notEqual(menu[1].dataset.hoverShape, shape);
  menu[1].listeners.click();
  const selected = menu[1].dataset.hoverShape;
  menu[1].listeners.pointerenter();
  assert.equal(menu[1].dataset.hoverShape, selected);
  menu[0].listeners.click();
  assert.equal(menu[0].attrs['aria-current'], 'true');
});


test('idle rail moves at 10px per second across normal and sparse animation frames', async () => {
  for (const interval of [1000 / 60, 100, 1000]) {
    const { elements, tick } = await mount();
    const rail = elements['.rail'];
    const initial = rail.scrollLeft;
    const frames = Math.round(10000 / interval);
    for (let frame = 0; frame < frames; frame++) tick(interval);
    assert.ok(Math.abs(rail.scrollLeft - initial - 100) < .01);
  }
});

const settle = () => new Promise(resolve => setImmediate(resolve));

test('native transitions name only the clicked repeated image and restore history, focus and scroll', async () => {
  const { elements, transitions, document, history, location, tick } = await mount(seed, false, 310, 1000, '', true);
  const tile = elements['.track'].children[12];
  const rail = elements['.rail'];
  rail.scrollLeft += 37.25;
  const position = rail.scrollLeft;
  tile.listeners.click();
  assert.equal(transitions.length, 1);
  assert.equal(tile.children[0].style.viewTransitionName, 'project-image');
  assert.equal(elements['.track'].children.filter(item => item.children[0].style.viewTransitionName === 'project-image').length, 1);
  await transitions[0].ready;
  assert.equal(elements['.project-hero'].style.viewTransitionName, 'project-image');
  assert.equal(tile.children[0].style.viewTransitionName, '');
  assert.equal(elements['.portfolio'].hidden, true);
  tick(1000);
  assert.equal(rail.scrollLeft, position);
  transitions[0].finish(); await settle();
  assert.equal(elements['.project-hero'].style.viewTransitionName, '');
  assert.equal(document.documentElement.classes.has('project-transitioning'), false);
  elements['#project-detail'].listeners.keydown({ key: 'Escape', preventDefault() {} });
  await transitions[1].ready;
  assert.equal(location.hash, '');
  assert.equal(elements['#project-detail'].hidden, true);
  assert.equal(tile.children[0].style.viewTransitionName, 'project-image');
  assert.equal(tile.focused, true);
  assert.equal(rail.scrollLeft, position);
  transitions[1].finish(); await settle();
  history.forward(); await transitions[2].ready;
  assert.equal(elements['#project-detail'].hidden, false);
  assert.equal(elements['.project-hero'].src, tile.children[0].src);
  transitions[2].finish(); await settle();
});

test('a new menu destination safely skips an active project transition', async () => {
  const { elements, transitions, tick, location, document } = await mount(seed, false, 310, 1000, '', true);
  elements['.track'].children[12].listeners.click();
  await transitions[0].ready;
  elements['.menu'].children[1].listeners.click();
  await settle();
  assert.equal(transitions.length, 2);
  await transitions[1].ready;
  assert.equal(elements['#project-detail'].hidden, true);
  assert.equal(elements['#gallery'].hidden, false);
  assert.equal(location.hash, '#index/field');
  transitions[1].finish(); await settle(); tick();
  assert.equal(document.documentElement.classes.has('project-transitioning'), false);
  assert.equal(elements['.project-hero'].style.viewTransitionName, '');
});

test('reduced motion avoids the native transition API and Project Info reflects CMS copy', async () => {
  const { elements, transitions } = await mount(seed, true, 310, 1000, '', true);
  elements['.track'].children[12].listeners.click();
  assert.equal(transitions.length, 0);
  const [identity, categories, toggle, description] = elements['.project-detail-info'].children;
  assert.ok(identity.children.length > 0 && categories.children.length > 0);
  assert.equal(description.textContent, normalizePortfolio(seed)[0].description);
  assert.equal(description.hidden, true);
  toggle.listeners.click();
  assert.equal(description.hidden, false);
  assert.equal(toggle.attrs['aria-expanded'], 'true');
  toggle.listeners.click();
  assert.equal(description.hidden, true);
});

test('Index filters use CMS tags and each tile opens its own assigned project and image', async () => {
  const { elements, location, tick } = await mount(seed, true);
  elements['.menu'].children[1].listeners.click(); tick();
  const filter = elements['.index-filters'].children.find(button => button.textContent !== 'All');
  filter.listeners.click(); tick();
  assert.equal(filter.attrs['aria-pressed'], 'true');
  const allowed = normalizePortfolio(seed).flatMap(project => project.images.filter(image => image.tags.includes(filter.textContent)));
  assert.ok(elements['#field'].children.every(tile => allowed.some(image => image.url === tile.children[0].src)));
  const tile = elements['#field'].children[0];
  tile.listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(elements['.project-hero'].src, tile.children[0].src);
  assert.match(location.hash, /^#project\//);
  elements['#project-detail'].listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(elements['#gallery'].hidden, false);
  assert.equal(location.hash, '#index/field');
  assert.equal(filter.attrs['aria-pressed'], 'true');
});

test('About uses studio settings, supports history and preserves fractional gallery position', async () => {
  const { elements, location } = await mount(seed, true);
  const rail = elements['.rail'];
  rail.scrollLeft += 42.5;
  const position = rail.scrollLeft;
  elements['.menu'].children[3].listeners.click();
  assert.equal(elements['#studio-detail'].hidden, false);
  assert.equal(location.hash, '#about');
  assert.equal(elements['.studio-detail-copy'].children[1].textContent, seed.settings.about);
  elements['#studio-detail'].listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(elements['#studio-detail'].hidden, true);
  assert.equal(rail.scrollLeft, position);
  const direct = await mount(seed, true, 310, 1000, '#about');
  assert.equal(direct.elements['#studio-detail'].hidden, false);
});

test('automatic project rows show every supplied image once and fill incomplete final rows', () => {
  for (let count = 0; count < 32; count++) {
    const images = Array.from({ length: count }, (_, id) => ({ id }));
    const rows = projectRows(images);
    assert.deepEqual(rows.map(item => item.image), images);
    assert.ok(rows.every(item => item.span >= 3 && item.span <= 12 && item.ratio > 0 && [1, 2].includes(item.mobileSpan)));
  }
  assert.equal(projectRows([{ id: 1 }])[0].span, 12);
  assert.deepEqual(projectRows([{ id: 1 }, { id: 2 }]).map(item => item.span), [6, 6]);
});

test('a menu choice before the native snapshot callback still wins over the pending project', async () => {
  const { elements, transitions, location } = await mount(seed, false, 310, 1000, '', true);
  elements['.track'].children[12].listeners.click();
  elements['.menu'].children[1].listeners.click();
  await settle();
  assert.equal(transitions.length, 2);
  await transitions[1].ready;
  assert.equal(location.hash, '#index/field');
  assert.equal(elements['#project-detail'].hidden, true);
  assert.equal(elements['#gallery'].hidden, false);
  transitions[1].finish(); await settle();
});
