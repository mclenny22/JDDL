const $ = (selector) => document.querySelector(selector);
const state = {
  data: null,
  search: "",
  selectedTags: new Set(),
  selectedFile: null,
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
  projectDialog: $("#project-dialog"),
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
  tagManager: $("#tag-manager-list"),
  cellEditor: $("#cell-editor"),
  cellContent: $("#cell-editor-content"),
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
  if (!response.ok) throw new Error(payload.error || "Something went wrong");
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
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
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

function imagePayload(image, changes = {}) {
  const tagIds = changes.tag_ids ?? image.tag_ids;
  return {
    original_name: changes.original_name ?? image.original_name,
    alt_text: changes.alt_text ?? image.alt_text,
    aspect_ratio: changes.aspect_ratio ?? image.aspect_ratio,
    published: changes.published ?? Boolean(image.published),
    archived: changes.archived ?? Boolean(image.archived),
    tag_names: tagIds.map((id) => tagFor(id)?.name).filter(Boolean).join(", "),
    project_ids: changes.project_ids ?? image.project_ids,
  };
}

function setView(view) {
  document.querySelectorAll("[data-view-content]").forEach((section) => {
    section.hidden = section.dataset.viewContent !== view;
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  closeCell();
}

function renderFilters() {
  const counts = new Map(state.data.tags.map((tag) => [tag.id, state.data.images.filter((image) => image.tag_ids.includes(tag.id)).length]));
  el.tagFilters.innerHTML = state.data.tags.length
    ? state.data.tags.map((tag) => `<label class="filter-option"><input type="checkbox" data-tag-id="${tag.id}" ${state.selectedTags.has(tag.id) ? "checked" : ""} /><span>${escapeHtml(tag.name)}</span><span class="option-count">${counts.get(tag.id)}</span></label>`).join("")
    : '<div class="filter-option admin-muted">No tags available</div>';
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
  const images = filteredImages();
  const filtering = Boolean(state.search.trim()) || state.selectedTags.size > 0;
  $("#image-count").textContent = `${images.length} ${images.length === 1 ? "image" : "images"}`;
  $("#table-result-count").textContent = `${images.length} ${images.length === 1 ? "row" : "rows"}`;
  el.imageTable.hidden = !images.length && !filtering;
  el.libraryEmpty.hidden = images.length || filtering;
  if (!images.length && filtering) {
    el.imageBody.innerHTML = '<tr><td colspan="7"><div class="admin-empty"><h2>No results</h2><p>Try changing the search or filters.</p></div></td></tr>';
    return;
  }
  el.imageBody.innerHTML = images.map((image) => {
    const tags = tagNames(image);
    const projects = projectNames(image);
    const status = image.archived ? "Archived" : image.published ? "Published" : "Draft";
    return `<tr>
      <td><img class="admin-thumb" src="${escapeHtml(image.url)}" alt="" loading="lazy" /></td>
      <td><button class="cell-button" data-edit-field="name" data-image-id="${image.id}"><span class="file-name">${escapeHtml(image.original_name)}</span><small>${escapeHtml(image.alt_text || "No alternative text")}</small></button></td>
      <td><button class="cell-button" data-edit-field="tags" data-image-id="${image.id}"><span class="tags">${tags.length ? tags.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("") : '<span class="admin-muted">Select tags</span>'}</span></button></td>
      <td><button class="cell-button" data-edit-field="project" data-image-id="${image.id}">${projects.length ? escapeHtml(projects[0]) : '<span class="admin-muted">Select project</span>'}</button></td>
      <td><span class="status">${status}</span></td>
      <td class="admin-muted">${formatDate(image.created_at)}</td>
      <td><div class="row-actions"><button class="row-button" data-edit-image="${image.id}">Edit</button><button class="row-button danger" data-delete-image="${image.id}" aria-label="Delete image">×</button></div></td>
    </tr>`;
  }).join("");
}

function renderProjects() {
  const projects = state.data.projects;
  el.projectTable.hidden = !projects.length;
  el.projectsEmpty.hidden = Boolean(projects.length);
  $("#project-result-count").textContent = `${projects.length} ${projects.length === 1 ? "row" : "rows"}`;
  el.projectBody.innerHTML = projects.map((project) => {
    const count = state.data.images.filter((image) => image.project_ids.includes(project.id)).length;
    return `<tr>
      <td><span class="file-name">${escapeHtml(project.title)}</span></td>
      <td class="${project.client ? "" : "admin-muted"}">${escapeHtml(project.client || "—")}</td>
      <td class="description-cell ${project.description ? "" : "admin-muted"}">${escapeHtml(project.description || "No description")}</td>
      <td>${count}</td><td><span class="status">${project.published ? "Published" : "Draft"}</span></td><td>${project.sort_order}</td>
      <td><div class="row-actions"><button class="row-button" data-edit-project="${project.id}">Edit</button><button class="row-button danger" data-delete-project="${project.id}" aria-label="Delete project">×</button></div></td>
    </tr>`;
  }).join("");
}

function renderTagManager() {
  el.tagManager.innerHTML = state.data.tags.length
    ? state.data.tags.map((tag) => {
      const count = state.data.images.filter((image) => image.tag_ids.includes(tag.id)).length;
      return `<div class="manager-row"><input value="${escapeHtml(tag.name)}" maxlength="60" data-tag-name="${tag.id}" aria-label="Tag name" /><span class="usage">${count} ${count === 1 ? "image" : "images"}</span><button class="button" type="button" data-save-tag="${tag.id}">Save</button><button class="row-button danger" type="button" data-delete-tag="${tag.id}" aria-label="Delete tag">×</button></div>`;
    }).join("")
    : '<div class="admin-empty compact">No tags yet.</div>';
}

function renderSettings() {
  $("#setting-eyebrow").value = state.data.settings.eyebrow || "";
  $("#setting-about").value = state.data.settings.about || "";
  $("#setting-clients").value = state.data.settings.clients || "";
}

function exportFilteredImages() {
  if (!state.exportTags.size) return state.data.images;
  return state.data.images.filter((image) => image.tag_ids.some((id) => state.exportTags.has(id)));
}

function renderExportFilters() {
  const counts = new Map(state.data.tags.map((tag) => [tag.id, state.data.images.filter((image) => image.tag_ids.includes(tag.id)).length]));
  el.exportTagFilters.innerHTML = state.data.tags.length
    ? state.data.tags.map((tag) => `<label class="tag-check"><input type="checkbox" data-export-tag-id="${tag.id}" ${state.exportTags.has(tag.id) ? "checked" : ""} /><span>${escapeHtml(tag.name)} <small>${counts.get(tag.id)}</small></span></label>`).join("")
    : '<span class="admin-muted">No categories available.</span>';
}

function renderExportImages() {
  const images = exportFilteredImages();
  const selectedCount = state.exportSelected.size;
  el.exportSelectionSummary.textContent = `${selectedCount} ${selectedCount === 1 ? "image" : "images"} selected`;
  el.createPortfolioButton.disabled = selectedCount === 0;
  el.clearExportSelection.disabled = selectedCount === 0;
  $("#select-visible-images").disabled = images.length === 0 || images.every((image) => state.exportSelected.has(image.id));
  $("#export-result-count").textContent = `${images.length} ${images.length === 1 ? "row" : "rows"}`;
  el.exportTable.hidden = images.length === 0;
  if (!images.length) {
    el.exportBody.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><h2>No results</h2><p>Try changing the category filter.</p></div></td></tr>';
    el.exportTable.hidden = false;
    return;
  }
  el.exportBody.innerHTML = images.map((image) => {
    const tags = tagNames(image);
    const projects = projectNames(image);
    const status = image.archived ? "Archived" : image.published ? "Published" : "Draft";
    return `<tr class="export-row ${state.exportSelected.has(image.id) ? "is-selected" : ""}">
      <td><input class="row-checkbox" type="checkbox" data-export-image-id="${image.id}" aria-label="Select ${escapeHtml(image.original_name)}" ${state.exportSelected.has(image.id) ? "checked" : ""} /></td>
      <td><img class="admin-thumb" src="${escapeHtml(image.url)}" alt="" loading="lazy" /></td>
      <td><span class="file-name">${escapeHtml(image.original_name)}</span><small class="row-subtitle">${escapeHtml(image.alt_text || "No alternative text")}</small></td>
      <td><span class="tags">${tags.length ? tags.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("") : '<span class="admin-muted">No categories</span>'}</span></td>
      <td>${projects.length ? escapeHtml(projects[0]) : '<span class="admin-muted">No project</span>'}</td>
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
  const selectionFocus = $("#portfolio-title").value.trim() || chosenCategories.join(" and ") || "creative";
  const studio = state.data.settings;
  const clients = String(studio.clients || "").split("\n").map((client) => client.trim()).filter(Boolean);
  const categories = [...new Set(images.flatMap((image) => tagNames(image)))];
  const date = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(new Date());
  let pageNumber = 0;
  const pages = groupedExportImages(images).flatMap(({ project, images: projectImages }) => {
    const projectTitle = project?.title || "Independent work";
    const projectDescription = project?.description || "Selected work not assigned to a project.";
    const projectClient = project?.client || "JDDL studio selection";
    const projectCategories = [...new Set(projectImages.flatMap((image) => tagNames(image)))];
    const batches = chunk(projectImages, 5);
    return batches.map((batch, batchIndex) => {
      pageNumber += 1;
      const tiles = batch.map((image) => `<figure class="project-tile"><img src="${escapeHtml(new URL(image.url, location.origin).href)}" alt="${escapeHtml(image.alt_text || image.original_name)}" /></figure>`).join("");
      return `<article class="portfolio-page project-page">
        <aside class="project-copy">
          <div><p class="project-index">${String(pageNumber).padStart(2, "0")} / ${escapeHtml(projectClient)}</p><h2>${escapeHtml(projectTitle)}${batchIndex ? " <small>(continued)</small>" : ""}</h2><p class="project-description">${escapeHtml(projectDescription)}</p></div>
          <p class="project-meta">${escapeHtml(projectCategories.join(" / ") || "Selected work")}<br />${projectImages.length} ${projectImages.length === 1 ? "image" : "images"}</p>
        </aside>
        <div class="project-grid grid-count-${batch.length}">${tiles}</div>
      </article>`;
    });
  }).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>JDDL - ${escapeHtml(safeFileName(selectionFocus))} portfolio</title>
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
  <div class="print-toolbar"><span>Choose “Save as PDF” in the print dialog.</span><button type="button" onclick="window.print()">Print / save PDF</button></div>
  <section class="portfolio-page cover-page">
    <div class="cover-main"><p class="cover-we-are">We are</p><h1>JDDL</h1><p class="cover-selection">This is a selection of <strong>${escapeHtml(selectionFocus)}</strong> work.</p></div>
    <div class="cover-footer"><div><h2>${escapeHtml(studio.eyebrow || "About the studio")}</h2><p>${escapeHtml(studio.about || "JDDL is an independent creative practice.")}</p></div><div><h2>Selected clients</h2><p>${escapeHtml(clients.join(" / ") || "JDDL studio portfolio")}<br />${escapeHtml(categories.join(" / ") || "Selected work")} / ${escapeHtml(date)}</p></div></div>
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
    notify("Allow pop-ups to create the portfolio PDF");
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
    : '<span class="admin-muted">No options yet.</span>';
}

function renderProjectOptions(container, selectedId) {
  const options = [{ id: "", title: "No project" }, ...state.data.projects];
  container.innerHTML = options.map((project) => `<label class="tag-check"><input type="radio" name="image-project" value="${project.id}" ${project.id === selectedId ? "checked" : ""} /><span>${escapeHtml(project.title)}</span></label>`).join("");
}

function openImage(image = null) {
  el.imageForm.reset();
  $("#image-error").textContent = "";
  $("#image-id").value = image?.id || "";
  $("#image-dialog-title").textContent = image ? "Edit image" : "Add image";
  $("#image-name").value = image?.original_name || "";
  $("#image-alt").value = image?.alt_text || "";
  $("#image-ratio").value = image?.aspect_ratio || 1;
  $("#image-published").checked = image ? Boolean(image.published) : true;
  $("#image-archived").checked = image ? Boolean(image.archived) : false;
  renderRelationOptions(el.imageTags, state.data.tags, image?.tag_ids || [], "image-tag");
  renderProjectOptions(el.imageProjects, image?.project_ids[0] || "");
  state.selectedFile = null;
  el.imageFile.disabled = Boolean(image);
  el.imagePreview.hidden = !image;
  el.dropzoneCopy.hidden = Boolean(image);
  if (image) el.imagePreview.src = image.url;
  else el.imagePreview.removeAttribute("src");
  el.dropzone.classList.toggle("is-readonly", Boolean(image));
  el.imageDialog.showModal();
}

function openProject(project = null) {
  el.projectForm.reset();
  $("#project-error").textContent = "";
  $("#project-id").value = project?.id || "";
  $("#project-title").value = project?.title || "";
  $("#project-client").value = project?.client || "";
  $("#project-description").value = project?.description || "";
  $("#project-order").value = project?.sort_order || 0;
  $("#project-published").checked = project ? Boolean(project.published) : true;
  $("#project-dialog-title").textContent = project ? "Edit project" : "New project";
  el.projectDialog.showModal();
  $("#project-title").focus();
}

function openTags() {
  $("#tag-error").textContent = "";
  el.newTagForm.reset();
  renderTagManager();
  el.tagsDialog.showModal();
  $("#new-tag-name").focus();
}

function selectFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 20 * 1024 * 1024) {
    $("#image-error").textContent = "Image must be smaller than 20 MB.";
    return;
  }
  state.selectedFile = file;
  el.imagePreview.src = URL.createObjectURL(file);
  el.imagePreview.hidden = false;
  el.dropzoneCopy.hidden = true;
  if (!$("#image-name").value) $("#image-name").value = file.name;
}

function closeCell() {
  el.cellEditor.hidden = true;
  el.cellContent.replaceChildren();
}

function positionCell(anchor) {
  el.cellEditor.hidden = false;
  const anchorBox = anchor.getBoundingClientRect();
  const editorBox = el.cellEditor.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchorBox.left, innerWidth - editorBox.width - 8));
  const below = anchorBox.bottom + 5;
  const top = below + editorBox.height <= innerHeight ? below : Math.max(8, anchorBox.top - editorBox.height - 5);
  el.cellEditor.style.left = `${left}px`;
  el.cellEditor.style.top = `${top}px`;
}

function openCell(anchor, image, field) {
  if (field === "name") {
    el.cellContent.innerHTML = `<form class="cell-form" id="cell-name-form" data-image-id="${image.id}"><input id="cell-name-input" value="${escapeHtml(image.original_name)}" maxlength="240" required /><button class="button primary">Save</button></form>`;
  }
  if (field === "tags") {
    const selected = new Set(image.tag_ids);
    el.cellContent.innerHTML = `<form id="cell-relations-form" data-field="tags" data-image-id="${image.id}"><div class="cell-heading">Select tags</div><div class="cell-options">${state.data.tags.length ? state.data.tags.map((tag) => `<label class="cell-option"><input type="checkbox" name="cell-tag" value="${tag.id}" ${selected.has(tag.id) ? "checked" : ""} /><span>${escapeHtml(tag.name)}</span></label>`).join("") : '<div class="cell-option admin-muted">No tags available</div>'}</div><div class="cell-actions"><button class="button" type="button" data-close-cell>Cancel</button><button class="button primary">Save</button></div></form>`;
  }
  if (field === "project") {
    const selectedId = image.project_ids[0] || "";
    const projects = [{ id: "", title: "No project" }, ...state.data.projects];
    el.cellContent.innerHTML = `<form id="cell-relations-form" data-field="project" data-image-id="${image.id}"><div class="cell-heading">Select project</div><div class="cell-options">${projects.map((project) => `<label class="cell-option"><input type="radio" name="cell-project" value="${project.id}" ${selectedId === project.id ? "checked" : ""} /><span>${escapeHtml(project.title)}</span></label>`).join("")}</div><div class="cell-actions"><button class="button" type="button" data-close-cell>Cancel</button><button class="button primary">Save</button></div></form>`;
  }
  positionCell(anchor);
  if (field === "name") {
    $("#cell-name-input").focus();
    $("#cell-name-input").select();
  }
}

async function updateImage(image, changes) {
  await api(`/api/images/${image.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(imagePayload(image, changes)),
  });
  closeCell();
  await refresh();
  notify("Image updated");
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#login-error").textContent = "";
  try {
    await api("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#password").value }) });
    await bootstrap();
  } catch (error) { $("#login-error").textContent = error.message; }
});

