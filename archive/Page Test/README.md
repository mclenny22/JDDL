# Split-screen portfolio gallery

This is the React/Vite app in the JDDL workspace. The home route presents manifesto copy and a filterable project gallery in two independently scrollable panes separated by a draggable divider.

The original Figma source is [Create Interactive Thumbnail Gallery](https://www.figma.com/design/sOsdmMWZkQN8RZwHLVP7dS/Create-Interactive-Thumbnail-Gallery).

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` for a production build. There are currently no test, lint, or standalone type-check scripts.

## Key files

- `src/app/pages/Home.tsx` — split view, divider behavior, filtering, and project cards.
- `src/app/pages/ProjectPage.tsx` — project detail screen.
- `src/data/projects.ts` — project content and image metadata.
- `src/app/routes.ts` — in-memory route definitions.
- `src/styles/` — Tailwind entry point, font import, and theme variables.

The current split-view behavior is desktop-first and works best at widths of about 1000px or more. Some sample images and the DM Sans font are fetched remotely, so the complete experience requires network access.
