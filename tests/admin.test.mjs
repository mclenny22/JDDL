import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { imagePlacement, projectRows, automaticPlacements, projectComposition } from '../frontend/project-view.js';

function mount() {
  const elements = new Map();
  let document;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.value = ''; this.hidden = true; this.checked = false;
      this.listeners = {}; this.attributes = {}; this.dataset = {}; this.style = {};
      this.classList = { toggle() {}, add() {}, remove() {} };
    }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    replaceWith(replacement) {
      for (const [selector, element] of elements) if (element === this) elements.set(selector, replacement);
    }
    pause() { this.paused = true; }
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
      if (!elements.has(selector)) {
        const element = new Element(selector.endsWith('preview') ? 'img' : 'div');
        element.id = selector.slice(1); elements.set(selector, element);
      }
      return elements.get(selector);
    },
    createElement: tag => new Element(tag),
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const calls = [];
  const context = vm.createContext({
    imagePlacement, projectRows, automaticPlacements, projectComposition, document, window: { addEventListener() {} }, Node: Element,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ authenticated: false }) };
    },
    location: { hostname: '127.0.0.1' },
    URL: { createObjectURL: file => `blob:${file.name}`, revokeObjectURL() {} },
    FormData: class { constructor() { this.fields = new Map(); } append(key, value) { this.fields.set(key, value); } get(key) { return this.fields.get(key); } },
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
  assert.deepEqual(JSON.parse(run('JSON.stringify([...state.selectedProjects])')), ['alpha', 'beta']);
  assert.equal(panel.hidden, false);
  assert.equal(document.activeElement, search);
  run('openProjectSelect()');
  search.value = 'no matches';
  search.listeners.input();
  assert.equal(elements.get('#image-project-empty').hidden, false);
  search.listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(panel.hidden, false);
  assert.deepEqual(JSON.parse(run('JSON.stringify([...state.selectedProjects])')), ['alpha', 'beta']);
  search.value = '';
  search.listeners.input();
  run("selectProject('')");
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
  assert.match(elements.get('#layout-page').innerHTML, /grid-column:3\/span 5;grid-row:8/);
  assert.match(elements.get('#layout-hidden-images').textContent, /1 nicht veröffentlichte/);
  const admin = fs.readFileSync(new URL('../backend/static/admin.html', import.meta.url), 'utf8');
  assert.doesNotMatch(admin, /id="layout-mode"/);
});

test('grid movement and resizing reject occupied cells and out-of-range placements', () => {
  const { run } = mount();
  run(`layoutEditor.placements = { a: { column: 1, span: 2, row: 1 }, b: { column: 4, span: 2, row: 1 } };`);
  assert.equal(run("canPlaceImage('a', { column: 2, span: 2, row: 1 })"), true);
  assert.equal(run("canPlaceImage('a', { column: 3, span: 2, row: 1 })"), false);
  assert.equal(run("canPlaceImage('a', { column: 4, span: 2, row: 2 })"), true);
  for (const placement of [{column:0,span:2,row:1}, {column:12,span:2,row:1}, {column:1,span:0,row:1}, {column:1,span:2,row:1001}, {column:1,span:2,row:0}]) {
    assert.equal(run(`canPlaceImage('a', ${JSON.stringify(placement)})`), false);
  }
});

test('project save includes the project-specific twelve-column composition atomically', async () => {
  for (const custom of [true, false]) {
    const { run, elements, calls } = mount();
    run(`openProject(state.data.projects[0]); refresh = async () => {};
      layoutEditor.custom = ${custom}; layoutEditor.dirty = true;
      layoutEditor.placements = { image: { column: 3, span: 2, row: 5 } };`);
    await elements.get('#project-form').listeners.submit({ preventDefault() {}, submitter: { disabled: false } });
    const request = calls.find(call => call.url === '/api/projects');
    const composition = JSON.parse(request.options.body).composition;
    assert.equal(composition.manual, custom);
    assert.equal(composition.columns, 12);
    assert.deepEqual(composition.placements, { image: { column: 3, span: 2, row: 5 } });
    assert.equal(calls.filter(call => call.url === '/api/settings').length, 0);
  }
});

