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
- Seven repeated project sets rebase by whole cycles for an endless rail.
  Each project retains its first published, unarchived assigned image as a
  stable thumbnail. No image cycling, story bar or indicators. All other
  project images remain available in Index and the project detail.
- The rail drifts at 10px/s, easing to .35px/s on hover/focus. Manual wheel,
  touch and keyboard input suspends drift for 3.5 seconds. Fractional,
  elapsed-time movement preserves its speed across frame rates. Drift pauses
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
  two-column rows. Every remaining published project image appears once.
  Project/client, categories and derived format sit above the hero;
  Project Info + expands the CMS description. The footer and return control
  follow the project images and scroll with the content.
- Project links use `#project/<slug>/<image-id>` and real anchor hrefs.
  Native same-document View Transitions pair only the clicked repeated tile
  with the hero, then reverse to its source on return. Unsupported browsers
  use a Web Animations image morph. Interrupted transitions clean up temporary
  names and pause state; a new destination replaces pending navigation.
  Escape and the return button use the existing history entry when possible;
  direct links return locally. Focus and gallery offsets are restored.
- Existing seven-column image placements in the `project_layout` JSON studio
  setting remain supported on desktop when a project has saved placements.
  Mobile reflows these images into two columns. The image drawer's start
  column, span and row controls and validated `/api/settings` `image_layout`
  patches remain unchanged; no database migration is required.
- No frontend framework, package dependencies or frontend build is required.

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
  stores images, tags and image-to-project relations. An image can have many
  tags but at most one project, enforced by the existing unique index.
- `uploads/` stores persistent uploaded files. `data/`, `uploads/`, SQLite
  sidecars and session secrets are ignored by Git. Preserve these directories
  when changing code. Use SQLite backup APIs when copying live databases.
- `backend/seed/content.json` contains the public-content snapshot for fresh
  installs. Initialization seeds only missing databases; restarting does not
  overwrite edits or repopulate intentionally emptied existing databases.
- `/admin` uses German interface copy: Alle Bilder, Projekte, Portfolio-Export
  and Studio-Informationen. Dates and fixed portfolio export copy are German;
  stored project, image, tag and studio content retains its original language. Library tag
  filtering uses AND; portfolio export tags use OR and image selection remains
  explicit. Exports open a print-optimized A4 landscape document with a cover
  and project pages containing up to five ratio-preserving images each.
- Admin controls use a dependency-free shadcn-style neutral design. Project and
  image creation/editing open right-side modal drawers with fixed headers/actions,
  scrolling form content, native focus containment and Escape dismissal. Image
  name, tag and project cells open the same drawer at the corresponding field.
  Drawer entrance motion respects reduced motion; mobile drawers fill the width.
  Image aspect ratio is hidden metadata: uploads derive it from natural dimensions,
  and editing retains the stored ratio without a manual dimension control.
  Image/project row actions live in ellipsis dropdowns with edit and delete items;
  menus support arrow keys, Home/End, Escape and return focus to their trigger.
  The shared menu sits outside table overflow and closes on outside click/scroll.
  Images have one “Veröffentlicht” checkbox: unchecked saves unpublished/archived,
  checked saves published/unarchived. New uploads default to archived in the UI
  and API. Existing content is unchanged until saved. Project assignment uses a
  searchable single-select combobox with keyboard navigation and “Kein Projekt”.
  Projects reorder through pointer dragging (mouse/touch) or Up/Down on row grips.
  `/api/projects/reorder` validates the complete ID list and saves positions in one
  transaction; new projects append. The public rail starts at the first published
  project with published, unarchived images and shows its first assigned image.
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
