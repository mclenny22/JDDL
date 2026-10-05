# Project notes

## Architecture

- `server.js` is a dependency-free Node HTTP server and JSON API.
- SQLite is provided by Node's built-in `node:sqlite` module.
- `public/` contains the vanilla frontend.
- Runtime data lives in ignored `data/` and `uploads/` folders.

## Product constraints

- Keep the app intentionally small and dependency-free.
- Images can have many tags selected from a persistent, user-managed tag set and optionally belong to one project.
- Starter tags are seeded once via `app_meta`; deleting them does not cause them to reappear.
- Tags persist even when unassigned. Deleting a tag removes its image associations.
- Image metadata supports direct cell editing: Name opens text input, Tags opens predefined tag choices, and Project opens relation choices.
- Multi-tag filtering uses AND semantics.
- Deleting a project keeps its images and clears only their project relation.
- Library and Projects both use compact database-table views.

## Verification

Run `npm run check`. For API changes, start the server on a temporary `PORT` and exercise affected endpoints.
