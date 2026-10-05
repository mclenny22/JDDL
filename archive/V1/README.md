# JDDL V1

V1 is a dependency-free portfolio and local content workspace.

- `/` is the public studio website with database-driven tag filters and a Watch Test-inspired inertial image field. Clicking an image opens a full-screen project gallery that collects all public images assigned to the same project, shows the project's combined services/tags at the top, supports arrow-key, previous/next and thumbnail navigation, and presents the saved project information at the bottom.
- `/admin` is a password-protected, table-first interface for the image library, projects, persistent tag management, project assignments, public studio copy and portfolio exports. Image names, tags and project relations can be edited directly from the table; the full record dialogs retain publishing, archive, alt-text and aspect-ratio controls. Portfolio Export can filter images by one or more tags, select individual records, and open an A4 landscape print preview. Its cover combines an oversized JDDL wordmark, a configurable selection focus and the saved Studio info. The remaining pages group work by project, keep the project description in a left column, and arrange up to five ratio-preserving images in an asymmetric grid before continuing that project on another page. Choose Save as PDF in the browser print dialog to produce the client-ready file.
- `data/projects.db` stores projects and public studio settings.
- `data/images.db` stores image metadata, many-to-many image tags, and each image's optional single-project link.
- `uploads/` stores locally uploaded image files.

The databases and upload directory are created automatically and ignored by Git. On first run, the app seeds the local, 1000px-wide Figma showcase exports under `static/` and assigns the seven headings from the planning view as tags.

## Run locally

```sh
cd V1
python3 server.py
```

Open `http://127.0.0.1:4173`. Set `ADMIN_PASSWORD` before running this archived prototype. The former shared demonstration credential has been retired.

To choose a proper password:

```sh
ADMIN_PASSWORD='use-a-long-unique-password' python3 server.py
```

For production, run behind HTTPS and a reverse proxy, set `ADMIN_PASSWORD` and `COOKIE_SECURE=1`, preserve `data/` and `uploads/` on persistent storage, and back both directories up together. The server refuses to bind beyond localhost without an explicit password. Its built-in HTTP server is intentionally a small self-hosted prototype, not a managed deployment platform.
