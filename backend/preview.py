"""Serve the working frontend with disposable, read-only portfolio fixtures."""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit


FRONTEND = Path(__file__).resolve().parents[1] / 'frontend'
PROJECTS = (
    ('Field Notes', 'Field Office', 'Identity', '#bbc9b2', '#303c33'),
    ('After Hours', 'Night Shift', 'Motion', '#cbc0df', '#3d2857'),
    ('Common Ground', 'Public Works', 'Campaign', '#efc1a3', '#793d32'),
    ('Soft Focus', 'Image Bureau', 'Art Direction', '#b3cfe3', '#224156'),
    ('Open Form', 'Form Lab', 'Digital', '#e4d1a0', '#5e452a'),
)
RATIOS = ((4, 5), (16, 9), (1, 1), (3, 4))


def preview_content():
    payload = {
        'projects': [], 'images': [], 'tags': [],
        'settings': {'about': 'An independent design studio. Placeholder copy for local layout review.'},
    }
    artwork = {}
    for index, (title, client, service, background, foreground) in enumerate(PROJECTS, 1):
        project = f'preview-{index}'
        payload['projects'].append({
            'id': project, 'slug': project, 'title': title, 'client': client,
            'description': f'{service} for {client}. This sample project is here to preview the layout.',
            'published': True, 'sort_order': index,
        })
        payload['tags'].append({'id': project, 'name': service})
        for number, (wide, high) in enumerate(RATIOS, 1):
            image = f'{project}-{number}'
            url = f'/preview-media/{image}.svg'
            payload['images'].append({
                'id': image, 'url': url, 'project_ids': [project], 'tag_ids': [project],
                'published': True, 'archived': False, 'mime_type': 'image/svg+xml',
                'alt_text': f'{title}, placeholder {number}', 'aspect_ratio': wide / high,
            })
            width, height = wide * 100, high * 100
            artwork[url] = (
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">'
                f'<rect width="100%" height="100%" fill="{background}"/>'
                f'<circle cx="{width / 2}" cy="{height / 2}" r="{min(width, height) / 3}" fill="{foreground}"/>'
                f'<text x="50%" y="52%" fill="{background}" text-anchor="middle" '
                f'font-family="sans-serif" font-size="24">{index:02d} / {number:02d}</text></svg>'
            ).encode()
    return json.dumps(payload).encode(), artwork


class PreviewHandler(SimpleHTTPRequestHandler):
    payload, artwork = preview_content()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        path = urlsplit(self.path).path
        if path == '/api/public':
            content, mime = self.payload, 'application/json'
        elif path in self.artwork:
            content, mime = self.artwork[path], 'image/svg+xml'
        else:
            return super().send_head()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        return BytesIO(content)


def run():
    port = int(os.environ.get('PORT', '4175'))
    with ThreadingHTTPServer(('127.0.0.1', port), PreviewHandler) as server:
        print(f'AD4K placeholder preview at http://127.0.0.1:{server.server_port}/', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
