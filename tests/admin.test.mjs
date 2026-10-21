import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { imagePlacement, projectRows } from '../frontend/project-view.js';

function mount() {
  const elements = new Map();
  let document;
  class Element {
    constructor() {
      this.value = ''; this.hidden = true; this.checked = false;
      this.listeners = {}; this.attributes = {}; this.dataset = {}; this.style = {};
      this.classList = { toggle() {}, add() {}, remove() {} };
    }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    querySelectorAll() { return []; }
    querySelector() { return new Element(); }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    getBoundingClientRect() { return { top: 0, height: 62, bottom: 62 }; }
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.(); }
    reset() {}
    contains(target) { return target === this; }
  }
  document = {
    activeElement: null,
    documentElement: { classList: { add() {}, remove() {} } },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const calls = [];
  const context = vm.createContext({
    imagePlacement, projectRows, document, window: { addEventListener() {} }, Node: Element,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ authenticated: false }) };
    },
    setTimeout: () => 0, clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync(new URL('../backend/static/admin.js', import.meta.url), 'utf8').replace(/^import .*;\n/, ''), context);
  vm.runInContext(`state.data = {
    projects: [{ id: 'alpha', title: 'Alpha Studio' }, { id: 'beta', title: 'Béta & Co' }],
    images: [{ id: 'image', original_name: 'Photo', published: 1, archived: 0, aspect_ratio: 1.5, project_ids: ['alpha'], tag_ids: [] }],
    tags: [], settings: {}
  }`, context);
  return { context, elements, calls, document, Element, run: code => vm.runInContext(code, context) };
}

test('new and archived images open unpublished; existing published images stay checked', () => {
  const { elements, run } = mount();
  run('openImage()');
  assert.equal(elements.get('#image-published').checked, false);
  assert.equal(elements.get('#image-project-id').value, '');
  run('openImage(state.data.images[0])');
  assert.equal(elements.get('#image-published').checked, true);
  assert.equal(elements.get('#image-project-id').value, 'alpha');
  run('openImage({ ...state.data.images[0], archived: 1 })');
  assert.equal(elements.get('#image-published').checked, false);
});

test('project combobox filters names, selects with keyboard, clears and dismisses', () => {
  const { elements, document, run } = mount();
  run('openImage(state.data.images[0]); openProjectSelect()');
  const search = elements.get('#image-project-search');
  const panel = elements.get('#image-project-panel');
  const trigger = elements.get('#image-project-trigger');
  assert.equal(document.activeElement, search);
  search.value = 'BÉTA';
  search.listeners.input();
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.projectOptions.map(project => project.id))')), ['beta']);
  assert.match(elements.get('#image-project-options').innerHTML, /Béta &amp; Co/);
  search.listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(elements.get('#image-project-id').value, 'beta');
  assert.equal(panel.hidden, true);
  assert.equal(document.activeElement, trigger);
  run('openProjectSelect()');
  search.value = 'no matches';
  search.listeners.input();
  assert.equal(elements.get('#image-project-empty').hidden, false);
  search.listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(panel.hidden, false);
  assert.equal(elements.get('#image-project-id').value, 'beta');
  search.value = '';
  search.listeners.input();
  search.listeners.keydown({ key: 'ArrowDown', preventDefault() {} });
  search.listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(elements.get('#image-project-id').value, '');
  run('openProjectSelect()');
  let stopped = false;
  panel.listeners.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(panel.hidden, true);
  assert.equal(trigger.attributes['aria-expanded'], 'false');
});

test('saving visibility keeps publication and archive mutually exclusive', async () => {
  for (const published of [false, true]) {
    const { elements, calls, run } = mount();
    run('openImage(state.data.images[0]); refresh = async () => {};');
    elements.get('#image-published').checked = published;
    const submit = { disabled: false };
    await elements.get('#image-form').listeners.submit({ preventDefault() {}, submitter: submit });
    const request = calls.find(call => call.url === '/api/images/image');
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.published, published);
    assert.equal(payload.archived, !published);
    assert.equal(payload.aspect_ratio, 1.5);
    assert.deepEqual(payload.project_ids, ['alpha']);
    assert.equal(submit.disabled, false);
  }
});


test('project reorder saves all positions together and restores order on failure', async () => {
  const { run, calls, context } = mount();
  await run("saveProjectOrder(['beta', 'alpha'], 'beta')");
  const request = calls.find(call => call.url === '/api/projects/reorder');
  assert.deepEqual(JSON.parse(request.options.body), { project_ids: ['beta', 'alpha'] });
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.data.projects.map(project => [project.id, project.sort_order]))')), [['beta', 0], ['alpha', 10]]);
  assert.equal(run('state.reorderingProjects'), false);
  context.fetch = async () => { throw new Error('Offline'); };
  await run("saveProjectOrder(['alpha', 'beta'], 'alpha')");
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.data.projects.map(project => project.id))')), ['beta', 'alpha']);
  assert.equal(run('state.reorderingProjects'), false);
});

