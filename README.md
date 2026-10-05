# JDDL

A horizontal portfolio and integrated content workspace. The public website and
password-protected editor share a dependency-free Python server and two SQLite
databases.

## Run

Requires Python 3.9 or newer. No package installation or frontend build is needed.

```sh
python3 server.py
```

- Website: http://127.0.0.1:4174/
- Editor: http://127.0.0.1:4174/admin
- Local demonstration password: `jddl` (override with `ADMIN_PASSWORD`).

The rail loops in both directions and snaps projects to the left inset. Mouse
wheel input glides horizontally; touch and horizontal trackpad gestures use
native scrolling and CSS snapping. Arrow keys work when the rail is focused.
Only the active project advances its gallery every 4.5 seconds. Other galleries
retain their slide and progress. Progress bars allow manual selection. Reduced
motion disables autoplay, image crossfades, and wheel easing.

Projects, descriptions, studio copy and images come from `/api/public`. Edit
content in `/admin`, then refresh the public page. Published projects with at
least one published, unarchived assigned image appear in the rail. The menu and
progress bars adapt to the actual project and image counts. All assigned public
images participate; galleries are not artificially limited to four slides.

## Layout

- `frontend/`: the current HTML/CSS/JavaScript website.
- `backend/server.py`: CMS authentication, APIs, upload handling, static serving
  and SQLite initialization.
- `backend/static/`: admin assets and the local showcase images referenced by
  the databases. Admin CSS/JS are served under `/admin-assets/`.
- `backend/seed/content.json`: a snapshot of the public portfolio used only when
  creating new databases. It contains no login/session secrets.
- `data/`: live `projects.db`, `images.db`, and the session signing secret.
- `uploads/`: persistent image uploads.
- `archive/`: previous V1, V2 demo, Page Test, Watch Test and backendUI prototypes.
- `tests/`: backend HTTP integration and frontend data/interaction checks.

Live databases, uploads, secrets, dependencies, generated builds and preserved
legacy Git metadata are ignored by Git. Existing local content was retained
when the prototypes were archived. Fresh checkouts initialize from the public
seed; restarting does not replace edited content or intentionally empty databases.

## Verification

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

The frontend checks require Node 18 or newer. They verify data mapping and
scroll/gallery logic without a browser visual check.

## Server configuration

`HOST` defaults to `127.0.0.1`; `PORT` defaults to `4174`. `JDDL_DATA_DIR` and
`JDDL_UPLOADS_DIR` override the storage paths. For a production deployment, use
HTTPS via a reverse proxy, set a strong `ADMIN_PASSWORD` and `COOKIE_SECURE=1`,
and preserve and back up both storage directories together. The server refuses
non-local binding unless `ADMIN_PASSWORD` is explicitly set. Hosting the static
frontend alone will not provide the CMS or database APIs.

The Figma reference is [Website Planning, node 563:1020](https://www.figma.com/design/83EmCrcQUbPM4r2UiCcgnx/Website-Planning?node-id=563-1020).
Haffer was not supplied; typography uses the existing system sans-serif fallback.
