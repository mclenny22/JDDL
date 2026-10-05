const pane = document.querySelector("#gallery-pane");
const field = document.querySelector("#image-field");
const filterBar = document.querySelector("#filter-bar");
const projectList = document.querySelector("#project-list");
const emptyState = document.querySelector("#empty-state");
const projectGallery = document.querySelector("#project-gallery-dialog");
const projectGalleryImage = document.querySelector("#project-gallery-image");
const projectGalleryTags = document.querySelector("#project-gallery-tags");
const projectGalleryThumbnails = document.querySelector("#project-gallery-thumbnails");
const projectGalleryPrevious = document.querySelector("#project-gallery-previous");
const projectGalleryNext = document.querySelector("#project-gallery-next");
const projectGalleryPrimary = document.querySelector("#project-gallery-primary");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const columns = 3;
const minimumRows = 16;
const defaultChaos = 72;
const defaultViscosity = 80;
const minimumGap = 10;
const targetGap = minimumGap + 1.25;
const horizontalInset = 20;
const focusedScale = 1.68;

const state = {
  data: null,
  activeTags: new Set(),
  activeProject: null,
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
  pointerStartX: 0,
  pointerStartY: 0,
  pointerDragged: false,
  pointerImage: null,
  suppressTileClickUntil: 0,
  frame: 0,
  tiles: [],
  galleryImages: [],
  galleryIndex: 0,
  galleryProject: null,
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
  return defaultChaos / 100;
}

function viscosityLevel() {
  return defaultViscosity / 100;
}

function noise(index, channel = 0) {
  const raw = Math.sin(state.seed * 0.019 + index * 91.73 + channel * 37.11) * 43758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}

function visibleImages() {
  if (!state.data) return [];
  return state.data.images.filter((image) => {
    const tagMatch = state.activeTags.size === 0 || image.tag_ids.some((tag) => state.activeTags.has(tag));
    const projectMatch = !state.activeProject || image.project_ids.includes(state.activeProject);
    return tagMatch && projectMatch;
  });
}

function renderContent() {
  const { settings, projects, tags } = state.data;
  document.querySelector("#studio-eyebrow").textContent = settings.eyebrow;
  document.querySelector("#studio-about").textContent = settings.about;
  const clients = settings.clients.split("\n").filter(Boolean);
  document.querySelector("#client-list").replaceChildren(...clients.map((client) => {
    const item = document.createElement("li");
    item.textContent = client;
    return item;
  }));

  const allProject = document.createElement("li");
  const allProjectButton = document.createElement("button");
  allProjectButton.className = "project-button";
  allProjectButton.type = "button";
  allProjectButton.textContent = "All work";
  allProjectButton.dataset.client = "Archive";
  allProjectButton.setAttribute("aria-pressed", String(!state.activeProject));
  allProjectButton.addEventListener("click", () => setProject(null));
  allProject.append(allProjectButton);
  const projectItems = projects.map((project) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "project-button";
    button.type = "button";
    button.textContent = project.title;
    button.dataset.client = project.client || "Project";
    button.dataset.projectId = project.id;
    button.setAttribute("aria-pressed", String(state.activeProject === project.id));
    button.addEventListener("click", () => setProject(project.id));
    item.append(button);
    return item;
  });
  projectList.replaceChildren(allProject, ...projectItems);

  const all = document.createElement("button");
  all.type = "button";
  all.className = "filter-button";
  all.textContent = "All";
  all.setAttribute("aria-pressed", String(state.activeTags.size === 0));
  all.addEventListener("click", () => {
    state.activeTags.clear();
    renderFilters();
    createTiles();
  });
  filterBar.replaceChildren(all, ...tags.map((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-button";
    button.textContent = tag.name;
    button.dataset.tag = tag.id;
    button.setAttribute("aria-pressed", String(state.activeTags.has(tag.id)));
    button.addEventListener("click", () => {
      state.activeTags.has(tag.id) ? state.activeTags.delete(tag.id) : state.activeTags.add(tag.id);
      renderFilters();
      createTiles();
    });
    return button;
  }));
}

function renderFilters() {
  filterBar.querySelectorAll("button").forEach((button) => {
    const tag = button.dataset.tag;
    button.setAttribute("aria-pressed", String(tag ? state.activeTags.has(tag) : state.activeTags.size === 0));
  });
}

function setProject(projectId) {
  state.activeProject = projectId;
  projectList.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String((button.dataset.projectId || null) === projectId));
  });
  createTiles();
}

function projectForImage(image) {
  return state.data.projects.find((project) => image.project_ids.includes(project.id)) || null;
}

function galleryTags() {
  const usedTagIds = new Set(state.galleryImages.flatMap((image) => image.tag_ids));
  return state.data.tags.filter((tag) => usedTagIds.has(tag.id));
}

