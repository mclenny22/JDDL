import { projectRows, automaticPlacements, projectComposition } from "/project-view.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  data: null,
  view: "library",
  projectReturnScroll: 0,
  projectReturnFocus: null,
  search: "",
  selectedTags: new Set(),
  selectedFile: null,
  selectedFiles: [],
  selectedProjects: new Set(),
  librarySelected: new Set(),
  inlineEdit: null,
  batchBusy: false,
  rowMenu: null,
  projectOptions: [],
  projectOptionIndex: -1,
  projectDrag: null,
  reorderingProjects: false,
  exportTags: new Set(),
  exportProject: "",
  exportSelected: new Set(),
};

const el = {
  loginView: $("#login-view"),
  adminApp: $("#admin-app"),
  imageTable: $("#image-table"),
  imageBody: $("#image-table-body"),
  projectTable: $("#project-table"),
  projectBody: $("#project-table-body"),
  exportTable: $("#export-table"),
  exportBody: $("#export-table-body"),
  exportTagFilters: $("#export-tag-filters"),
  exportProjectFilter: $("#export-project-filter"),
  exportSelectionSummary: $("#export-selection-summary"),
  createPortfolioButton: $("#create-portfolio-button"),
  clearExportSelection: $("#clear-export-selection"),
  libraryEmpty: $("#library-empty"),
  projectsEmpty: $("#projects-empty"),
  filterMenu: $("#tag-filter-menu"),
  tagFilters: $("#tag-filters"),
  filterCount: $("#filter-count"),
  clearFilters: $("#clear-tag-filters"),
  imageDialog: $("#image-dialog"),
  projectEditor: $("#project-editor"),
  tagsDialog: $("#tags-dialog"),
  imageForm: $("#image-form"),
  projectForm: $("#project-form"),
  newTagForm: $("#new-tag-form"),
  imageFile: $("#image-file"),
  replaceImageFile: $("#replace-image-file"),
  imagePreview: $("#image-preview"),
  dropzone: $("#dropzone"),
  dropzoneCopy: $("#dropzone-copy"),
  imageTags: $("#image-tag-options"),
  imageProjects: $("#image-project-options"),
  projectTrigger: $("#image-project-trigger"),
  projectValue: $("#image-project-value"),
  projectSelection: $("#image-project-id"),
  projectPanel: $("#image-project-panel"),
  projectSearch: $("#image-project-search"),
  projectEmpty: $("#image-project-empty"),
  tagManager: $("#tag-manager-list"),
  rowMenu: $("#row-menu"),
  toast: $("#toast"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Ein Fehler ist aufgetreten");
  return payload;
}

function notify(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { el.toast.hidden = true; }, 2200);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}

function tagFor(id) {
  return state.data.tags.find((tag) => tag.id === id);
}

function projectFor(id) {
  return state.data.projects.find((project) => project.id === id);
}

function isVideo(media) { return media?.mime_type === "video/mp4"; }

function mediaMarkup(media, className = "", label = "", draggable = false) {
  const attributes = `class="${className}" src="${escapeHtml(media.url)}" draggable="${draggable}"`;
  return isVideo(media)
    ? `<video ${attributes} muted playsinline preload="metadata" aria-label="${escapeHtml(label || media.original_name)}"></video>`
    : `<img ${attributes} alt="${escapeHtml(label)}" loading="lazy" />`;
}

function setMediaPreview(preview, media, controls = false) {
  const tag = isVideo(media) ? "VIDEO" : "IMG";
  if (preview.tagName && preview.tagName !== tag) {
    const replacement = document.createElement(tag.toLowerCase());
    replacement.id = preview.id;
    preview.pause?.();
    preview.replaceWith(replacement);
    preview = replacement;
  }
  preview.hidden = !media;
  if (media) {
    if (isVideo(media)) {
      preview.muted = true;
      preview.playsInline = true;
      preview.controls = controls;
      preview.preload = "metadata";
      preview.setAttribute("aria-label", media.alt_text || media.original_name || "Video-Vorschau");
    } else preview.alt = media.alt_text || "Bild-Vorschau";
    preview.src = media.url;
  } else preview.removeAttribute("src");
  return preview;
}

let previewURL = null;
function releasePreviewURL() {
  el.imagePreview.pause?.();
  if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
}

function mediaDimensions(preview) {
  if (preview.tagName !== "VIDEO") return preview.decode().then(() => preview.naturalWidth / preview.naturalHeight || 1);
  if (preview.error) return Promise.reject(new Error("Das MP4-Video konnte nicht gelesen werden."));
  if (preview.readyState >= 1) return Promise.resolve(preview.videoWidth / preview.videoHeight || 1);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      preview.removeEventListener("loadedmetadata", loaded);
      preview.removeEventListener("error", failed);
    };
    const loaded = () => { cleanup(); resolve(preview.videoWidth / preview.videoHeight || 1); };
    const failed = () => { cleanup(); reject(new Error("Das MP4-Video konnte nicht gelesen werden.")); };
    const timer = setTimeout(failed, 15000);
    preview.addEventListener("loadedmetadata", loaded, { once: true });
    preview.addEventListener("error", failed, { once: true });
  });
}

function tagNames(image) {
  return image.tag_ids.map((id) => tagFor(id)?.name).filter(Boolean);
}

function projectNames(image) {
  return image.project_ids.map((id) => projectFor(id)?.title).filter(Boolean);
}

