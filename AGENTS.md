# JDDL workspace notes

## Active application

The workspace root is the Git repository for `https://github.com/mclenny22/JDDL.git`.
The current website is `frontend/`; retired prototypes are recoverable from Git
history using `docs/HISTORY.md`. Ignored local `archive/` remnants are legacy
storage and metadata, not the active source of truth.

Run `python3 server.py` from the workspace root. No dependency installation or
frontend build is required. The dependency-free Python 3.9+ server exposes the
public site at `/`, the editor at `/admin`, and APIs at `/api/*`, defaulting to
`http://127.0.0.1:4174`. A local admin password is generated in the ignored
`data/admin.password` file unless `ADMIN_PASSWORD` is set.

## Frontend

- The active screens follow Figma file `83EmCrcQUbPM4r2UiCcgnx`, section
  `731:61` (AD4K): desktop landing V1 `784:3845`, dark project `743:1124`,
  mobile landing `801:491`, mobile project `800:471`, mobile menu `811:601`
  and Index `743:922`. V1 is the bottom-aligned horizontal rail; V2 is an
  alternate artboard, not a separate site mode.
- `frontend/index.html`, `styles.css` and `app.js` implement the responsive
  light portfolio. The desktop grid uses 15px margins/gutters and three
  project tiles across; thumbnails crop at 4:5. At 390px the tiles are 266.25px
  wide. Height is capped on short viewports so the masthead stays clear.
  The AD4K logo and menu shapes are local, unmodified Figma SVG exports in
  `frontend/assets/`. Desktop and mobile logo exports keep their native sizes
  (460 × 34 and 203 × 34); the desktop asset includes its own whitespace.
- Typography follows the new screens: 11px / 13px body, 8px / 10px metadata
  labels and 14px / 16px mobile MENU/CLOSE. Waldenburg has a system sans-serif
  fallback until licensed font files are supplied. CMS studio copy splits at
  its first sentence into dark/light emphasis. Footer fields remain editable
  under Studio-Informationen and appear in contact/email/address order. Empty
  CMS fields stay empty; no fabricated contact details are added.
- `frontend/projects.js` fetches `/api/public` with caching disabled. Only
  published projects with published, unarchived assigned images appear.
  Project titles, descriptions, clients, tags and image alt text come from
  the CMS. No demo asset fallback or hardcoded project content belongs in
  the active frontend. Figma's example project imagery is data, not branding.
- Images and MP4 videos share the existing CMS library, assignments, publication,
  thumbnail picker and layout metadata (`mime_type` identifies video; no migration).
  Upload MP4 (prefer H.264 for browser compatibility) through the media drawer;
  dimensions derive from video metadata. Existing upload limits remain 4 MB online
  and 20 MB locally. `frontend/media.js` renders videos in the rail, Index and detail.
  Visible videos loop muted inline, with native controls on project pages. Reduced
  motion disables autoplay; offscreen/hidden videos pause and repeated copies load
  only when visible. Admin previews are paused. Print portfolio export includes only
  still images. Local MP4 serving supports byte ranges for seeking.
- Seven repeated project sets rebase by whole cycles for an endless rail.
  Each project uses its chosen published, unarchived assigned image as a stable
  thumbnail; an empty or unavailable choice falls back to its first eligible image.
  The project editor offers a Vorschaubild picker and an automatically populated
  preview. Choices save with project metadata as `thumbnail_id`, backed by the
  `project_thumbnails` setting without a schema migration. The image list keeps
  its original order. Selected and the Project menu open the chosen thumbnail as
  hero unless a separate hero is saved in the project composition; Index and direct image links still open the selected image. No image cycling, story bar or indicators. All other
  project images remain available in Index and the project detail.
- The rail drifts at 40px/s, easing to 5px/s on hover/focus. Manual wheel
  easing lands exactly on its requested offset and drift resumes on the next
  frame without a cooldown. Native touch/trackpad momentum and smooth keyboard
  scrolling keep control until 120ms without a scroll event, then drift resumes
  from the current fractional offset. Held pointers still pause drift. A 700ms exponential response and its exact distance integral
  provide smooth slowdown and acceleration. Fractional, elapsed-time movement preserves its speed across frame rates. Drift pauses
  in Index, About, project detail, open mobile menus and transitions.
  Reduced motion disables drift, easing and view-transition snapshots.
- Preserve free horizontal scrolling: no snapping, wheel rounding, minimum
  project jumps or scroll-end corrections. Mouse-wheel easing lands on the
  exact requested offset; native horizontal trackpad/touch and browser pinch
  zoom remain available. Left/Right moves relative to the offset; Home/End
  selects first/last. Fractional geometry and whole-cycle rebasing preserve
  seamless wrapping. Resize preserves the fractional position, including
  a deferred re-measure after returning from a hidden gallery.