test('touch dragging changes project order, cancellation restores it and keyboard moves save', async () => {
  const { elements, Element, run } = mount();
  const body = elements.get('#project-table-body');
  const rows = ['alpha', 'beta'].map(id => {
    const row = new Element();
    row.dataset.projectRow = id;
    row.getBoundingClientRect = () => ({ top: rows.indexOf(row) * 66, height: 66 });
    const handle = new Element();
    handle.dataset.dragProject = id;
    handle.closest = () => row;
    handle.setPointerCapture = () => {};
    handle.hasPointerCapture = () => false;
    row.handle = handle;
    return row;
  });
  body.querySelectorAll = selector => selector === '[data-project-row]' ? rows : rows.map(row => row.handle);
  body.insertBefore = (row, before) => {
    rows.splice(rows.indexOf(row), 1);
    rows.splice(before ? rows.indexOf(before) : rows.length, 0, row);
  };
  const event = (key, y) => ({ target: { closest: () => rows.find(row => row.dataset.projectRow === 'alpha').handle }, key, clientY: y, pointerId: 1, button: 0, isPrimary: true, preventDefault() {} });
  // Keep pointer movement clear of viewport autoscroll thresholds.
  run('innerHeight = 500; window.scrollBy = () => {};');
  body.listeners.pointerdown(event(null, 33));
  body.listeners.pointermove(event(null, 120));
  assert.deepEqual(rows.map(row => row.dataset.projectRow), ['beta', 'alpha']);
  body.listeners.pointercancel();
  assert.equal(run('state.projectDrag'), null);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.data.projects.map(project => project.id))')), ['alpha', 'beta']);
  body.listeners.keydown(event('ArrowDown'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.data.projects.map(project => project.id))')), ['beta', 'alpha']);
});

test('project layout drafts use the public hero, preserve saved placements and reset on reopen', () => {
  const { run, elements } = mount();
  run(`state.data.images.push(
    { id: 'second', url: '/second.jpg', original_name: 'Second', published: 1, archived: 0, project_ids: ['alpha'] },
    { id: 'draft', url: '/draft.jpg', published: 0, archived: 1, project_ids: ['alpha'] },
    { id: 'other', url: '/other.jpg', published: 1, archived: 0, project_ids: ['beta'] }
  ); state.data.images[0].url = '/hero.jpg';
  state.data.settings.project_layout = JSON.stringify({ second: { column: 2, span: 3, row: 8 } });
  openProject(state.data.projects[0]);`);
  assert.equal(run('layoutEditor.hero.id'), 'image');
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.images.map(image => image.id))')), ['second']);
  assert.equal(run('layoutEditor.custom'), true);
  assert.equal(run('layoutEditor.dirty'), false);
  assert.match(elements.get('#layout-page').innerHTML, /grid-column:2\/span 3;grid-row:8/);
  assert.match(elements.get('#layout-hidden-images').textContent, /1 nicht veröffentlichte/);
  elements.get('#layout-mode').listeners.click();
  assert.equal(run('layoutEditor.custom'), false);
  assert.equal(run('layoutEditor.dirty'), true);
  run('openProject(state.data.projects[0])');
  assert.equal(run('layoutEditor.custom'), true);
  assert.equal(run('layoutEditor.dirty'), false);
});

test('grid movement and resizing reject occupied cells and out-of-range placements', () => {
  const { run } = mount();
  run(`layoutEditor.placements = { a: { column: 1, span: 2, row: 1 }, b: { column: 4, span: 2, row: 1 } };`);
  assert.equal(run("canPlaceImage('a', { column: 2, span: 2, row: 1 })"), true);
  assert.equal(run("canPlaceImage('a', { column: 3, span: 2, row: 1 })"), false);
  assert.equal(run("canPlaceImage('a', { column: 4, span: 2, row: 2 })"), true);
  for (const placement of [{column:0,span:2,row:1}, {column:7,span:2,row:1}, {column:1,span:0,row:1}, {column:1,span:2,row:1001}, {column:1,span:2,row:0}]) {
    assert.equal(run(`canPlaceImage('a', ${JSON.stringify(placement)})`), false);
  }
});

test('project save includes a dirty layout in the same request and automatic reset sends an empty map', async () => {
  for (const custom of [true, false]) {
    const { run, elements, calls } = mount();
    run(`openProject(state.data.projects[0]); refresh = async () => {};
      layoutEditor.custom = ${custom}; layoutEditor.dirty = true;
      layoutEditor.placements = { image: { column: 3, span: 2, row: 5 } };`);
    await elements.get('#project-form').listeners.submit({ preventDefault() {}, submitter: { disabled: false } });
    const request = calls.find(call => call.url === '/api/projects');
    assert.deepEqual(JSON.parse(request.options.body).image_layouts, custom ? { image: { column: 3, span: 2, row: 5 } } : {});
    assert.equal(calls.filter(call => call.url === '/api/settings').length, 0);
  }
});