function setView(view) {
  cancelProjectDrag();
  if (state.view === 'project-editor' && view !== 'project-editor') finishLayoutDrag(false);
  state.view = view;
  closeRowMenu();
  document.querySelectorAll("[data-view-content]").forEach((section) => {
    section.hidden = section.dataset.viewContent !== view;
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === (view === "project-editor" ? "projects" : view);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  closeFilterMenu();
}

function renderFilters() {
  const counts = new Map(state.data.tags.map((tag) => [tag.id, state.data.images.filter((image) => image.tag_ids.includes(tag.id)).length]));
  el.tagFilters.innerHTML = state.data.tags.length
    ? state.data.tags.map((tag) => `<label class="filter-option"><input type="checkbox" data-tag-id="${tag.id}" ${state.selectedTags.has(tag.id) ? "checked" : ""} /><span>${escapeHtml(tag.name)}</span><span class="option-count">${counts.get(tag.id)}</span></label>`).join("")
    : '<div class="filter-option admin-muted">Keine Tags verfügbar</div>';
  el.filterCount.textContent = state.selectedTags.size;
  el.filterCount.hidden = !state.selectedTags.size;
  el.clearFilters.hidden = !state.selectedTags.size;
}

function filteredImages() {
  const query = state.search.trim().toLowerCase();
  return state.data.images.filter((image) => {
    const matchesTags = [...state.selectedTags].every((id) => image.tag_ids.includes(id));
    const text = [image.original_name, image.alt_text, ...tagNames(image), ...projectNames(image)].join(" ").toLowerCase();
    return matchesTags && (!query || text.includes(query));
  });
}

function renderImages() {
  closeRowMenu();
  const images = filteredImages();
  updateLibrarySelection();
  const filtering = Boolean(state.search.trim()) || state.selectedTags.size > 0;
  $("#image-count").textContent = `${images.length} ${images.length === 1 ? "Asset" : "Assets"}`;
  $("#table-result-count").textContent = `${images.length} ${images.length === 1 ? "Eintrag" : "Einträge"}`;
  el.imageTable.hidden = !images.length && !filtering;
  el.libraryEmpty.hidden = images.length || filtering;
  if (!images.length && filtering) {
    el.imageBody.innerHTML = '<tr><td colspan="8"><div class="admin-empty"><h2>Keine Ergebnisse</h2><p>Ändere die Suche oder die Filter.</p></div></td></tr>';
    return;
  }
  el.imageBody.innerHTML = images.map((image) => {
    const tags = tagNames(image);
    const projects = projectNames(image);
    const status = image.archived ? "Archiviert" : image.published ? "Veröffentlicht" : "Entwurf";
    return `<tr>
      <td><input type="checkbox" data-library-select="${escapeHtml(image.id)}" aria-label="${escapeHtml(image.original_name)} auswählen" ${state.librarySelected.has(image.id) ? "checked" : ""} /></td>
      <td>${mediaMarkup(image, "admin-thumb")}</td>
      <td><button class="cell-button" data-edit-field="name" data-image-id="${image.id}"><span class="file-name">${escapeHtml(image.original_name)}</span><small>${escapeHtml(image.alt_text || "Kein Alternativtext")}</small></button></td>
      <td><button class="cell-button" data-inline-field="tag_ids" data-image-id="${image.id}"><span class="tags">${tags.length ? tags.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("") : '<span class="admin-muted">Tags auswählen</span>'}</span></button>${inlineEditorMarkup(image.id, "tag_ids")}</td>
      <td><button class="cell-button" data-inline-field="project_ids" data-image-id="${image.id}">${projects.length ? escapeHtml(projects.join(", ")) : '<span class="admin-muted">Projekt auswählen</span>'}</button>${inlineEditorMarkup(image.id, 'project_ids')}</td>
      <td><button type="button" class="cell-button" data-inline-field="published" data-image-id="${escapeHtml(image.id)}"><span class="status">${status}</span></button>${inlineEditorMarkup(image.id, "published")}</td>
      <td class="admin-muted">${formatDate(image.created_at)}</td>
      <td><div class="row-actions">${rowMenuTrigger("image", image.id, image.original_name)}</div></td>
    </tr>`;
  }).join("");
  el.imageBody.querySelectorAll('[data-inline-relation]').forEach(input => { input.indeterminate = state.inlineEdit?.mixed.has(input.dataset.inlineRelation) && !state.inlineEdit.touched.has(input.dataset.inlineRelation); if (state.inlineEdit?.touched.has(input.dataset.inlineRelation)) input.checked = state.inlineEdit.touched.get(input.dataset.inlineRelation); });
}

function renderProjects() {
  closeRowMenu();
  const projects = state.data.projects;
  el.projectTable.hidden = !projects.length;
  el.projectsEmpty.hidden = Boolean(projects.length);
  $("#project-result-count").textContent = `${projects.length} ${projects.length === 1 ? "Eintrag" : "Einträge"}`;
  el.projectBody.innerHTML = projects.map((project, index) => {
    const count = state.data.images.filter((image) => image.project_ids.includes(project.id)).length;
    return `<tr data-project-row="${escapeHtml(project.id)}">
      <td><button class="project-drag-handle" type="button" data-drag-project="${escapeHtml(project.id)}" aria-label="${escapeHtml(project.title)} verschieben, Position ${index + 1} von ${projects.length}" aria-describedby="project-order-help" ${state.reorderingProjects ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="19" r="1" /></svg></button></td>
      <td><button class="cell-button" data-edit-project="${project.id}"><span class="file-name">${escapeHtml(project.title)}</span></button></td>
      <td class="${project.client ? "" : "admin-muted"}">${escapeHtml(project.client || "—")}</td>
      <td class="description-cell ${project.description ? "" : "admin-muted"}">${escapeHtml(project.description || "Keine Beschreibung")}</td>
      <td>${count}</td><td><span class="status">${project.published ? "Veröffentlicht" : "Entwurf"}</span></td>
      <td><div class="row-actions">${rowMenuTrigger("project", project.id, project.title)}</div></td>
    </tr>`;
  }).join("");
}

function focusProjectHandle(id) {
  const handle = [...el.projectBody.querySelectorAll("[data-drag-project]")].find((button) => button.dataset.dragProject === id);
  handle?.focus({ preventScroll: true });
}

async function saveProjectOrder(ids, focusId) {
  if (state.reorderingProjects || ids.every((id, index) => id === state.data.projects[index]?.id)) {
    focusProjectHandle(focusId);
    return;
  }
  state.reorderingProjects = true;
  el.projectTable.setAttribute("aria-busy", "true");
  el.projectBody.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  try {
    await api("/api/projects/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_ids: ids }) });
    const projects = new Map(state.data.projects.map((project) => [project.id, project]));
    state.data.projects = ids.map((id, index) => ({ ...projects.get(id), sort_order: index * 10 }));
    notify("Projektreihenfolge gespeichert");
  } catch (error) {
    notify(error.message);
    // Restore authoritative order after a stale list or a failed request.
    try { await refresh(); } catch { /* Keep the last known order if offline. */ }
  } finally {
    state.reorderingProjects = false;
    el.projectTable.setAttribute("aria-busy", "false");
    renderProjects();
    renderExportImages();
    focusProjectHandle(focusId);
  }
}

function finishProjectDrag() {
  const drag = state.projectDrag;
  state.projectDrag = null;
  document.documentElement.classList.remove("is-reordering-projects");
  if (drag) {
    drag.row.classList.remove("is-dragging");
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  }
  return drag;
}

function cancelProjectDrag() {
  const drag = finishProjectDrag();
  if (drag) { renderProjects(); focusProjectHandle(drag.id); }
}

el.projectBody.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-drag-project]");
  if (!handle || state.reorderingProjects || event.button !== 0 || !event.isPrimary) return;
  event.preventDefault();
  closeRowMenu();
  handle.focus({ preventScroll: true });
  state.projectDrag = { id: handle.dataset.dragProject, handle, row: handle.closest("[data-project-row]"), pointerId: event.pointerId, startY: event.clientY, moved: false, ids: state.data.projects.map((project) => project.id) };
  handle.setPointerCapture(event.pointerId);
});
el.projectBody.addEventListener("pointermove", (event) => {
  const drag = state.projectDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.abs(event.clientY - drag.startY) < 5) return;
  event.preventDefault();
  drag.moved = true;
  drag.row.classList.add("is-dragging");
  document.documentElement.classList.add("is-reordering-projects");
  const rows = [...el.projectBody.querySelectorAll("[data-project-row]")];
  const others = rows.filter((row) => row !== drag.row);
  const index = others.filter((row) => {
    const box = row.getBoundingClientRect();
    return event.clientY > box.top + box.height / 2;
  }).length;
  const ids = others.map((row) => row.dataset.projectRow);
  ids.splice(index, 0, drag.id);
  if (ids.some((id, position) => id !== drag.ids[position])) {
    el.projectBody.insertBefore(drag.row, others[index] || null);
    // Re-establish capture after moving the row in the DOM.
    drag.handle.setPointerCapture(drag.pointerId);
    drag.ids = ids;
  }
  if (event.clientY < 90) window.scrollBy(0, -16);
  else if (event.clientY > innerHeight - 70) window.scrollBy(0, 16);
});
el.projectBody.addEventListener("pointerup", (event) => {
  if (event.pointerId !== state.projectDrag?.pointerId) return;
  const drag = finishProjectDrag();
  if (drag.moved) saveProjectOrder(drag.ids, drag.id);
});
el.projectBody.addEventListener("pointercancel", cancelProjectDrag);
el.projectBody.addEventListener("keydown", (event) => {
  const handle = event.target.closest("[data-drag-project]");
  if (!handle || state.reorderingProjects || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const ids = state.data.projects.map((project) => project.id);
  const index = ids.indexOf(handle.dataset.dragProject);
  const destination = index + (event.key === "ArrowUp" ? -1 : 1);
  if (destination < 0 || destination >= ids.length) return;
  ids.splice(destination, 0, ids.splice(index, 1)[0]);
  saveProjectOrder(ids, handle.dataset.dragProject);
});

function renderTagManager() {
  el.tagManager.innerHTML = state.data.tags.length
    ? state.data.tags.map((tag) => {
      const count = state.data.images.filter((image) => image.tag_ids.includes(tag.id)).length;
      return `<div class="manager-row"><input value="${escapeHtml(tag.name)}" maxlength="60" data-tag-name="${tag.id}" aria-label="Tag-Name" /><span class="usage">${count} ${count === 1 ? "Asset" : "Assets"}</span><button class="button" type="button" data-save-tag="${tag.id}">Speichern</button><button class="row-button danger" type="button" data-delete-tag="${tag.id}" aria-label="Tag löschen">×</button></div>`;
    }).join("")
    : '<div class="admin-empty compact">Noch keine Tags.</div>';
}

function renderSettings() {
  $("#setting-eyebrow").value = state.data.settings.eyebrow || "";
  $("#setting-about").value = state.data.settings.about || "";
  $("#setting-clients").value = state.data.settings.clients || "";
  for (const [key, fallback] of [["contact", "Contact"], ["address", "Orbitstreet 666, Berlin"], ["email", "Info (at) orbit.com"]]) {
    $("#setting-footer-" + key).value = state.data.settings["footer_" + key] ?? fallback;
  }
}

function exportProjectImages() {
  return state.data.images.filter((image) => !isVideo(image) && (!state.exportProject || image.project_ids.includes(state.exportProject)));
}

function exportFilteredImages() {
  const images = exportProjectImages();
  if (!state.exportTags.size) return images;
  return images.filter((image) => image.tag_ids.some((id) => state.exportTags.has(id)));
}

function renderExportFilters() {
  if (state.exportProject && !projectFor(state.exportProject)) state.exportProject = "";
  el.exportProjectFilter.innerHTML = '<option value="">Alle Projekte</option>' + state.data.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)}</option>`).join("");
  el.exportProjectFilter.value = state.exportProject;
  const images = exportProjectImages();
  const counts = new Map(state.data.tags.map((tag) => [tag.id, images.filter((image) => image.tag_ids.includes(tag.id)).length]));
  el.exportTagFilters.innerHTML = state.data.tags.length
    ? state.data.tags.map((tag) => `<label class="tag-check"><input type="checkbox" data-export-tag-id="${tag.id}" ${state.exportTags.has(tag.id) ? "checked" : ""} /><span>${escapeHtml(tag.name)} <small>${counts.get(tag.id)}</small></span></label>`).join("")
    : '<span class="admin-muted">Keine Kategorien verfügbar.</span>';
}

function renderExportImages() {
  const eligibleIds = new Set(exportProjectImages().map((image) => image.id));
  state.exportSelected = new Set([...state.exportSelected].filter((id) => eligibleIds.has(id)));
  const images = exportFilteredImages();
  const selectedCount = state.exportSelected.size;
  el.exportSelectionSummary.textContent = `${selectedCount} ${selectedCount === 1 ? "Bild" : "Bilder"} ausgewählt`;
  el.createPortfolioButton.disabled = selectedCount === 0;
  el.clearExportSelection.disabled = selectedCount === 0;
  $("#select-visible-images").disabled = images.length === 0 || images.every((image) => state.exportSelected.has(image.id));
  $("#export-result-count").textContent = `${images.length} ${images.length === 1 ? "Eintrag" : "Einträge"}`;
  el.exportTable.hidden = images.length === 0;
  if (!images.length) {
    el.exportBody.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><h2>Keine Ergebnisse</h2><p>Ändere den Projekt- oder Kategoriefilter.</p></div></td></tr>';
    el.exportTable.hidden = false;
    return;
  }
  el.exportBody.innerHTML = images.map((image) => {
    const tags = tagNames(image);
    const projects = projectNames(image);
    const status = image.archived ? "Archiviert" : image.published ? "Veröffentlicht" : "Entwurf";
    return `<tr class="export-row ${state.exportSelected.has(image.id) ? "is-selected" : ""}">
      <td><input class="row-checkbox" type="checkbox" data-export-image-id="${image.id}" aria-label="Auswählen: ${escapeHtml(image.original_name)}" ${state.exportSelected.has(image.id) ? "checked" : ""} /></td>
      <td>${mediaMarkup(image, "admin-thumb")}</td>
      <td><span class="file-name">${escapeHtml(image.original_name)}</span><small class="row-subtitle">${escapeHtml(image.alt_text || "Kein Alternativtext")}</small></td>
      <td><span class="tags">${tags.length ? tags.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("") : '<span class="admin-muted">Keine Kategorien</span>'}</span></td>
      <td>${projects.length ? escapeHtml(projects.join(", ")) : '<span class="admin-muted">Kein Projekt</span>'}</td>
      <td><span class="status">${status}</span></td>
    </tr>`;
  }).join("");
}

function selectedExportImages() {
  return exportProjectImages().filter((image) => state.exportSelected.has(image.id));
}

function safeFileName(value) {
  return String(value || "portfolio")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "portfolio";
}

function chunk(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function groupedExportImages(images) {
  const groups = new Map();
  images.forEach((image) => {
    const projectId = (state.exportProject && image.project_ids.includes(state.exportProject) ? state.exportProject : image.project_ids[0]) || "__unassigned";
    if (!groups.has(projectId)) groups.set(projectId, []);
    groups.get(projectId).push(image);
  });
  const projectOrder = new Map(state.data.projects.map((project, index) => [project.id, index]));
  return [...groups.entries()]
    .sort(([a], [b]) => (projectOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (projectOrder.get(b) ?? Number.MAX_SAFE_INTEGER))
    .map(([projectId, projectImages]) => ({
      project: projectId === "__unassigned" ? null : projectFor(projectId),
      images: projectImages,
    }));
}

function buildPortfolioDocument(images) {
  const chosenCategories = [...state.exportTags].map((id) => tagFor(id)?.name).filter(Boolean);
  const selectionFocus = $("#portfolio-title").value.trim() || chosenCategories.join(" und ") || "Kreation";
  const studio = state.data.settings;
  const clients = String(studio.clients || "").split("\n").map((client) => client.trim()).filter(Boolean);
  const categories = [...new Set(images.flatMap((image) => tagNames(image)))];
  const date = new Intl.DateTimeFormat("de-DE", { year: "numeric", month: "long" }).format(new Date());
  let pageNumber = 0;
  const pages = groupedExportImages(images).flatMap(({ project, images: projectImages }) => {
    const projectTitle = project?.title || "Freie Arbeiten";
    const projectDescription = project?.description || "Ausgewählte Arbeiten ohne Projektzuordnung.";
    const projectClient = project?.client || "AD4K Studio-Auswahl";
    const projectCategories = [...new Set(projectImages.flatMap((image) => tagNames(image)))];
    const batches = chunk(projectImages, 5);
    return batches.map((batch, batchIndex) => {
      pageNumber += 1;
      const tiles = batch.map((image) => `<figure class="project-tile"><img src="${escapeHtml(new URL(image.url, location.origin).href)}" alt="${escapeHtml(image.alt_text || image.original_name)}" /></figure>`).join("");
      return `<article class="portfolio-page project-page">
        <aside class="project-copy">
          <div><p class="project-index">${String(pageNumber).padStart(2, "0")} / ${escapeHtml(projectClient)}</p><h2>${escapeHtml(projectTitle)}${batchIndex ? " <small>(Fortsetzung)</small>" : ""}</h2><p class="project-description">${escapeHtml(projectDescription)}</p></div>
          <p class="project-meta">${escapeHtml(projectCategories.join(" / ") || "Ausgewählte Arbeiten")}<br />${projectImages.length} ${projectImages.length === 1 ? "Bild" : "Bilder"}</p>
        </aside>
        <div class="project-grid grid-count-${batch.length}">${tiles}</div>
      </article>`;
    });
  }).join("");

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>AD4K - ${escapeHtml(safeFileName(selectionFocus))} portfolio</title>
<style>
  :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #111; background: #d7d7d2; }
  * { box-sizing: border-box; }
  figure { margin: 0; }
  html, body { margin: 0; }
  body { padding: 18px; }
  .print-toolbar { position: sticky; z-index: 10; top: 12px; display: flex; justify-content: space-between; align-items: center; width: min(100%, 1120px); min-height: 48px; margin: 0 auto 18px; padding: 8px 10px 8px 16px; background: #111; color: #fff; font-size: 12px; }
  .print-toolbar button { min-height: 32px; padding: 0 14px; border: 1px solid #fff; background: #fff; color: #111; cursor: pointer; }
  .portfolio-page { width: min(100%, 1120px); aspect-ratio: 297 / 210; margin: 0 auto 18px; overflow: hidden; background: #f7f7f3; box-shadow: 0 2px 22px rgba(0,0,0,.12); }
  .cover-page { display: grid; grid-template-rows: 1fr auto; padding: 7.5%; }
  .cover-main { align-self: center; }
  .cover-we-are, .project-index, .project-meta { margin: 0; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
  .cover-we-are { margin-bottom: 4px; }
  .cover-main h1 { margin: 0; font-size: clamp(92px, 15vw, 210px); font-weight: 400; letter-spacing: -.075em; line-height: .78; }
  .cover-selection { max-width: 720px; margin: 36px 0 0; font-size: clamp(20px, 2.2vw, 34px); line-height: 1.25; }
  .cover-selection strong { font-weight: 400; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: .12em; }
  .cover-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; padding-top: 18px; border-top: 1px solid #bbb; }
  .cover-footer h2 { margin: 0 0 9px; font-size: 10px; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; }
  .cover-footer p { max-width: 460px; margin: 0; font-size: 12px; line-height: 1.5; }
  .project-page { display: grid; grid-template-columns: 26% minmax(0, 1fr); gap: 4%; padding: 4%; }
  .project-copy { display: flex; min-width: 0; flex-direction: column; justify-content: space-between; padding-right: 8%; border-right: 1px solid #bbb; }
  .project-copy h2 { margin: 14px 0 0; font-size: clamp(28px, 3.2vw, 48px); font-weight: 400; letter-spacing: -.045em; line-height: .96; overflow-wrap: anywhere; }
  .project-copy h2 small { display: block; margin-top: 8px; color: #686863; font-size: 10px; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; }
  .project-description { margin: 24px 0 0; color: #4f4f4b; font-size: 13px; line-height: 1.55; }
  .project-meta { color: #686863; line-height: 1.6; }
  .project-grid { display: grid; min-width: 0; min-height: 0; gap: 9px; }
  .project-tile { display: grid; min-width: 0; min-height: 0; overflow: hidden; place-items: center; background: #e7e7e2; }
  .project-tile img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .grid-count-1 { grid-template: 1fr / 1fr; }
  .grid-count-2 { grid-template: 1fr / repeat(2, minmax(0, 1fr)); }
  .grid-count-3 { grid-template: repeat(2, minmax(0, 1fr)) / minmax(0, 1.45fr) minmax(0, 1fr); }
  .grid-count-3 .project-tile:first-child { grid-row: 1 / 3; }
  .grid-count-4, .grid-count-5 { grid-template: repeat(2, minmax(0, 1fr)) / minmax(0, 1.45fr) repeat(2, minmax(0, 1fr)); }
  .grid-count-4 .project-tile:first-child, .grid-count-5 .project-tile:first-child { grid-row: 1 / 3; }
  .grid-count-4 .project-tile:nth-child(4) { grid-column: 2 / 4; }
  @page { size: A4 landscape; margin: 0; }
  @media print {
    html, body { background: #fff; }
    body { padding: 0; }
    .print-toolbar { display: none; }
    .portfolio-page { width: 297mm; height: 210mm; margin: 0; break-after: page; box-shadow: none; }
    .portfolio-page:last-child { break-after: auto; }
    .cover-main h1 { font-size: 48mm; }
    .cover-selection { font-size: 8mm; }
    .project-copy h2 { font-size: 11mm; }
  }
</style></head><body>
  <div class="print-toolbar"><span>Wähle im Druckdialog „Als PDF speichern“.</span><button type="button" onclick="window.print()">Drucken / PDF speichern</button></div>
  <section class="portfolio-page cover-page">
    <div class="cover-main"><p class="cover-we-are">Wir sind</p><h1>AD4K</h1><p class="cover-selection">Eine Auswahl unserer Arbeiten im Bereich <strong>${escapeHtml(selectionFocus)}</strong>.</p></div>
    <div class="cover-footer"><div><h2>${escapeHtml(studio.eyebrow || "Über das Studio")}</h2><p>${escapeHtml(studio.about || "AD4K ist ein unabhängiges Kreativstudio.")}</p></div><div><h2>Ausgewählte Kunden</h2><p>${escapeHtml(clients.join(" / ") || "AD4K Studio-Portfolio")}<br />${escapeHtml(categories.join(" / ") || "Ausgewählte Arbeiten")} / ${escapeHtml(date)}</p></div></div>
  </section>
  ${pages}
<script>
  Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); })))
    .then(() => document.fonts?.ready)
    .then(() => setTimeout(() => window.print(), 180));
</script></body></html>`;
}