- Navigation has four destinations: Selected, Index, Project and About.
  The active label uses the reference's pale rounded shape (Index is a pill);
  inactive numbers use triangle, hexagon, rounded square and circle shapes.
  Hover/focus varies inactive geometry without clipping labels or focus rings.
  Project opens a random published project's detail, excluding the currently
  open project when another is available. About (`#about`) uses studio
  settings and selected clients. On mobile MENU becomes CLOSE and reveals
  a horizontal row beneath the logo; studio copy moves below that row while
  the rail keeps its size. Selection, outside click and Escape close the menu.
- `frontend/orbit.js` implements the CMS-backed infinite Index field with a
  radial center lens. It wraps on both axes and retains its top/bottom fade,
  800px image cap, fixed 80% chaos and 2px corners. CMS tag chips filter images
  by one category (All resets). A click/tap or Enter/Space opens the image's
  assigned project with that image as hero; dragging does not activate tiles.
  Two-axis pointer/touch drag, trackpad, Shift-wheel and all four arrow keys
  remain available. Coasting, separation and exponential settling account
  for elapsed time; stationary frames avoid redundant style/accessibility
  writes. `#index` normalizes to `#index/field` without adding history.
- Menu navigation fades out over 400ms, switches at opacity zero, then eases
  in over 800ms with a small directional offset. Exit clicks replace the
  pending destination. The masthead stays fixed. Reduced motion switches
  immediately. Back/Forward restores views without refetching CMS data.
- `frontend/project-view.js` implements full-width dark project pages with
  15px margins/gutters and automatic three-up, mixed, paired, full-width and
  four-up image rows. Mobile uses square heroes, stacked wide images and
  two-column rows. Automatic layouts show every remaining published project image once;
  manual compositions show the images explicitly placed in that project.
  Project/client, categories and derived format sit above the hero;
  Project Info + expands the CMS description with a reversible 450ms height
  easing and text fade. Collapsed text is inert and hidden from assistive
  technology; reduced motion switches immediately. The footer and return control
  follow the project images and scroll with the content.
- Project links use `#project/<slug>/<image-id>` and real anchor hrefs.
  Native same-document View Transitions pair only the clicked repeated tile
  with the hero, then reverse to its source on return. Unsupported browsers
  use a Web Animations image morph. Interrupted transitions clean up temporary
  names and pause state; a new destination replaces pending navigation.
  Escape and the return button use the existing history entry when possible;
  direct links return locally. Focus and gallery offsets are restored.
- Automatic and manual project layouts share twelve integer columns and identical
  gutters/crop ratios. The editor opens directly on the editable grid. For
  automatic projects, the grid starts from the automatic composition and saves
  as manual only after a grid edit. The editor has no asset sidebar.
  Selecting the hero, an image, a text block or an empty column reveals a compact
  toolbar at the selection's bottom right. + adds an asset, the exchange icon
  replaces it, T adds plain white text only when an empty column is selected,
  and the trash icon removes the element from the layout without deleting the
  asset or changing project assignments. Empty columns are native focusable
  buttons; Left/Right selects adjacent free columns. Image/text movement still
  uses arrow keys, Shift+Left/Right resizing, and pointer/touch dragging with
  autoscroll and a right-edge resize grip. Toolbar controls never start a drag.
  Explicit row insertion/removal remains; dragging/resizing never appends rows.
- The asset toolbar opens a native modal with searchable published project assets,
  paused image/MP4 previews, single selection and explicit confirmation. Cancel,
  Escape and closing discard picker changes and restore focus. Choosing an
  already placed asset exchanges slots with the current image; adding it in an
  empty area moves it there. Hero exchanges preserve the previous hero in the
  new hero's prior slot. Hero removal leaves an empty selectable hero placeholder.
  The Selected thumbnail is independently editable. A second native modal edits
  text from the T button in empty columns. Existing text opens its editor on
  click or keyboard activation; text changes apply only on confirmation and render
  as plain white text, never HTML. All confirmed changes remain local drafts
  until the project is saved.
- Project-specific layouts save atomically with metadata through `/api/projects`
  `composition`, stored in the `project_compositions` JSON setting keyed by project
  ID: `{columns:12, manual, hero_id, hero_hidden?, placements, texts, rows}`. Placements use
  `{column, span, row, ratio?}`; text entries add `text`. This lets shared assets
  have independent layouts in different projects. The backend validates project
  membership, bounds, overlap and text length. Unpublished projects' compositions
  are omitted from public settings. Existing seven-column `project_layout` / `project_layout_rows`
  data and the legacy `/api/settings` patch API still render until edited;
  opening the editor converts legacy geometry into a twelve-column draft.
  No content settings are rewritten just by opening an editor. `hero_hidden: true`
  omits the hero on default project visits (`#project/<slug>`); Index and explicit
  image links still open their selected asset as hero. Hidden heroes use a quiet
  page transition and retain the normal source focus/history restoration.
