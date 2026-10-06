import base64
import http.client
import json
import secrets
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer

from backend import server


class BackendIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.password = secrets.token_urlsafe(24)
        self.env = patch.dict(server.os.environ, ADMIN_PASSWORD=self.password)
        self.env.start()
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.storage = patch.multiple(server, DATA=root / 'data', UPLOADS=root / 'uploads',
                                     PROJECTS_DB=root / 'data/projects.db',
                                     IMAGES_DB=root / 'data/images.db',
                                     SESSION_SECRET_FILE=root / 'data/session.secret')
        self.storage.start()
        server.initialize()
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.cookie = ''

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.storage.stop()
        self.env.stop()
        self.temp.cleanup()

    def request(self, method, path, payload=None, content_type='application/json', headers=None):
        body = json.dumps(payload).encode() if isinstance(payload, (dict, list)) else payload
        connection = http.client.HTTPConnection('127.0.0.1', self.http.server_port)
        connection.request(method, path, body=body,
                           headers={'Content-Type': content_type, 'Cookie': self.cookie, **(headers or {})})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def login(self):
        status, headers, _ = self.request('POST', '/api/login', {'password': self.password})
        self.assertEqual(status, 200)
        self.cookie = headers['Set-Cookie'].split(';')[0]

    def test_new_site_and_admin_assets_do_not_conflict(self):
        status, _, page = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'project-copy', page)
        self.assertNotIn(b'RIN TOUR', page)
        self.assertIn(b'scroll-snap-type', self.request('GET', '/styles.css')[2])
        admin = self.request('GET', '/admin')[2]
        self.assertIn(b'/admin-assets/styles.css', admin)
        self.assertIn(b'/admin-assets/admin.js', admin)
        self.assertEqual(self.request('GET', '/admin-assets/admin.js')[0], 200)
        self.assertEqual(self.request('HEAD', '/')[2], b'')
        for path in ['/data/projects.db', '/data/session.secret', '/archive/V1/server.py', '/backend/server.py', '/admin-assets/../server.py']:
            self.assertEqual(self.request('GET', path)[0], 404, path)

    def test_seed_content_and_all_public_image_urls(self):
        status, _, body = self.request('GET', '/api/public')
        self.assertEqual(status, 200)
        public = json.loads(body)
        self.assertEqual(len(public['projects']), 4)
        self.assertEqual(len(public['images']), 22)
        for image in public['images']:
            status, headers, content = self.request('GET', image['url'])
            self.assertEqual(status, 200, image['url'])
            self.assertTrue(content, image['url'])
            self.assertTrue(headers['Content-Type'].startswith('image/'))

    def test_cross_origin_public_reads_and_protected_admin(self):
        origin = {'Origin': 'https://other-frontend.example'}
        with patch.dict(server.os.environ, PUBLIC_API_ORIGINS='*'):
            for method in ['GET', 'HEAD', 'OPTIONS']:
                status, headers, body = self.request(method, '/api/public', headers=origin)
                self.assertEqual(status, 204 if method == 'OPTIONS' else 200)
                self.assertEqual(headers['Access-Control-Allow-Origin'], '*')
                self.assertNotIn('Access-Control-Allow-Credentials', headers)
                if method != 'GET':
                    self.assertEqual(body, b'')
                if method == 'OPTIONS':
                    self.assertEqual(headers['Access-Control-Allow-Methods'], 'GET, HEAD, OPTIONS')
            for method, path, expected in [
                ('GET', '/api/admin/bootstrap', 401),
                ('POST', '/api/settings', 401),
                ('OPTIONS', '/api/settings', 405),
                ('POST', '/api/public', 401),
            ]:
                status, headers, _ = self.request(method, path, headers=origin)
                self.assertEqual(status, expected)
                self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_public_origin_allowlist(self):
        with patch.dict(server.os.environ, PUBLIC_API_ORIGINS='https://one.example, https://two.example'):
            for method in ['GET', 'OPTIONS']:
                for origin in ['https://one.example', 'https://two.example', 'https://denied.example', 'null']:
                    _, headers, _ = self.request(method, '/api/public', headers={'Origin': origin})
                    self.assertEqual(headers['Vary'], 'Origin')
                    self.assertEqual(headers.get('Access-Control-Allow-Origin'),
                                     origin if origin in ['https://one.example', 'https://two.example'] else None)
        with patch.dict(server.os.environ, PUBLIC_API_ORIGINS=''):
            self.assertNotIn('Access-Control-Allow-Origin', self.request('GET', '/api/public')[1])

    def test_public_absolute_image_urls_preserve_content_and_admin(self):
        original = server.public_payload()
        with patch.dict(server.os.environ, PUBLIC_BASE_URL='https://cms.example/'):
            public = json.loads(self.request('GET', '/api/public')[2])
            for image, source in zip(public['images'], original['images']):
                self.assertEqual(image['url'], server.urljoin('https://cms.example/', source['url']))
            self.assertEqual(public['projects'], original['projects'])
            self.assertEqual(public['settings'], original['settings'])
            self.assertEqual(set(public), {'projects', 'images', 'tags', 'settings'})
            self.login()
            admin = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
            self.assertEqual(admin['images'][0]['url'], original['images'][0]['url'])
            with server.connect(server.IMAGES_DB) as db:
                db.execute('UPDATE images SET remote_url=? WHERE id=?',
                           ('https://assets.example/photo.jpg', original['images'][0]['id']))
            public = json.loads(self.request('GET', '/api/public')[2])
            self.assertEqual(public['images'][0]['url'], 'https://assets.example/photo.jpg')

    def test_authentication_and_cms_edits_reach_public_api(self):
        self.assertEqual(self.request('GET', '/api/admin/bootstrap')[0], 401)
        self.assertEqual(self.request('POST', '/api/settings', {'about': 'Denied'})[0], 401)
        self.assertEqual(self.request('POST', '/api/login', {'password': 'wrong'})[0], 401)
        self.login()
        self.assertEqual(self.request('GET', '/api/admin/bootstrap')[0], 200)
        self.assertEqual(self.request('POST', '/api/settings', {'about': 'JDDL Updated studio copy'})[0], 200)
        public = json.loads(self.request('GET', '/api/public')[2])
        self.assertEqual(public['settings']['about'], 'JDDL Updated studio copy')
        project = public['projects'][0]
        project.update(title='Updated project', description='Updated description')
        self.assertEqual(self.request('POST', '/api/projects', project)[0], 200)
        public = json.loads(self.request('GET', '/api/public')[2])
        updated = next(p for p in public['projects'] if p['id'] == project['id'])
        self.assertEqual(updated['description'], 'Updated description')
        self.assertEqual(updated['title'], 'Updated project')
        project['published'] = False
        self.request('POST', '/api/projects', project)
        self.assertNotIn(project['id'], [p['id'] for p in json.loads(self.request('GET', '/api/public')[2])['projects']])
        self.assertEqual(self.request('POST', '/api/logout')[0], 200)

    def test_upload_image_assignment_archive_and_delete(self):
        self.login()
        public = json.loads(self.request('GET', '/api/public')[2])
        project_id = public['projects'][0]['id']
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1kAAAAASUVORK5CYII=')
        boundary = 'jddl-test-boundary'
        payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="project_ids"\r\n\r\n{json.dumps([project_id])}\r\n'
                   f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n').encode()
        payload += png + f'\r\n--{boundary}--\r\n'.encode()
        status, _, body = self.request('POST', '/api/images', payload, f'multipart/form-data; boundary={boundary}')
        self.assertEqual(status, 201)
        image_id = json.loads(body)['image']
        image = next(i for i in json.loads(self.request('GET', '/api/public')[2])['images'] if i['id'] == image_id)
        self.assertEqual(image['project_ids'], [project_id])
        self.assertEqual(self.request('GET', image['url'])[2], png)
        image.update(archived=True, tag_names='Test tag', project_ids=[project_id, public['projects'][1]['id']])
        self.assertEqual(self.request('PUT', f'/api/images/{image_id}', image)[0], 200)
        self.assertNotIn(image_id, [i['id'] for i in json.loads(self.request('GET', '/api/public')[2])['images']])
        admin_image = next(i for i in json.loads(self.request('GET', '/api/admin/bootstrap')[2])['images'] if i['id'] == image_id)
        self.assertEqual(admin_image['project_ids'], [project_id])
        self.assertEqual(self.request('DELETE', f'/api/images/{image_id}')[0], 200)
        self.assertEqual(self.request('GET', image['url'])[0], 404)

    def test_delete_project_keeps_images_and_restart_does_not_reseed(self):
        self.login()
        public = json.loads(self.request('GET', '/api/public')[2])
        project_id = public['projects'][0]['id']
        self.assertEqual(self.request('DELETE', f'/api/projects/{project_id}')[0], 200)
        public = json.loads(self.request('GET', '/api/public')[2])
        self.assertEqual(len(public['images']), 22)
        self.assertTrue(all(project_id not in image['project_ids'] for image in public['images']))
        with server.connect(server.PROJECTS_DB) as db:
            db.execute('DELETE FROM projects')
        with server.connect(server.IMAGES_DB) as db:
            db.execute('DELETE FROM images')
        server.initialize()
        self.assertEqual(server.public_payload()['projects'], [])
        self.assertEqual(server.public_payload()['images'], [])


if __name__ == '__main__':
    unittest.main()
