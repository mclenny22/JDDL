# JDDL deployment record

Set up on 5 October 2026. This file records the current production setup; check
Vercel before changing resources because dashboard settings can change later.

## Website and editor

- Public website: https://jddl.vercel.app/
- CMS: https://jddl.vercel.app/admin
- GitHub repository: https://github.com/mclenny22/JDDL
- Production branch: `main`. Vercel deploys updates pushed to this branch.
- Vercel account/team: **Lenni's projects**, Hobby plan.
- Team slug: `lennis-projects-3ef951fe`.
- Project name: `jddl`.
- Project dashboard: https://vercel.com/lennis-projects-3ef951fe/jddl
- Environment settings: https://vercel.com/lennis-projects-3ef951fe/jddl/settings/environment-variables
- Deployments: https://vercel.com/lennis-projects-3ef951fe/jddl/deployments
- Verified production deployment:
  https://vercel.com/lennis-projects-3ef951fe/jddl/FtB1PaVqM1amaWpCGBwzcRtsowF8
- Application commit at setup: `a0e8088dd867c01bee15d034e13c60273ff51212`.

## Database: Turso

Turso is the managed SQLite-compatible database provider. It is installed through
Vercel's Storage marketplace and connected to the JDDL project.

- Resource name: **jddl-database**.
- Plan at setup: **Starter**, $0/month.
- Primary region: **EU West (Ireland)**, `dub1`.
- Database resource ID: `01a10ddd-c401-7230-b7d8-4de4051ad10e`.
- Vercel storage ID: `store_FlahXNLGlgN8tnf9`.
- Integration configuration: `icfg_59hBJIBcKfzClf4KayM8ctPS`.
- Database dashboard:
  https://vercel.com/lennis-projects-3ef951fe/~/integrations/tursocloud/icfg_59hBJIBcKfzClf4KayM8ctPS/resources/storage/store_FlahXNLGlgN8tnf9/guides
- Use **Open in Turso Cloud** on that dashboard to reach Turso management through
  the existing Vercel integration.
- Connection variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
- Connected environments at setup: Production and Preview.

Production project descriptions, studio copy, image metadata, tags and image
assignments live in this database. Tables are `projects`, `settings`, `images`,
`tags`, `image_tags`, and `image_projects`. The private `private_config` table
stores the initialization marker and session signing secret; it is excluded
from content API responses.

The cloud database was initialized with 4 projects and 22 public images from
`backend/seed/content.json`. The seed runs once. Later CMS edits persist across
function instances and deployments, and are not replaced on redeployment.

Preview deployments currently share this database with production. CMS edits in
an authenticated preview can therefore change production content. Separate the
preview database before using previews for experimental content edits.

## Image uploads: Vercel Blob

- Store name: **jddl-images**.
- Store ID: `store_BQzt7yXLJj4uhzO5`.
- Region: **Dublin, Ireland**, `dub1`.
- Access: **Public**; anyone with an image URL can read that asset.
- Browse uploads:
  https://vercel.com/lennis-projects-3ef951fe/~/stores/blob/store_BQzt7yXLJj4uhzO5/manage-blobs
- Project connections:
  https://vercel.com/lennis-projects-3ef951fe/~/stores/blob/store_BQzt7yXLJj4uhzO5/projects
- Connected environments: Production and Preview.
- Variables supplied: `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`,
  `BLOB_WEBHOOK_PUBLIC_KEY`.

The CMS uses `BLOB_READ_WRITE_TOKEN` to upload and delete assets. New uploads use
the `jddl/` path prefix. Image metadata and the Blob URL are stored in Turso.
Hosted upload requests must be smaller than 4 MB. The original showcase images
remain repository assets in `backend/static/`, copied to Vercel's CDN at build.

## Passwords and secrets

The user entered the production CMS password directly into Vercel's sensitive
`ADMIN_PASSWORD` environment variable. Its value is not recorded here or in Git.
Use that password to log in at `/admin`. Production cookies are automatically
marked Secure.

Database and Blob credentials are managed by the storage integrations and stored
as sensitive project environment variables. Do not copy their values into source,
this document, public settings, or chat. Redeploy after environment changes.
`ADMIN_PASSWORD` was configured for Production; previews do not have a CMS
password unless one is explicitly added.

## Local workspace and deployment code

Workspace: `/Users/lenni/Library/Mobile Documents/com~apple~CloudDocs/_Projects/_Codex/JDDL`.

- `frontend/`: active website.
- `backend/server.py`: CMS and HTTP APIs.
- `backend/cloud.py`: Turso and Blob integration.
- `backend/schema.sql`: cloud database schema.
- `api/index.py`: Vercel Python function entry point.
- `requirements.txt`: pinned cloud dependencies.
- `vercel.json`: build settings, Dublin function region, routes and exclusions.
- `scripts/build_vercel.py`: exports active static assets into ignored `public/`.
- `archive/`: earlier versions; excluded from the function deployment.

Vercel uses the **Other** preset and the repository root. The build runs
`python3 scripts/build_vercel.py` and serves `public/`. `/api/*` and `/admin`
are routed to the Python function.

Local development remains separate: run `python3 server.py` at the workspace
root. Local content lives in ignored `data/projects.db`, `data/images.db`, and
`uploads/`. Local credentials are in ignored `data/admin.password` and
`data/session.secret`, unless overridden through environment variables.
Local CMS edits do not automatically synchronize with the cloud database.

## Checks and ongoing maintenance

At setup, Vercel reported Ready. The public API returned 4 projects and 22 images;
all 22 image URLs returned HTTP 200. `/admin` loaded, protected admin API requests
and an incorrect password returned 401, and private data/source URLs returned
404. The website was visually checked in Chrome. An authenticated production
editing/upload check was not performed because the password was entered privately
by the user.

For changes: edit source, run the tests in `AGENTS.md`, commit and push to `main`,
then check the Vercel deployment. Content-only edits belong in the live CMS and
need a page refresh, not a code deployment. Back up Turso and Blob separately;
a Git checkout does not contain live cloud edits or uploaded files. No recurring
backup automation was configured during this setup.