- No frontend framework, package dependencies or frontend build is required.
- `frontend/imprint.html` is the static imprint page, linked from both site and
  project footers and included in the Vercel export. It lists Lennard Makosch,
  Wrangelstr. 79, Berlin; the studio contact address is a separate CMS setting.
- Link previews use static Open Graph and social-card metadata in the initial
  `frontend/index.html` head, so crawlers do not need JavaScript or CMS access.
  `frontend/assets/social-preview.png` is a 1200 × 630 logo-only card rendered
  from the existing AD4K SVG on #f6f6f6; keep its centered logo within square
  crop bounds. All hash-based project links currently share this studio card.

## Backend and content

- Read `docs/DATABASE_ACCESS.md` before connecting to the database. It documents
  the public read-only API, direct Turso connection variables and query example,
  local SQLite access, and the connection verification status. Never record
  database tokens in shared files.

- `/api/public` supports read-only cross-origin access (GET/HEAD/OPTIONS).
  `PUBLIC_API_ORIGINS` defaults to `*`; comma-separated exact origins restrict
  browser reads, and an empty value disables CORS. Admin APIs do not expose CORS.
  Optional `PUBLIC_BASE_URL` resolves public image URLs against the CMS domain;
  admin payloads retain stored URLs. Integration examples are in `docs/PUBLIC_API.md`.

- `backend/server.py` retains the integrated V1 CMS APIs and admin behavior.
  Frontend assets and admin assets have separate routes to avoid CSS conflicts.
  Admin CSS/JS live under `/admin-assets/`. Existing root-level showcase image
  URLs remain valid through `backend/static/`; uploaded images use `/uploads/`.
  Static serving restricts resolved paths to asset directories. Live data,
  archives and source files outside the frontend are not served.
- `data/projects.db` stores projects and studio settings. `data/images.db`
  stores images, tags and image-to-project relations. An asset can have many tags and many projects. Startup drops the legacy
  `one_project_per_image` index locally and in Turso, preserving existing links.
  The `(image_id, project_id)` primary key prevents duplicate assignments.
- `uploads/` stores persistent uploaded files. `data/`, `uploads/`, SQLite
  sidecars and session secrets are ignored by Git. Preserve these directories
  when changing code. Use SQLite backup APIs when copying live databases.
- `backend/seed/content.json` contains the public-content snapshot for fresh
  installs. Initialization seeds only missing databases; restarting does not
  overwrite edits or repopulate intentionally emptied existing databases.
- `/admin` uses German interface copy (the shared image/MP4 library uses “Asset hinzufügen”, “Asset bearbeiten” and “Asset speichern”): Alle Assets, Projekte, Portfolio-Export
  and Studio-Informationen. Dates and fixed portfolio export copy are German;
  stored project, image, tag and studio content retains its original language. Library tag
  filtering uses AND; portfolio export tags use OR within the selected project
  (or all projects). Image selection remains explicit; switching projects prunes
  selections outside that project, while category changes retain selected images.
  Category counts include only still images in the chosen project. Exports open
  a print-optimized A4 landscape document with a cover
  and project pages containing up to five ratio-preserving images each.