test('layout keyboard moves and resizes, while a cancelled drag leaves its draft unchanged', () => {
  const { run, elements, context } = mount();
  run(`layoutEditor.placements = { image: { column: 2, span: 2, row: 3 } };
    layoutEditor.selected = 'image'; renderLayoutEditor = () => {};`);
  const tile = { dataset: { layoutImage: 'image' } };
  const event = (key, shiftKey = false) => ({ key, shiftKey, target: { closest: selector => selector === '[data-layout-image]' ? tile : null }, preventDefault() {} });
  const page = elements.get('#layout-page');
  page.listeners.keydown(event('ArrowRight'));
  page.listeners.keydown(event('ArrowDown'));
  page.listeners.keydown(event('ArrowRight', true));
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.placements.image)')), { column: 3, span: 3, row: 4 });
  context.cancelAnimationFrame = () => {};
  run(`layoutEditor.drag = { pointerId: 1, frame: 1, tile: { hasPointerCapture: () => false, classList: { remove() {} } }, grid: { querySelector: () => ({ hidden: false }) }, next: { column: 1, span: 1, row: 1 } }; finishLayoutDrag(false);`);
  assert.equal(run('layoutEditor.drag'), null);
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.placements.image)')), { column: 3, span: 3, row: 4 });
});

test('thumbnail picker auto-populates and changing the thumbnail preserves unsaved layout edits', () => {
  const { run, elements } = mount();
  run(`state.data.images[0].url = '/first.jpg';
    state.data.images.push({ id: 'second', original_name: 'Second', url: '/second.jpg', published: 1, archived: 0, project_ids: ['alpha'] });
    openProject(state.data.projects[0]);`);
  assert.equal(elements.get('#project-thumbnail').value, '');
  assert.equal(elements.get('#project-thumbnail-preview').src, '/first.jpg');
  run(`layoutEditor.custom = true; layoutEditor.dirty = true;
    layoutEditor.placements.second = { column: 2, span: 3, row: 9 };`);
  elements.get('#project-thumbnail').value = 'second';
  elements.get('#project-thumbnail').listeners.change();
  assert.equal(run('layoutEditor.hero.id'), 'second');
  assert.equal(run('layoutEditor.images[0].id'), 'image');
  assert.equal(run('layoutEditor.custom'), true);
  assert.equal(run('layoutEditor.dirty'), true);
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.retained.second)')), { column: 2, span: 3, row: 9 });
  assert.equal(elements.get('#project-thumbnail-preview').src, '/second.jpg');
  elements.get('#project-thumbnail').value = '';
  elements.get('#project-thumbnail').listeners.change();
  assert.equal(run('layoutEditor.hero.id'), 'image');
  assert.equal(run('layoutEditor.placements.second.row'), 9);
});

test('project editor replaces the main view, keeps Projects active and returns focus and scroll on back', () => {
  const { run, elements, document, context, Element } = mount();
  const sections = ['library', 'projects', 'project-editor'].map(view => Object.assign(new Element(), { dataset: { viewContent: view } }));
  const tabs = ['library', 'projects'].map(view => Object.assign(new Element(), { dataset: { view } }));
  document.querySelectorAll = selector => selector === '[data-view-content]' ? sections : selector === '[data-view]' ? tabs : [];
  const trigger = new Element(); trigger.isConnected = true;
  document.activeElement = trigger;
  const scrolls = [];
  context.window.scrollY = 320;
  context.window.scrollTo = options => scrolls.push(options.top);
  run('openProject(state.data.projects[0])');
  assert.equal(run('state.view'), 'project-editor');
  assert.deepEqual(sections.map(section => section.hidden), [true, true, false]);
  assert.equal(tabs[1].attributes['aria-selected'], 'true');
  assert.equal(elements.get('#project-editor-title').textContent, 'Alpha Studio');
  assert.equal(document.activeElement, elements.get('#project-editor-title'));
  assert.equal(elements.get('#image-dialog').open, undefined);
  run('layoutEditor.dirty = true');
  elements.get('#project-back').listeners.click();
  assert.equal(run('state.view'), 'projects');
  assert.deepEqual(sections.map(section => section.hidden), [true, false, true]);
  assert.equal(document.activeElement, trigger);
  assert.deepEqual(scrolls, [0, 320]);
  run('openProject(state.data.projects[0])');
  assert.equal(run('layoutEditor.dirty'), false);
  elements.get('#project-cancel').listeners.click();
  assert.equal(run('state.view'), 'projects');
});
