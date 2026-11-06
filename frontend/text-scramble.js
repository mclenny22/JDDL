const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const scrambleDuration = 360;

export function scrambleGlyph(character, distance, extent, elapsed) {
  const age = elapsed - 180 * distance / (extent || 1);
  if (age < 0 || age >= 180 || !/[\p{L}\p{N}]/u.test(character)) return character;
  const index = Math.floor(Math.random() * glyphs.length);
  return glyphs[index] === character ? glyphs[(index + 1) % glyphs.length] : glyphs[index];
}

export function enableTextScramble(reducedMotion) {
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) return;
  const highlight = new Highlight();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let hovered = null;
  let overlay = null;
  let frame = 0;

  function clear() {
    cancelAnimationFrame(frame);
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
    if (!touch && hovered === node) return;
    const letters = [];
    let extent = 0;
    let onText = false;
    for (const { segment, index } of segmenter.segment(node.data)) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      const rect = range.getBoundingClientRect();
      if (rect.width && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) onText = true;
      if (!rect.width || !/[\p{L}\p{N}]/u.test(segment)) continue;
      const distance = Math.hypot(rect.left + rect.width / 2 - x, rect.top + rect.height / 2 - y);
      extent = Math.max(extent, distance);
      letters.push({ segment, range, distance });
    }
    if (!onText || !letters.length) { hovered = null; return; }
    hovered = node;
    clear();
    overlay = document.createElement('div');
    overlay.className = 'text-scramble-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const style = getComputedStyle(parent);
    overlay.style.fontFamily = style.fontFamily;
    overlay.style.fontSize = style.fontSize;
    overlay.style.fontWeight = style.fontWeight;
    overlay.style.fontStyle = style.fontStyle;
    overlay.style.color = style.color;
    document.body.append(overlay);
    CSS.highlights.set('scrambled-text', highlight);
    const started = performance.now();
    let lastFrame = -1;
    function render(now) {
      const elapsed = now - started;
      if (elapsed >= scrambleDuration || !node.isConnected || reducedMotion.matches) { clear(); return; }
      const currentFrame = Math.floor(elapsed / 35);
      if (lastFrame !== currentFrame) {
        lastFrame = currentFrame;
        const replacements = [];
        highlight.clear();
        for (const { segment, range, distance } of letters) {
          const glyph = scrambleGlyph(segment, distance, extent, elapsed);
          if (glyph === segment) continue;
          const rect = range.getBoundingClientRect();
          if (!rect.width) continue;
          const span = document.createElement('span');
          span.textContent = glyph;
          span.style.left = `${rect.left}px`;
          span.style.top = `${rect.top}px`;
          span.style.width = `${rect.width}px`;
          span.style.lineHeight = `${rect.height}px`;
          replacements.push(span);
          highlight.add(range);
        }
        overlay.replaceChildren(...replacements);
      }
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
  }

  document.addEventListener('pointermove', interact, { passive: true });
  document.addEventListener('pointerdown', interact, { passive: true });
  document.addEventListener('pointerleave', () => { hovered = null; });
  document.addEventListener('selectionchange', clear);
  window.addEventListener('resize', clear);
}