function selectGalleryImage(index) {
  const imageCount = state.galleryImages.length;
  if (!imageCount) return;
  state.galleryIndex = (index + imageCount) % imageCount;
  const image = state.galleryImages[state.galleryIndex];
  projectGalleryImage.src = image.url;
  projectGalleryImage.alt = image.alt_text || image.original_name || state.galleryProject?.title || "Project image";
  document.querySelector("#project-gallery-counter").textContent = `${state.galleryIndex + 1} / ${imageCount}`;
  projectGalleryPrevious.disabled = imageCount < 2;
  projectGalleryNext.disabled = imageCount < 2;
  projectGalleryPrimary.disabled = imageCount < 2;
  projectGalleryThumbnails.querySelectorAll("button").forEach((button, thumbnailIndex) => {
    button.setAttribute("aria-current", String(thumbnailIndex === state.galleryIndex));
  });
}

function renderProjectGallery() {
  const project = state.galleryProject;
  const imageCount = state.galleryImages.length;
  document.querySelector("#project-gallery-client").textContent = project?.client || "JDDL studio selection";
  document.querySelector("#project-gallery-title").textContent = project?.title || "Selected work";
  document.querySelector("#project-gallery-description").textContent = project?.description || "Selected work not assigned to a project.";

  const tags = galleryTags();
  projectGalleryTags.replaceChildren(...tags.map((tag) => {
    const item = document.createElement("span");
    item.className = "project-gallery-tag";
    item.textContent = tag.name;
    return item;
  }));

  projectGalleryThumbnails.replaceChildren(...state.galleryImages.map((image, index) => {
    const button = document.createElement("button");
    const thumbnail = document.createElement("img");
    button.type = "button";
    button.className = "project-gallery-thumbnail";
    button.setAttribute("aria-label", `Show image ${index + 1} of ${imageCount}`);
    thumbnail.src = image.url;
    thumbnail.alt = "";
    thumbnail.loading = "lazy";
    button.append(thumbnail);
    button.addEventListener("click", () => selectGalleryImage(index));
    return button;
  }));
  projectGalleryThumbnails.hidden = imageCount < 2;
  selectGalleryImage(state.galleryIndex);
}

function openProjectGallery(image) {
  if (projectGallery.open) return;
  if (performance.now() < state.suppressTileClickUntil) return;
  const project = projectForImage(image);
  state.galleryProject = project;
  state.galleryImages = project
    ? state.data.images.filter((candidate) => candidate.project_ids.includes(project.id))
    : [image];
  state.galleryIndex = Math.max(0, state.galleryImages.findIndex((candidate) => candidate.id === image.id));
  renderProjectGallery();
  projectGallery.showModal();
  document.querySelector("#project-gallery-close").focus();
}

function stepProjectGallery(direction) {
  if (state.galleryImages.length < 2) return;
  selectGalleryImage(state.galleryIndex + direction);
}

function createTiles() {
  const images = visibleImages();
  field.replaceChildren();
  state.tiles = [];
  emptyState.hidden = images.length > 0;
  if (!images.length) return;

  const rows = Math.max(minimumRows, Math.ceil(images.length / columns));
  const tileCount = rows * columns;
  for (let index = 0; index < tileCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const imageData = images[index % images.length];
    const figure = document.createElement("figure");
    const image = document.createElement("img");

    figure.className = "image-tile";
    figure.dataset.imageId = imageData.id;
    figure.tabIndex = 0;
    figure.setAttribute("role", "button");
    figure.setAttribute("aria-label", `Open ${projectForImage(imageData)?.title || imageData.alt_text || "selected work"}`);
    image.src = imageData.url;
    image.alt = index < images.length ? imageData.alt_text : "";
    image.draggable = false;
    image.loading = index < 28 ? "eager" : "lazy";
    figure.append(image);
    field.append(figure);
    figure.addEventListener("click", () => openProjectGallery(imageData));
    figure.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openProjectGallery(imageData);
    });

    state.tiles.push({
      image: imageData,
      index,
      row,
      column,
      aspect: clamp(Number(imageData.aspect_ratio) || 1, 0.5, 1.85),
      element: figure,
      offsetX: noise(index, 1),
      offsetY: noise(index, 2),
      sizeNoise: noise(index, 3),
      rotationNoise: noise(index, 4),
      edgeNoiseX: noise(index, 5),
      edgeNoiseY: noise(index, 6),
      x: Number.NaN,
      y: Number.NaN,
      scale: Number.NaN,
      rotation: Number.NaN,
      opacity: Number.NaN,
      motionX: 0,
      motionY: 0,
      motionScale: 0,
      motionRotation: 0,
    });
  }
  layout({ recenter: true });
}