$("#logout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  el.adminApp.hidden = true;
  el.loginView.hidden = false;
  $("#password").value = "";
});

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#add-image-button").addEventListener("click", () => openImage());
$("#add-project-button").addEventListener("click", () => openProject());
$("#manage-tags-button").addEventListener("click", openTags);
document.querySelectorAll("[data-open-upload]").forEach((button) => button.addEventListener("click", () => openImage()));
document.querySelectorAll("[data-open-project]").forEach((button) => button.addEventListener("click", () => openProject()));
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

$("#image-search").addEventListener("input", (event) => { state.search = event.target.value; renderImages(); });
$("#tag-filter-button").addEventListener("click", () => { el.filterMenu.hidden = !el.filterMenu.hidden; });
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
  if (!event.target.closest(".menu-wrap")) el.filterMenu.hidden = true;
  if (!event.target.closest("#cell-editor") && !event.target.closest("[data-edit-field]")) closeCell();
});
window.addEventListener("resize", closeCell);
window.addEventListener("scroll", (event) => {
  if (!(event.target instanceof Node) || !el.cellEditor.contains(event.target)) closeCell();
}, true);

el.imageFile.addEventListener("change", () => selectFile(el.imageFile.files[0]));
el.dropzone.addEventListener("dragover", (event) => { if (!el.imageFile.disabled) event.preventDefault(); });
el.dropzone.addEventListener("drop", (event) => { if (!el.imageFile.disabled) { event.preventDefault(); selectFile(event.dataTransfer.files[0]); } });