test('layout keyboard moves and resizes, while a cancelled drag leaves its draft unchanged', () => {
  const { run, elements, context } = mount();
  run(`layoutEditor.custom = true; layoutEditor.placements = { image: { column: 2, span: 2, row: 3 } };
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
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.placements.image)')), { column: 2, span: 3, row: 9 });
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

test('enabling the twelve-column editor retains automatic composition without adding empty rows', () => {
  const { run, elements } = mount();
  run(`state.data.images[0].url = '/hero.jpg';
    for (let i = 0; i < 7; i++) state.data.images.push({ id: 'layout-' + i, original_name: 'Image ' + i, url: '/image.jpg', published: 1, archived: 0, project_ids: ['alpha'] });
    openProject(state.data.projects[0]);`);
  const automatic = JSON.parse(run('JSON.stringify(layoutEditor.placements)'));
  run('ensureManualLayout(); renderLayoutEditor();');
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.placements)')), automatic);
  assert.equal(run('layoutEditor.rows'), 3);
  const markup = elements.get('#layout-page').innerHTML;
  assert.equal((markup.match(/data-layout-row=/g) || []).length, 3);
  assert.equal((markup.match(/data-insert-row=/g) || []).length, 4);
  assert.equal((markup.match(/class="layout-row is-empty"/g) || []).length, 0);
});

test('row insertion shifts later images once and persists a bottom empty row on save', async () => {
  const { run, elements, calls } = mount();
  run(`state.data.images[0].url = '/hero.jpg';
    state.data.images.push({ id: 'second', url: '/second.jpg', original_name: 'Second', published: 1, archived: 0, project_ids: ['alpha'] });
    openProject(state.data.projects[0]); refresh = async () => {};`);
  run('ensureManualLayout(); renderLayoutEditor();');
  run('insertLayoutRow(1)');
  assert.equal(run('layoutEditor.placements.second.row'), 2);
  assert.equal(run('layoutEditor.rows'), 2);
  run('insertLayoutRow(2)');
  assert.equal(run('layoutEditor.placements.second.row'), 3);
  assert.equal(run('layoutEditor.rows'), 3);
  run('insertLayoutRow(4)');
  assert.equal(run('layoutEditor.placements.second.row'), 3);
  assert.equal(run('layoutEditor.rows'), 4);
  await elements.get('#project-form').listeners.submit({ preventDefault() {}, submitter: { disabled: false } });
  const payload = JSON.parse(calls.find(call => call.url === '/api/projects').options.body);
  assert.equal(payload.composition.rows, 4);
  assert.equal(payload.composition.placements.second.row, 3);
  run('removeLayoutRow(2)');
  assert.equal(run('layoutEditor.placements.second.row'), 2);
  assert.equal(run('layoutEditor.rows'), 3);
  run('removeLayoutRow(2)');
  assert.equal(run('layoutEditor.rows'), 3); // Occupied rows cannot be deleted.
  run('layoutEditor.rows = 1000; insertLayoutRow(1)');
  assert.equal(run('layoutEditor.rows'), 1000);
  assert.equal(run('layoutEditor.placements.second.row'), 2);
});


test('dragging a row moves its assets and text together and keyboard reordering saves the draft order', async () => {
  const { run, elements, calls, context, Element } = mountLayout();
  run(`layoutEditor.custom = true; layoutEditor.composed = true; layoutEditor.rows = 3;
    layoutEditor.placements = { second: { column: 1, span: 4, row: 1, ratio: 2 }, third: { column: 1, span: 4, row: 3 } };
    layoutEditor.texts = { note: { column: 5, span: 8, row: 1, text: 'Note' } };
    renderLayoutEditor();`);
  const page = elements.get('#layout-page');
  assert.equal((page.innerHTML.match(/data-move-row=/g) || []).length, 3);
  const marker = new Element();
  const grip = new Element('button');
  grip.dataset.moveRow = '1';
  const grid = new Element();
  grid.querySelector = () => marker;
  grid.querySelectorAll = () => [0, 100, 200].map(top => ({
    getBoundingClientRect: () => ({ top, bottom: top + 90, height: 90 }),
  }));
  grip.closest = selector => selector === '[data-move-row]' ? grip : selector === '.layout-grid' ? grid : null;
  grip.setPointerCapture = grip.releasePointerCapture = () => {};
  grip.hasPointerCapture = () => true;
  context.requestAnimationFrame = () => 1;
  context.cancelAnimationFrame = () => {};
  const pointer = clientY => ({ target: grip, button: 0, pointerId: 1, clientX: 10, clientY });
  page.listeners.pointerdown(pointer(10));
  page.listeners.pointermove(pointer(275));
  assert.equal(marker.hidden, false);
  assert.equal(marker.style.top, '290px');
  assert.equal(run('layoutEditor.placements.second.row'), 1);
  page.listeners.pointercancel(pointer(275));
  assert.equal(marker.hidden, true);
  assert.equal(run('layoutEditor.dirty'), false);

  page.listeners.pointerdown(pointer(10));
  page.listeners.pointermove(pointer(275));
  page.listeners.pointerup(pointer(275));
  assert.equal(run('layoutEditor.placements.second.row'), 3);
  assert.equal(run('layoutEditor.texts.note.row'), 3);
  assert.equal(run('layoutEditor.placements.third.row'), 2);
  grip.dataset.moveRow = '3';
  page.listeners.keydown({ key: 'ArrowUp', target: grip, preventDefault() {} });
  await elements.get('#project-form').listeners.submit({ preventDefault() {}, submitter: { disabled: false } });
  const { composition } = JSON.parse(calls.find(call => call.url === '/api/projects').options.body);
  assert.deepEqual(composition.placements.second, { column: 1, span: 4, row: 2, ratio: 2 });
  assert.deepEqual(composition.texts.note, { column: 5, span: 8, row: 2, text: 'Note' });
  assert.equal(composition.placements.third.row, 3);
  assert.equal(composition.rows, 3);
});

test('MP4 upload previews and saves video dimensions with the existing publication and assignment fields', async () => {
  const { elements, calls, run } = mount();
  run(`openImage(); selectFile({ type: 'video/mp4', name: 'identity.mp4', size: 1024 });
    el.imagePreview.readyState = 1; el.imagePreview.videoWidth = 1920; el.imagePreview.videoHeight = 1080;
    state.selectedProjects.add('alpha'); refresh = async () => {};`);
  const preview = elements.get('#image-preview');
  assert.equal(preview.tagName, 'VIDEO');
  assert.equal(preview.controls, true);
  assert.equal(preview.src, 'blob:identity.mp4');
  elements.get('#image-published').checked = true;
  await elements.get('#image-form').listeners.submit({ preventDefault() {}, submitter: { disabled: false } });
  const form = calls.find(call => call.url === '/api/images').options.body;
  assert.equal(form.get('image').name, 'identity.mp4');
  assert.equal(Number(form.get('aspect_ratio')), 16 / 9);
  assert.equal(form.get('published'), 'true');
  assert.equal(form.get('project_ids'), '["alpha"]');
  run('openImage(state.data.images[0])');
  assert.equal(elements.get('#image-preview').tagName, 'IMG');
});

test('editing stages one replacement, discards it on cancel, and saves it with changed metadata', async () => {
  const { elements, calls, run } = mount();
  run('openImage()');
  assert.equal(elements.get('#replace-image-file').hidden, true);
  assert.equal(elements.get('#image-file').multiple, true);
  run('openImage(state.data.images[0]); refresh = async () => {};');
  const picker = elements.get('#image-file');
  assert.equal(elements.get('#replace-image-file').hidden, false);
  assert.equal(picker.multiple, false);
  const clip = { type: 'video/mp4', name: 'new.mp4', size: 1024 };
  picker.files = [clip, clip];
  picker.listeners.change();
  assert.equal(run('state.selectedFile'), null);
  assert.match(elements.get('#image-error').textContent, /genau eine Datei/);
  picker.files = [clip];
  picker.listeners.change();
  assert.match(elements.get('#upload-queue').textContent, /Neue Datei · new.mp4/);
  assert.equal(elements.get('#image-preview').src, 'blob:new.mp4');
  assert.equal(calls.some(call => call.url.startsWith('/api/images')), false);
  run('el.imageDialog.close(); openImage(state.data.images[0]);');
  assert.equal(run('state.selectedFile'), null);

  picker.listeners.change();
  run('el.imagePreview.readyState = 1; el.imagePreview.videoWidth = 1920; el.imagePreview.videoHeight = 1080;');
  elements.get('#image-alt').value = 'Updated description';
  await elements.get('#image-form').listeners.submit({ preventDefault() {}, submitter: { disabled: false } });
  const request = calls.find(call => call.url === '/api/images/image');
  assert.equal(request.options.method, 'PUT');
  assert.equal(request.options.body.get('image'), clip);
  assert.equal(Number(request.options.body.get('aspect_ratio')), 16 / 9);
  assert.equal(request.options.body.get('alt_text'), 'Updated description');
  for (const field of ['original_name', 'project_ids', 'tag_names', 'published']) {
    assert.equal(request.options.body.get(field), undefined);
  }
});

test('MP4 thumbnails and layout previews render video, and print selection excludes videos', () => {
  const { elements, run } = mount();
  run(`state.data.images[0].mime_type = 'video/mp4'; state.data.images[0].url = '/clip.mp4';
    openThumbnailPicker(state.data.projects[0]); openLayoutEditor(state.data.projects[0]); renderLayoutEditor();
    state.exportSelected.add('image');`);
  assert.equal(elements.get('#project-thumbnail-preview').tagName, 'VIDEO');
  assert.equal(elements.get('#project-thumbnail-preview').src, '/clip.mp4');
  assert.match(elements.get('#layout-page').innerHTML, /<video/);
  assert.equal(run('exportFilteredImages().length'), 0);
  assert.equal(run('selectedExportImages().length'), 0);
});

function mountExport() {
  const app = mount();
  app.run(`state.data.tags = [{ id: 'photo', name: 'Foto' }, { id: 'design', name: 'Design' }];
    state.data.projects.push({ id: 'empty', title: 'Ohne Bilder' });
    state.data.images = [
      { id: 'a-photo', original_name: 'Alpha Foto', url: '/alpha-photo.jpg', project_ids: ['alpha'], tag_ids: ['photo'] },
      { id: 'a-design', original_name: 'Alpha Design', url: '/alpha-design.jpg', project_ids: ['alpha'], tag_ids: ['design'], archived: 1 },
      { id: 'b-photo', original_name: 'Beta Foto', url: '/beta-photo.jpg', project_ids: ['beta'], tag_ids: ['photo'] },
      { id: 'free', original_name: 'Frei', url: '/free.jpg', project_ids: [], tag_ids: [] },
      { id: 'clip', original_name: 'Clip', url: '/clip.mp4', mime_type: 'video/mp4', project_ids: ['alpha'], tag_ids: ['photo'] }
    ]; renderExportFilters(); renderExportImages();`);
  return app;
}

test('export project dropdown scopes images and category counts, with OR category matching', () => {
  const { elements, run } = mountExport();
  const picker = elements.get('#export-project-filter');
  assert.match(picker.innerHTML, /Alle Projekte/);
  assert.match(picker.innerHTML, /Béta &amp; Co/);
  assert.match(picker.innerHTML, /Ohne Bilder/);
  assert.equal(run('exportFilteredImages().length'), 4);
  assert.match(elements.get('#export-tag-filters').innerHTML, /Foto <small>2<\/small>/);
  picker.value = 'alpha'; picker.listeners.change();
  assert.deepEqual(JSON.parse(run('JSON.stringify(exportFilteredImages().map(image => image.id))')), ['a-photo', 'a-design']);
  assert.match(elements.get('#export-tag-filters').innerHTML, /Foto <small>1<\/small>/);
  const tags = elements.get('#export-tag-filters');
  for (const id of ['photo', 'design']) {
    tags.listeners.change({ target: { closest: () => ({ checked: true, dataset: { exportTagId: id } }) } });
    assert.equal(run('exportFilteredImages().length'), id === 'photo' ? 1 : 2);
  }
  assert.equal(run('state.exportSelected.size'), 0);
  assert.equal(elements.get('#create-portfolio-button').disabled, true);
  picker.value = ''; picker.listeners.change();
  assert.equal(run('exportFilteredImages().length'), 3);
});

test('export keeps image choices across category changes but prunes them when switching projects', () => {
  const { elements, run } = mountExport();
  const picker = elements.get('#export-project-filter');
  const all = elements.get('#select-visible-images');
  all.listeners.click();
  assert.equal(run('state.exportSelected.size'), 4);
  picker.value = 'alpha'; picker.listeners.change();
  assert.deepEqual(JSON.parse(run('JSON.stringify([...state.exportSelected])')), ['a-photo', 'a-design']);
  elements.get('#export-table-body').listeners.change({ target: { closest: () => ({ checked: false, dataset: { exportImageId: 'a-design' } }) } });
  elements.get('#export-tag-filters').listeners.change({ target: { closest: () => ({ checked: true, dataset: { exportTagId: 'design' } }) } });
  assert.equal(run('state.exportSelected.has("a-photo")'), true);
  all.listeners.click();
  assert.equal(run('state.exportSelected.size'), 2);
  picker.value = 'beta'; picker.listeners.change();
  assert.equal(run('state.exportSelected.size'), 0);
  assert.equal(elements.get('#create-portfolio-button').disabled, true);
  assert.equal(all.disabled, true);
  assert.match(elements.get('#export-table-body').innerHTML, /Projekt- oder Kategoriefilter/);
  run('state.exportTags.clear()');
  picker.listeners.change(); all.listeners.click();
  assert.deepEqual(JSON.parse(run('JSON.stringify([...state.exportSelected])')), ['b-photo']);
  picker.value = ''; picker.listeners.change();
  assert.equal(run('state.exportSelected.size'), 1);
  elements.get('#clear-export-selection').listeners.click();
  assert.equal(elements.get('#export-selection-summary').textContent, '0 Bilder ausgewählt');
});

test('project export prints only explicitly chosen images in the selected project', () => {
  const { elements, context, run } = mountExport();
  context.URL = URL; context.location.origin = 'http://127.0.0.1:4174';
  let printed;
  context.window.open = () => ({ document: { open() {}, write(html) { printed = html; }, close() {} } });
  const picker = elements.get('#export-project-filter');
  picker.value = 'alpha'; picker.listeners.change();
  elements.get('#export-table-body').listeners.change({ target: { closest: () => ({ checked: true, dataset: { exportImageId: 'a-photo' } }) } });
  // Even stale selections cannot leak another project's images or videos into the PDF.
  run(`state.exportSelected.add('b-photo'); state.exportSelected.add('clip')`);
  elements.get('#create-portfolio-button').listeners.click();
  assert.match(printed, /alpha-photo\.jpg/);
  assert.doesNotMatch(printed, /alpha-design\.jpg|beta-photo\.jpg|clip\.mp4|free\.jpg/);
  assert.match(printed, /Alpha Studio/);
  assert.match(printed, /@page \{ size: A4 landscape/);
});

test('export refresh handles reassigned images and deleted or empty projects', async () => {
  const { elements, context, run } = mountExport();
  const picker = elements.get('#export-project-filter');
  picker.value = 'alpha'; picker.listeners.change();
  elements.get('#select-visible-images').listeners.click();
  run(`state.data.images[0].project_ids = ['beta']; renderAll()`);
  assert.deepEqual(JSON.parse(run('JSON.stringify([...state.exportSelected])')), ['a-design']);
  picker.value = 'empty'; picker.listeners.change();
  assert.equal(elements.get('#select-visible-images').disabled, true);
  assert.equal(elements.get('#create-portfolio-button').disabled, true);
  const payload = JSON.parse(run('JSON.stringify(state.data)'));
  payload.projects = payload.projects.filter(project => project.id !== 'empty');
  context.fetch = async () => ({ ok: true, json: async () => payload });
  await run('refresh()');
  assert.equal(run('state.exportProject'), '');
  assert.equal(picker.value, '');
  assert.equal(run('exportFilteredImages().length'), 4);
});

function mountLayout() {
  const app = mount();
  app.run(`state.data.images[0].url='/hero.jpg';
    state.data.images.push(
      {id:'second',url:'/second.jpg',original_name:'Second',published:1,archived:0,project_ids:['alpha'],aspect_ratio:1.5},
      {id:'third',url:'/third.mp4',mime_type:'video/mp4',original_name:'Third video',published:1,archived:0,project_ids:['alpha'],aspect_ratio:16/9},
      {id:'draft',url:'/draft.jpg',original_name:'Draft',published:0,archived:1,project_ids:['alpha']},
      {id:'other',url:'/other.jpg',original_name:'Other project',published:1,archived:0,project_ids:['beta']});
    openProject(state.data.projects[0]); refresh = async () => {};`);
  return app;
}

test('context asset picker scopes and searches project assets, cancels without changes and confirms a geometry-preserving swap', () => {
  const {run,elements}=mountLayout();
  const original=JSON.parse(run('JSON.stringify(layoutEditor.placements)'));
  run(`layoutEditor.selected='second'; openLayoutAssetPicker();`);
  const options=elements.get('#layout-asset-options');
  assert.match(options.innerHTML, /Third video/);
  assert.doesNotMatch(options.innerHTML, /Other project|Draft/);
  elements.get('#layout-asset-search').value='third';
  elements.get('#layout-asset-search').listeners.input();
  assert.match(options.innerHTML, /<video/);
  assert.doesNotMatch(options.innerHTML, /Second/);
  elements.get('#layout-asset-options').listeners.change({target:{name:'layout-asset',value:'third'}});
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.placements)')),original);
  elements.get('#layout-asset-dialog').close();
  assert.equal(run('layoutEditor.dirty'),false);
  assert.equal(run('layoutEditor.custom'),false);
  run(`openLayoutAssetPicker(); layoutEditor.picker.selectedId='third';`);
  elements.get('#layout-asset-form').listeners.submit({preventDefault(){}});
  assert.equal(elements.get('#layout-asset-dialog').open,false);
  const { ratio: secondCrop, ...secondSlot } = original.second;
  const { ratio: thirdCrop, ...thirdSlot } = original.third;
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.placements.third)')),secondSlot);
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.placements.second)')),thirdSlot);
  assert.equal(run('layoutEditor.custom'),true);
});

test('empty-column controls respect occupied cells and the edge of the twelve-column grid', () => {
  const {run,elements}=mountLayout();
  run(`layoutEditor.custom=true; layoutEditor.placements={second:{column:5,span:4,row:1,ratio:1}}; renderLayoutEditor();`);
  const cells=run('emptyLayoutCells(1)');
  assert.doesNotMatch(cells, /data-column="[5-8]"/);
  run('selectEmptyLayoutCell(1,11); openLayoutAssetPicker();');
  assert.deepEqual(JSON.parse(run('JSON.stringify(layoutEditor.empty)')),{row:1,column:11,span:2});
  run(`layoutEditor.picker.selectedId='third'`);
  elements.get('#layout-asset-form').listeners.submit({preventDefault(){}});
  assert.equal(run('layoutEditor.placements.third.column'),11);
  assert.equal(run('layoutEditor.placements.third.span'),2);
  assert.equal(run('layoutEditor.placements.third.ratio'),undefined);
  assert.equal(run('layoutEditor.rows'),1);
  assert.equal(run("applyLayoutAsset({kind:'slot',id:null,placement:{column:7,span:4,row:1}},'image')"),false);
  assert.equal(run('layoutEditor.hero.id'),'image');
});

test('the T tool adds and edits safe white text only after confirmation and removes it through the selection', async () => {
  const {run,elements,calls}=mountLayout();
  run(`layoutEditor.custom=true; layoutEditor.placements={}; selectEmptyLayoutCell(1,3); openLayoutTextEditor();`);
  elements.get('#layout-text-content').value='Discard me';
  elements.get('#layout-text-dialog').close();
  assert.equal(run('Object.keys(layoutEditor.texts).length'),0);
  assert.equal(run('layoutEditor.dirty'),false);
  run('openLayoutTextEditor();');
  elements.get('#layout-text-content').value='A note\n<unsafe>';
  elements.get('#layout-text-form').listeners.submit({preventDefault(){}});
  const id=run('layoutEditor.selected');
  assert.match(run("layoutToolbar('empty')"), /data-layout-action="text"/);
  for (const target of ['hero', 'second', id]) assert.doesNotMatch(run(`layoutToolbar('${target}')`), /data-layout-action="text"/);
  assert.match(elements.get('#layout-page').innerHTML,/A note\n&lt;unsafe&gt;/);
  assert.equal(run(`layoutEditor.texts[layoutEditor.selected].column`),3);
  const tile={dataset:{layoutImage:id}};
  const textButton={};
  elements.get('#layout-page').listeners.click({target:{closest:selector=>selector==='[data-layout-image]'?tile:selector==='.layout-move'?textButton:null}});
  assert.equal(elements.get('#layout-text-dialog').open,true);
  elements.get('#layout-text-content').value='Revised';
  elements.get('#layout-text-form').listeners.submit({preventDefault(){}});
  assert.equal(run('Object.keys(layoutEditor.texts).length'),1);
  assert.equal(run(`layoutEditor.texts[layoutEditor.selected].text`),'Revised');
  await elements.get('#project-form').listeners.submit({preventDefault(){},submitter:{disabled:false}});
  const saved=JSON.parse(calls.find(call=>call.url==='/api/projects').options.body).composition;
  assert.equal(saved.texts[id].text,'Revised');
  run(`layoutEditor.selected='${id}'; removeLayoutSelection();`);
  assert.equal(run('Object.keys(layoutEditor.texts).length'),0);
  assert.equal(run('layoutEditor.empty.column'),3);
});

test('hero toolbar swaps into the old slot and supports removal and restoration without changing the thumbnail', async () => {
  const {run,elements,calls}=mountLayout();
  run(`layoutEditor.selected='hero'; openLayoutAssetPicker(); layoutEditor.picker.selectedId='second';`);
  elements.get('#layout-asset-form').listeners.submit({preventDefault(){}});
  assert.equal(run('layoutEditor.hero.id'),'second');
  assert.equal(elements.get('#project-thumbnail').value,'');
  run(`removeLayoutSelection();`);
  assert.equal(run('layoutEditor.hero'),null);
  assert.equal(run('layoutEditor.heroHidden'),true);
  assert.match(elements.get('#layout-page').innerHTML,/Hero hinzufügen/);
  await elements.get('#project-form').listeners.submit({preventDefault(){},submitter:{disabled:false}});
  assert.equal(JSON.parse(calls.find(call=>call.url==='/api/projects').options.body).composition.hero_hidden,true);
  run(`layoutEditor.selected='hero'; openLayoutAssetPicker(); layoutEditor.picker.selectedId='image';`);
  elements.get('#layout-asset-form').listeners.submit({preventDefault(){}});
  assert.equal(run('layoutEditor.hero.id'),'image');
  assert.equal(run('layoutEditor.heroHidden'),false);
});

test('toolbar pointer and keyboard actions do not initiate image dragging or movement', () => {
  const {run,elements}=mountLayout();
  run(`layoutEditor.custom=true; layoutEditor.selected='second';`);
  const before=run('JSON.stringify(layoutEditor.placements)');
  const event={key:'ArrowRight',target:{closest:selector=>selector==='[data-layout-action]'?{}:null},button:0,preventDefault(){}};
  elements.get('#layout-page').listeners.pointerdown(event);
  elements.get('#layout-page').listeners.keydown(event);
  assert.equal(run('layoutEditor.drag'),null);
  assert.equal(run('JSON.stringify(layoutEditor.placements)'),before);
});

test('inline multi-edit targets the selection and sends only changed tag relations', async () => {
  const { run, elements, calls } = mount();
  run(`state.data.tags = [{id:'shared',name:'Shared'},{id:'alpha-only',name:'Alpha'}];
    state.data.images[0].tag_ids=['alpha-only'];
    state.data.images.push({...state.data.images[0],id:'second',tag_ids:['shared']});
    state.librarySelected = new Set(['image','second']); refresh = async () => {};`);
  const body = elements.get('#image-table-body');
  const trigger = {dataset:{imageId:'image',inlineField:'tag_ids'}};
  await body.listeners.click({target:{closest:selector=>selector==='[data-inline-field]'?trigger:null}});
  assert.equal(run("state.inlineEdit.mixed.has('shared')"), true);
  body.listeners.change({target:{matches:()=>false,closest:selector=>selector==='[data-inline-relation]'?{dataset:{inlineRelation:'shared'},checked:true}:null}});
  await body.listeners.click({target:{closest:selector=>selector==='[data-inline-save]'?{}:null}});
  const payload=JSON.parse(calls.find(call=>call.url==='/api/images/batch').options.body);
  assert.deepEqual(payload,{ids:['image','second'],changes:{add_tag_ids:['shared'],remove_tag_ids:[]}});
});

test('batch deletion confirms the full selection, keeps it on failure, and clears it after success', async () => {
  const { run, elements, calls, context, document } = mount();
  const trigger = elements.get('#library-delete-selection');
  const dialog = elements.get('#library-delete-dialog');
  const submit = () => elements.get('#library-delete-form').listeners.submit({ preventDefault() {} });
  run('updateLibrarySelection()');
  assert.equal(trigger.hidden, true);
  run(`state.data.images.push({ ...state.data.images[0], id: 'second', original_name: 'Video' });
    state.librarySelected = new Set(['image', 'second']);
    state.search = 'Photo';
    updateLibrarySelection();`);
  assert.equal(trigger.hidden, false);
  trigger.listeners.click();
  assert.equal(dialog.open, true);
  assert.match(elements.get('#library-delete-title').textContent, /2 Assets/);
  assert.match(elements.get('#library-delete-description').textContent, /Filter blendet 1 davon aus/);
  dialog.close();
  await submit();
  assert.equal(calls.some(call => call.url === '/api/images/batch-delete'), false);
  assert.equal(run('state.librarySelected.size'), 2);

  trigger.listeners.click();
  const originalFetch = context.fetch;
  context.fetch = async () => { throw new Error('Offline'); };
  await submit();
  assert.equal(dialog.open, true);
  assert.equal(elements.get('#library-delete-error').textContent, 'Offline');
  assert.equal(run('state.librarySelected.size'), 2);

  context.fetch = originalFetch;
  await submit();
  const requests = calls.filter(call => call.url === '/api/images/batch-delete');
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].options.body), { ids: ['image', 'second'] });
  assert.equal(dialog.open, false);
  assert.equal(trigger.hidden, true);
  assert.equal(run('state.librarySelected.size'), 0);
  assert.equal(run('state.data.images.length'), 0);
  assert.equal(document.activeElement, elements.get('#image-search'));
});

test('multi-upload uses one request per file and retries only files not yet uploaded', async () => {
  const { run, elements, calls, context } = mount();
  run(`openImage();
    selectFiles([{type:'image/png',name:'one.png',size:100},{type:'video/mp4',name:'two.mp4',size:100}]);
    mediaDimensions = async () => 1.5; fileDimensions = async () => 16/9; refresh = async () => {};`);
  const originalFetch = context.fetch;
  let failed = false;
  context.fetch = async (url, options) => {
    if (url === '/api/images' && options.body.get('image').name === 'two.mp4' && !failed) { failed=true; throw new Error('Connection lost'); }
    return originalFetch(url, options);
  };
  const submit = () => elements.get('#image-form').listeners.submit({preventDefault(){},submitter:{disabled:false}});
  await submit();
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.selectedFiles.map(file=>file.name))')), ['two.mp4']);
  await submit();
  const uploads=calls.filter(call=>call.url==='/api/images').map(call=>call.options.body);
  assert.deepEqual(uploads.map(form=>form.get('image').name), ['one.png','two.mp4']);
  assert.equal(Number(uploads[1].get('aspect_ratio')),16/9);
});

test('library selection survives rendering the other admin sections and export uses the selected project for shared assets', () => {
  const {run}=mount();
  run(`state.librarySelected.add('image'); state.data.images[0].project_ids=['alpha','beta']; state.exportProject='beta'; renderAll();`);
  assert.equal(run("state.librarySelected.has('image')"),true);
  assert.equal(run('groupedExportImages(state.data.images)[0].project.id'),'beta');
});