function layout({ recenter = false } = {}) {
  if (!state.tiles.length) return;
  const rect = pane.getBoundingClientRect();
  state.width = rect.width;
  state.height = rect.height;

  const rows = Math.ceil(state.tiles.length / columns);
  const chaos = chaosLevel();
  const shapeChaos = smoothstep(0, 0.55, chaos);
  const maximumScale = reducedMotion.matches ? 1 : focusedScale;
  const horizontalMetrics = state.tiles.map((tile) => {
    const wide = tile.aspect > 1.2;
    const tall = tile.aspect < 0.72;
    const portrait = tile.aspect < 0.95;
    const baseWidth = wide ? 1.34 : tall ? 0.67 : portrait ? 0.86 : 0.98;
    const sizeVariation = 1 + tile.sizeNoise * 0.39 * chaos;
    const chaoticWidth = baseWidth * sizeVariation;
    const orderlySize = 0.92;
    const width = orderlySize + (chaoticWidth - orderlySize) * shapeChaos;
    const stagger = tile.row % 2 ? 0.72 * shapeChaos : 0;
    const center = tile.column * 1.44 + stagger + tile.offsetX * 0.31 * chaos;
    return { center, width };
  });
  const leftEdge = Math.min(...horizontalMetrics.map(({ center, width }) => center - width * maximumScale / 2));
  const rightEdge = Math.max(...horizontalMetrics.map(({ center, width }) => center + width * maximumScale / 2));
  const availableWidth = Math.max(1, state.width - horizontalInset * 2);
  state.unit = availableWidth / Math.max(1, rightEdge - leftEdge);

  const rowStep = state.unit * 1.32;
  const padding = state.unit * 1.8;

  state.planeWidth = state.width;
  state.planeHeight = padding * 2 + rowStep * (rows - 1) + state.unit * 1.75;
  state.cycleHeight = rowStep * rows;

  state.tiles.forEach((tile, index) => {
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

    tile.width = width;
    tile.height = height;
    tile.baseX = horizontalInset + (horizontalMetrics[index].center - leftEdge) * state.unit;
    tile.baseY = padding + tile.row * rowStep + tile.offsetY * state.unit * 0.25 * chaos;
    tile.element.style.setProperty("--width", `${width}px`);
    tile.element.style.setProperty("--height", `${height}px`);
  });

  if (recenter) {
    state.cameraX = 0;
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
          const direction = deltaX === 0 ? (first.index < second.index ? -1 : 1) : Math.sign(deltaX);
          first.x += direction * overlapX * firstShare;
          second.x -= direction * overlapX * secondShare;
        } else {
          const direction = deltaY === 0 ? (first.index < second.index ? -1 : 1) : Math.sign(deltaY);
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
    const naturalY = wrapAround(state.cameraY + tile.baseY, centerY, state.cycleHeight);
    const normalizedY = (naturalY - centerY) / (state.height * 0.62);
    const focus = Math.exp(-(normalizedY ** 2) * 2.7);
    const edge = 1 - focus;
    const edgeStrength = edge ** 1.35;
    const scale = reduced ? 0.76 + focus * 0.24 : 0.32 + focus * (focusedScale - 0.32);
    const rotation = reduced ? 0 : tile.rotationNoise * 7.65 * edgeStrength * chaos;
    const x = naturalX + tile.edgeNoiseX * state.unit * edgeStrength * chaos;
    const y = naturalY + tile.edgeNoiseY * state.unit * 0.67 * edgeStrength * chaos;
    const verticalFade = 1 - smoothstep(state.height * 0.5, state.height * 0.7, Math.abs(y - centerY));
    const opacity = clamp(verticalFade, 0, 1);
    const bounds = rotatedBounds(tile.width, tile.height, scale, rotation);
    return { index: tile.index, tile, x, y, width: bounds.width, height: bounds.height, scale, rotation, opacity, focus };
  });
  separate(targets, targetGap, 14);
  return targets;
}