function createPortfolioPdf() {
  const images = selectedExportImages();
  if (!images.length) return;
  const preview = window.open("", "_blank");
  if (!preview) {
    notify("Erlaube Pop-ups, um das Portfolio-PDF zu erstellen");
    return;
  }
  preview.document.open();
  preview.document.write(buildPortfolioDocument(images));
  preview.document.close();
  preview.opener = null;
}

function renderAll() {
  renderFilters();
  renderImages();
  renderProjects();
  renderTagManager();
  renderSettings();
  renderExportFilters();
  renderExportImages();
}

async function refresh() {
  state.data = await api("/api/admin/bootstrap");
  const imageIds = new Set(state.data.images.map((image) => image.id));
  state.librarySelected = new Set([...state.librarySelected].filter(id => imageIds.has(id)));
  state.exportSelected = new Set([...state.exportSelected].filter((id) => imageIds.has(id)));
  renderAll();
}

async function bootstrap() {
  await refresh();
  el.loginView.hidden = true;
  el.adminApp.hidden = false;
}

function renderRelationOptions(container, values, selected, name) {
  container.innerHTML = values.length
    ? values.map((item) => `<label class="tag-check"><input type="checkbox" name="${name}" value="${item.id}" ${selected.includes(item.id) ? "checked" : ""} /><span>${escapeHtml(item.name || item.title)}</span></label>`).join("")
    : '<span class="admin-muted">Noch keine Optionen.</span>';
}

function setProjectOption(index) {
  state.projectOptionIndex = index;
  el.imageProjects.querySelectorAll('[role="option"]').forEach((option, position) => {
    option.classList.toggle("is-active", position === index);
    if (position === index) option.scrollIntoView({ block: "nearest" });
  });
  if (index >= 0) el.projectSearch.setAttribute("aria-activedescendant", `image-project-option-${index}`);
  else el.projectSearch.removeAttribute("aria-activedescendant");
}

function renderProjectOptions() {
  const query = el.projectSearch.value.trim().toLocaleLowerCase("de");
  state.projectOptions = [{ id: "", title: "Kein Projekt" }, ...state.data.projects]
    .filter((project) => project.title.toLocaleLowerCase("de").includes(query));
  el.imageProjects.innerHTML = state.projectOptions.map((project, index) => `<button class="project-combobox-option" id="image-project-option-${index}" type="button" role="option" tabindex="-1" data-project-id="${escapeHtml(project.id)}" aria-selected="${(project.id ? state.selectedProjects.has(project.id) : !state.selectedProjects.size)}"><span>${escapeHtml(project.title)}</span><span class="project-option-check" aria-hidden="true">${(project.id ? state.selectedProjects.has(project.id) : !state.selectedProjects.size) ? "✓" : ""}</span></button>`).join("");
  el.projectEmpty.hidden = Boolean(state.projectOptions.length);
  const selected = state.projectOptions.findIndex((project) => (project.id ? state.selectedProjects.has(project.id) : !state.selectedProjects.size));
  setProjectOption(state.projectOptions.length ? Math.max(0, selected) : -1);
}

function closeProjectSelect(returnFocus = false) {
  el.projectPanel.hidden = true;
  el.projectTrigger.setAttribute("aria-expanded", "false");
  el.projectSearch.setAttribute("aria-expanded", "false");
  el.projectSearch.removeAttribute("aria-activedescendant");
  if (returnFocus) el.projectTrigger.focus({ preventScroll: true });
}

function openProjectSelect(last = false) {
  el.projectSearch.value = "";
  el.projectPanel.hidden = false;
  el.projectTrigger.setAttribute("aria-expanded", "true");
  el.projectSearch.setAttribute("aria-expanded", "true");
  renderProjectOptions();
  if (last) setProjectOption(state.projectOptions.length - 1);
  el.projectSearch.focus({ preventScroll: true });
  el.projectPanel.scrollIntoView({ block: "nearest" });
}

function selectProject(id) {
  if (!id) state.selectedProjects.clear();
  else if (state.selectedProjects.has(id)) state.selectedProjects.delete(id);
  else state.selectedProjects.add(id);
  el.projectSelection.value = [...state.selectedProjects][0] || '';
  el.projectValue.textContent = [...state.selectedProjects].map(id => projectFor(id)?.title).filter(Boolean).join(', ') || 'Kein Projekt';
  renderProjectOptions();
  el.projectSearch.focus({ preventScroll: true });
}

el.projectTrigger.addEventListener("click", () => {
  if (el.projectPanel.hidden) openProjectSelect();
  else closeProjectSelect(true);
});
el.projectTrigger.addEventListener("keydown", (event) => {
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    openProjectSelect(event.key === "ArrowUp");
  }
});
el.projectSearch.addEventListener("input", renderProjectOptions);
el.projectSearch.addEventListener("keydown", (event) => {
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    const count = state.projectOptions.length;
    if (count) setProjectOption((state.projectOptionIndex + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const project = state.projectOptions[state.projectOptionIndex];
    if (project) selectProject(project.id);
  }
});
el.projectPanel.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeProjectSelect(true);
  }
});
el.imageProjects.addEventListener("click", (event) => {
  const option = event.target.closest("[data-project-id]");
  if (option) selectProject(option.dataset.projectId);
});
$("#image-project-field").addEventListener("focusout", (event) => {
  if (event.relatedTarget && !$("#image-project-field").contains(event.relatedTarget)) closeProjectSelect();
});

function openImage(image = null, field = "name") {
  releasePreviewURL();
  state.selectedFile = null;
  state.selectedFiles = [];
  $("#upload-queue").textContent = "";
  el.imageForm.reset();
  $("#image-error").textContent = "";
  $("#image-id").value = image?.id || "";
  $("#image-dialog-title").textContent = image ? "Asset bearbeiten" : "Asset hinzufügen";
  $("#image-name").value = image?.original_name || "";
  $("#image-alt").value = image?.alt_text || "";
  $("#image-published").checked = Boolean(image?.published && !image?.archived);
  renderRelationOptions(el.imageTags, state.data.tags, image?.tag_ids || [], "image-tag");
  state.selectedProjects = new Set(image?.project_ids || []);
  el.projectSelection.value = image?.project_ids[0] || "";
  el.projectValue.textContent = [...state.selectedProjects].map(id => projectFor(id)?.title).join(", ") || "Kein Projekt";
  closeProjectSelect();
  el.imageFile.multiple = !image;
  el.imageFile.tabIndex = image ? -1 : 0;
  el.replaceImageFile.hidden = !image;
  el.dropzoneCopy.hidden = Boolean(image);
  el.imagePreview = setMediaPreview(el.imagePreview, image, true);
  openDrawer(el.imageDialog);
  const focusTargets = { name: "#image-name", tags: "#image-tags-field input", project: "#image-project-trigger" };
  const target = $(focusTargets[field] || focusTargets.name) || $("#image-name");
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest" });
}

function openProject(project = null) {
  state.projectReturnScroll = window.scrollY || 0;
  state.projectReturnFocus = document.activeElement;
  el.projectForm.reset();
  $("#project-error").textContent = "";
  $("#project-id").value = project?.id || "";
  $("#project-title").value = project?.title || "";
  $("#project-client").value = project?.client || "";
  $("#project-description").value = project?.description || "";
  $("#project-published").checked = project ? Boolean(project.published) : true;
  $('#project-editor-title').textContent = project?.title || 'Neues Projekt';
  openThumbnailPicker(project);
  openLayoutEditor(project);
  setView('project-editor');
  updateProjectHeaderInset();
  window.scrollTo?.({ top: 0, behavior: 'instant' });
  (project ? $('#project-editor-title') : $('#project-title')).focus({ preventScroll: true });
}

function updateProjectHeaderInset() {
  $('#project-editor .project-editor-heading').style.top = `${$('.admin-topbar').getBoundingClientRect().height}px`;
}
window.addEventListener('resize', updateProjectHeaderInset);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateProjectHeaderInset).observe($('.admin-topbar'));

function closeProjectEditor() {
  $('#layout-asset-dialog').close();
  $('#layout-text-dialog').close();
  setView('projects');
  window.scrollTo?.({ top: state.projectReturnScroll, behavior: 'instant' });
  const previous = state.projectReturnFocus;
  const fallback = $(`[data-edit-project="${$('#project-id').value}"]`) || $('#add-project-button');
  (previous?.isConnected ? previous : fallback).focus({ preventScroll: true });
}
$('#project-back').addEventListener('click', closeProjectEditor);
$('#project-cancel').addEventListener('click', closeProjectEditor);