el.imageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  const id = $("#image-id").value;
  const error = $("#image-error");
  if (!id && !state.selectedFile) { error.textContent = "Choose an image first."; return; }
  submit.disabled = true;
  error.textContent = "";
  try {
    const tagIds = [...document.querySelectorAll('input[name="image-tag"]:checked')].map((input) => input.value);
    const selectedProject = document.querySelector('input[name="image-project"]:checked')?.value || "";
    const projectIds = selectedProject ? [selectedProject] : [];
    const shared = {
      original_name: $("#image-name").value,
      alt_text: $("#image-alt").value,
      aspect_ratio: Number($("#image-ratio").value),
      published: $("#image-published").checked,
      archived: $("#image-archived").checked,
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
    notify(id ? "Image updated" : "Image added");
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
      body: JSON.stringify({ id: id || undefined, title: $("#project-title").value, client: $("#project-client").value, description: $("#project-description").value, sort_order: Number($("#project-order").value), published: $("#project-published").checked }),
    });
    el.projectDialog.close();
    await refresh();
    notify(id ? "Project updated" : "Project created");
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
      notify("Tag renamed");
    } catch (reason) { $("#tag-error").textContent = reason.message; save.disabled = false; }
    return;
  }
  const remove = event.target.closest("[data-delete-tag]");
  if (!remove || !confirm("Delete this tag? It will be removed from assigned images.")) return;
  try {
    state.selectedTags.delete(remove.dataset.deleteTag);
    state.exportTags.delete(remove.dataset.deleteTag);
    await api(`/api/tags/${remove.dataset.deleteTag}`, { method: "DELETE" });
    await refresh();
    notify("Tag deleted");
  } catch (reason) { $("#tag-error").textContent = reason.message; }
});