function viscousStep(tile, property, motionProperty, target, stiffness, friction) {
  tile[motionProperty] = (tile[motionProperty] + (target - tile[property]) * stiffness) * friction;
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
      viscousStep(tile, "x", "motionX", target.x, positionStiffness, positionFriction);
      viscousStep(tile, "y", "motionY", target.y, positionStiffness, positionFriction);
      viscousStep(tile, "scale", "motionScale", target.scale, transformStiffness, transformFriction);
      viscousStep(tile, "rotation", "motionRotation", target.rotation, transformStiffness, transformFriction);
      tile.opacity += (target.opacity - tile.opacity) * opacityResponse;
    }
    const bounds = rotatedBounds(tile.width, tile.height, tile.scale, tile.rotation);
    return { index: tile.index, tile, x: tile.x, y: tile.y, width: bounds.width, height: bounds.height, opacity: tile.opacity, focus: target.focus };
  });

  separate(visible, minimumGap + 0.15, 8);
  visible.forEach(({ tile, x, y, focus }) => {
    tile.x = x;
    tile.y = y;
    tile.element.style.setProperty("--x", `${(x - tile.width / 2).toFixed(2)}px`);
    tile.element.style.setProperty("--y", `${(y - tile.height / 2).toFixed(2)}px`);
    tile.element.style.setProperty("--scale", tile.scale.toFixed(4));
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
  const reduced = reducedMotion.matches;
  if (state.pointerId === null) {
    state.cameraY += state.velocityY;
    state.velocityY *= reduced ? 0 : mix(0.92, 0.76, viscosityLevel());
  }
  normalizeCamera();
  const unsettled = render();
  const moving = state.pointerId !== null || Math.abs(state.velocityY) > 0.015;
  if (moving || unsettled) requestFrame();
}

function requestFrame() {
  if (state.frame) return;
  state.frame = requestAnimationFrame(animate);
}

function interact() {
  pane.classList.add("has-interacted");
  requestFrame();
}

pane.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.target.closest("a, button, input, label")) return;
  state.pointerId = event.pointerId;
  state.pointerY = event.clientY;
  state.pointerStartX = event.clientX;
  state.pointerStartY = event.clientY;
  state.pointerDragged = false;
  const tile = event.target.closest(".image-tile");
  state.pointerImage = tile ? state.data.images.find((image) => image.id === tile.dataset.imageId) || null : null;
  state.velocityY = 0;
  pane.setPointerCapture(event.pointerId);
  pane.classList.add("is-dragging");
  interact();
});

pane.addEventListener("pointermove", (event) => {
  if (event.pointerId !== state.pointerId) return;
  const deltaY = event.clientY - state.pointerY;
  state.pointerY = event.clientY;
  if (Math.hypot(event.clientX - state.pointerStartX, event.clientY - state.pointerStartY) > 7) {
    state.pointerDragged = true;
  }
  state.cameraY += deltaY;
  state.velocityY = deltaY;
  requestFrame();
});

function endPointer(event) {
  if (event.pointerId !== state.pointerId) return;
  if (state.pointerDragged) state.suppressTileClickUntil = performance.now() + 160;
  const selectedImage = state.pointerDragged || event.type === "pointercancel" ? null : state.pointerImage;
  state.pointerId = null;
  state.pointerImage = null;
  pane.classList.remove("is-dragging");
  if (pane.hasPointerCapture(event.pointerId)) pane.releasePointerCapture(event.pointerId);
  requestFrame();
  if (selectedImage) openProjectGallery(selectedImage);
}

pane.addEventListener("pointerup", endPointer);
pane.addEventListener("pointercancel", endPointer);
pane.addEventListener("wheel", (event) => {
  event.preventDefault();
  const vertical = event.deltaY;
  if (reducedMotion.matches) state.cameraY -= vertical * 0.8;
  else state.velocityY -= vertical * mix(0.09, 0.04, viscosityLevel());
  interact();
}, { passive: false });

pane.addEventListener("keydown", (event) => {
  if (event.target.closest("a, button, input, label")) return;
  const distance = event.shiftKey ? 42 : 20;
  const direction = { ArrowUp: distance, ArrowDown: -distance }[event.key];
  if (!direction) return;
  event.preventDefault();
  state.velocityY += direction;
  interact();
});

document.querySelector("#project-gallery-close").addEventListener("click", () => projectGallery.close());
projectGalleryPrevious.addEventListener("click", () => stepProjectGallery(-1));
projectGalleryNext.addEventListener("click", () => stepProjectGallery(1));
projectGalleryPrimary.addEventListener("click", () => stepProjectGallery(1));
projectGallery.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    stepProjectGallery(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    stepProjectGallery(1);
  }
});
projectGallery.addEventListener("click", (event) => {
  if (event.target === projectGallery) projectGallery.close();
});
projectGallery.addEventListener("close", () => {
  projectGalleryImage.removeAttribute("src");
  state.galleryImages = [];
  state.galleryProject = null;
});

new ResizeObserver(() => layout({ recenter: true })).observe(pane);
reducedMotion.addEventListener("change", () => {
  state.velocityY = 0;
  layout({ recenter: true });
});

try {
  const response = await fetch("/api/public");
  if (!response.ok) throw new Error("Could not load the archive");
  state.data = await response.json();
  renderContent();
  createTiles();
} catch (error) {
  emptyState.hidden = false;
  emptyState.textContent = error.message;
}
