# V2 — horizontal portfolio

Fresh dependency-free implementation of Figma node `563:1020`.

Run from this directory:

```sh
python3 -m http.server 4174 --bind 127.0.0.1
```

Open http://127.0.0.1:4174. Use the mouse wheel anywhere on the page, a
horizontal trackpad gesture, touch swipe, or focus the rail and use the arrow keys. Vertical scrolling
is disabled. Seven repeated project sets are rebased by whole cycles to keep
the rail looping in either direction without changing its visible content.
Vertical mouse-wheel input eases into the native rail's horizontal scroll,
then gently settles onto a project after a 140ms input pause. Short intentional
wheel gestures advance one project. Touch and horizontal trackpad gestures
use native CSS snapping, aligning each project with the left inset. Pinch-to-zoom
is preserved; reduced motion skips the wheel easing.

Each project has up to four slides; the blank grey demo slide is excluded. Only the active project nearest the left edge
advances automatically, every 4.5 seconds with a crossfade. Other projects
retain their slide and progress and resume when they become active again.
The description and clickable progress bars follow the active project, with
one bar per available image. There
is no pause button. Reduced motion disables autoplay and removes crossfades;
the progress bars still allow manual slide selection.

Edit `projects.js` for titles and thumbnails. The first three covers are the
local Figma artwork; slides 2–4 use V1 demo assets pending final project images.
Haffer was not supplied, so the typography uses an Arial/system fallback.
The prototype intentionally has no CMS connection. The Imprint / AGB text
is a placeholder pending legal content. Menu items jump to projects; the
fourth project is a demo Glitch edition using the repeated cover in the design.