function openTags() {
  $("#tag-error").textContent = "";
  el.newTagForm.reset();
  renderTagManager();
  el.tagsDialog.showModal();
  $("#new-tag-name").focus();
}

function selectFile(file) {
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4"].includes(file.type)) {
    $("#image-error").textContent = "Wähle ein Bild oder MP4-Video aus.";
    return;
  }
  if (file.size > (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? 20 : 4) * 1024 * 1024) {
    $("#image-error").textContent = "Die Datei ist zu groß. Online müssen Uploads kleiner als 4 MB sein; lokal sind bis zu 20 MB möglich.";
    return;
  }
  releasePreviewURL();
  state.selectedFile = file;
  previewURL = URL.createObjectURL(file);
  el.imagePreview = setMediaPreview(el.imagePreview, { url: previewURL, mime_type: file.type, original_name: file.name }, true);
  $("#image-error").textContent = "";
  el.imagePreview.hidden = false;
  el.dropzoneCopy.hidden = true;
  if (!$("#image-name").value) $("#image-name").value = file.name;
}

function rowMenuTrigger(kind, id, name) {
  return `<button class="row-menu-trigger" type="button" data-row-kind="${kind}" data-row-id="${escapeHtml(id)}" aria-label="Aktionen für ${escapeHtml(name)}" aria-haspopup="menu" aria-expanded="false" aria-controls="row-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>`;
}

function closeRowMenu(returnFocus = false) {
  const trigger = state.rowMenu?.trigger;
  trigger?.setAttribute("aria-expanded", "false");
  state.rowMenu = null;
  el.rowMenu.hidden = true;
  if (returnFocus && trigger?.isConnected) trigger.focus();
}

function openRowMenu(trigger, last = false) {
  if (state.rowMenu?.trigger === trigger) { closeRowMenu(true); return; }
  closeRowMenu();
  closeFilterMenu();
  state.rowMenu = { trigger, kind: trigger.dataset.rowKind, id: trigger.dataset.rowId };
  trigger.setAttribute("aria-expanded", "true");
  el.rowMenu.hidden = false;
  const anchor = trigger.getBoundingClientRect();
  const menu = el.rowMenu.getBoundingClientRect();
  el.rowMenu.style.left = `${Math.max(8, Math.min(anchor.right - menu.width, innerWidth - menu.width - 8))}px`;
  el.rowMenu.style.top = `${Math.max(8, Math.min(anchor.bottom + 4 + menu.height > innerHeight - 8 ? anchor.top - menu.height - 4 : anchor.bottom + 4, innerHeight - menu.height - 8))}px`;
  const items = el.rowMenu.querySelectorAll('[role="menuitem"]');
  items[last ? items.length - 1 : 0].focus();
}

el.rowMenu.addEventListener("keydown", (event) => {
  const items = [...el.rowMenu.querySelectorAll('[role="menuitem"]')];
  const current = items.indexOf(document.activeElement);
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeRowMenu(true);
  } else if (event.key === "Tab") {
    // Return to the row so normal tab order continues through the table.
    closeRowMenu(true);
  }
});
el.rowMenu.addEventListener("focusout", (event) => {
  if (event.relatedTarget && !el.rowMenu.contains(event.relatedTarget)) closeRowMenu();
});
el.rowMenu.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-row-action]")?.dataset.rowAction;
  const selected = state.rowMenu;
  if (!action || !selected) return;
  closeRowMenu(true);
  const { kind, id } = selected;
  if (action === "edit") {
    if (kind === "project") openProject(projectFor(id));
    else openImage(state.data.images.find((image) => image.id === id));
    return;
  }
  const message = kind === "project" ? "Dieses Projekt löschen? Seine Assets bleiben unter „Alle Assets“ erhalten." : "Dieses Asset dauerhaft löschen?";
  if (!confirm(message)) return;
  try {
    await api(`/api/${kind === "project" ? "projects" : "images"}/${id}`, { method: "DELETE" });
    await refresh();
    notify(kind === "project" ? "Projekt gelöscht" : "Asset gelöscht");
  } catch (reason) { notify(reason.message); }
});
window.addEventListener("resize", () => closeRowMenu());
window.addEventListener("scroll", (event) => {
  if (!(event.target instanceof Node) || !el.rowMenu.contains(event.target)) closeRowMenu();
}, true);

function closeFilterMenu() {
  el.filterMenu.hidden = true;
  $("#tag-filter-button").setAttribute("aria-expanded", "false");
}

function openDrawer(drawer) {
  closeRowMenu();
  closeFilterMenu();
  drawer.querySelector(".drawer-body").scrollTop = 0;
  drawer.showModal();
  document.documentElement.classList.add("has-open-drawer");
}

// Native modal dialogs provide focus containment, Escape and return focus.
[el.imageDialog].forEach((drawer) => {
  let backdropPress = false;
  const outside = (event) => {
    const box = drawer.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  drawer.addEventListener("pointerdown", (event) => { backdropPress = event.target === drawer && outside(event); });
  drawer.addEventListener("pointerup", (event) => {
    if (backdropPress && event.target === drawer && outside(event)) drawer.close();
    backdropPress = false;
  });
  drawer.addEventListener("close", () => {
    if (drawer === el.imageDialog) { closeProjectSelect(); releasePreviewURL(); }
    document.documentElement.classList.remove("has-open-drawer");
  });
});

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#login-error").textContent = "";
  try {
    await api("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#password").value }) });
    await bootstrap();
  } catch (error) { $("#login-error").textContent = error.message; }
});

$("#logout").addEventListener("click", async () => {
  if (state.view === 'project-editor') closeProjectEditor();
  await api("/api/logout", { method: "POST" });
  el.adminApp.hidden = true;
  el.loginView.hidden = false;
  $("#password").value = "";
});

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#add-image-button").addEventListener("click", () => openImage());
$("#add-project-button").addEventListener("click", () => openProject());
$("#manage-tags-button").addEventListener("click", () => { closeRowMenu(); openTags(); });
document.querySelectorAll("[data-open-upload]").forEach((button) => button.addEventListener("click", () => openImage()));
document.querySelectorAll("[data-open-project]").forEach((button) => button.addEventListener("click", () => openProject()));
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

$("#image-search").addEventListener("input", (event) => { state.search = event.target.value; renderImages(); });
$("#tag-filter-button").addEventListener("click", () => {
  closeRowMenu();
  el.filterMenu.hidden = !el.filterMenu.hidden;
  $("#tag-filter-button").setAttribute("aria-expanded", String(!el.filterMenu.hidden));
});
el.tagFilters.addEventListener("change", (event) => {
  const input = event.target.closest("[data-tag-id]");
  if (!input) return;
  input.checked ? state.selectedTags.add(input.dataset.tagId) : state.selectedTags.delete(input.dataset.tagId);
  renderFilters();
  renderImages();
});
el.clearFilters.addEventListener("click", () => { state.selectedTags.clear(); renderFilters(); renderImages(); });

el.exportProjectFilter.addEventListener("change", () => {
  state.exportProject = el.exportProjectFilter.value;
  renderExportFilters();
  renderExportImages();
});
el.exportTagFilters.addEventListener("change", (event) => {
  const input = event.target.closest("[data-export-tag-id]");
  if (!input) return;
  input.checked ? state.exportTags.add(input.dataset.exportTagId) : state.exportTags.delete(input.dataset.exportTagId);
  renderExportFilters();
  renderExportImages();
});
el.exportBody.addEventListener("change", (event) => {
  const input = event.target.closest("[data-export-image-id]");
  if (!input) return;
  input.checked ? state.exportSelected.add(input.dataset.exportImageId) : state.exportSelected.delete(input.dataset.exportImageId);
  renderExportImages();
});
$("#select-visible-images").addEventListener("click", () => {
  exportFilteredImages().forEach((image) => state.exportSelected.add(image.id));
  renderExportImages();
});
el.clearExportSelection.addEventListener("click", () => {
  state.exportSelected.clear();
  renderExportImages();
});
el.createPortfolioButton.addEventListener("click", createPortfolioPdf);

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-row-kind]");
  if (trigger) openRowMenu(trigger);
  else if (!event.target.closest("#row-menu")) closeRowMenu();
  if (!event.target.closest(".menu-wrap")) closeFilterMenu();
  if (!event.target.closest("#image-project-field")) closeProjectSelect();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.projectDrag) { event.preventDefault(); cancelProjectDrag(); }
  const trigger = event.target.closest("[data-row-kind]");
  if (trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    openRowMenu(trigger, event.key === "ArrowUp");
  }
  if (event.key === "Escape" && !el.filterMenu.hidden) {
    closeFilterMenu();
    $("#tag-filter-button").focus();
  }
});

el.replaceImageFile.addEventListener("click", () => el.imageFile.click());
el.imageFile.addEventListener("change", () => {
  selectFiles(el.imageFile.files);
  el.imageFile.value = "";
});
el.dropzone.addEventListener("dragover", (event) => { if (!el.imageFile.disabled) event.preventDefault(); });
el.dropzone.addEventListener("drop", (event) => { if (!el.imageFile.disabled) { event.preventDefault(); selectFiles(event.dataTransfer.files); } });

el.imageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter || el.imageForm.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  const id = $("#image-id").value;
  const error = $("#image-error");
  if (!id && !state.selectedFile) { error.textContent = "Wähle zuerst ein Bild oder MP4-Video aus."; return; }
  const label = submit.textContent;
  submit.disabled = true;
  el.imageFile.disabled = el.replaceImageFile.disabled = true;
  submit.textContent = id && !state.selectedFile ? "Speichert…" : "Lädt hoch…";
  el.imageForm.setAttribute("aria-busy", "true");
  error.textContent = "";
  try {
    const tagIds = [...document.querySelectorAll('input[name="image-tag"]:checked')].map((input) => input.value);
    const projectIds = [...state.selectedProjects];
    const current = state.data.images.find((image) => image.id === id);
    let aspectRatio = current?.aspect_ratio || 1;
    if (state.selectedFile) {
      try { aspectRatio = await mediaDimensions(el.imagePreview); }
      catch { throw new Error("Die Datei konnte nicht gelesen werden. Wähle ein gültiges Bild oder MP4-Video aus."); }
    }
    const shared = {
      original_name: $("#image-name").value,
      alt_text: $("#image-alt").value,
      aspect_ratio: aspectRatio,
      published: $("#image-published").checked,
      archived: !$("#image-published").checked,
      tag_names: tagIds.map((tagId) => tagFor(tagId)?.name).filter(Boolean).join(", "),
      project_ids: projectIds,
    };
    if (id && state.selectedFile) {
      const fields = { aspect_ratio: aspectRatio };
      if (shared.original_name !== current.original_name) fields.original_name = shared.original_name;
      if (shared.alt_text !== (current.alt_text || "")) fields.alt_text = shared.alt_text;
      if (shared.published !== Boolean(current.published && !current.archived)) fields.published = shared.published;
      if (!sameSelection(tagIds, current.tag_ids)) fields.tag_names = shared.tag_names;
      if (!sameSelection(projectIds, current.project_ids)) fields.project_ids = projectIds;
      await api(`/api/images/${id}`, { method: "PUT", body: mediaUploadForm(state.selectedFile, fields) });
    } else if (id) {
      await api(`/api/images/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shared) });
    } else {
      const queue = state.selectedFiles.length ? state.selectedFiles : [state.selectedFile];
      while (queue.length) {
        const file = queue[0];
        submit.textContent = `Lädt hoch… ${queue.length} verbleibend`;
        const ratio = file === state.selectedFile ? aspectRatio : await fileDimensions(file);
        const fields = { ...shared, aspect_ratio: ratio, original_name: state.selectedFiles.length > 1 || file !== state.selectedFile ? file.name : shared.original_name };
        await api("/api/images", { method: "POST", body: mediaUploadForm(file, fields) });
        queue.shift();
        state.selectedFiles = queue;
        $("#upload-queue").textContent = queue.map(item => item.name).join(' · ');
      }
    }
    el.imageDialog.close();
    await refresh();
    notify(id ? "Asset aktualisiert" : "Asset hinzugefügt");
  } catch (reason) { error.textContent = reason.message; if (!id) { await refresh(); error.textContent += " Bereits hochgeladene Assets bleiben gespeichert; erneut speichern setzt die Warteschlange fort."; } }
  finally {
    submit.disabled = false;
    el.imageFile.disabled = el.replaceImageFile.disabled = false;
    submit.textContent = label;
    el.imageForm.removeAttribute("aria-busy");
  }
});

el.projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  $("#project-error").textContent = "";
  try {
    const id = $("#project-id").value;
    await api("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id || undefined, title: $("#project-title").value, client: $("#project-client").value, description: $("#project-description").value, sort_order: id ? projectFor(id)?.sort_order || 0 : Math.max(-10, ...state.data.projects.map((project) => project.sort_order || 0)) + 10, published: $("#project-published").checked, thumbnail_id: $("#project-thumbnail").value, ...(layoutEditor.dirty ? { composition: { columns: 12, manual: layoutEditor.custom, hero_id: layoutEditor.heroId || "", ...(layoutEditor.heroHidden ? { hero_hidden: true } : {}), placements: layoutEditor.placements, texts: layoutEditor.texts, rows: layoutEditor.rows } } : {}) }),
    });
    await refresh();
    closeProjectEditor();
    notify(id ? "Projekt aktualisiert" : "Projekt erstellt");
  } catch (reason) { $("#project-error").textContent = reason.message; }
  finally { submit.disabled = false; }
});

el.newTagForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  $("#tag-error").textContent = "";
  try {
    await api("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: $("#new-tag-name").value }) });
    el.newTagForm.reset();
    await refresh();
    $("#new-tag-name").focus();
  } catch (reason) { $("#tag-error").textContent = reason.message; }
  finally { submit.disabled = false; }
});

el.tagManager.addEventListener("click", async (event) => {
  const save = event.target.closest("[data-save-tag]");
  if (save) {
    save.disabled = true;
    try {
      const input = save.closest(".manager-row").querySelector("[data-tag-name]");
      await api(`/api/tags/${save.dataset.saveTag}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: input.value }) });
      await refresh();
      notify("Tag umbenannt");
    } catch (reason) { $("#tag-error").textContent = reason.message; save.disabled = false; }
    return;
  }
  const remove = event.target.closest("[data-delete-tag]");
  if (!remove || !confirm("Diesen Tag löschen? Er wird von allen zugeordneten Assets entfernt.")) return;
  try {
    state.selectedTags.delete(remove.dataset.deleteTag);
    state.exportTags.delete(remove.dataset.deleteTag);
    await api(`/api/tags/${remove.dataset.deleteTag}`, { method: "DELETE" });
    await refresh();
    notify("Tag gelöscht");
  } catch (reason) { $("#tag-error").textContent = reason.message; }
});

