import { imagePlacement, projectRows, automaticPlacements } from "/project-view.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  data: null,
  view: "library",
  projectReturnScroll: 0,
  projectReturnFocus: null,
  search: "",
  selectedTags: new Set(),
  selectedFile: null,
  rowMenu: null,
  projectOptions: [],
  projectOptionIndex: -1,
  projectDrag: null,
  reorderingProjects: false,
  exportTags: new Set(),
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
  const filtering = Boolean(state.search.trim()) || state.selectedTags.size > 0;
  $("#image-count").textContent = `${images.length} ${images.length === 1 ? "Bild" : "Bilder"}`;
  $("#table-result-count").textContent = `${images.length} ${images.length === 1 ? "Eintrag" : "Einträge"}`;
  el.imageTable.hidden = !images.length && !filtering;
  el.libraryEmpty.hidden = images.length || filtering;
  if (!images.length && filtering) {
    el.imageBody.innerHTML = '<tr><td colspan="7"><div class="admin-empty"><h2>Keine Ergebnisse</h2><p>Ändere die Suche oder die Filter.</p></div></td></tr>';
    return;
  }
  el.imageBody.innerHTML = images.map((image) => {
    const tags = tagNames(image);
    const projects = projectNames(image);
    const status = image.archived ? "Archiviert" : image.published ? "Veröffentlicht" : "Entwurf";
    return `<tr>
      <td><img class="admin-thumb" src="${escapeHtml(image.url)}" alt="" loading="lazy" /></td>
      <td><button class="cell-button" data-edit-field="name" data-image-id="${image.id}"><span class="file-name">${escapeHtml(image.original_name)}</span><small>${escapeHtml(image.alt_text || "Kein Alternativtext")}</small></button></td>
      <td><button class="cell-button" data-edit-field="tags" data-image-id="${image.id}"><span class="tags">${tags.length ? tags.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("") : '<span class="admin-muted">Tags auswählen</span>'}</span></button></td>
      <td><button class="cell-button" data-edit-field="project" data-image-id="${image.id}">${projects.length ? escapeHtml(projects[0]) : '<span class="admin-muted">Projekt auswählen</span>'}</button></td>
      <td><span class="status">${status}</span></td>
      <td class="admin-muted">${formatDate(image.created_at)}</td>
      <td><div class="row-actions">${rowMenuTrigger("image", image.id, image.original_name)}</div></td>
    </tr>`;
  }).join("");
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
      return `<div class="manager-row"><input value="${escapeHtml(tag.name)}" maxlength="60" data-tag-name="${tag.id}" aria-label="Tag-Name" /><span class="usage">${count} ${count === 1 ? "Bild" : "Bilder"}</span><button class="button" type="button" data-save-tag="${tag.id}">Speichern</button><button class="row-button danger" type="button" data-delete-tag="${tag.id}" aria-label="Tag löschen">×</button></div>`;
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

function exportFilteredImages() {
  if (!state.exportTags.size) return state.data.images;
  return state.data.images.filter((image) => image.tag_ids.some((id) => state.exportTags.has(id)));
}

function renderExportFilters() {
  const counts = new Map(state.data.tags.map((tag) => [tag.id, state.data.images.filter((image) => image.tag_ids.includes(tag.id)).length]));
  el.exportTagFilters.innerHTML = state.data.tags.length
    ? state.data.tags.map((tag) => `<label class="tag-check"><input type="checkbox" data-export-tag-id="${tag.id}" ${state.exportTags.has(tag.id) ? "checked" : ""} /><span>${escapeHtml(tag.name)} <small>${counts.get(tag.id)}</small></span></label>`).join("")
    : '<span class="admin-muted">Keine Kategorien verfügbar.</span>';
}

