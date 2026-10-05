# Current frontend

This is the active JDDL horizontal portfolio. Run `python3 server.py` from the
repository root and open http://127.0.0.1:4174. A static-only HTTP server will not
provide the `/api/public` endpoint required by this frontend.

`projects.js` loads and groups the CMS data. `app.js` renders studio copy, menu,
project descriptions, galleries and progress bars, with native horizontal
scrolling, wheel easing, snapping and infinite wrapping. All published,
unarchived images assigned to each published project are used. Only the active
project cycles automatically; inactive projects retain their slide/progress.

Edit content through `/admin`, then refresh the website. The original demo
content and artwork are preserved in `archive/V2-demo/`.
