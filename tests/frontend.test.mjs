import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizePortfolio, loadPortfolio } from '../frontend/projects.js';

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
    this.children = []; this.dataset = {}; this.style = { setProperty(name, value) { this[name] = value; } }; this.attrs = {};
    this.value = '72'; this.hidden = false;
    this.listeners = {}; this.scrollLeft = 0; this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      add: name => this.classes.add(name), remove: name => this.classes.delete(name),
    };
  }
  append(...elements) { elements.forEach(element => { element.parent = this; this.children.push(element); }); }
  focus() { this.focused = true; }
  closest() { return null; }
  replaceChildren(...elements) { this.children = []; elements.forEach(element => this.append(element)); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(key, callback) {
    const previous = this.listeners[key];
    this.listeners[key] = previous ? event => { previous(event); callback(event); } : callback;
  }
  get offsetLeft() { return Math.round(this.parent.children.indexOf(this) * this.step + 16); }
  getBoundingClientRect() { return { left: (this.parent?.children.indexOf(this) || 0) * this.step + 16, width: this.step - 10, height: 700, bottom: 100 }; }
  get firstElementChild() { return this.children[0]; }
  get clientWidth() { return 1000; }
  set innerHTML(value) { this.children = [new Element()]; }
  scrollTo({ left }) { this.scrollLeft = left; this.listeners.scroll?.(); }
  contains(element) { return element === this; }
}

async function mount(data = seed, reduced = false, step = 310, viewportWidth = 1000) {
  const selectors = ['.rail', '.track', '#project-title', '#project-copy', '.stories', '.about', '.menu', '#status', '.project-context', '.portfolio', '#gallery', '#field', '#chaos', '#chaos-value', '#viscosity', '#viscosity-value', '.masthead'];
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
    addEventListener: (key, callback) => { listeners[key] = callback; }, hidden: false,
  };
  const context = vm.createContext({
    console, document, performance: { now: () => time },
    loadPortfolio: async () => ({ projects: normalizePortfolio(data), settings: data.settings || {} }),
    matchMedia: () => ({ matches: reduced, addEventListener() {} }), Image: class extends Element { constructor() { super(step); } },
    ResizeObserver: class { observe() {} }, requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(new URL('../frontend/orbit.js', import.meta.url), 'utf8').replace('export function', 'function'), context);
  const source = fs.readFileSync(new URL('../frontend/app.js', import.meta.url), 'utf8')
    .replace("import { loadPortfolio } from './projects.js';", '')
    .replace("import { createOrbitGrid } from './orbit.js';", '');
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, listeners, tick: (delta = 100) => { time += delta; const pending = [...frames.values()]; frames.clear(); pending.forEach(frame => frame(time)); }, document };
}

test('only left project advances, CMS descriptions and bars follow selection', async () => {
  const { elements, tick } = await mount();
  const track = elements['.track'];
  const menu = elements['.menu'];
  assert.equal(track.children.length, 28);
  assert.equal(elements['#project-copy'].textContent, seed.projects[0].description);
  assert.equal(elements['.stories'].children.length, 3);
  assert.equal(elements['.about'].children[0].textContent, seed.settings.about.split(/\s+/)[0]);
  for (let index = 0; index < 45; index++) tick();
  assert.ok(track.children[0].children[1].classes.has('visible'));
  assert.ok(track.children[1].children[0].classes.has('visible'));
  elements['.rail'].listeners.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(elements['#project-title'].textContent, seed.projects[1].title);
  assert.equal(elements['.stories'].children.length, 10);
  for (let index = 0; index < 45; index++) tick();
  assert.ok(track.children[1].children[1].classes.has('visible'));
  assert.ok(track.children[0].children[1].classes.has('visible'));
  elements['.stories'].children[9].listeners.click();
  assert.ok(track.children[1].children[9].classes.has('visible'));
  for (let index = 0; index < 45; index++) tick();
  assert.ok(track.children[1].children[0].classes.has('visible'));
});