function renderExportImages() {
  const images = exportFilteredImages();
  const selectedCount = state.exportSelected.size;
  el.exportSelectionSummary.textContent = `${selectedCount} ${selectedCount === 1 ? "Bild" : "Bilder"} ausgewählt`;
  el.createPortfolioButton.disabled = selectedCount === 0;
  el.clearExportSelection.disabled = selectedCount === 0;
  $("#select-visible-images").disabled = images.length === 0 || images.every((image) => state.exportSelected.has(image.id));
  $("#export-result-count").textContent = `${images.length} ${images.length === 1 ? "Eintrag" : "Einträge"}`;
  el.exportTable.hidden = images.length === 0;
  if (!images.length) {
    el.exportBody.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><h2>Keine Ergebnisse</h2><p>Ändere den Kategoriefilter.</p></div></td></tr>';
    el.exportTable.hidden = false;
    return;
  }
  el.exportBody.innerHTML = images.map((image) => {
    const tags = tagNames(image);
    const projects = projectNames(image);
    const status = image.archived ? "Archiviert" : image.published ? "Veröffentlicht" : "Entwurf";
    return `<tr class="export-row ${state.exportSelected.has(image.id) ? "is-selected" : ""}">
      <td><input class="row-checkbox" type="checkbox" data-export-image-id="${image.id}" aria-label="Auswählen: ${escapeHtml(image.original_name)}" ${state.exportSelected.has(image.id) ? "checked" : ""} /></td>
      <td><img class="admin-thumb" src="${escapeHtml(image.url)}" alt="" loading="lazy" /></td>
      <td><span class="file-name">${escapeHtml(image.original_name)}</span><small class="row-subtitle">${escapeHtml(image.alt_text || "Kein Alternativtext")}</small></td>
      <td><span class="tags">${tags.length ? tags.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("") : '<span class="admin-muted">Keine Kategorien</span>'}</span></td>
      <td>${projects.length ? escapeHtml(projects[0]) : '<span class="admin-muted">Kein Projekt</span>'}</td>
      <td><span class="status">${status}</span></td>
    </tr>`;
  }).join("");
}