el.projectBody.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-project]");
  if (edit) openProject(projectFor(edit.dataset.editProject));
});

el.imageBody.addEventListener("click", (event) => {
  const field = event.target.closest("[data-edit-field]");
  if (field) {
    const image = state.data.images.find((item) => item.id === field.dataset.imageId);
    if (image) openImage(image, field.dataset.editField);
  }
});

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eyebrow: $("#setting-eyebrow").value, about: $("#setting-about").value, clients: $("#setting-clients").value, footer_contact: $("#setting-footer-contact").value, footer_address: $("#setting-footer-address").value, footer_email: $("#setting-footer-email").value }),
  });
  await refresh();
  notify("Studio-Informationen gespeichert");
});

api("/api/session").then((session) => { if (session.authenticated) return bootstrap(); }).catch(() => {});

// Drafts stay local to the project editor until the project is saved.
const layoutEditor = { texts: {}, visible: [], heroId: '', images: [], placements: {}, custom: false, dirty: false, selected: null, drag: null, rows: 0, composed: false, empty: null, heroHidden: false, picker: null, textDraft: null, suppressClick: false };
function openThumbnailPicker(project) {
  const images = state.data.images.filter(image => image.project_ids.includes(project?.id) && image.published && !image.archived && image.url);
  const picker = $('#project-thumbnail');
  picker.innerHTML = `<option value="">Automatisch${images[0] ? ` · ${escapeHtml(images[0].original_name)}` : ' · noch kein veröffentlichtes Asset'}</option>` + images.map(image => `<option value="${escapeHtml(image.id)}">${escapeHtml(image.original_name)}</option>`).join('');
  picker.value = images.some(image => image.id === project?.thumbnail_id) ? project.thumbnail_id : '';
  updateThumbnailPreview(images);
}
function updateThumbnailPreview(images) {
  const image = images.find(image => image.id === $('#project-thumbnail').value) || images[0];
  const preview = $('#project-thumbnail-preview');
  preview.hidden = !image;
  setMediaPreview(preview, image);
}
$('#project-thumbnail').addEventListener('change', () => {
  updateThumbnailPreview(layoutEditor.visible);
  if (!layoutEditor.heroId) changeLayoutHero($('#project-thumbnail').value || layoutEditor.visible[0]?.id || '', false);
});
function openLayoutEditor(project) {
  const assigned = state.data.images.filter(image => image.project_ids.includes(project?.id));
  const visible = assigned.filter(image => image.published && !image.archived && image.url);
  const composition = projectComposition(project || { id: '' }, state.data.settings, visible);
  const assignedIds = new Set(assigned.map(image => image.id));
  composition.placements = Object.fromEntries(Object.entries(composition.placements).filter(([id]) => assignedIds.has(id)));
  layoutEditor.visible = visible;
  layoutEditor.heroId = assignedIds.has(composition.hero_id) ? composition.hero_id : '';
  layoutEditor.heroHidden = Boolean(composition.hero_hidden);
  layoutEditor.hero = visible.find(image => image.id === (layoutEditor.heroId || project?.thumbnail_id)) || visible[0];
  if (layoutEditor.heroHidden) layoutEditor.hero = null;
  layoutEditor.images = visible.filter(image => image !== layoutEditor.hero);
  layoutEditor.custom = composition.manual;
  layoutEditor.composed = true;
  layoutEditor.texts = composition.texts;
  layoutEditor.placements = composition.manual ? composition.placements : automaticPlacements(layoutEditor.images);
  layoutEditor.retained = {};
  layoutEditor.rows = Math.max(composition.rows, 0, ...Object.values(layoutEditor.placements).map(p => p.row));
  layoutEditor.dirty = false;
  layoutEditor.selected = null;
  layoutEditor.empty = null;
  layoutEditor.picker = null;
  layoutEditor.textDraft = null;
  layoutEditor.drag = null;
  $('#layout-status').textContent = '';
  $('#layout-hidden-images').textContent = `${assigned.length - visible.length} nicht veröffentlichte Assets werden auf der Website nicht angezeigt.`;
  renderLayoutEditor();
}
function changeLayoutHero(id, explicit = true) {
  const next = layoutEditor.visible.find(image => image.id === id);
  if (!next) return;
  const previous = layoutEditor.hero;
  layoutEditor.heroHidden = false;
  layoutEditor.hero = next;
  const placement = layoutEditor.placements[next.id];
  delete layoutEditor.placements[next.id];
  if (previous && previous !== next) {
    if (placement) layoutEditor.placements[previous.id] = placement;
    else if (layoutEditor.custom) placeLayoutAsset(previous.id);
  }
  layoutEditor.hero = next;
  if (explicit) layoutEditor.heroId = next.id;
  layoutEditor.images = layoutEditor.visible.filter(image => image !== next);
  if (!layoutEditor.custom) layoutEditor.placements = automaticPlacements(layoutEditor.images);
  layoutEditor.rows = Math.max(layoutEditor.rows, 0, ...Object.values(layoutEditor.placements).map(p => p.row));
  layoutEditor.dirty = true;
  renderLayoutEditor();
}
function allLayoutPlacements() { return { ...layoutEditor.placements, ...layoutEditor.texts }; }
function placeLayoutAsset(id, position = null) {
  const image = layoutEditor.visible.find(image => image.id === id);
  if (!image || image === layoutEditor.hero || layoutEditor.placements[id]) return;
  let placement = position || { column: 1, span: 4, row: 1, ratio: Number(image.aspect_ratio) || 1 };
  if (!position) {
    while (placement.row <= layoutEditor.rows && !canPlaceImage(id, placement)) placement.row++;
  }
  commitLayoutPlacement(id, placement);
}
function renderLayoutEditor(focusId) {
  const editor = layoutEditor;
  $('#layout-mode').hidden = !editor.visible.length;
  $('#layout-mode').textContent = editor.custom ? 'Automatisches Layout' : '12-Spalten-Layout erstellen';
  $('#layout-help').textContent = editor.custom
    ? 'Asset, Hero oder leere Spalte auswählen: + fügt ein Asset hinzu, ↔ tauscht es aus und der Papierkorb entfernt das Element. T fügt Text in eine leere Spalte ein. Vorhandenen Text zum Bearbeiten anklicken. Zeilen am Griff ziehen oder mit ↑ und ↓ verschieben. Mit + eine Zeile einfügen. Assets ziehen; am rechten Griff die Breite ändern. Tastatur: Pfeiltasten verschieben, Umschalt + Links/Rechts ändert die Breite. Escape bricht das Ziehen ab. Änderungen werden mit dem Projekt gespeichert.'
    : 'Hero oder Asset auswählen und über die Werkzeugleiste bearbeiten. Für freie Platzierung das 12-Spalten-Layout erstellen. Das gewählte Hero-Asset wird darüber dargestellt.';
  const imageMarkup = image => mediaMarkup(image, "", image.alt_text || image.original_name);
  const hero = editor.hero ? `<div class="layout-meta"><span>${escapeHtml($('#project-title').value)}</span><span>${escapeHtml($('#project-client').value)}</span></div><div class="layout-hero" data-layout-hero><button type="button" class="layout-hero-select" data-select-hero aria-label="Hero auswählen" aria-describedby="layout-help">${imageMarkup(editor.hero)}</button><span>Hero · volle Breite</span>${layoutToolbar("hero")}</div>` : editor.visible.length ? `<div class="layout-hero layout-hero-empty" data-layout-hero><button type="button" class="layout-hero-select" data-select-hero aria-label="Leeren Hero-Bereich auswählen">Hero hinzufügen</button>${layoutToolbar('hero')}</div>` : '<p class="layout-empty">Noch keine veröffentlichten Assets zugeordnet. Assets unter „Alle Assets“ diesem Projekt zuordnen.</p>';
  let body = '';
  if (editor.custom) {
    const insertButton = (row, top = false) => `<button type="button" class="layout-row-add${top ? ' is-top' : ''}" data-insert-row="${row}" aria-label="Zeile ${row} einfügen" ${editor.rows >= 1000 ? 'disabled' : ''}>+</button>`;
    const occupied = new Set(Object.values(allLayoutPlacements()).map(p => p.row));
    const rows = Array.from({ length: Math.max(1, editor.rows) }, (_, index) => {
      const row = index + 1;
      const grip = editor.rows > 1 ? `<button type="button" class="layout-row-grip" data-move-row="${row}" aria-label="Zeile ${row} verschieben" aria-describedby="layout-help" aria-keyshortcuts="ArrowUp ArrowDown">⠿</button>` : '';
      return `<div class="layout-row${occupied.has(row) ? '' : ' is-empty'}" data-layout-row="${row}" style="grid-row:${row}">${row === 1 ? insertButton(1, true) : ''}${insertButton(row + 1)}${grip}${emptyLayoutCells(row)}${!occupied.has(row) ? `<span class="layout-row-empty" aria-hidden="true">Freie Zeile</span><button type="button" class="layout-row-remove" data-remove-row="${row}" aria-label="Leere Zeile ${row} entfernen">×</button>` : ''}</div>`;
    }).join('');
    body = `<div class="layout-grid${editor.composed ? ' composed-layout' : ''}">${rows}${editor.images.filter(image => editor.placements[image.id]).map(image => {
      const p = editor.placements[image.id];
      const column = p.column;
      const span = p.span;
      return `<div class="layout-tile" data-layout-image="${escapeHtml(image.id)}" style="grid-column:${column}/span ${span};grid-row:${p.row};${p.ratio ? `--layout-ratio:${p.ratio}` : ''}"><button type="button" class="layout-move" aria-describedby="layout-help" aria-label="${escapeHtml(image.original_name)} verschieben">${imageMarkup(image)}<span class="layout-tile-label">${escapeHtml(image.original_name)}</span></button><button type="button" class="layout-resize" aria-label="Breite von ${escapeHtml(image.original_name)} ändern" aria-describedby="layout-help">↔</button>${layoutToolbar(image.id)}</div>`;
    }).join('')}${Object.entries(editor.texts).map(([id, p]) => `<div class="layout-tile layout-text-tile" data-layout-image="${escapeHtml(id)}" style="grid-column:${p.column}/span ${p.span};grid-row:${p.row}"><button type="button" class="layout-move" aria-label="Text bearbeiten oder verschieben" aria-describedby="layout-help"><span class="layout-white-text">${escapeHtml(p.text)}</span></button><button type="button" class="layout-resize" aria-label="Textbreite ändern">↔</button>${layoutToolbar(id)}</div>`).join('')}<div class="layout-target" hidden aria-hidden="true"></div></div>`;
  } else {
    body = `<div class="layout-auto">${projectRows(editor.images).map(({ image, span, ratio }) => `<div class="layout-tile layout-auto-tile" data-layout-image="${escapeHtml(image.id)}" style="grid-column:span ${span};--preview-ratio:${ratio}"><button type="button" class="layout-move" aria-label="${escapeHtml(image.original_name)} auswählen">${imageMarkup(image)}</button>${layoutToolbar(image.id)}</div>`).join('')}</div>`;
  }
  $('#layout-page').innerHTML = hero + body;
  updateLayoutSelection();
  if (focusId) $(`[data-layout-image="${focusId}"] .layout-move`)?.focus({ preventScroll: true });
}
function updateLayoutSelection() {
  const id = layoutEditor.selected;
  const placement = allLayoutPlacements()[id];
  $('#layout-page').querySelectorAll('[data-layout-image]').forEach(tile => tile.classList.toggle('is-selected', tile.dataset.layoutImage === id));
  $('#layout-page [data-layout-hero]')?.classList.toggle('is-selected', id === 'hero');
  $('#layout-page').querySelectorAll('[data-empty-cell]').forEach(cell => cell.classList.toggle('is-selected', Boolean(layoutEditor.empty && Number(cell.dataset.row) === layoutEditor.empty.row && Number(cell.dataset.column) === layoutEditor.empty.column)));
  updateContextToolbar();
  $('#layout-selection').textContent = placement ? `Spalte ${Number(placement.column.toFixed(2))} · Breite ${Number(placement.span.toFixed(2))} · Zeile ${placement.row}` : 'Asset auswählen';
}
function canPlaceImage(id, placement, placements = allLayoutPlacements()) {
  return placement.column >= 1 && placement.span >= 1 && placement.column + placement.span <= 13 + 1e-6 && placement.row >= 1 && placement.row <= 1000 && !Object.entries(placements).some(([otherId, other]) => otherId !== id && other.row === placement.row && other.column < placement.column + placement.span - 1e-6 && placement.column < other.column + other.span - 1e-6);
}
function commitLayoutPlacement(id, placement) {
  if (!canPlaceImage(id, placement)) {
    $('#layout-status').textContent = 'Hier ist kein Platz. Wähle eine freie Position im Raster.';
    return false;
  }
  if (layoutEditor.texts[id]) layoutEditor.texts[id] = placement;
  else layoutEditor.placements[id] = placement;
  layoutEditor.selected = id;
  layoutEditor.empty = null;
  layoutEditor.dirty = true;
  layoutEditor.rows = Math.min(1000, Math.max(layoutEditor.rows, placement.row));
  renderLayoutEditor(id);
  $('#layout-status').textContent = `Asset verschoben: Spalte ${Number(placement.column.toFixed(2))}, Breite ${Number(placement.span.toFixed(2))}, Zeile ${placement.row}.`;
  return true;
}
$('#layout-mode').addEventListener('click', () => {
  layoutEditor.custom = !layoutEditor.custom;
  layoutEditor.selected = null;
  layoutEditor.empty = null;
  layoutEditor.dirty = true;
  layoutEditor.composed = true;
  layoutEditor.placements = automaticPlacements(layoutEditor.images);
  layoutEditor.texts = {};
  layoutEditor.rows = Math.max(0, ...Object.values(layoutEditor.placements).map(p => p.row));
  renderLayoutEditor();
});
function insertLayoutRow(row) {
  if (!Number.isInteger(row) || row < 1 || row > Math.max(1, layoutEditor.rows) + 1 || layoutEditor.rows >= 1000) return;
  for (const placement of Object.values(allLayoutPlacements())) if (placement.row >= row) placement.row++;
  layoutEditor.rows = Math.max(1, layoutEditor.rows) + 1;
  if (layoutEditor.empty && layoutEditor.empty.row >= row) layoutEditor.empty.row++;
  layoutEditor.dirty = true;
  layoutEditor.composed = true;
  renderLayoutEditor();
  $(`[data-insert-row="${row}"]`)?.focus({ preventScroll: true });
  $('#layout-status').textContent = `Leere Zeile ${row} eingefügt.`;
}
function removeLayoutRow(row) {
  if (!Number.isInteger(row) || row < 1 || row > layoutEditor.rows || Object.values(allLayoutPlacements()).some(p => p.row === row)) return;
  for (const placement of Object.values(allLayoutPlacements())) if (placement.row > row) placement.row--;
  layoutEditor.rows--;
  if (layoutEditor.empty?.row === row) layoutEditor.empty = null;
  else if (layoutEditor.empty && layoutEditor.empty.row > row) layoutEditor.empty.row--;
  layoutEditor.dirty = true;
  renderLayoutEditor();
  $(`[data-insert-row="${row}"]`)?.focus({ preventScroll: true });
  $('#layout-status').textContent = `Leere Zeile ${row} entfernt.`;
}
function moveLayoutRow(from, to) {
  if (from === to || to < 1 || to > layoutEditor.rows) return;
  const shift = from < to ? -1 : 1;
  for (const placement of [...Object.values(allLayoutPlacements()), layoutEditor.empty].filter(Boolean)) {
    if (placement.row === from) placement.row = to;
    else if (placement.row >= Math.min(from, to) && placement.row <= Math.max(from, to)) placement.row += shift;
  }
  layoutEditor.dirty = true;
  renderLayoutEditor();
  const grip = $(`#layout-page [data-move-row="${to}"]`);
  grip?.focus({ preventScroll: true });
  grip?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('#layout-status').textContent = `Zeile ${from} an Position ${to} verschoben.`;
}
$('#layout-page').addEventListener('click', event => {
  if (layoutEditor.suppressClick) { layoutEditor.suppressClick = false; return; }
  const action = event.target.closest('[data-layout-action]');
  if (action) { handleLayoutAction(action.dataset.layoutAction, action); return; }
  const insert = event.target.closest('[data-insert-row]');
  if (insert) { insertLayoutRow(Number(insert.dataset.insertRow)); return; }
  const remove = event.target.closest('[data-remove-row]');
  if (remove) { removeLayoutRow(Number(remove.dataset.removeRow)); return; }
  const empty = event.target.closest('[data-empty-cell]');
  if (empty) { selectEmptyLayoutCell(Number(empty.dataset.row), Number(empty.dataset.column)); return; }
  if (event.target.closest('[data-layout-hero]')) { layoutEditor.selected = 'hero'; layoutEditor.empty = null; updateLayoutSelection(); return; }
  const tile = event.target.closest('[data-layout-image]');
  if (!tile) return;
  layoutEditor.selected = tile.dataset.layoutImage;
  layoutEditor.empty = null;
  updateLayoutSelection();
  const textButton = event.target.closest('.layout-move');
  if (layoutEditor.texts[layoutEditor.selected] && textButton) openLayoutTextEditor(textButton);
});
$('#layout-page').addEventListener('keydown', event => {
  if (event.key === 'Escape' && layoutEditor.drag) {
    event.preventDefault(); event.stopPropagation(); finishLayoutDrag(false); return;
  }
  if (event.target.closest('[data-layout-action]')) return;
  const grip = event.target.closest('[data-move-row]');
  if (grip && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const row = Number(grip.dataset.moveRow);
    if (!layoutEditor.drag) moveLayoutRow(row, row + (event.key === 'ArrowUp' ? -1 : 1));
    return;
  }
  const empty = event.target.closest('[data-empty-cell]');
  if (empty && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const next = Number(empty.dataset.column) + (event.key === 'ArrowLeft' ? -1 : 1);
    const nextCell = $(`#layout-page [data-empty-cell][data-row="${empty.dataset.row}"][data-column="${next}"]`);
    if (nextCell) { selectEmptyLayoutCell(Number(empty.dataset.row), next); nextCell.focus(); }
    return;
  }
  const tile = event.target.closest('[data-layout-image]');
  if (!layoutEditor.custom || !tile || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const id = tile.dataset.layoutImage;
  layoutEditor.selected = id;
  const next = { ...allLayoutPlacements()[id] };
  const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  if (event.shiftKey || event.target.closest('.layout-resize')) next.span += horizontal;
  else { next.column += horizontal; next.row += event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0; }
  commitLayoutPlacement(id, next);
});
$('#layout-page').addEventListener('pointerdown', event => {
  if (layoutEditor.drag || !layoutEditor.custom || event.button !== 0 || event.isPrimary === false || event.target.closest('[data-layout-action]')) return;
  const grip = event.target.closest('[data-move-row]');
  const tile = grip || event.target.closest('[data-layout-image]');
  if (!tile) return;
  const grid = tile.closest('.layout-grid');
  const drag = {
    pointerId: event.pointerId, tile, grid, next: null, moved: false,
    x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
  };
  if (grip) {
    drag.row = Number(grip.dataset.moveRow);
    drag.rows = [...grid.querySelectorAll('[data-layout-row]')];
    grip.focus({ preventScroll: true });
  } else {
    drag.id = tile.dataset.layoutImage;
    drag.original = { ...allLayoutPlacements()[drag.id] };
    drag.resize = Boolean(event.target.closest('.layout-resize'));
    drag.offsetX = event.clientX - tile.getBoundingClientRect().left;
    layoutEditor.selected = drag.id;
    layoutEditor.empty = null;
    updateLayoutSelection();
  }
  layoutEditor.drag = drag;
  tile.setPointerCapture(event.pointerId);
  const scroll = () => {
    if (layoutEditor.drag !== drag) return;
    const bounds = { top: $('#project-editor .project-editor-heading').getBoundingClientRect().bottom, bottom: window.innerHeight };
    if (drag.moved) {
      const step = drag.y < bounds.top + 55 ? -10 : drag.y > bounds.bottom - 55 ? 10 : 0;
      if (step) { window.scrollBy(0, step); updateLayoutDrag(); }
      const horizontalViewport = $('.layout-viewport');
      const horizontalBounds = horizontalViewport.getBoundingClientRect();
      const horizontalStep = drag.x < horizontalBounds.left + 30 ? -8 : drag.x > horizontalBounds.right - 30 ? 8 : 0;
      if (!drag.row && horizontalStep) { horizontalViewport.scrollLeft += horizontalStep; updateLayoutDrag(); }
    }
    drag.frame = requestAnimationFrame(scroll);
  };
  drag.frame = requestAnimationFrame(scroll);
});
function updateLayoutDrag() {
  const drag = layoutEditor.drag;
  if (!drag?.moved) return;
  const rect = drag.grid.getBoundingClientRect();
  if (drag.row) {
    let boundary = 0;
    let line = 0;
    for (const row of drag.rows) {
      const bounds = row.getBoundingClientRect();
      line = bounds.top;
      if (drag.y < bounds.top + bounds.height / 2) break;
      boundary++;
      line = bounds.bottom;
    }
    drag.next = boundary + (boundary < drag.row ? 1 : 0);
    const target = drag.grid.querySelector('.layout-target');
    target.hidden = drag.next === drag.row;
    target.classList.remove('is-invalid');
    target.classList.add('is-row-target');
    Object.assign(target.style, { left: '0', top: `${line - rect.top}px`, width: '100%', height: '3px' });
    return;
  }
  const gap = rect.width * .01064;
  const unit = (rect.width + gap) / 12;
  const next = { ...drag.original };
  if (drag.resize) next.span = Math.max(1, Math.min(13 - next.column, Math.round((drag.x - rect.left - (next.column - 1) * unit + gap) / unit)));
  else {
    next.column = Math.max(1, Math.min(13 - next.span, Math.round((drag.x - rect.left - drag.offsetX) / unit) + 1));
    const rows = [...drag.grid.querySelectorAll('[data-layout-row]')];
    const row = rows.find(row => { const r = row.getBoundingClientRect(); return drag.y >= r.top && drag.y < r.bottom; });
    if (!row) { drag.next = null; drag.grid.querySelector('.layout-target').hidden = true; return; }
    next.row = Number(row.dataset.layoutRow);
  }
  drag.next = canPlaceImage(drag.id, next) ? next : null;
  const row = drag.grid.querySelector(`[data-layout-row="${next.row}"]`).getBoundingClientRect();
  const target = drag.grid.querySelector('.layout-target');
  target.hidden = false;
  target.classList.toggle('is-invalid', !drag.next);
  Object.assign(target.style, { left: `${(next.column - 1) * unit}px`, top: `${row.top - rect.top}px`, width: `${next.span * unit - gap}px`, height: `${row.height}px` });
}
$('#layout-page').addEventListener('pointermove', event => {
  const drag = layoutEditor.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.x = event.clientX; drag.y = event.clientY;
  if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 4) drag.moved = true;
  if (drag.moved) { drag.tile.classList.add('is-dragging'); updateLayoutDrag(); }
});
function finishLayoutDrag(commit) {
  const drag = layoutEditor.drag;
  if (!drag) return;
  layoutEditor.drag = null;
  layoutEditor.suppressClick = Boolean(drag.moved);
  if (drag.moved) setTimeout(() => { layoutEditor.suppressClick = false; }, 0);
  cancelAnimationFrame(drag.frame);
  if (drag.tile.hasPointerCapture(drag.pointerId)) drag.tile.releasePointerCapture(drag.pointerId);
  drag.tile.classList.remove('is-dragging');
  const target = drag.grid.querySelector('.layout-target');
  target.hidden = true;
  if (drag.row) target.classList.remove('is-row-target');
  if (commit && drag.moved && drag.row) moveLayoutRow(drag.row, drag.next);
  else if (commit && drag.moved && drag.next) commitLayoutPlacement(drag.id, drag.next);
  else if (commit && drag.moved) $('#layout-status').textContent = 'Hier ist kein Platz. Das Asset bleibt an seiner bisherigen Position.';
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('#layout-page').addEventListener(type, event => {
    if (event.pointerId === layoutEditor.drag?.pointerId) finishLayoutDrag(type === 'pointerup');
  });
}

