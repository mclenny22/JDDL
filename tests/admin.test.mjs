import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
    document, window: { addEventListener() {} }, Node: Element,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ authenticated: false }) };
    },
    setTimeout: () => 0, clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync(new URL('../backend/static/admin.js', import.meta.url), 'utf8'), context);
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
