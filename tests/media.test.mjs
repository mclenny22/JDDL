import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function mount(reduced = false) {
  let intersection, mutation;
  const listeners = {};
  const motion = { matches: reduced, addEventListener: (type, callback) => { motion.change = callback; } };
  const document = {
    hidden: false, body: {}, addEventListener: (type, callback) => { listeners[type] = callback; },
    createElement: tag => ({
      tagName: tag.toUpperCase(), attrs: {}, isConnected: true, hiddenAncestor: false,
      plays: 0, pauses: 0, loads: 0,
      setAttribute(name, value) { this.attrs[name] = value; },
      getAttribute(name) { return name === 'src' ? this.src : this.attrs[name]; },
      closest() { return this.hiddenAncestor; },
      play() { this.plays++; return Promise.resolve(); },
      pause() { this.pauses++; }, load() { this.loads++; },
    }),
  };
  const context = vm.createContext({ document, matchMedia: () => motion,
    IntersectionObserver: class {
      constructor(callback) { intersection = callback; }
      observe() {} unobserve(item) { item.unobserved = true; }
    },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} },
  });
  vm.runInContext(fs.readFileSync(new URL('../frontend/media.js', import.meta.url), 'utf8').replaceAll('export function', 'function'), context);
  return { document, motion, listeners, create: (media, controls = false) => context.createMedia(media, 'Project', controls),
    visible: (target, isIntersecting) => intersection([{ target, isIntersecting }]), mutate: () => mutation() };
}

test('video copies load on visibility and pause offscreen, in hidden views and background tabs', () => {
  const app = mount();
  const video = app.create({ mime_type: 'video/mp4', url: '/clip.mp4', alt_text: 'Animated identity' });
  assert.equal(video.tagName, 'VIDEO');
  assert.equal(video.muted, true);
  assert.equal(video.loop, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.controls, false);
  assert.equal(video.attrs['aria-label'], 'Animated identity');
  assert.equal(video.src, undefined);
  app.visible(video, true);
  assert.equal(video.src, '/clip.mp4');
  assert.equal(video.plays, 1);
  app.visible(video, true);
  assert.equal(video.plays, 1);
  app.visible(video, false);
  assert.equal(video.pauses, 1);
  app.visible(video, true);
  video.hiddenAncestor = true; app.mutate();
  assert.equal(video.pauses, 2);
  video.hiddenAncestor = false; app.mutate();
  app.document.hidden = true; app.listeners.visibilitychange();
  assert.equal(video.pauses, 3);
  app.document.hidden = false; app.listeners.visibilitychange();
  assert.equal(video.plays, 4);
  video.isConnected = false; app.mutate();
  assert.equal(video.unobserved, true);
  const plays = video.plays;
  app.visible(video, true);
  assert.equal(video.plays, plays);
});

test('reduced motion leaves video paused with project controls and responds to preference changes', () => {
  const app = mount(true);
  const video = app.create({ mime_type: 'video/mp4', url: '/clip.mp4' }, true);
  app.visible(video, true);
  assert.equal(video.loads, 1);
  assert.equal(video.plays, 0);
  assert.equal(video.controls, true);
  app.motion.matches = false; app.motion.change();
  assert.equal(video.plays, 1);
  app.motion.matches = true; app.motion.change();
  assert.equal(video.pauses, 1);
  const photo = app.create({ mime_type: 'image/jpeg', url: '/photo.jpg' });
  assert.equal(photo.tagName, 'IMG');
  assert.equal(photo.src, '/photo.jpg');
  assert.equal(photo.alt, 'Project');
});


test('a video started manually with reduced motion still pauses when hidden', () => {
  const app = mount(true);
  const video = app.create({ mime_type: 'video/mp4', url: '/clip.mp4' }, true);
  app.visible(video, true);
  video.play();
  video.hiddenAncestor = true; app.mutate();
  assert.equal(video.pauses, 1);
});