for (const selector of ['#project-title', '#project-client']) {
  $(selector).addEventListener('input', () => {
    $('#project-editor-title').textContent = $('#project-title').value.trim() || 'Neues Projekt';
    const meta = $('#layout-page .layout-meta');
    if (meta) {
      meta.children[0].textContent = $('#project-title').value;
      meta.children[1].textContent = $('#project-client').value;
    }
  });
}

function sameSelection(ids, current) {
  return ids.length === current.length && ids.every(id => current.includes(id));
}

function mediaUploadForm(file, fields) {
  const form = new FormData();
  form.append("image", file);
  Object.entries(fields).forEach(([key, value]) => form.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value)));
  return form;
}

function selectFiles(files) {
  const queue = [...files];
  if (!queue.length) return;
  const replacing = Boolean($("#image-id").value);
  if (replacing && queue.length > 1) {
    $("#image-error").textContent = "Wähle genau eine Datei als Ersatz aus.";
    return;
  }
  const limit = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 20 : 4) * 1024 * 1024;
  const invalid = queue.find(file => !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4'].includes(file.type) || file.size > limit);
  if (invalid) { $('#image-error').textContent = `${invalid.name}: Format nicht unterstützt oder Datei zu groß (max. ${limit / 1024 / 1024} MB pro Datei).`; return; }
  state.selectedFiles = queue;
  selectFile(queue[0]);
  $('#upload-queue').textContent = replacing
    ? `Neue Datei · ${queue[0].name}`
    : `${queue.length} ${queue.length === 1 ? 'Datei' : 'Dateien'} · ${queue.map(file => file.name).join(' · ')}`;
}
async function fileDimensions(file) {
  const url = URL.createObjectURL(file);
  const preview = document.createElement(file.type === 'video/mp4' ? 'video' : 'img');
  preview.preload = 'metadata'; preview.muted = true; preview.src = url;
  try { return await mediaDimensions(preview); }
  finally { preview.pause?.(); preview.removeAttribute('src'); preview.load?.(); URL.revokeObjectURL(url); }
}

