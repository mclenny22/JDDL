# Database access for agents

This guide describes the connections implemented by this repository. Read it
before accessing JDDL content. Hosting resource identifiers and environment
scopes are recorded in [DEPLOYMENT.md](DEPLOYMENT.md).

## Public content: no credentials required

Use the public API when you only need published portfolio content:

```sh
curl --fail https://jddl.vercel.app/api/public
```

Locally, start `python3 server.py` from the repository root and use
`http://127.0.0.1:4174/api/public`. The JSON contains `projects`, `images`, `tags`
and `settings`. It excludes unpublished/archived images and private
configuration. This endpoint provides read-only content access, not arbitrary
SQL or database writes. See [PUBLIC_API.md](PUBLIC_API.md) for the response
fields, joins, browser examples and CORS configuration.

## Production SQL: Turso/libSQL

The application's production database is **jddl-database**, connected to Vercel
project **jddl** in team **lennis-projects-3ef951fe**. It is SQLite-compatible;
the active backend does not use Supabase/Postgres.

Direct SQL requires these variables in the agent's execution environment:

- `TURSO_DATABASE_URL`: the database connection URL supplied by the integration.
- `TURSO_AUTH_TOKEN`: the corresponding database authentication token.

Authorized users can obtain the connection configuration through the existing
Vercel/Turso integration linked in [DEPLOYMENT.md](DEPLOYMENT.md), or supply it
through a private execution environment. Do not print tokens or commit their
values. `.env` and `.env.*` are ignored by Git, but the Python server does not
automatically load these files: variables must be exported into its environment
before startup.

Use the pinned dependencies in `requirements.txt` in a suitable Python virtual
environment for cloud access. Local SQLite development needs no installation.
This read-only smoke query uses the same driver and arguments as
`backend/cloud.py`, without starting the server or triggering initialization:

```python
import os
import libsql

required = ("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN")
if any(not os.environ.get(name) for name in required):
    raise SystemExit("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN privately first")

connection = libsql.connect(
    database=os.environ["TURSO_DATABASE_URL"],
    auth_token=os.environ["TURSO_AUTH_TOKEN"],
)
try:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).fetchall()
    print([row[0] for row in rows])
finally:
    connection.close()
```

Cloud content tables are `projects`, `settings`, `images`, `tags`, `image_tags`
and `image_projects`; their schema is in `backend/schema.sql`. Images have many
tags and at most one project. `private_config` contains initialization and
session secrets: do not retrieve or expose its values for content tasks.

The backend selects cloud mode when `TURSO_DATABASE_URL` is set. Starting the
server in cloud mode can run initialization against an uninitialized database;
use a direct SELECT for connection checks. The deployment record says Production
and Preview share a database, so verify the target before making requested edits.
Use `/admin` for ordinary CMS content editing. Do not modify live data for tests.

## Local SQL: separate SQLite files

Run queries from the repository root. Use read-only connections for inspection
so a missing file is not silently created:

```python
import sqlite3
from pathlib import Path

for filename in ("projects.db", "images.db"):
    uri = (Path("data") / filename).resolve().as_uri() + "?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    try:
        print(filename, connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        ).fetchall())
    finally:
        connection.close()
```

`data/projects.db` holds projects and studio settings; `data/images.db` holds
images, tags and image relationships. These files are ignored by Git and are
separate from Turso. Local edits do not synchronize with production. Uploaded
local files live in `uploads/`; production uploads live in Vercel Blob, with
their metadata and URLs in Turso. Preserve local storage and use SQLite backup
APIs when copying live databases.

## Verification record

On 6 October 2026 this guide was checked against `backend/cloud.py`,
`backend/server.py`, `backend/schema.sql` and the deployment documentation.
Neither Turso connection variable was set in the documenting agent's shell,
so a direct production SQL connection was not verified. A connector appearing
in an agent's tools does not establish that it targets JDDL; confirm its database
identity before using it, and update this guide if the connection changes.
