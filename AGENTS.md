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

- `frontend/index.html`, `styles.css`, and `app.js` implement the white horizontal
  portfolio based on Figma node `563:1020`: fixed studio copy at top left, menu
  at top right, descriptions and story bars above bottom-aligned portrait tiles.
- `frontend/projects.js` fetches `/api/public` with caching disabled and groups
  public images by their single project assignment. Only published projects
  with published, unarchived assigned images appear. Menu items and story bars
  use actual project/image counts; empty/error states are explicit. Studio copy,
  project titles, descriptions and image alt text come from the CMS. No demo
  asset fallback or hardcoded project content belongs in the active frontend.
- Seven repeated project sets rebase by whole cycles for an endless rail. Only
  the active project nearest the left edge advances every 4.5 seconds. Inactive
  galleries retain slide/progress and resume when active again. There is no
  pause button or hover pause. Reduced motion disables autoplay and crossfades;
  manual slide selection remains available.
- Mouse-wheel input anywhere on the page eases into the native horizontal rail
  and settles onto a project after a 140ms input pause. Short intentional wheel
  gestures advance a project. Native CSS snapping handles horizontal trackpad
  gestures and touch, aligning tiles with the left inset. Wheel animation
  temporarily disables native snapping and rebases its target with the rail.
  Reduced motion skips easing; browser pinch-to-zoom is preserved. The focused
  rail supports Left/Right/Home/End. Resize preserves the active project.
- About, project text and menu share a fixed 12px root font size and 1.12 line
  height across all viewport sizes. Story fills animate their actual width with fixed round
  caps, rather than scaling their shape. Rail spacing uses fractional bounding
  rectangles to match native snapping exactly; the context/progress width follows
  the measured tile width. Story selection also aligns the active tile, and
  native scroll completion corrects residual misalignment.
- Menu buttons show numbers by default and reveal Highlights, Index, About and
  random on hover or keyboard focus. Labels match the studio copy's regular
  weight, uppercase type and line height. Button 2 (Index) opens the CMS-backed
  Orbit Grid V2 in `frontend/orbit.js`: a vertically wrapping center lens with
  Order–Chaos and viscosity controls, pointer/touch drag, wheel and Up/Down keys.
  The seeded grid fits approximately 80% of the viewport width; displayed image
  sides are capped at 800px, including during lens spring motion and resizing.
  A bottom-left Vertical / Infinite field toggle switches to a field wrapping on
  both axes with a radial center lens. Field mode supports two-axis pointer/touch
  drag, trackpad scrolling, Shift-wheel horizontally and all four arrow keys.
  Each mode retains its camera while toggling; both keep the 800px image cap
  and the image layer's top/bottom fade.
  Escape or another menu button returns to the preserved horizontal gallery.
  Gallery autoplay pauses in Index; reduced motion removes inertia and springs.
  Other buttons retain project navigation; additional buttons reveal project titles.
  Buttons ease to the measured label width over 320ms while number and label
  fade; reduced motion disables these transitions.
- Menu navigation fades the outgoing view over 400ms, switches at opacity zero,
  then eases the incoming view over 800ms with a small directional horizontal
  offset. The masthead stays fixed. Exit clicks replace the pending destination;
  autoplay pauses during transitions. Reduced motion switches immediately.
- No frontend framework or package dependencies are needed. Haffer uses a system
  sans-serif fallback until licensed font files are supplied.

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
- Preserve horizontal scrolling, infinite wrapping, snapping and active-gallery
  behavior unless the user explicitly requests a replacement. Account for touch,
  mouse wheel, keyboard accessibility, reduced motion and narrow viewports.