function updateLibrarySelection() {
  const ids = filteredImages().map(image => image.id);
  const count = ids.filter(id => state.librarySelected.has(id)).length;
  const checkbox = $('#library-select-all');
  checkbox.checked = ids.length > 0 && count === ids.length;
  checkbox.indeterminate = count > 0 && count < ids.length;
  $('#library-selection-count').textContent = `${state.librarySelected.size} ausgewählt`;
  $('#library-clear-selection').hidden = !state.librarySelected.size;
  $('#library-delete-selection').hidden = !state.librarySelected.size;
  $('#library-delete-selection').disabled = state.batchBusy;
}
function inlineEditorMarkup(id, field) {
  const edit = state.inlineEdit;
  if (!edit || edit.anchor !== id || edit.field !== field) return '';
  let options;
  if (field === 'published') options = `<label class="field"><span>Status für ${edit.ids.length} Assets</span><select data-inline-status><option value="">Bitte wählen</option><option value="true" ${edit.status === true ? 'selected' : ''}>Veröffentlicht</option><option value="false" ${edit.status === false ? 'selected' : ''}>Archiviert</option></select></label>`;
  else {
    const values = field === 'tag_ids' ? state.data.tags : state.data.projects;
    options = `<p>${edit.ids.length} Assets · Gemischte Zuordnungen bleiben bis zur Änderung erhalten.</p>` + values.map(item => `<label class="tag-check"><input type="checkbox" data-inline-relation="${escapeHtml(item.id)}" ${edit.values.has(item.id) ? 'checked' : ''} /><span>${escapeHtml(item.name || item.title)}${edit.mixed.has(item.id) ? ' (teilweise)' : ''}</span></label>`).join('');
  }
  return `<div class="cell-editor" role="group" aria-label="${field === 'tag_ids' ? 'Tags' : field === 'project_ids' ? 'Projekte' : 'Status'} bearbeiten">${options}<div class="cell-editor-actions"><button type="button" class="button primary" data-inline-save ${state.batchBusy ? 'disabled' : ''}>Übernehmen</button><button type="button" class="button" data-inline-cancel>Abbrechen</button></div><p class="form-error" id="inline-error" role="alert"></p></div>`;
}
el.imageBody.addEventListener('change', event => {
  const selected = event.target.closest('[data-library-select]');
  if (selected) {
    selected.checked ? state.librarySelected.add(selected.dataset.librarySelect) : state.librarySelected.delete(selected.dataset.librarySelect);
    if (!state.batchBusy) state.inlineEdit = null; renderImages(); return;
  }
  if (event.target.matches('[data-inline-status]')) state.inlineEdit.status = event.target.value === '' ? null : event.target.value === 'true';
  const relation = event.target.closest('[data-inline-relation]');
  if (relation) state.inlineEdit.touched.set(relation.dataset.inlineRelation, relation.checked);
});
el.imageBody.addEventListener('click', async event => {
  if (event.target.closest('[data-inline-cancel]')) { state.inlineEdit = null; renderImages(); return; }
  if (event.target.closest('[data-inline-save]')) {
    if (state.batchBusy) return;
    const edit = state.inlineEdit;
    const changes = {};
    if (edit.field === 'published') {
      if (edit.status === null) { $('#inline-error').textContent = 'Wähle einen Status.'; return; }
      changes.published = edit.status;
    } else {
      changes[`add_${edit.field}`] = [...edit.touched].filter(([, checked]) => checked).map(([id]) => id);
      changes[`remove_${edit.field}`] = [...edit.touched].filter(([, checked]) => !checked).map(([id]) => id);
    }
    state.batchBusy = true; renderImages();
    try {
      await api('/api/images/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: edit.ids, changes }) });
      state.inlineEdit = null; await refresh(); notify(`${edit.ids.length} Assets aktualisiert`);
    } catch (error) { $('#inline-error').textContent = error.message; }
    finally {
      state.batchBusy = false;
      if (state.inlineEdit) {
        const message = $("#inline-error").textContent;
        renderImages();
        $("#inline-error").textContent = message;
      } else updateLibrarySelection();
    }
    return;
  }
  const trigger = event.target.closest('[data-inline-field]');
  if (!trigger || state.batchBusy) return;
  const id = trigger.dataset.imageId, field = trigger.dataset.inlineField;
  const ids = state.librarySelected.has(id) ? [...state.librarySelected] : [id];
  const images = state.data.images.filter(image => ids.includes(image.id));
  const values = field === 'published' ? [] : [...new Set(images.flatMap(image => image[field]))];
  const common = values.filter(value => images.every(image => image[field].includes(value)));
  const statuses = new Set(images.map(image => Boolean(image.published && !image.archived)));
  state.inlineEdit = { anchor: id, ids, field, values: new Set(common), mixed: new Set(values.filter(value => !common.includes(value))), touched: new Map(), status: statuses.size === 1 ? [...statuses][0] : null };
  renderImages();
  el.imageBody.querySelector('.cell-editor input, .cell-editor select, .cell-editor button')?.focus();
});
$('#library-select-all').addEventListener('change', event => {
  filteredImages().forEach(image => event.target.checked ? state.librarySelected.add(image.id) : state.librarySelected.delete(image.id));
  state.inlineEdit = null; renderImages();
});
$('#library-clear-selection').addEventListener('click', () => { state.librarySelected.clear(); state.inlineEdit = null; renderImages(); });

const deleteSelectionDialog = $('#library-delete-dialog');
const deleteSelectionConfirm = $('#library-delete-confirm');
let deleteSelectionIds = [];
$('#library-delete-selection').addEventListener('click', () => {
  if (state.batchBusy || !state.librarySelected.size) return;
  deleteSelectionIds = [...state.librarySelected];
  const count = deleteSelectionIds.length;
  const hiddenCount = count - filteredImages().filter(image => state.librarySelected.has(image.id)).length;
  $('#library-delete-title').textContent = `${count} ${count === 1 ? 'Asset' : 'Assets'} endgültig löschen?`;
  const hiddenMessage = hiddenCount ? ` Der aktuelle Filter blendet ${hiddenCount} davon aus.` : '';
  $('#library-delete-description').textContent = (count === 1
    ? 'Das Asset wird aus der Bibliothek und allen zugeordneten Projekten entfernt.'
    : 'Die Assets werden aus der Bibliothek und allen zugeordneten Projekten entfernt.') + hiddenMessage;
  $('#library-delete-error').hidden = true;
  $('#library-delete-error').textContent = '';
  $('#library-delete-selection').focus();
  deleteSelectionDialog.showModal();
});
deleteSelectionDialog.addEventListener('cancel', event => {
  if (deleteSelectionConfirm.disabled) event.preventDefault();
});
$('#library-delete-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!deleteSelectionDialog.open || deleteSelectionConfirm.disabled) return;
  const ids = new Set(deleteSelectionIds);
  const cancel = $('#library-delete-cancel');
  const error = $('#library-delete-error');
  cancel.disabled = deleteSelectionConfirm.disabled = true;
  deleteSelectionConfirm.textContent = 'Wird gelöscht…';
  error.hidden = true;
  try {
    await api('/api/images/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: deleteSelectionIds }),
    });
  } catch (reason) {
    error.textContent = reason.message;
    error.hidden = false;
    return;
  } finally {
    cancel.disabled = deleteSelectionConfirm.disabled = false;
    deleteSelectionConfirm.textContent = 'Endgültig löschen';
    if (!error.hidden) deleteSelectionConfirm.focus();
  }
  state.data.images = state.data.images.filter(image => !ids.has(image.id));
  ids.forEach(id => {
    state.librarySelected.delete(id);
    state.exportSelected.delete(id);
  });
  state.inlineEdit = null;
  deleteSelectionDialog.close();
  renderAll();
  $('#image-search').focus();
  notify(ids.size === 1 ? 'Asset gelöscht' : `${ids.size} Assets gelöscht`);
});

