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
- A local admin password is generated in the ignored `data/admin.password` file.
  Set `ADMIN_PASSWORD` to choose your own password.

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

Other frontends can read the same content through `/api/public`, with
cross-domain reads enabled by default. See [the public API connection guide](docs/PUBLIC_API.md)
for a working JavaScript example, response fields, and optional origin/image URL
configuration. Editing remains protected by the CMS login.

- `frontend/`: the current HTML/CSS/JavaScript website.
- `backend/server.py`: CMS authentication, APIs, upload handling, static serving
  and SQLite initialization.
- `backend/static/`: admin assets and the local showcase images referenced by
  the databases. Admin CSS/JS are served under `/admin-assets/`.
- `backend/seed/content.json`: a snapshot of the public portfolio used only when
  creating new databases. It contains no login/session secrets.
- `data/`: live `projects.db`, `images.db`, and the session signing secret.
- `uploads/`: persistent image uploads.
- `docs/`: database access, public API, deployment and prototype recovery guides.
- `tests/`: backend HTTP integration and frontend data/interaction checks.

Live databases, uploads, secrets, dependencies, generated builds and preserved
legacy storage and Git metadata are ignored by Git. Retired prototypes are
recoverable from Git history; see [docs/HISTORY.md](docs/HISTORY.md).
Fresh checkouts initialize from the public
seed; restarting does not replace edited content or intentionally empty databases.

## Database connections

### Public content

Read published portfolio content without credentials:

```sh
curl --fail https://jddl.vercel.app/api/public
```

For local content, start the server and use
`http://127.0.0.1:4174/api/public`. The API returns projects, images, tags and
studio settings; it excludes unpublished/archived images and private settings.
Use `/admin` for ordinary content edits.

### Production: Turso / libSQL

Production uses the SQLite-compatible **jddl-database** database through the
Vercel/Turso integration. Supply these variables privately in the process
environment:

- `TURSO_DATABASE_URL`: the database connection URL.
- `TURSO_AUTH_TOKEN`: its authentication token.

Obtain them through the integration linked in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Install the pinned cloud dependencies in a Python virtual environment:

```sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
```

With both variables available, this query connects directly without starting
the server or running database initialization:

```python
import os
import libsql

connection = libsql.connect(
    database=os.environ["TURSO_DATABASE_URL"],
    auth_token=os.environ["TURSO_AUTH_TOKEN"],
)
try:
    projects = connection.execute(
        "SELECT id, title, sort_order FROM projects ORDER BY sort_order, title"
    ).fetchall()
    print(projects)
finally:
    connection.close()
```

Setting `TURSO_DATABASE_URL` switches the server to cloud storage. `.env` files
are ignored by Git but are **not automatically loaded**; export the variables
before starting the server. Never commit or print authentication tokens.
Production and Preview share a database according to the deployment record;
confirm the target before editing. Direct production SQL connectivity has not
been verified in this workspace; see the verification record in
[docs/DATABASE_ACCESS.md](docs/DATABASE_ACCESS.md).

### Local: SQLite

Without `TURSO_DATABASE_URL`, running the server initializes two local files:

- `data/projects.db`: projects and studio settings.
- `data/images.db`: images, tags and image/project relationships.

`JDDL_DATA_DIR` overrides their directory. Local databases are separate from
Turso, and local edits do not synchronize with production. No additional Python
packages are needed. For inspection, use `sqlite3.connect(uri, uri=True)` with a
`file:` URI ending in `?mode=ro`; a complete example is in
[docs/DATABASE_ACCESS.md](docs/DATABASE_ACCESS.md). Preserve `data/` and `uploads/`,
and use SQLite backup APIs when copying live databases.

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

## Vercel

Import the root repository with the Other preset; `vercel.json` provides the
build and routes. Connect Turso (Starter) and a public Vercel Blob store to the
project. Turso supplies `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; Blob supplies
`BLOB_READ_WRITE_TOKEN`. Add a strong `ADMIN_PASSWORD` as a sensitive environment
variable, then redeploy. `/admin` edits the durable cloud database; uploads go
to Blob. Hosted image requests must be under 4 MB. The site initializes the
public seed snapshot once and never overwrites later CMS edits. Back up the
managed database and Blob store independently.

The current accounts, dashboard links, resource IDs, credential locations and
maintenance workflow are recorded in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Agent connection instructions are in [docs/DATABASE_ACCESS.md](docs/DATABASE_ACCESS.md).