test('wheel glide snaps and loop rebase preserves project and motion', async () => {
  const { elements, listeners, tick } = await mount();
  const rail = elements['.rail'];
  let prevented = false;
  const wheel = delta => listeners.wheel({ ctrlKey: false, deltaX: 0, deltaY: delta,
    deltaMode: 0, target: rail, preventDefault: () => { prevented = true; } });
  const initial = rail.scrollLeft;
  wheel(120); tick(16);
  assert.ok(rail.scrollLeft > initial && rail.scrollLeft < initial + 120);
  for (let index = 0; index < 120; index++) tick(16);
  assert.equal(rail.scrollLeft, initial + 310);
  assert.ok(prevented);
  assert.ok(!rail.classes.has('gliding'));
  rail.scrollLeft = 1240 * 5 - 10; rail.listeners.scroll();
  wheel(400);
  for (let index = 0; index < 120; index++) tick(16);
  assert.equal(rail.scrollLeft % 310, 0);
  assert.ok(rail.scrollLeft >= 1240 * 2 && rail.scrollLeft < 1240 * 5);
  rail.scrollLeft = 100; rail.listeners.scroll(); assert.equal(rail.scrollLeft, 2580);
  prevented = false;
  listeners.wheel({ ctrlKey: false, deltaX: 100, deltaY: 0, target: rail,
    preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  listeners.wheel({ ctrlKey: true, preventDefault: () => assert.fail('Zoom intercepted') });
});

test('reduced motion keeps manual galleries; empty data produces an empty state', async () => {
  const { elements, tick } = await mount(seed, true);
  for (let index = 0; index < 60; index++) tick();
  assert.ok(elements['.track'].children[0].children[0].classes.has('visible'));
  elements['.stories'].children[2].listeners.click();
  assert.ok(elements['.track'].children[0].children[2].classes.has('visible'));
  const empty = await mount({ projects: [], images: [], settings: {} });
  assert.equal(empty.elements['#status'].textContent, 'No published projects yet.');
  assert.equal(empty.elements['.project-context'].hidden, true);
});


test('fractional tile geometry aligns wheel, menu, story clicks and native settling', async () => {
  const step = 310.375;
  const { elements, listeners, tick } = await mount(seed, false, step);
  const rail = elements['.rail'];
  assert.equal(rail.scrollLeft, 12 * step);
  assert.equal(elements['.project-context'].style.width, `${step - 10}px`);
  rail.listeners.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(rail.scrollLeft, 13 * step);
  listeners.wheel({ ctrlKey: false, deltaX: 0, deltaY: 120, deltaMode: 0,
    target: rail, preventDefault() {} });
  for (let index = 0; index < 120; index++) tick(16);
  assert.equal(rail.scrollLeft, 14 * step);
  rail.scrollLeft += 1.5;
  rail.listeners.scrollend();
  assert.equal(rail.scrollLeft, 14 * step);
  rail.scrollLeft += 30;
  elements['.stories'].children[1].listeners.click();
  assert.equal(rail.scrollLeft, 14 * step);
  rail.scrollLeft = 5 * 4 * step - 10; rail.listeners.scroll();
  listeners.wheel({ ctrlKey: false, deltaX: 0, deltaY: 400, deltaMode: 0,
    target: rail, preventDefault() {} });
  for (let index = 0; index < 120; index++) tick(16);
  assert.equal(rail.scrollLeft % step, 0);
});

test('story progress uses actual fill width without scaling its rounded ends', async () => {
  const { elements, tick } = await mount();
  for (let index = 0; index < 22; index++) tick();
  tick(50);
  const fill = elements['.stories'].children[0].firstElementChild;
  assert.equal(fill.style.width, '50%');
  assert.equal(fill.style.transform, undefined);
});


test('saved CMS project order determines the landing project and its first visible image', async () => {
  const data = structuredClone(seed);
  const featured = data.projects[2];
  featured.sort_order = -20;
  const firstImage = data.images.find(image => image.project_ids.includes(featured.id) && image.published && !image.archived);
  const { elements } = await mount(data);
  assert.equal(elements['#project-title'].textContent, featured.title);
  const activeTile = elements['.track'].children.find(tile => tile.attrs['aria-hidden'] === 'false');
  assert.equal(activeTile.children[0].src, firstImage.url);
  assert.equal(activeTile.children[0].classes.has('visible'), true);
  featured.published = 0;
  const hidden = await mount(data);
  assert.equal(hidden.elements['#project-title'].textContent, normalizePortfolio(data)[0].title);
  featured.published = 1;
  data.images.filter(image => image.project_ids.includes(featured.id)).forEach(image => { image.archived = 1; });
  const empty = await mount(data);
  assert.equal(empty.elements['#project-title'].textContent, normalizePortfolio(data)[0].title);
});


test('Index opens the CMS-backed V2 grid, pauses galleries, and returns with progress intact', async () => {
  const { elements, listeners, tick } = await mount();
  const menu = elements['.menu'];
  for (let index = 0; index < 10; index++) tick();
  const fill = elements['.stories'].children[0].firstElementChild.style.width;
  const railPosition = elements['.rail'].scrollLeft;
  menu.children[1].listeners.click();
  assert.equal(elements['.portfolio'].hidden, true);
  assert.equal(elements['#gallery'].hidden, false);
  assert.equal(elements['#gallery'].focused, true);
  assert.equal(menu.children[1].attrs['aria-current'], 'true');
  const images = elements['#field'].children.map(tile => tile.children[0]);
  const publicURLs = new Set(normalizePortfolio(seed).flatMap(project => project.images.map(image => image.url)));
  assert.ok(images.length >= publicURLs.size);
  assert.ok(images.every(image => publicURLs.has(image.src)));
  for (let index = 0; index < 50; index++) tick();
  assert.equal(elements['.stories'].children[0].firstElementChild.style.width, fill);
  listeners.wheel({ ctrlKey: false, deltaY: 100, preventDefault: () => assert.fail('Hidden rail intercepted wheel') });
  elements['#gallery'].listeners.wheel({ ctrlKey: true, preventDefault: () => assert.fail('Zoom intercepted') });
  elements['#gallery'].listeners.keydown({ key: 'Escape', target: elements['#gallery'], preventDefault() {} });
  assert.equal(elements['.portfolio'].hidden, false);
  assert.equal(elements['#gallery'].hidden, true);
  assert.equal(elements['.rail'].scrollLeft, railPosition);
  assert.equal(menu.children[1].focused, true);
  tick();
  assert.notEqual(elements['.stories'].children[0].firstElementChild.style.width, fill);
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
    sizes.push(parseFloat(elements['#field'].children[1].style['--width']));
    const assertCap = () => {
      for (const tile of elements['#field'].children) {
        const longest = Math.max(parseFloat(tile.style['--width']), parseFloat(tile.style['--height']));
        assert.ok(longest * Number(tile.style['--scale']) <= 800, `Image exceeds cap at viewport ${width}`);
      }
    };
    tick(); assertCap();
    elements['#chaos'].value = '100';
    elements['#chaos'].listeners.input();
    elements['#gallery'].listeners.wheel({ deltaY: 400, deltaMode: 0, preventDefault() {} });
    for (let frame = 0; frame < 60; frame++) { tick(16); assertCap(); }
  }
  assert.ok(sizes[1] > sizes[0] * 5);
  assert.ok(sizes[2] > sizes[1] * 3);
});