el.projectBody.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-project]");
  if (edit) { openProject(projectFor(edit.dataset.editProject)); return; }
  const remove = event.target.closest("[data-delete-project]");
  if (!remove || !confirm("Delete this project? Its images will stay in the library.")) return;
  await api(`/api/projects/${remove.dataset.deleteProject}`, { method: "DELETE" });
  await refresh();
  notify("Project deleted");
});

el.imageBody.addEventListener("click", async (event) => {
  const field = event.target.closest("[data-edit-field]");
  if (field) {
    const image = state.data.images.find((item) => item.id === field.dataset.imageId);
    if (image) openCell(field, image, field.dataset.editField);
    return;
  }
  const edit = event.target.closest("[data-edit-image]");
  if (edit) { openImage(state.data.images.find((image) => image.id === edit.dataset.editImage)); return; }
  const remove = event.target.closest("[data-delete-image]");
  if (!remove || !confirm("Delete this image permanently?")) return;
  await api(`/api/images/${remove.dataset.deleteImage}`, { method: "DELETE" });
  await refresh();
  notify("Image deleted");
});

el.cellEditor.addEventListener("submit", async (event) => {
  event.preventDefault();
  const image = state.data.images.find((item) => item.id === event.target.dataset.imageId);
  if (!image) return;
  try {
    if (event.target.id === "cell-name-form") await updateImage(image, { original_name: $("#cell-name-input").value });
    if (event.target.id === "cell-relations-form") {
      const field = event.target.dataset.field;
      if (field === "tags") {
        const values = [...el.cellEditor.querySelectorAll('input[name="cell-tag"]:checked')].map((input) => input.value);
        await updateImage(image, { tag_ids: values });
      } else {
        const selectedProject = el.cellEditor.querySelector('input[name="cell-project"]:checked')?.value || "";
        await updateImage(image, { project_ids: selectedProject ? [selectedProject] : [] });
      }
    }
  } catch (reason) { notify(reason.message); }
});
el.cellEditor.addEventListener("click", (event) => { if (event.target.closest("[data-close-cell]")) closeCell(); });

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eyebrow: $("#setting-eyebrow").value, about: $("#setting-about").value, clients: $("#setting-clients").value }),
  });
  await refresh();
  notify("Studio information saved");
});

api("/api/session").then((session) => { if (session.authenticated) return bootstrap(); }).catch(() => {});
