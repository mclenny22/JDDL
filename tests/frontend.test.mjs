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
  constructor() {
    this.children = []; this.dataset = {}; this.style = {}; this.attrs = {};
    this.listeners = {}; this.scrollLeft = 0; this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      add: name => this.classes.add(name), remove: name => this.classes.delete(name),
    };
  }
  append(element) { element.parent = this; this.children.push(element); }
  replaceChildren(...elements) { this.children = []; elements.forEach(element => this.append(element)); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(key, callback) { this.listeners[key] = callback; }
  get offsetLeft() { return this.parent.children.indexOf(this) * 310 + 16; }
  get firstElementChild() { return this.children[0]; }
  get clientWidth() { return 1000; }
  set innerHTML(value) { this.children = [new Element()]; }
  scrollTo({ left }) { this.scrollLeft = left; this.listeners.scroll?.(); }
  contains(element) { return element === this; }
}

async function mount(data = seed, reduced = false) {
  const selectors = ['.rail', '.track', '#project-title', '#project-copy', '.stories', '.about', '.menu', '#status', '.project-context'];
  const elements = Object.fromEntries(selectors.map(selector => [selector, new Element()]));
  let frame;
  let time = 0;
  const listeners = {};
  const document = {
    querySelector: selector => elements[selector],
    createElement: () => new Element(), createTextNode: text => ({ textContent: text }),
    addEventListener: (key, callback) => { listeners[key] = callback; }, hidden: false,
  };
  const context = vm.createContext({
    console, document, performance: { now: () => time },
    loadPortfolio: async () => ({ projects: normalizePortfolio(data), settings: data.settings || {} }),
    matchMedia: () => ({ matches: reduced }), Image: Element,
    ResizeObserver: class { observe() {} }, requestAnimationFrame: callback => { frame = callback; },
  });
  const source = fs.readFileSync(new URL('../frontend/app.js', import.meta.url), 'utf8')
    .replace("import { loadPortfolio } from './projects.js';", '');
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, listeners, tick: (delta = 100) => { time += delta; frame?.(time); }, document };
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
  menu.children[1].listeners.click();
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
