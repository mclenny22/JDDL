# Connect another frontend

Use the read-only JSON API to display the same CMS content in another website
or application. No password, API key, database driver, or frontend dependency
is needed. Content changes made in `/admin` become available on the next fetch.

The production endpoint is `https://jddl.vercel.app/api/public`; locally it is
`http://127.0.0.1:4174/api/public` after running `python3 server.py`.
Cross-domain browser access requires deploying the backend changes in this
repository. The endpoint accepts `GET` and `HEAD`, with `OPTIONS` for preflight.
Responses use `Cache-Control: no-store`.

## Browser example

Paste this into your frontend's JavaScript, replacing the CMS URL for local
development or a custom domain:

```js
const cmsUrl = 'https://jddl.vercel.app';

async function loadContent() {
  const response = await fetch(`${cmsUrl}/api/public`, {
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`CMS request failed (${response.status})`);
  const content = await response.json();

  // Resolve CMS-relative paths; existing absolute Blob URLs stay intact.
  const images = content.images.map(image => ({
    ...image,
    url: new URL(image.url, `${cmsUrl}/`).href,
  }));
  const projects = content.projects.map(project => ({
    ...project,
    images: images.filter(image => image.project_ids.includes(project.id)),
  }));

  return { ...content, images, projects };
}

const content = await loadContent();
console.log(content.projects, content.settings);
```

For a portfolio like JDDL, filter projects with `project.images.length > 0`.
Applications can also use the image library separately. Fetch on page load,
refresh, or your chosen interval; this endpoint does not push live updates.
Handle request failures and empty collections explicitly in your UI.

From a server or terminal:

```sh
curl --fail https://jddl.vercel.app/api/public
```

## Response structure

The response contains four top-level fields:

| Field | Content |
| --- | --- |
| `projects` | Published projects, ordered by `sort_order`, then title. Fields include `id`, `slug`, `title`, `client`, `description`, `published`, `sort_order`, `created_at`, and `updated_at`. |
| `images` | Published, unarchived images. Fields include `id`, `url`, `alt_text`, `aspect_ratio` (width / height), `original_name`, `filename`, `remote_url`, `mime_type`, `published`, `archived`, timestamps, `project_ids`, and `tag_ids`. |
| `tags` | Tags with `id`, `slug`, `name`, and `sort_order`. |
| `settings` | Studio settings as a key/value object, including `about`. |

IDs are strings. Publication/archive flags are SQLite integers (`0` / `1`).
Each image has at most one project assignment; `project_ids` is still an array
for compatibility. An image can have many tags. The image library can contain
unassigned images and images assigned to unpublished projects; join against
the returned projects when building project galleries. Tags are returned even
when unused. Private database configuration and session secrets are excluded.

## Optional server configuration

No configuration is required to allow public reads from any frontend. Only
`/api/public` receives cross-origin access headers; admin and editing endpoints
continue to require the existing CMS login.

| Variable | Default | Effect |
| --- | --- | --- |
| `PUBLIC_API_ORIGINS` | `*` | Allow any browser origin to read public content. Set comma-separated exact origins such as `https://portfolio.example,https://gallery.example` to limit browser access. Set an empty value to disable cross-origin reads. Origins include scheme and optional port, with no path or trailing slash. |
| `PUBLIC_BASE_URL` | Unset | Optional canonical CMS URL, such as `https://jddl.vercel.app`. Resolves public image `url` fields to absolute URLs. Existing absolute asset URLs and admin responses retain their values. |

CORS restrictions control browser access, not authentication: this endpoint
remains public and readable by server clients. Cross-origin requests should
omit credentials and custom headers. Write methods are not enabled by CORS.

For local configuration:

```sh
PUBLIC_API_ORIGINS='http://localhost:3000,http://127.0.0.1:3000' \
PUBLIC_BASE_URL='http://127.0.0.1:4174' python3 server.py
```

For Vercel, set optional variables in the relevant environment and redeploy.
Use the appropriate CMS URL for each preview environment. Never put
`TURSO_AUTH_TOKEN`, `ADMIN_PASSWORD`, or Blob write credentials into another
frontend. Other frontends connect to this API; CMS edits stay in `/admin`.
