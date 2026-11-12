const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const scrambleDuration = 360;
// A ripple front reaches its outer radius after rippleTravel ms; the letters it
// passes scramble for longer and more densely the closer they sit to its origin.
export const rippleTravel = 260;
export const rippleDuration = rippleTravel + 320;

function randomGlyph(character) {
  const index = Math.floor(Math.random() * glyphs.length);
  return glyphs[index] === character ? glyphs[(index + 1) % glyphs.length] : glyphs[index];
}

export function scrambleGlyph(character, distance, extent, elapsed) {
  const age = elapsed - 180 * distance / (extent || 1);
  if (age < 0 || age >= 180 || !/[\p{L}\p{N}]/u.test(character)) return character;
  return randomGlyph(character);
}

export function rippleStrength(distance, radius) {
  const t = distance / (radius || 1);
  return t >= 1 ? 0 : (1 - t) ** 1.6;
}

export function rippleGlyph(character, distance, radius, elapsed, random = Math.random) {
  const strength = rippleStrength(distance, radius);
  if (!strength || !/[\p{L}\p{N}]/u.test(character)) return character;
  const age = elapsed - rippleTravel * distance / radius;
  if (age < 0 || age >= 40 + 280 * strength) return character;
  // Weaker letters flicker only some of the time, so the ripple thins out.
  return random() < .2 + .8 * strength ? randomGlyph(character) : character;
}

export function enableTextScramble(reducedMotion) {
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) return;
  const highlight = new Highlight();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const ripples = [];
  const nodeIds = new WeakMap();
  let nextNodeId = 0;
  let hovered = null;
  let last = null;
  let overlay = null;
  let frame = 0;
  let lastFrame = -1;

  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    ripples.length = 0;
    highlight.clear();
    overlay?.remove();
    overlay = null;
  }

  function interact(event) {
    const touch = event.pointerType === 'touch';
    if (touch !== (event.type === 'pointerdown') || reducedMotion.matches || event.buttons && !touch) return;
    const { clientX: x, clientY: y, target } = event;
    const caret = document.caretPositionFromPoint?.(x, y);
    const node = caret?.offsetNode || document.caretRangeFromPoint?.(x, y)?.startContainer;
    const parent = node?.parentElement;
    if (node?.nodeType !== 3 || !target.contains(node) ||
        parent.closest('.menu, [contenteditable], textarea, input, select, svg')) {
      hovered = null;
      return;
    }
    const style = getComputedStyle(parent);
    const radius = Math.max(48, parseFloat(style.fontSize) * 7 || 98);
    // Drop a new ripple on entering a text node or after travelling half a radius.
    if (!touch && hovered === node && last && Math.hypot(x - last.x, y - last.y) < radius / 2) return;
    const letters = [];
    let onText = false;
    for (const { segment, index } of segmenter.segment(node.data)) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      const rect = range.getBoundingClientRect();
      if (rect.width && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) onText = true;
      if (!rect.width || !/[\p{L}\p{N}]/u.test(segment)) continue;
      const distance = Math.hypot(rect.left + rect.width / 2 - x, rect.top + rect.height / 2 - y);
      if (distance < radius) letters.push({ key: index, segment, range, distance });
    }
    if (!onText || !letters.length) { hovered = null; return; }
    hovered = node;
    last = { x, y };
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'text-scramble-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.append(overlay);
      CSS.highlights.set('scrambled-text', highlight);
    }
    if (!nodeIds.has(node)) nodeIds.set(node, ++nextNodeId);
    ripples.push({ node, id: nodeIds.get(node), letters, radius, started: performance.now(), font: {
      fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
      fontStyle: style.fontStyle, color: style.color,
    } });
    if (ripples.length > 6) ripples.shift();
    if (!frame) frame = requestAnimationFrame(render);
  }

  function render(now) {
    for (let index = ripples.length - 1; index >= 0; index--) {
      const ripple = ripples[index];
      if (now - ripple.started >= rippleDuration || !ripple.node.isConnected) ripples.splice(index, 1);
    }
    if (!ripples.length || reducedMotion.matches) { clear(); return; }
    const currentFrame = Math.floor(now / 35);
    if (lastFrame !== currentFrame) {
      lastFrame = currentFrame;
      const replacements = new Map();
      highlight.clear();
      for (const ripple of ripples) {
        const elapsed = now - ripple.started;
        for (const { key, segment, range, distance } of ripple.letters) {
          const id = `${ripple.id}:${key}`;
          if (replacements.has(id)) continue;
          const glyph = rippleGlyph(segment, distance, ripple.radius, elapsed);
          if (glyph === segment) continue;
          const rect = range.getBoundingClientRect();
          if (!rect.width) continue;
          const span = document.createElement('span');
          span.textContent = glyph;
          Object.assign(span.style, ripple.font, {
            left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, lineHeight: `${rect.height}px`,
          });
          replacements.set(id, span);
          highlight.add(range);
        }
      }
      overlay.replaceChildren(...replacements.values());
    }
    frame = requestAnimationFrame(render);
  }

  document.addEventListener('pointermove', interact, { passive: true });
  document.addEventListener('pointerdown', interact, { passive: true });
  document.addEventListener('pointerleave', () => { hovered = null; });
  document.addEventListener('selectionchange', clear);
  window.addEventListener('resize', clear);
}
