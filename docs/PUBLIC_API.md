# Connect another frontend

Use the read-only JSON API to display the same CMS content in another website
or application. No password, API key, database driver, or frontend dependency
is needed. Content changes made in `/admin` become available on the next fetch.

The production endpoint is `https://jddl.vercel.app/api/public`; locally it is
`http://127.0.0.1:4174/api/public` after running `python3 server.py`.
Cross-domain browser access requires deploying the backend changes in this
repository. The endpoint accepts `GET` and `HEAD`, with `OPTIONS` for preflight.
Responses use `Cache-Control: no-store`.

## Images and videos

The existing `images` array can contain still images and MP4 videos. Check
`mime_type === "video/mp4"` and render those URLs with `<video>` rather than
`<img>`. Video entries use the same tags, project assignments, publication flags,
`aspect_ratio` and `thumbnail_id` selection as images. No API route or schema
change is needed. Upload limits remain below 4 MB online and up to 20 MB locally;
MP4 with H.264 is the preferred browser-compatible upload format.

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
| `projects` | Published projects, ordered by `sort_order`, then title. Fields include `id`, `slug`, `title`, `client`, `description`, `thumbnail_id`, `published`, `sort_order`, `created_at`, and `updated_at`. |
| `images` | Published, unarchived images. Fields include `id`, `url`, `alt_text`, `aspect_ratio` (width / height), `original_name`, `filename`, `remote_url`, `mime_type`, `published`, `archived`, timestamps, `project_ids`, and `tag_ids`. |
| `tags` | Tags with `id`, `slug`, `name`, and `sort_order`. |
| `settings` | Studio settings as a key/value object, including `about`, `footer_contact`, `footer_address`, `footer_email` and optional `project_compositions` (described below), plus legacy `project_layout` (a JSON string mapping image IDs to `{column, span, row}` placements in the seven-column detail grid; composed layouts also store `ratio` and may use twelfth-column fractions), plus optional `project_layout_rows` (a JSON string mapping project IDs to their explicit row count, including empty rows). |

A project’s `thumbnail_id` is its optional explicit thumbnail choice (empty means automatic).
Use the matching published, unarchived image assigned to that project; if no eligible
match exists, use its first assigned public image. Keep the original image order.

IDs are strings. Publication/archive flags are SQLite integers (`0` / `1`).
Each image can have multiple project assignments in `project_ids` and many tags.
A shared asset appears once per assigned project when joined against projects. The image library can contain
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


## Project compositions (twelve columns)

`settings.project_compositions` is a JSON string mapping project IDs to:

```json
{
  "columns": 12,
  "manual": true,
  "hero_id": "assigned-image-id",
  "rows": 3,
  "placements": {
    "another-image-id": {"column": 1, "span": 4, "row": 1, "ratio": 0.8}
  },
  "texts": {
    "text-note": {"column": 1, "span": 8, "row": 2, "text": "Project note"}
  }
}
```

In automatic mode (`manual: false`) all eligible assigned images except the hero
use the standard twelve-column row patterns. In manual mode only placed images
and text blocks appear below the hero. Coordinates and widths are whole columns;
`column + span` must not exceed 13. Rows are 1–1000. Elements cannot overlap in a
row. Text blocks are plain white text, not HTML (maximum 10,000 characters each,
200 blocks per project). An empty `hero_id` follows the project's thumbnail;
otherwise the hero can differ from the Selected thumbnail. Optional `hero_hidden`
is a boolean: `true` omits the hero for default project visits at
`#project/<slug>`. Existing compositions without this field keep their hero.
A direct image link
still chooses its specified image as hero. Compositions for unpublished projects
are excluded from public settings. Existing seven-column settings remain readable.

The authenticated `/api/projects` endpoint accepts this object as `composition`
and saves it with project metadata. Each project retains its own composition,
including when an image is assigned to multiple projects. No new database table
is needed. The authenticated `/api/images/batch` endpoint accepts `ids` and
`changes`: `published` updates visibility, `project_ids` / `tag_ids` replace a
relation set, and `add_project_ids`, `remove_project_ids`, `add_tag_ids`,
`remove_tag_ids` change only the specified relations. All selected assets update
in one transaction; unknown assets, tags or projects reject the complete request.