el.imageBody.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !state.inlineEdit || state.batchBusy) return;
  event.preventDefault();
  const { anchor, field } = state.inlineEdit;
  state.inlineEdit = null; renderImages();
  el.imageBody.querySelector(`[data-image-id="${anchor}"][data-inline-field="${field}"]`)?.focus();
});

// Selection tools share one asset picker and one text editor across the canvas.
function layoutToolbar(id) {
  const hero = id === 'hero';
  const empty = id === 'empty' || (hero && !layoutEditor.hero);
  const swapIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg>';
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
  const button = (action, label, icon) => `<button type="button" data-layout-action="${action}" title="${label}" aria-label="${label}">${icon}</button>`;
  return `<div class="layout-context-toolbar" role="group" aria-label="Auswahl bearbeiten" data-toolbar-for="${escapeHtml(id)}" hidden>${button('asset', empty ? 'Asset hinzufügen' : 'Asset austauschen', empty ? '+' : swapIcon)}${id === 'empty' ? button('text', 'Text hinzufügen', 'T') : ''}${!empty ? button('remove', 'Aus Layout entfernen', trashIcon) : ''}</div>`;
}
function emptyLayoutCells(row) {
  const placements = Object.values(allLayoutPlacements()).filter(p => p.row === row);
  const free = column => !placements.some(p => p.column <= column && column < p.column + p.span);
  const cells = Array.from({ length: 12 }, (_, index) => index + 1).filter(free).map(column => `<button type="button" class="layout-empty-cell" data-empty-cell data-row="${row}" data-column="${column}" style="--cell:${column}" aria-label="Leere Spalte ${column} in Zeile ${row} auswählen"></button>`).join('');
  const empty = layoutEditor.empty;
  const selection = empty?.row === row && free(empty.column) ? `<div class="layout-empty-selection" style="--cell:${empty.column};--span:${empty.span}">${layoutToolbar('empty')}</div>` : '';
  return cells + selection;
}
function updateContextToolbar() {
  $('#layout-page').querySelectorAll('[data-toolbar-for]').forEach(toolbar => {
    toolbar.hidden = toolbar.dataset.toolbarFor === 'empty' ? !layoutEditor.empty : toolbar.dataset.toolbarFor !== layoutEditor.selected;
    if (!toolbar.hidden) {
      toolbar.style.right = '5px';
      const minimumLeft = $('#layout-page').getBoundingClientRect().left + 4;
      const left = toolbar.getBoundingClientRect().left;
      if (left < minimumLeft) toolbar.style.right = `${5 - (minimumLeft - left)}px`;
    }
  });
}
function selectEmptyLayoutCell(row, column) {
  const placements = Object.values(allLayoutPlacements()).filter(p => p.row === row);
  let available = 0;
  while (column + available <= 12 && !placements.some(p => p.column <= column + available && column + available < p.column + p.span)) available++;
  if (!available) return;
  layoutEditor.empty = { row, column, span: Math.min(4, available) };
  layoutEditor.selected = null;
  renderLayoutEditor();
  $(`#layout-page [data-empty-cell][data-row="${row}"][data-column="${column}"]`)?.focus({ preventScroll: true });
}
function layoutSelectionTarget() {
  const id = layoutEditor.selected;
  if (id === 'hero') return { kind: 'hero', id: layoutEditor.hero?.id || '' };
  const placement = allLayoutPlacements()[id];
  if (placement) return { kind: 'slot', id, placement: { ...placement } };
  if (layoutEditor.empty) return { kind: 'slot', id: null, placement: { ...layoutEditor.empty } };
  return null;
}
function ensureManualLayout() {
  if (layoutEditor.custom) return;
  layoutEditor.custom = true;
  layoutEditor.composed = true;
  layoutEditor.placements = automaticPlacements(layoutEditor.images);
  layoutEditor.rows = Math.max(0, ...Object.values(layoutEditor.placements).map(p => p.row));
}
function handleLayoutAction(action, trigger) {
  if (action === 'asset') openLayoutAssetPicker(trigger);
  if (action === 'text') openLayoutTextEditor(trigger);
  if (action === 'remove') removeLayoutSelection();
}
function restoreLayoutFocus() {
  if (layoutEditor.selected === 'hero') $('#layout-page [data-select-hero]')?.focus({ preventScroll: true });
  else if (layoutEditor.selected) $(`#layout-page [data-layout-image="${layoutEditor.selected}"] .layout-move`)?.focus({ preventScroll: true });
  else if (layoutEditor.empty) $(`#layout-page [data-empty-cell][data-row="${layoutEditor.empty.row}"][data-column="${layoutEditor.empty.column}"]`)?.focus({ preventScroll: true });
}
function openLayoutAssetPicker(trigger) {
  const target = layoutSelectionTarget();
  if (!target) return;
  layoutEditor.picker = { target, selectedId: layoutEditor.texts[target.id] ? '' : target.id || '', trigger };
  $('#layout-asset-search').value = '';
  $('#layout-asset-error').textContent = '';
  $('#layout-asset-title').textContent = target.kind === 'hero' ? 'Hero-Asset auswählen' : target.id ? 'Asset austauschen' : 'Asset hinzufügen';
  renderLayoutAssetOptions();
  $('#layout-asset-dialog').showModal();
  document.documentElement.classList.add('has-open-drawer');
  $('#layout-asset-search').focus();
}
function renderLayoutAssetOptions() {
  const picker = layoutEditor.picker;
  if (!picker) return;
  const query = $('#layout-asset-search').value.trim().toLocaleLowerCase('de');
  const images = layoutEditor.visible.filter(image => `${image.original_name} ${image.alt_text || ''}`.toLocaleLowerCase('de').includes(query));
  $('#layout-asset-options').innerHTML = '<legend class="sr-only">Projekt-Assets</legend>' + (images.map(image => `<label class="layout-asset-option"><input type="radio" name="layout-asset" value="${escapeHtml(image.id)}" ${picker.selectedId === image.id ? 'checked' : ''}/>${mediaMarkup(image)}<span>${escapeHtml(image.original_name)}</span><small>${image === layoutEditor.hero ? 'Hero' : layoutEditor.placements[image.id] ? 'Bereits platziert' : 'Verfügbar'}</small></label>`).join('') || '<p class="admin-muted">Keine passenden Assets in diesem Projekt.</p>');
  $('#layout-asset-confirm').disabled = !layoutEditor.visible.some(image => image.id === picker.selectedId);
}
function applyLayoutAsset(target, id) {
  const image = layoutEditor.visible.find(item => item.id === id);
  if (!image) return false;
  if (target.kind === 'hero') { changeLayoutHero(id); layoutEditor.selected = 'hero'; updateLayoutSelection(); return true; }
  if (target.id === id) return true;
  const oldPlacement = layoutEditor.placements[id];
  const oldImage = layoutEditor.visible.find(item => item.id === target.id);
  const others = Object.fromEntries(Object.entries(allLayoutPlacements()).filter(([key]) => key !== target.id && key !== id));
  const placement = { column: target.placement.column, span: target.placement.span, row: target.placement.row, ratio: target.placement.ratio || Number(image.aspect_ratio) || 1 };
  if (!canPlaceImage(id, placement, others)) return false;
  ensureManualLayout();
  delete layoutEditor.placements[target.id]; delete layoutEditor.texts[target.id];
  if (image === layoutEditor.hero) {
    layoutEditor.hero = oldImage || null;
    layoutEditor.heroId = oldImage?.id || image.id;
    layoutEditor.heroHidden = !oldImage;
  } else if (oldPlacement && oldImage) layoutEditor.placements[oldImage.id] = oldPlacement;
  layoutEditor.placements[id] = placement;
  layoutEditor.images = layoutEditor.visible.filter(item => item !== layoutEditor.hero);
  layoutEditor.rows = Math.max(layoutEditor.rows, placement.row);
  layoutEditor.selected = id; layoutEditor.empty = null; layoutEditor.dirty = true;
  renderLayoutEditor();
  return true;
}
function removeLayoutSelection() {
  const target = layoutSelectionTarget();
  if (!target || (target.kind === 'hero' && !layoutEditor.hero)) return;
  ensureManualLayout();
  if (target.kind === 'hero') {
    layoutEditor.heroId = layoutEditor.hero.id;
    layoutEditor.hero = null; layoutEditor.heroHidden = true;
    layoutEditor.images = [...layoutEditor.visible];
  } else {
    delete layoutEditor.placements[target.id]; delete layoutEditor.texts[target.id];
    layoutEditor.selected = null; layoutEditor.empty = { column: target.placement.column, span: target.placement.span, row: target.placement.row };
  }
  layoutEditor.dirty = true;
  renderLayoutEditor(); restoreLayoutFocus();
}
function openLayoutTextEditor(trigger) {
  const target = layoutSelectionTarget();
  if (!target || target.kind === 'hero') return;
  const existing = layoutEditor.texts[target.id];
  if (target.id && !existing) return;
  layoutEditor.textDraft = { target, trigger };
  $('#layout-text-title').textContent = existing ? 'Text bearbeiten' : 'Text hinzufügen';
  $('#layout-text-content').value = existing?.text || '';
  $('#layout-text-error').textContent = '';
  $('#layout-text-dialog').showModal();
  document.documentElement.classList.add('has-open-drawer');
  $('#layout-text-content').focus();
}
function applyLayoutText(target, text) {
  if (!text.trim()) { $('#layout-text-error').textContent = 'Bitte gib einen Text ein.'; return false; }
  if (text.length > 10000) return false;
  if (!layoutEditor.texts[target.id] && Object.keys(layoutEditor.texts).length >= 200) { $('#layout-text-error').textContent = 'Pro Projekt sind bis zu 200 Textblöcke möglich.'; return false; }
  const id = layoutEditor.texts[target.id] ? target.id : `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const placement = { column: target.placement.column, span: target.placement.span, row: target.placement.row, text };
  const others = Object.fromEntries(Object.entries(allLayoutPlacements()).filter(([key]) => key !== target.id));
  if (!canPlaceImage(id, placement, others)) { $('#layout-text-error').textContent = 'Hier ist kein Platz für den Text.'; return false; }
  ensureManualLayout();
  delete layoutEditor.placements[target.id]; delete layoutEditor.texts[target.id];
  layoutEditor.texts[id] = placement;
  layoutEditor.rows = Math.max(layoutEditor.rows, placement.row);
  layoutEditor.selected = id; layoutEditor.empty = null; layoutEditor.dirty = true;
  renderLayoutEditor();
  return true;
}
$('#layout-asset-search').addEventListener('input', renderLayoutAssetOptions);
$('#layout-asset-options').addEventListener('change', event => {
  if (event.target.name !== 'layout-asset' || !layoutEditor.picker) return;
  layoutEditor.picker.selectedId = event.target.value;
  $('#layout-asset-confirm').disabled = false;
});
$('#layout-asset-form').addEventListener('submit', event => {
  event.preventDefault();
  const picker = layoutEditor.picker;
  if (!picker) return;
  if (applyLayoutAsset(picker.target, picker.selectedId)) $('#layout-asset-dialog').close();
  else $('#layout-asset-error').textContent = 'Das Asset kann hier nicht platziert werden. Wähle eine freie Position.';
});
$('#layout-text-form').addEventListener('submit', event => {
  event.preventDefault();
  const draft = layoutEditor.textDraft;
  if (draft && applyLayoutText(draft.target, $('#layout-text-content').value)) $('#layout-text-dialog').close();
});
for (const [selector, key] of [['#layout-asset-dialog', 'picker'], ['#layout-text-dialog', 'textDraft']]) {
  const dialog = $(selector);
  dialog.addEventListener('close', () => {
    const draft = layoutEditor[key];
    layoutEditor[key] = null;
    document.documentElement.classList.remove('has-open-drawer');
    dialog.querySelectorAll('video').forEach(video => video.pause());
    if (draft?.trigger?.isConnected) draft.trigger.focus({ preventScroll: true });
    else restoreLayoutFocus();
  });
}
$('#layout-page').addEventListener('focusin', event => {
  if (event.target.closest('[data-layout-action]')) return;
  const tile = event.target.closest('[data-layout-image]');
  const hero = event.target.closest('[data-select-hero]');
  if (!tile && !hero) return;
  layoutEditor.selected = hero ? 'hero' : tile.dataset.layoutImage;
  layoutEditor.empty = null; updateLayoutSelection();
});

window.addEventListener('resize', updateContextToolbar);