- Admin controls use a dependency-free shadcn-style neutral design. Project
  creation/editing replaces the main content with a full-page editor, keeping
  Projekte active in the navigation. Its sticky heading shows the project name,
  a back arrow and Save/Cancel actions. Returning to the list restores focus and
  scroll. Leaving the editor with unsaved changes offers save, discard or
  continue editing. Reloading or closing the page uses the browser warning. Metadata and
  thumbnail controls sit above the full-width layout canvas; dragging autoscrolls
  the page. Image creation/editing opens a right-side modal drawer with fixed headers/actions,
  scrolling form content, native focus containment and Escape dismissal. Image
  name cells open the drawer; tag, project and status cells offer inline editing.
  Drawer entrance motion respects reduced motion; mobile drawers fill the width.
  Image aspect ratio is hidden metadata: uploads derive it from natural dimensions,
  and editing retains the stored ratio without a manual dimension control.
  In the asset drawer, “Datei ersetzen” stages one image or MP4 for the next
  save. Multipart PUT to `/api/images/<id>` replaces the file and media dimensions
  in place, retaining the asset ID, metadata unless edited, and references from
  projects, thumbnails and layouts. The file receives a fresh URL.
  Image/project row actions live in ellipsis dropdowns with edit and delete items;
  menus support arrow keys, Home/End, Escape and return focus to their trigger.
  The shared menu sits outside table overflow and closes on outside click/scroll.
  Images have one “Veröffentlicht” checkbox: unchecked saves unpublished/archived,
  checked saves published/unarchived. New uploads default to archived in the UI
  and API. Existing content is unchanged until saved. Project assignment uses a
  searchable multiselect combobox with keyboard
  navigation and “Kein Projekt” to clear all assignments. The library has row
  selection checkboxes and select-all for the filtered results. Clicking a status,
  project or tag cell opens an inline editor; if that row is selected, changes
  apply to the full selection. Mixed tags/projects remain unchanged until toggled.
  “Auswahl löschen” confirms the full selection in a modal, including assets
  outside the current filter. `/api/images/batch-delete` deletes the selected
  assets and their assignments in one transaction, then removes stored uploads.
  `/api/images/batch` validates the whole selection and applies status/relation
  changes in one transaction, preserving unrelated metadata and relations.
  Multi-file selection/drop uploads each file in a separate request, derives its
  dimensions and shares tags, project assignments and visibility. The queue shows
  remaining files and retries only unfinished uploads after a failure. Per-file
  upload limits remain unchanged. Portfolio export uses the selected project
  when grouping a shared image; all-project export includes each image once.
  Projects reorder through pointer dragging (mouse/touch) or Up/Down on row grips.
  `/api/projects/reorder` validates the complete ID list and saves positions in one
  transaction; new projects append. The public rail starts at the first published
  project with published, unarchived images and shows its chosen or automatic thumbnail.
- Project deletion retains images and clears links; tag deletion clears tag
  associations; image deletion removes its upload where present. Public data
  excludes archived and unpublished images. Admin bootstrap includes both.
- Production requires HTTPS, a real `ADMIN_PASSWORD`, a reverse proxy and
  persistent backups of both storage directories. Non-local binding requires
  an explicit password. `COOKIE_SECURE=1` enables secure session cookies.

## Vercel deployment

- Read `docs/DEPLOYMENT.md` for the production URLs, Vercel team/project,
  Turso database, Blob store, environment scopes and setup verification record.
  Keep that record current when hosting resources or configuration change.

- `vercel.json` selects the active app explicitly and excludes archived versions
  from the Python function. `scripts/build_vercel.py` exports frontend, CMS assets
  and seed images to the ignored `public/` CDN output.
  It copies only runtime frontend/admin files, and images once at the root to
  preserve existing image URLs. Do not reintroduce duplicate admin image copies.
- `api/index.py` exposes the existing HTTP handler. API and `/admin` rewrites retain
  their original routes. Cloud functions fail closed when no database is linked.
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` select the persistent Turso/libSQL
  database through `backend/cloud.py`. Cloud tables share one database; local
  development keeps the two SQLite files. Initialization seeds once in a locked
  transaction, with a marker and session signing secret in private_config,
  which is never part of either public or admin content payloads.
- Vercel requires an explicit `ADMIN_PASSWORD`. Cookies are Secure automatically.
  Connect a public Vercel Blob store to provide `BLOB_READ_WRITE_TOKEN`; uploaded
  assets then persist in Blob. Hosted multipart requests are limited to 4 MB to
  fit Vercel's request limit; local uploads retain 20 MB. Existing seed images are
  served from the CDN. Do not put secrets in source or public content settings.
- Install pinned cloud dependencies from `requirements.txt` for deployment.
  The local SQLite server remains dependency-free. Keep production and preview
  databases separate when previews should not edit production content.

## Retired prototypes

- Tracked prototype files were removed from the working tree on 6 October 2026.
  Read `docs/HISTORY.md` for their Git commit and recovery commands.
- The ignored local `archive/` can retain legacy databases, untracked source,
  exports and Page Test Git metadata. Preserve these local-only files.
- Active code has no Node packages or frontend build. Node is only needed for
  frontend verification. `public/` is generated by the Vercel export script.

## Verification and working rules

Run from the repository root:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

Backend tests use temporary storage and an ephemeral local HTTP server; never
modify live content for tests. Frontend tests use data fixtures and DOM stubs;
they do not replace browser visual verification.

- Ask the user, "Do you want me to run a quick visual check in the browser?"
  before any browser-based visual check. Do not run it without an affirmative answer.
- Update this file when application logic or the workspace layout changes substantially.
- If a task requires Figma and its MCP is disconnected or failing, stop and tell
  the user rather than continuing without it.
- Preserve free horizontal scrolling, infinite wrapping and stable project
  thumbnails unless the user explicitly requests a replacement. Account for touch,
  mouse wheel, keyboard accessibility, reduced motion and narrow viewports.