function selectedExportImages() {
  return state.data.images.filter((image) => state.exportSelected.has(image.id));
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
    const projectId = image.project_ids[0] || "__unassigned";
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
  el.imageProjects.innerHTML = state.projectOptions.map((project, index) => `<button class="project-combobox-option" id="image-project-option-${index}" type="button" role="option" tabindex="-1" data-project-id="${escapeHtml(project.id)}" aria-selected="${project.id === el.projectSelection.value}"><span>${escapeHtml(project.title)}</span><span class="project-option-check" aria-hidden="true">${project.id === el.projectSelection.value ? "✓" : ""}</span></button>`).join("");
  el.projectEmpty.hidden = Boolean(state.projectOptions.length);
  const selected = state.projectOptions.findIndex((project) => project.id === el.projectSelection.value);
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
  el.projectSelection.value = id;
  el.projectValue.textContent = projectFor(id)?.title || "Kein Projekt";
  closeProjectSelect(true);
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
  el.imageForm.reset();
  $("#image-error").textContent = "";
  $("#image-id").value = image?.id || "";
  $("#image-dialog-title").textContent = image ? "Bild bearbeiten" : "Bild hinzufügen";
  $("#image-name").value = image?.original_name || "";
  $("#image-alt").value = image?.alt_text || "";
  $("#image-published").checked = Boolean(image?.published && !image?.archived);
  renderRelationOptions(el.imageTags, state.data.tags, image?.tag_ids || [], "image-tag");
  el.projectSelection.value = image?.project_ids[0] || "";
  el.projectValue.textContent = projectFor(el.projectSelection.value)?.title || "Kein Projekt";
  closeProjectSelect();
  state.selectedFile = null;
  el.imageFile.disabled = Boolean(image);
  el.imagePreview.hidden = !image;
  el.dropzoneCopy.hidden = Boolean(image);
  if (image) el.imagePreview.src = image.url;
  else el.imagePreview.removeAttribute("src");
  el.dropzone.classList.toggle("is-readonly", Boolean(image));
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
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? 20 : 4) * 1024 * 1024) {
    $("#image-error").textContent = "Das Bild ist zu groß. Online müssen Uploads kleiner als 4 MB sein; lokal sind bis zu 20 MB möglich.";
    return;
  }
  state.selectedFile = file;
  el.imagePreview.src = URL.createObjectURL(file);
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
  const message = kind === "project" ? "Dieses Projekt löschen? Seine Bilder bleiben unter „Alle Bilder“ erhalten." : "Dieses Bild dauerhaft löschen?";
  if (!confirm(message)) return;
  try {
    await api(`/api/${kind === "project" ? "projects" : "images"}/${id}`, { method: "DELETE" });
    await refresh();
    notify(kind === "project" ? "Projekt gelöscht" : "Bild gelöscht");
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
    if (drawer === el.imageDialog) closeProjectSelect();
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

el.imageFile.addEventListener("change", () => selectFile(el.imageFile.files[0]));
el.dropzone.addEventListener("dragover", (event) => { if (!el.imageFile.disabled) event.preventDefault(); });
el.dropzone.addEventListener("drop", (event) => { if (!el.imageFile.disabled) { event.preventDefault(); selectFile(event.dataTransfer.files[0]); } });

el.imageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  const id = $("#image-id").value;
  const error = $("#image-error");
  if (!id && !state.selectedFile) { error.textContent = "Wähle zuerst ein Bild aus."; return; }
  submit.disabled = true;
  error.textContent = "";
  try {
    const tagIds = [...document.querySelectorAll('input[name="image-tag"]:checked')].map((input) => input.value);
    const selectedProject = el.projectSelection.value;
    const projectIds = selectedProject ? [selectedProject] : [];
    // Keep existing metadata; new uploads derive their ratio from the actual image.
    let aspectRatio = state.data.images.find((image) => image.id === id)?.aspect_ratio || 1;
    if (!id) {
      try { await el.imagePreview.decode(); }
      catch { throw new Error("Das Bild konnte nicht gelesen werden. Wähle eine gültige Bilddatei aus."); }
      aspectRatio = el.imagePreview.naturalWidth / el.imagePreview.naturalHeight || 1;
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
    if (id) {
      await api(`/api/images/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shared) });
    } else {
      const form = new FormData();
      form.append("image", state.selectedFile);
      Object.entries(shared).forEach(([key, value]) => form.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value)));
      await api("/api/images", { method: "POST", body: form });
    }
    el.imageDialog.close();
    await refresh();
    notify(id ? "Bild aktualisiert" : "Bild hinzugefügt");
  } catch (reason) { error.textContent = reason.message; }
  finally { submit.disabled = false; }
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
      body: JSON.stringify({ id: id || undefined, title: $("#project-title").value, client: $("#project-client").value, description: $("#project-description").value, sort_order: id ? projectFor(id)?.sort_order || 0 : Math.max(-10, ...state.data.projects.map((project) => project.sort_order || 0)) + 10, published: $("#project-published").checked, thumbnail_id: $("#project-thumbnail").value, ...(layoutEditor.dirty ? { image_layouts: layoutEditor.custom ? { ...layoutEditor.retained, ...layoutEditor.placements } : {}, ...(layoutEditor.composed ? { layout_rows: layoutEditor.custom ? layoutEditor.rows : 0 } : {}) } : {}) }),
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
  if (!remove || !confirm("Diesen Tag löschen? Er wird von allen zugeordneten Bildern entfernt.")) return;
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
const layoutEditor = { images: [], placements: {}, custom: false, dirty: false, selected: null, drag: null, rows: 0, composed: false };
function openThumbnailPicker(project) {
  const images = state.data.images.filter(image => image.project_ids.includes(project?.id) && image.published && !image.archived && image.url);
  const picker = $('#project-thumbnail');
  picker.innerHTML = `<option value="">Automatisch${images[0] ? ` · ${escapeHtml(images[0].original_name)}` : ' · noch kein veröffentlichtes Bild'}</option>` + images.map(image => `<option value="${escapeHtml(image.id)}">${escapeHtml(image.original_name)}</option>`).join('');
  picker.value = images.some(image => image.id === project?.thumbnail_id) ? project.thumbnail_id : '';
  updateThumbnailPreview(images);
}
function updateThumbnailPreview(images) {
  const image = images.find(image => image.id === $('#project-thumbnail').value) || images[0];
  const preview = $('#project-thumbnail-preview');
  preview.hidden = !image;
  if (image) preview.src = image.url;
  else preview.removeAttribute('src');
}
$('#project-thumbnail').addEventListener('change', () => {
  const custom = layoutEditor.custom;
  const dirty = layoutEditor.dirty;
  const composed = layoutEditor.composed;
  const rows = layoutEditor.rows;
  const draft = { ...layoutEditor.retained, ...layoutEditor.placements };
  openLayoutEditor({ id: $('#project-id').value, thumbnail_id: $('#project-thumbnail').value }, draft);
  layoutEditor.custom = custom;
  layoutEditor.dirty = dirty;
  layoutEditor.composed = composed;
  layoutEditor.rows = Math.max(rows, ...Object.values(layoutEditor.placements).map(p => p.row));
  updateThumbnailPreview(layoutEditor.visible);
  renderLayoutEditor();
});
function openLayoutEditor(project, draft = null) {
  const assigned = state.data.images.filter(image => image.project_ids.includes(project?.id));
  const visible = assigned.filter(image => image.published && !image.archived && image.url);
  let saved = {};
  try { saved = JSON.parse(state.data.settings.project_layout || '{}') || {}; } catch {}
  if (draft) saved = draft;
  layoutEditor.visible = visible;
  layoutEditor.hero = visible.find(image => image.id === project?.thumbnail_id) || visible[0];
  layoutEditor.images = visible.filter(image => image !== layoutEditor.hero);
  layoutEditor.custom = layoutEditor.images.some(image => saved[image.id] && Object.keys(saved[image.id]).length);
  const automatic = automaticPlacements(layoutEditor.images);
  let rowCounts = {};
  try { rowCounts = JSON.parse(state.data.settings.project_layout_rows || '{}') || {}; } catch {}
  layoutEditor.composed = Boolean(rowCounts[project?.id]) || layoutEditor.images.some(image => saved[image.id]?.ratio);
  layoutEditor.placements = layoutEditor.custom ? Object.fromEntries(layoutEditor.images.map((image, index) => [image.id, saved[image.id] || !layoutEditor.composed ? imagePlacement(image, index, saved) : automatic[image.id]])) : automatic;
  // Keep placements for the hero and unpublished assignments while editing the visible grid.
  layoutEditor.retained = Object.fromEntries(assigned.filter(image => !layoutEditor.images.includes(image) && saved[image.id]).map((image, index) => [image.id, imagePlacement(image, index, saved)]));
  $('#layout-status').textContent = '';
  layoutEditor.dirty = false;
  layoutEditor.selected = null;
  layoutEditor.drag = null;
  layoutEditor.rows = Math.min(1000, Math.max(Number(rowCounts[project?.id]) || 0, 0, ...Object.values(layoutEditor.placements).map(p => p.row)));
  $('#layout-hidden-images').textContent = `${assigned.length - visible.length} nicht veröffentlichte Bilder werden auf der Website nicht angezeigt. Zuordnungen und Veröffentlichung unter „Alle Bilder“ bearbeiten.`;
  renderLayoutEditor();
}
function renderLayoutEditor(focusId) {
  const editor = layoutEditor;
  $('#layout-mode').hidden = !editor.images.length;
  $('#layout-mode').textContent = editor.custom ? 'Automatisches Layout' : '7-Spalten-Layout erstellen';
  $('#layout-tools').hidden = !editor.custom || !editor.images.length;
  $('#layout-help').textContent = editor.custom
    ? 'Mit + eine Zeile einfügen. Bilder ziehen; am rechten Griff die Breite ändern. Tastatur: Pfeiltasten verschieben, Umschalt + Links/Rechts ändert die Breite. Escape bricht das Ziehen ab. Änderungen werden mit dem Projekt gespeichert.'
    : 'Vorschau der Projektseite. Für freie Platzierung das 7-Spalten-Layout erstellen. Das gewählte Vorschaubild wird als Hero-Bild dargestellt.';
  const imageMarkup = image => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt_text || image.original_name)}" draggable="false" />`;
  const hero = editor.hero ? `<div class="layout-meta"><span>${escapeHtml($('#project-title').value)}</span><span>${escapeHtml($('#project-client').value)}</span></div><div class="layout-hero">${imageMarkup(editor.hero)}<span>Hero · volle Breite</span></div>` : '<p class="layout-empty">Noch keine veröffentlichten Bilder zugeordnet. Bilder unter „Alle Bilder“ diesem Projekt zuordnen.</p>';
  let body = '';
  if (editor.custom && editor.images.length) {
    const insertButton = (row, top = false) => `<button type="button" class="layout-row-add${top ? ' is-top' : ''}" data-insert-row="${row}" aria-label="Zeile ${row} einfügen" ${editor.rows >= 1000 ? 'disabled' : ''}>+</button>`;
    const occupied = new Set(Object.values(editor.placements).map(p => p.row));
    const rows = Array.from({ length: editor.rows }, (_, index) => {
      const row = index + 1;
      return `<div class="layout-row${occupied.has(row) ? '' : ' is-empty'}" data-layout-row="${row}" style="grid-row:${row}">${row === 1 ? insertButton(1, true) : ''}${insertButton(row + 1)}${!occupied.has(row) ? `<span class="layout-row-empty" aria-hidden="true">Freie Zeile</span><button type="button" class="layout-row-remove" data-remove-row="${row}" aria-label="Leere Zeile ${row} entfernen">×</button>` : ''}</div>`;
    }).join('');
    body = `<div class="layout-grid${editor.composed ? ' composed-layout' : ''}">${rows}${editor.images.map(image => {
      const p = editor.placements[image.id];
      const column = editor.composed ? Math.round((p.column - 1) * 12) + 1 : p.column;
      const span = editor.composed ? Math.round(p.span * 12) : p.span;
      return `<div class="layout-tile" data-layout-image="${escapeHtml(image.id)}" style="grid-column:${column}/span ${span};grid-row:${p.row};${p.ratio ? `--layout-ratio:${p.ratio}` : ''}"><button type="button" class="layout-move" aria-describedby="layout-help" aria-label="${escapeHtml(image.original_name)} verschieben">${imageMarkup(image)}<span class="layout-tile-label">${escapeHtml(image.original_name)}</span></button><button type="button" class="layout-resize" aria-label="Breite von ${escapeHtml(image.original_name)} ändern" aria-describedby="layout-help">↔</button></div>`;
    }).join('')}<div class="layout-target" hidden aria-hidden="true"></div></div>`;
  } else {
    body = `<div class="layout-auto">${projectRows(editor.images).map(({ image, span, ratio }) => `<div style="grid-column:span ${span};--preview-ratio:${ratio}">${imageMarkup(image)}</div>`).join('')}</div>`;
  }
  $('#layout-page').innerHTML = hero + body;
  updateLayoutSelection();
  if (focusId) $(`[data-layout-image="${focusId}"] .layout-move`)?.focus({ preventScroll: true });
}
function updateLayoutSelection() {
  const id = layoutEditor.selected;
  const placement = layoutEditor.placements[id];
  $('#layout-page').querySelectorAll('[data-layout-image]').forEach(tile => tile.classList.toggle('is-selected', tile.dataset.layoutImage === id));
  $('#layout-selection').textContent = placement ? `Spalte ${Number(placement.column.toFixed(2))} · Breite ${Number(placement.span.toFixed(2))} · Zeile ${placement.row}` : 'Bild auswählen';
  $('#layout-narrow').disabled = !placement || placement.span <= 1;
  $('#layout-wide').disabled = !placement || placement.column + placement.span >= 8;
}
function canPlaceImage(id, placement, placements = layoutEditor.placements) {
  return placement.column >= 1 && placement.span >= 1 && placement.column + placement.span <= 8 + 1e-6 && placement.row >= 1 && placement.row <= 1000 && !Object.entries(placements).some(([otherId, other]) => otherId !== id && other.row === placement.row && other.column < placement.column + placement.span - 1e-6 && placement.column < other.column + other.span - 1e-6);
}
function commitLayoutPlacement(id, placement) {
  if (!canPlaceImage(id, placement)) {
    $('#layout-status').textContent = 'Hier ist kein Platz. Wähle eine freie Position im Raster.';
    return false;
  }
  layoutEditor.placements[id] = placement;
  layoutEditor.dirty = true;
  layoutEditor.rows = Math.min(1000, Math.max(layoutEditor.rows, placement.row));
  renderLayoutEditor(id);
  $('#layout-status').textContent = `Bild verschoben: Spalte ${Number(placement.column.toFixed(2))}, Breite ${Number(placement.span.toFixed(2))}, Zeile ${placement.row}.`;
  return true;
}
$('#layout-mode').addEventListener('click', () => {
  layoutEditor.custom = !layoutEditor.custom;
  layoutEditor.dirty = true;
  layoutEditor.composed = true;
  layoutEditor.placements = automaticPlacements(layoutEditor.images);
  layoutEditor.rows = Math.max(0, ...Object.values(layoutEditor.placements).map(p => p.row));
  renderLayoutEditor();
});
function insertLayoutRow(row) {
  if (!Number.isInteger(row) || row < 1 || row > layoutEditor.rows + 1 || layoutEditor.rows >= 1000) return;
  for (const placement of Object.values(layoutEditor.placements)) if (placement.row >= row) placement.row++;
  layoutEditor.rows++;
  layoutEditor.dirty = true;
  layoutEditor.composed = true;
  renderLayoutEditor();
  $(`[data-insert-row="${row}"]`)?.focus({ preventScroll: true });
  $('#layout-status').textContent = `Leere Zeile ${row} eingefügt.`;
}
function removeLayoutRow(row) {
  if (!Number.isInteger(row) || row < 1 || row > layoutEditor.rows || Object.values(layoutEditor.placements).some(p => p.row === row)) return;
  for (const placement of Object.values(layoutEditor.placements)) if (placement.row > row) placement.row--;
  layoutEditor.rows--;
  layoutEditor.dirty = true;
  renderLayoutEditor();
  $(`[data-insert-row="${row}"]`)?.focus({ preventScroll: true });
  $('#layout-status').textContent = `Leere Zeile ${row} entfernt.`;
}
for (const [selector, delta] of [['#layout-narrow', -1], ['#layout-wide', 1]]) {
  $(selector).addEventListener('click', () => {
    const id = layoutEditor.selected;
    if (id) commitLayoutPlacement(id, { ...layoutEditor.placements[id], span: layoutEditor.placements[id].span + delta });
  });
}
$('#layout-page').addEventListener('click', event => {
  const insert = event.target.closest('[data-insert-row]');
  if (insert) { insertLayoutRow(Number(insert.dataset.insertRow)); return; }
  const remove = event.target.closest('[data-remove-row]');
  if (remove) { removeLayoutRow(Number(remove.dataset.removeRow)); return; }
  const tile = event.target.closest('[data-layout-image]');
  if (!tile) return;
  layoutEditor.selected = tile.dataset.layoutImage;
  updateLayoutSelection();
});
$('#layout-page').addEventListener('keydown', event => {
  if (event.key === 'Escape' && layoutEditor.drag) {
    event.preventDefault(); event.stopPropagation(); finishLayoutDrag(false); return;
  }
  const tile = event.target.closest('[data-layout-image]');
  if (!tile || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const id = tile.dataset.layoutImage;
  layoutEditor.selected = id;
  const next = { ...layoutEditor.placements[id] };
  const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  if (event.shiftKey || event.target.closest('.layout-resize')) next.span += horizontal;
  else { next.column += horizontal; next.row += event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0; }
  commitLayoutPlacement(id, next);
});
$('#layout-page').addEventListener('pointerdown', event => {
  const tile = event.target.closest('[data-layout-image]');
  if (!tile || event.button !== 0 || event.isPrimary === false) return;
  const id = tile.dataset.layoutImage;
  layoutEditor.selected = id;
  updateLayoutSelection();
  const grid = tile.closest('.layout-grid');
  const rect = tile.getBoundingClientRect();
  const drag = layoutEditor.drag = { id, pointerId: event.pointerId, tile, grid, original: { ...layoutEditor.placements[id] }, next: null, resize: Boolean(event.target.closest('.layout-resize')), offsetX: event.clientX - rect.left, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
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
      if (horizontalStep) { horizontalViewport.scrollLeft += horizontalStep; updateLayoutDrag(); }
    }
    drag.frame = requestAnimationFrame(scroll);
  };
  drag.frame = requestAnimationFrame(scroll);
});
function updateLayoutDrag() {
  const drag = layoutEditor.drag;
  if (!drag?.moved) return;
  const rect = drag.grid.getBoundingClientRect();
  const gap = rect.width * .01064 / (layoutEditor.composed ? 1.01064 : 1);
  const unit = (rect.width + (layoutEditor.composed ? 0 : gap)) / 7;
  const next = { ...drag.original };
  if (drag.resize) next.span = Math.max(1, Math.min(8 - next.column, Math.round((drag.x - rect.left - (next.column - 1) * unit + gap) / unit)));
  else {
    next.column = Math.max(1, Math.min(8 - next.span, Math.round((drag.x - rect.left - drag.offsetX) / unit) + 1));
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
  cancelAnimationFrame(drag.frame);
  if (drag.tile.hasPointerCapture(drag.pointerId)) drag.tile.releasePointerCapture(drag.pointerId);
  drag.tile.classList.remove('is-dragging');
  drag.grid.querySelector('.layout-target').hidden = true;
  if (commit && drag.moved && drag.next) commitLayoutPlacement(drag.id, drag.next);
  else if (commit && drag.moved) $('#layout-status').textContent = 'Hier ist kein Platz. Das Bild bleibt an seiner bisherigen Position.';
}
$('#layout-page').addEventListener('pointerup', () => finishLayoutDrag(true));
$('#layout-page').addEventListener('pointercancel', () => finishLayoutDrag(false));
$('#layout-page').addEventListener('lostpointercapture', () => finishLayoutDrag(false));

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
