// Adapted from the archived Orbit Grid V2 center-lens motion study.
export function createOrbitGrid(projects) {
  const gallery = document.querySelector("#gallery");
  const field = document.querySelector("#field");
  const chaosControl = document.querySelector("#chaos");
  const chaosOutput = document.querySelector("#chaos-value");
  const viscosityControl = document.querySelector("#viscosity");
  const viscosityOutput = document.querySelector("#viscosity-value");
  let enabled = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const columns = 3;
  const gridWidthFraction = 0.8;
  const maximumImageSide = 800;
  const maximumLensScale = 1.68;
  const minimumGap = 10;
  const targetGap = minimumGap + 1.25;

  const sources = projects.flatMap(project => project.images.map(image => ({ ...image, projectTitle: project.title })));

  const rows = Math.max(16, Math.ceil(sources.length / columns));
  const state = {
    seed: 28117,
    width: 0,
    height: 0,
    planeWidth: 0,
    planeHeight: 0,
    cycleHeight: 0,
    unit: 0,
    cameraX: 0,
    cameraY: 0,
    velocityY: 0,
    pointerId: null,
    pointerY: 0,
    frame: 0,
    tiles: [],
  };

  function clamp(number, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, number));
  }

  function mix(start, end, amount) {
    return start + (end - start) * amount;
  }

  function smoothstep(start, end, input) {
    const progress = clamp((input - start) / (end - start), 0, 1);
    return progress * progress * (3 - 2 * progress);
  }

  function wrapAround(value, center, span) {
    return center + ((((value - center) % span) + span * 1.5) % span) - span / 2;
  }

  function chaosLevel() {
    return Number(chaosControl.value) / 100;
  }

  function updateChaosControl() {
    chaosOutput.value = `${chaosControl.value}%`;
    chaosControl.style.setProperty("--progress", `${chaosControl.value}%`);
  }

  function viscosityLevel() {
    return Number(viscosityControl.value) / 100;
  }

  function updateViscosityControl() {
    viscosityOutput.value = `${viscosityControl.value}%`;
    viscosityControl.style.setProperty("--progress", `${viscosityControl.value}%`);
  }

  function noise(index, channel = 0) {
    const raw = Math.sin(state.seed * 0.019 + index * 91.73 + channel * 37.11) * 43758.5453;
    return (raw - Math.floor(raw)) * 2 - 1;
  }

  function sourceFor(index) {
    return sources[index % sources.length];
  }

  function createTiles() {
    field.replaceChildren();
    state.tiles = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const source = sourceFor(index);
        const figure = document.createElement("figure");
        const image = document.createElement("img");
        figure.className = "orbit-tile";
        image.src = source.url;
        image.alt = source.alt_text || source.projectTitle;
        image.draggable = false;
        figure.append(image);
        field.append(figure);
        state.tiles.push({
          index, row, column, aspect: Number(source.aspect_ratio) || 1,
          element: figure,
          offsetX: noise(index, 1), offsetY: noise(index, 2),
          sizeNoise: noise(index, 3), rotationNoise: noise(index, 4),
          edgeNoiseX: noise(index, 5), edgeNoiseY: noise(index, 6),
          x: Number.NaN, y: Number.NaN, scale: Number.NaN,
          rotation: Number.NaN, opacity: Number.NaN,
          motionX: 0, motionY: 0, motionScale: 0, motionRotation: 0,
        });
      }
    }
  }

  function layout({ recenter = false } = {}) {
    const rect = gallery.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    // Measure the seeded layout in unit coordinates, then fit its widest
    // possible lens silhouette to 80% of the viewport on every screen size.
    state.unit = 1;

    const columnStep = state.unit * 1.44;
    const rowStep = state.unit * 1.32;
    const padding = state.unit * 1.8;
    const chaos = chaosLevel();
    const shapeChaos = smoothstep(0, 0.55, chaos);

    state.planeWidth = padding * 2 + columnStep * (columns - 0.5) + state.unit * 1.5;
    state.planeHeight = padding * 2 + rowStep * (rows - 1) + state.unit * 1.75;
    state.cycleHeight = rowStep * rows;

    state.tiles.forEach((tile) => {
      const wide = tile.aspect > 1.2;
      const tall = tile.aspect < 0.72;
      const portrait = tile.aspect < 0.95;
      const baseWidth = state.unit * (wide ? 1.34 : tall ? 0.67 : portrait ? 0.86 : 0.98);
      const sizeVariation = 1 + tile.sizeNoise * 0.39 * chaos;
      const chaoticWidth = baseWidth * sizeVariation;
      const chaoticHeight = (baseWidth / tile.aspect) * sizeVariation;
      const orderlySize = state.unit * 0.92;
      const width = orderlySize + (chaoticWidth - orderlySize) * shapeChaos;
      const height = orderlySize + (chaoticHeight - orderlySize) * shapeChaos;
      const stagger = tile.row % 2 ? (columnStep / 2) * shapeChaos : 0;

      tile.width = width;
      tile.height = height;
      tile.baseX =
        padding +
        tile.column * columnStep +
        stagger +
        tile.offsetX * state.unit * 0.31 * chaos;
      tile.baseY =
        padding + tile.row * rowStep + tile.offsetY * state.unit * 0.25 * chaos;
      tile.element.style.setProperty("--width", `${width}px`);
      tile.element.style.setProperty("--height", `${height}px`);
    });

    const left = Math.min(...state.tiles.map(tile =>
      tile.baseX - tile.width * maximumLensScale / 2 - Math.abs(tile.edgeNoiseX) * chaos));
    const right = Math.max(...state.tiles.map(tile =>
      tile.baseX + tile.width * maximumLensScale / 2 + Math.abs(tile.edgeNoiseX) * chaos));
    const fit = rect.width * gridWidthFraction / (right - left);
    state.unit = fit;
    state.planeWidth *= fit;
    state.planeHeight *= fit;
    state.cycleHeight *= fit;
    state.tiles.forEach(tile => {
      tile.width *= fit;
      tile.height *= fit;
      tile.baseX *= fit;
      tile.baseY *= fit;
      tile.element.style.setProperty("--width", `${tile.width}px`);
      tile.element.style.setProperty("--height", `${tile.height}px`);
    });
    state.cameraX = rect.width / 2 - (left + right) * fit / 2;

    if (recenter) {
      state.cameraY = (state.height - state.planeHeight) / 2;
      state.velocityY = 0;
      state.tiles.forEach((tile) => {
        tile.x = Number.NaN;
        tile.y = Number.NaN;
        tile.scale = Number.NaN;
        tile.motionX = 0;
        tile.motionY = 0;
        tile.motionScale = 0;
        tile.motionRotation = 0;
      });
    }

    requestFrame();
  }

  function rotatedBounds(width, height, scale, rotation) {
    const radians = (rotation * Math.PI) / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    return {
      width: scaledWidth * cosine + scaledHeight * sine,
      height: scaledWidth * sine + scaledHeight * cosine,
    };
  }

  function separate(items, gap, passes) {
    for (let pass = 0; pass < passes; pass += 1) {
      let separated = false;

      for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
        const first = items[firstIndex];

        for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex += 1) {
          const second = items[secondIndex];
          if (first.opacity < 0.015 && second.opacity < 0.015) continue;

          const deltaX = first.x - second.x;
          const deltaY = first.y - second.y;
          const overlapX = (first.width + second.width) / 2 + gap - Math.abs(deltaX);
          const overlapY = (first.height + second.height) / 2 + gap - Math.abs(deltaY);

          if (overlapX <= 0 || overlapY <= 0) continue;
          separated = true;

          const firstMobility = 0.28 + (1 - first.focus) * 0.72;
          const secondMobility = 0.28 + (1 - second.focus) * 0.72;
          const totalMobility = firstMobility + secondMobility;
          const firstShare = firstMobility / totalMobility;
          const secondShare = secondMobility / totalMobility;

          if (overlapX < overlapY) {
            const direction = deltaX === 0
              ? first.index < second.index ? -1 : 1
              : Math.sign(deltaX);
            first.x += direction * overlapX * firstShare;
            second.x -= direction * overlapX * secondShare;
          } else {
            const direction = deltaY === 0
              ? first.index < second.index ? -1 : 1
              : Math.sign(deltaY);
            first.y += direction * overlapY * firstShare;
            second.y -= direction * overlapY * secondShare;
          }
        }
      }

      if (!separated) break;
    }
  }

  function targetLayout() {
    const centerY = state.height / 2;
    const reduced = reducedMotion.matches;
    const chaos = chaosLevel();

    const targets = state.tiles.map((tile) => {
      const naturalX = state.cameraX + tile.baseX;
      const naturalY = wrapAround(
        state.cameraY + tile.baseY,
        centerY,
        state.cycleHeight,
      );
      const normalizedY = (naturalY - centerY) / (state.height * 0.62);
      const focus = Math.exp(-(normalizedY ** 2) * 2.7);
      const edge = 1 - focus;
      const edgeStrength = edge ** 1.35;
      const lensScale = reduced ? 0.76 + focus * 0.24 : 0.32 + focus * 1.36;
      const scale = Math.min(lensScale, maximumImageSide / Math.max(tile.width, tile.height));
      const rotation = reduced ? 0 : tile.rotationNoise * 7.65 * edgeStrength * chaos;
      const x = naturalX + tile.edgeNoiseX * state.unit * edgeStrength * chaos;
      const y =
        naturalY + tile.edgeNoiseY * state.unit * 0.67 * edgeStrength * chaos;
      const verticalFade = 1 - smoothstep(
        state.height * 0.5,
        state.height * 0.7,
        Math.abs(y - centerY),
      );
      const opacity = clamp(verticalFade, 0, 1);
      const bounds = rotatedBounds(tile.width, tile.height, scale, rotation);

      return {
        index: tile.index,
        tile,
        x,
        y,
        width: bounds.width,
        height: bounds.height,
        scale,
        rotation,
        opacity,
        focus,
      };
    });

    separate(targets, targetGap, 14);
    return targets;
  }

  function viscousStep(tile, property, motionProperty, target, stiffness, friction) {
    tile[motionProperty] =
      (tile[motionProperty] + (target - tile[property]) * stiffness) * friction;
    tile[property] += tile[motionProperty];
  }

  function render() {
    const targets = targetLayout();
    const reduced = reducedMotion.matches;
    const viscosity = viscosityLevel();
    const interactionBoost = state.pointerId === null ? 1 : 1.35;
    const positionStiffness = mix(0.18, 0.025, viscosity) * interactionBoost;
    const positionFriction = mix(0.68, 0.48, viscosity);
    const transformStiffness = mix(0.13, 0.018, viscosity) * interactionBoost;
    const transformFriction = mix(0.66, 0.5, viscosity);
    const opacityResponse = mix(0.3, 0.08, viscosity);
    let unsettled = false;

    const visible = targets.map((target) => {
      const tile = target.tile;

      if (!Number.isFinite(tile.x)) {
        tile.x = target.x;
        tile.y = target.y;
        tile.scale = target.scale;
        tile.rotation = target.rotation;
        tile.opacity = target.opacity;
        tile.motionX = 0;
        tile.motionY = 0;
        tile.motionScale = 0;
        tile.motionRotation = 0;
      } else if (Math.abs(target.y - tile.y) > state.cycleHeight / 2) {
        tile.y = target.y;
        tile.opacity = target.opacity;
        tile.motionY = 0;
      } else if (reduced) {
        tile.x = target.x;
        tile.y = target.y;
        tile.scale = target.scale;
        tile.rotation = target.rotation;
        tile.opacity = target.opacity;
        tile.motionX = 0;
        tile.motionY = 0;
        tile.motionScale = 0;
        tile.motionRotation = 0;
      } else {
        unsettled ||= Math.abs(target.x - tile.x) > 0.08;
        unsettled ||= Math.abs(target.y - tile.y) > 0.08;
        unsettled ||= Math.abs(target.scale - tile.scale) > 0.0008;
        unsettled ||= Math.abs(target.rotation - tile.rotation) > 0.005;
        unsettled ||= Math.abs(tile.motionX) > 0.01;
        unsettled ||= Math.abs(tile.motionY) > 0.01;
        unsettled ||= Math.abs(tile.motionScale) > 0.0001;
        unsettled ||= Math.abs(tile.motionRotation) > 0.001;
        viscousStep(
          tile,
          "x",
          "motionX",
          target.x,
          positionStiffness,
          positionFriction,
        );
        viscousStep(
          tile,
          "y",
          "motionY",
          target.y,
          positionStiffness,
          positionFriction,
        );
        viscousStep(
          tile,
          "scale",
          "motionScale",
          target.scale,
          transformStiffness,
          transformFriction,
        );
        viscousStep(
          tile,
          "rotation",
          "motionRotation",
          target.rotation,
          transformStiffness,
          transformFriction,
        );
        tile.opacity += (target.opacity - tile.opacity) * opacityResponse;
      }

      // Springs can overshoot their targets, including during a resize.
      // Clamp the displayed scale too, so the 800px limit holds in motion.
      tile.scale = Math.min(tile.scale, maximumImageSide / Math.max(tile.width, tile.height));
      const bounds = rotatedBounds(tile.width, tile.height, tile.scale, tile.rotation);
      return {
        index: tile.index,
        tile,
        x: tile.x,
        y: tile.y,
        width: bounds.width,
        height: bounds.height,
        opacity: tile.opacity,
        focus: target.focus,
      };
    });

    separate(visible, minimumGap + 0.15, 8);

    visible.forEach(({ tile, x, y, focus }) => {
      tile.x = x;
      tile.y = y;
      tile.element.style.setProperty("--x", `${(x - tile.width / 2).toFixed(2)}px`);
      tile.element.style.setProperty("--y", `${(y - tile.height / 2).toFixed(2)}px`);
      tile.element.style.setProperty("--scale", (Math.floor(tile.scale * 10000) / 10000).toFixed(4));
      tile.element.style.setProperty("--rotation", `${tile.rotation.toFixed(2)}deg`);
      tile.element.style.setProperty("--opacity", tile.opacity.toFixed(3));
      tile.element.style.zIndex = String(Math.round(focus * 1000));
    });

    return unsettled;
  }

  function normalizeCamera() {
    if (!state.cycleHeight) return;
    state.cameraY = wrapAround(state.cameraY, 0, state.cycleHeight);
  }

  function animate() {
    state.frame = 0;
    if (!enabled || document.hidden) return;
    const reduced = reducedMotion.matches;

    if (state.pointerId === null) {
      state.cameraY += state.velocityY;
      state.velocityY *= reduced ? 0 : mix(0.92, 0.76, viscosityLevel());
    }

    normalizeCamera();
    const unsettled = render();
    const moving =
      state.pointerId !== null ||
      Math.abs(state.velocityY) > 0.015;

    if (moving || unsettled) requestFrame();
  }

  function requestFrame() {
    if (!enabled || document.hidden || state.frame) return;
    state.frame = requestAnimationFrame(animate);
  }

  function interact() {
    gallery.classList.add("has-interacted");
    requestFrame();
  }

  gallery.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("a, button, input, label")) return;
    state.pointerId = event.pointerId;
    state.pointerY = event.clientY;
    state.velocityY = 0;
    gallery.setPointerCapture(event.pointerId);
    gallery.classList.add("is-dragging");
    interact();
  });

  gallery.addEventListener("pointermove", (event) => {
    if (event.pointerId !== state.pointerId) return;
    const deltaY = event.clientY - state.pointerY;
    state.pointerY = event.clientY;
    state.cameraY += deltaY;
    state.velocityY = deltaY;
    requestFrame();
  });

  function endPointer(event) {
    if (event.pointerId !== state.pointerId) return;
    state.pointerId = null;
    gallery.classList.remove("is-dragging");
    if (gallery.hasPointerCapture(event.pointerId)) {
      gallery.releasePointerCapture(event.pointerId);
    }
    requestFrame();
  }

  gallery.addEventListener("pointerup", endPointer);
  gallery.addEventListener("pointercancel", endPointer);

  gallery.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.height : 1;
      const vertical = (event.deltaY || event.deltaX) * unit;

      if (reducedMotion.matches) {
        state.cameraY -= vertical * 0.8;
      } else {
        state.velocityY -= vertical * mix(0.09, 0.04, viscosityLevel());
      }
      interact();
    },
    { passive: false },
  );

  gallery.addEventListener("keydown", (event) => {
    if (event.target.closest("a, button, input, label")) return;
    const distance = event.shiftKey ? 42 : 20;
    const direction = {
      ArrowUp: distance,
      ArrowDown: -distance,
    }[event.key];

    if (!direction) return;
    event.preventDefault();
    if (reducedMotion.matches) state.cameraY += direction * 5;
    else state.velocityY += direction;
    interact();
  });

  chaosControl.addEventListener("input", () => {
    updateChaosControl();
    layout();
  });

  viscosityControl.addEventListener("input", () => {
    updateViscosityControl();
    requestFrame();
  });

  new ResizeObserver(() => {
    if (enabled) layout({ recenter: true });
  }).observe(gallery);
  reducedMotion.addEventListener("change", () => {
    state.velocityY = 0;
    requestFrame();
  });

  updateChaosControl();
  updateViscosityControl();
  createTiles();
  layout({ recenter: true });

  document.addEventListener("visibilitychange", () => {
    state.velocityY = 0;
    requestFrame();
  });
  return {
    setVisible(visible) {
      enabled = visible;
      state.velocityY = 0;
      if (visible) layout({ recenter: !state.width });
      else {
        cancelAnimationFrame(state.frame);
        state.frame = 0;
        if (state.pointerId !== null) endPointer({ pointerId: state.pointerId });
      }
    },
  };
}
