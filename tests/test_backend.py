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

    def test_batch_edits_preserve_other_fields_and_relations_and_rollback_invalid_ids(self):
        self.assertEqual(self.request('POST', '/api/images/batch', {'ids': ['missing'], 'changes': {'published': False}})[0], 401)
        self.login()
        data = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        images = data['images'][:2]
        ids = [image['id'] for image in images]
        project = data['projects'][-1]['id']
        tag = data['tags'][-1]['id']
        changes = {'published': False, 'add_project_ids': [project], 'add_tag_ids': [tag]}
        self.assertEqual(self.request('POST', '/api/images/batch', {'ids': ids, 'changes': changes})[0], 200)
        updated = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        for old in images:
            image = next(item for item in updated['images'] if item['id'] == old['id'])
            self.assertEqual(image['original_name'], old['original_name'])
            self.assertEqual(image['aspect_ratio'], old['aspect_ratio'])
            self.assertEqual(set(image['project_ids']), set(old['project_ids']) | {project})
            self.assertEqual(set(image['tag_ids']), set(old['tag_ids']) | {tag})
            self.assertEqual((image['published'], image['archived']), (0, 1))
        for invalid in ({'ids': ids + ['missing'], 'changes': {'published': True}},
                        {'ids': ids, 'changes': {'published': True, 'add_project_ids': ['missing']}},
                        {'ids': ids, 'changes': {'tag_ids': ['missing']}}):
            self.assertEqual(self.request('POST', '/api/images/batch', invalid)[0], 400)
        self.assertEqual(json.loads(self.request('GET', '/api/admin/bootstrap')[2]), updated)
        self.assertEqual(self.request('POST', '/api/images/batch', {'ids': ids, 'changes': {'remove_project_ids': [project], 'remove_tag_ids': [tag]}})[0], 200)

    def test_compositions_are_project_specific_and_validate_text_and_geometry_atomically(self):
        self.login()
        data = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        first, second = data['projects'][:2]
        image = next(image for image in data['images'] if first['id'] in image['project_ids'])
        self.assertEqual(self.request('POST', '/api/images/batch', {'ids': [image['id']], 'changes': {'add_project_ids': [second['id']]}})[0], 200)
        composition = {'columns': 12, 'manual': True, 'hero_id': '', 'rows': 3,
                       'placements': {image['id']: {'column': 9, 'span': 4, 'row': 1, 'ratio': 1.5}},
                       'texts': {'text-note': {'column': 1, 'span': 6, 'row': 2, 'text': '<hello> & weißer Text'}}}
        for project, column in ((first, 9), (second, 1)):
            draft = json.loads(json.dumps(composition))
            draft['placements'][image['id']]['column'] = column
            self.assertEqual(self.request('POST', '/api/projects', {**project, 'composition': draft})[0], 200)
        saved = json.loads(self.request('GET', '/api/public')[2])
        layouts = json.loads(saved['settings']['project_compositions'])
        self.assertEqual(layouts[first['id']]['placements'][image['id']]['column'], 9)
        self.assertEqual(layouts[second['id']]['placements'][image['id']]['column'], 1)
        for mutation in ('bounds', 'overlap', 'assignment', 'text', 'row'):
            invalid = json.loads(json.dumps(composition))
            if mutation == 'bounds': invalid['placements'][image['id']]['span'] = 5
            if mutation == 'overlap': invalid['texts']['text-note'].update(column=9, row=1)
            if mutation == 'assignment': invalid['hero_id'] = 'missing'
            if mutation == 'text': invalid['texts']['text-note']['text'] = 'x' * 10001
            if mutation == 'row': invalid['rows'] = 1
            self.assertEqual(self.request('POST', '/api/projects', {**first, 'title': 'Must not save', 'composition': invalid})[0], 400)
        self.assertEqual(json.loads(self.request('GET', '/api/public')[2]), saved)

    def test_optional_hero_removal_is_saved_and_validated_without_changing_assignments(self):
        self.login()
        data = server.public_payload(admin=True)
        project = data['projects'][0]
        image = next(item for item in data['images'] if project['id'] in item['project_ids'])
        composition = {'columns': 12, 'manual': True, 'hero_id': image['id'], 'hero_hidden': True,
                       'rows': 1, 'placements': {}, 'texts': {}}
        self.assertEqual(self.request('POST', '/api/projects', {**project, 'composition': composition})[0], 200)
        saved = server.public_payload(admin=True)
        self.assertTrue(json.loads(saved['settings']['project_compositions'])[project['id']]['hero_hidden'])
        self.assertEqual(saved['images'], data['images'])
        invalid = {**composition, 'hero_hidden': 'yes'}
        self.assertEqual(self.request('POST', '/api/projects', {**project, 'composition': invalid})[0], 400)
        self.assertEqual(server.public_payload(admin=True), saved)

    def test_unpublished_project_text_is_not_part_of_public_content(self):
        self.login()
        project = server.public_payload(admin=True)['projects'][0]
        composition = {'columns': 12, 'manual': True, 'hero_id': '', 'rows': 1, 'placements': {},
                       'texts': {'text-private': {'column': 1, 'span': 12, 'row': 1, 'text': 'Unpublished draft'}}}
        self.assertEqual(self.request('POST', '/api/projects', {**project, 'published': False, 'composition': composition})[0], 200)
        self.assertNotIn('Unpublished draft', self.request('GET', '/api/public')[2].decode())
        self.assertIn('Unpublished draft', self.request('GET', '/api/admin/bootstrap')[2].decode())

    def test_restart_removes_old_unique_index_and_keeps_multiple_assignments(self):
        data = server.public_payload(admin=True)
        image, projects = data['images'][0], data['projects'][:2]
        with server.connect(server.IMAGES_DB) as db:
            db.execute('CREATE UNIQUE INDEX one_project_per_image ON image_projects(image_id)')
        server.initialize()
        with server.connect(server.IMAGES_DB) as db:
            db.execute('INSERT OR IGNORE INTO image_projects VALUES (?, ?, ?)', (image['id'], projects[1]['id'], 1))
        server.initialize()
        persisted = next(item for item in server.public_payload(admin=True)['images'] if item['id'] == image['id'])
        self.assertIn(projects[1]['id'], persisted['project_ids'])
        self.assertIn(image['project_ids'][0], persisted['project_ids'])

    def test_footer_and_seven_column_layout_are_saved_and_validated(self):
        self.login()
        first = {"id": "showcase-01", "column": 2, "span": 3, "row": 8}
        second = {"id": "showcase-02", "column": 5, "span": 3, "row": 1}
        self.assertEqual(self.request('POST', '/api/settings', {"footer_address": "Berlin", "image_layout": first})[0], 200)
        self.assertEqual(self.request('POST', '/api/settings', {"image_layout": second})[0], 200)
        settings = json.loads(self.request('GET', '/api/public')[2])["settings"]
        self.assertEqual(settings["footer_address"], "Berlin")
        layout = json.loads(settings["project_layout"])
        self.assertEqual(layout[first["id"]], {"column": 2, "span": 3, "row": 8})
        self.assertEqual(layout[second["id"]], {"column": 5, "span": 3, "row": 1})
        for invalid in ({**first, "column": 6}, {**first, "span": 0}, {**first, "row": 1001}, {**first, "column": True}):
            self.assertEqual(self.request('POST', '/api/settings', {"image_layout": invalid})[0], 400)
        unchanged = json.loads(self.request('GET', '/api/public')[2])["settings"]
        self.assertEqual(unchanged, settings)

    def test_project_layout_batch_validates_and_saves_atomically(self):
        self.login()
        data = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        project = data['projects'][0]
        assigned = [image['id'] for image in data['images'] if project['id'] in image['project_ids']]
        other = next(image['id'] for image in data['images'] if project['id'] not in image['project_ids'])
        placement = {"column": 2, "span": 3, "row": 8}
        self.request('POST', '/api/settings', {"image_layout": {"id": other, **placement}})
        payload = {**project, 'title': 'Layout edited', 'image_layouts': {assigned[0]: placement, assigned[1]: {"column": 5, "span": 3, "row": 1}}}
        self.assertEqual(self.request('POST', '/api/projects', payload)[0], 200)
        saved = json.loads(self.request('GET', '/api/public')[2])
        layout = json.loads(saved['settings']['project_layout'])
        self.assertEqual(layout[assigned[0]], placement)
        self.assertEqual(layout[other], placement)
        self.assertEqual(next(p for p in saved['projects'] if p['id'] == project['id'])['title'], 'Layout edited')
        for invalid in ({other: placement}, {assigned[0]: {**placement, 'span': 7}}, {assigned[0]: {**placement, 'row': True}}, {assigned[0]: []}, []):
            self.assertEqual(self.request('POST', '/api/projects', {**payload, 'title': 'Must not save', 'image_layouts': invalid})[0], 400)
            self.assertEqual(json.loads(self.request('GET', '/api/public')[2]), saved)
        # Metadata-only saves preserve layouts; resetting affects only this project.
        self.assertEqual(self.request('POST', '/api/projects', {**project, 'title': 'Metadata only'})[0], 200)
        self.assertEqual(json.loads(json.loads(self.request('GET', '/api/public')[2])['settings']['project_layout']), layout)
        self.assertEqual(self.request('POST', '/api/projects', {**project, 'image_layouts': {}})[0], 200)
        reset = json.loads(json.loads(self.request('GET', '/api/public')[2])['settings']['project_layout'])
        self.assertEqual(reset[other], placement)
        self.assertTrue(all(image_id not in reset for image_id in assigned))

    def test_project_thumbnail_is_optional_validated_and_preserved(self):
        self.login()
        data = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        project = data['projects'][0]
        assigned = [image for image in data['images'] if project['id'] in image['project_ids']]
        chosen = assigned[1]['id']
        other = next(image['id'] for image in data['images'] if project['id'] not in image['project_ids'])
        payload = {**project, 'thumbnail_id': chosen}
        self.assertEqual(self.request('POST', '/api/projects', payload)[0], 200)
        saved = json.loads(self.request('GET', '/api/public')[2])
        self.assertEqual(next(p for p in saved['projects'] if p['id'] == project['id'])['thumbnail_id'], chosen)
        for invalid in (other, 'missing-image', True, [], None):
            self.assertEqual(self.request('POST', '/api/projects', {**payload, 'title': 'Invalid edit', 'thumbnail_id': invalid})[0], 400)
            self.assertEqual(json.loads(self.request('GET', '/api/public')[2]), saved)
        metadata_only = {key: value for key, value in project.items() if key != 'thumbnail_id'}
        self.assertEqual(self.request('POST', '/api/projects', metadata_only)[0], 200)
        unchanged = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        self.assertEqual(next(p for p in unchanged['projects'] if p['id'] == project['id'])['thumbnail_id'], chosen)
        with server.connect(server.IMAGES_DB) as db:
            db.execute('UPDATE images SET archived = 1 WHERE id = ?', (chosen,))
        self.assertEqual(self.request('POST', '/api/projects', payload)[0], 400)
        self.assertEqual(self.request('POST', '/api/projects', {**payload, 'thumbnail_id': ''})[0], 200)
        reset = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        self.assertEqual(next(p for p in reset['projects'] if p['id'] == project['id'])['thumbnail_id'], '')

    def test_composed_layout_keeps_fractional_columns_crop_and_blank_row_count(self):
        self.login()
        data = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        project = data['projects'][0]
        assigned = [image['id'] for image in data['images'] if project['id'] in image['project_ids']]
        placement = {"column": 1, "span": 7 / 3, "row": 2, "ratio": 0.8}
        payload = {**project, 'image_layouts': {assigned[1]: placement}, 'layout_rows': 4}
        self.assertEqual(self.request('POST', '/api/projects', payload)[0], 200)
        saved = json.loads(self.request('GET', '/api/public')[2])
        self.assertEqual(json.loads(saved['settings']['project_layout'])[assigned[1]], placement)
        self.assertEqual(json.loads(saved['settings']['project_layout_rows'])[project['id']], 4)
        for invalid in ({'layout_rows': 1001}, {'layout_rows': True}, {'layout_rows': -1}, {'image_layouts': {assigned[1]: {**placement, 'ratio': 0}}}, {'image_layouts': {assigned[1]: {**placement, 'span': 2.1}}}, {'image_layouts': {assigned[1]: {**placement, 'row': 1.5}}}):
            self.assertEqual(self.request('POST', '/api/projects', {**payload, **invalid})[0], 400)
            self.assertEqual(json.loads(self.request('GET', '/api/public')[2]), saved)
        self.assertEqual(self.request('POST', '/api/projects', {**project, 'image_layouts': {}, 'layout_rows': 0})[0], 200)
        reset = json.loads(self.request('GET', '/api/public')[2])
        self.assertNotIn(project['id'], json.loads(reset['settings']['project_layout_rows']))

    def test_new_site_and_admin_assets_do_not_conflict(self):
        status, _, page = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'class="track"', page)
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
        self.assertNotIn(image_id, [i['id'] for i in json.loads(self.request('GET', '/api/public')[2])['images']])
        image = next(i for i in json.loads(self.request('GET', '/api/admin/bootstrap')[2])['images'] if i['id'] == image_id)
        self.assertFalse(image['published'])
        self.assertTrue(image['archived'])
        self.assertEqual(image['project_ids'], [project_id])
        image.update(published=True, archived=False)
        self.assertEqual(self.request('PUT', f'/api/images/{image_id}', image)[0], 200)
        self.assertIn(image_id, [i['id'] for i in json.loads(self.request('GET', '/api/public')[2])['images']])
        self.assertEqual(self.request('GET', image['url'])[2], png)
        image.update(archived=True, tag_names='Test tag', project_ids=[project_id, public['projects'][1]['id']])
        self.assertEqual(self.request('PUT', f'/api/images/{image_id}', image)[0], 200)
        self.assertNotIn(image_id, [i['id'] for i in json.loads(self.request('GET', '/api/public')[2])['images']])
        admin_image = next(i for i in json.loads(self.request('GET', '/api/admin/bootstrap')[2])['images'] if i['id'] == image_id)
        self.assertEqual(admin_image['project_ids'], [project_id, public['projects'][1]['id']])
        self.assertEqual(self.request('DELETE', f'/api/images/{image_id}')[0], 200)
        self.assertEqual(self.request('GET', image['url'])[0], 404)

    def test_mp4_upload_thumbnail_publication_ranges_and_deletion(self):
        self.login()
        public = json.loads(self.request('GET', '/api/public')[2])
        project = public['projects'][0]
        video = b'\x00\x00\x00\x18ftypmp42' + bytes(range(128))
        boundary = 'mp4-test'
        payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="project_ids"\r\n\r\n{json.dumps([project["id"]])}\r\n'
                   f'--{boundary}\r\nContent-Disposition: form-data; name="aspect_ratio"\r\n\r\n1.7777777778\r\n'
                   f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\n').encode()
        payload += video + f'\r\n--{boundary}--\r\n'.encode()
        status, _, body = self.request('POST', '/api/images', payload, f'multipart/form-data; boundary={boundary}')
        self.assertEqual(status, 201)
        media_id = json.loads(body)['image']
        media = next(i for i in json.loads(self.request('GET', '/api/admin/bootstrap')[2])['images'] if i['id'] == media_id)
        self.assertEqual(media['mime_type'], 'video/mp4')
        self.assertTrue(media['url'].endswith('.mp4'))
        self.assertAlmostEqual(media['aspect_ratio'], 16 / 9)
        self.assertNotIn(media_id, [i['id'] for i in json.loads(self.request('GET', '/api/public')[2])['images']])
        self.assertEqual(self.request('POST', '/api/projects', {**project, 'thumbnail_id': media_id})[0], 400)
        media.update(published=True, archived=False)
        self.assertEqual(self.request('PUT', f'/api/images/{media_id}', media)[0], 200)
        self.assertEqual(self.request('POST', '/api/projects', {**project, 'thumbnail_id': media_id})[0], 200)
        saved = json.loads(self.request('GET', '/api/public')[2])
        self.assertEqual(next(p for p in saved['projects'] if p['id'] == project['id'])['thumbnail_id'], media_id)
        self.assertIn(media_id, [i['id'] for i in saved['images']])
        status, headers, content = self.request('GET', media['url'])
        self.assertEqual(status, 200)
        self.assertEqual(headers['Content-Type'], 'video/mp4')
        self.assertEqual(content, video)
        for requested, start, end in [('bytes=8-19', 8, 19), ('bytes=20-', 20, len(video) - 1), ('bytes=-12', len(video) - 12, len(video) - 1)]:
            status, headers, content = self.request('GET', media['url'], headers={'Range': requested})
            self.assertEqual(status, 206)
            self.assertEqual(headers['Content-Range'], f'bytes {start}-{end}/{len(video)}')
            self.assertEqual(content, video[start:end + 1])
        self.assertEqual(self.request('GET', media['url'], headers={'Range': 'bytes=9999-'})[0], 416)
        self.assertEqual(self.request('GET', media['url'], headers={'Range': 'bytes=-0'})[0], 416)
        status, headers, content = self.request('HEAD', media['url'])
        self.assertEqual(status, 200)
        self.assertEqual(int(headers['Content-Length']), len(video))
        self.assertEqual(content, b'')
        self.assertEqual(self.request('DELETE', f'/api/images/{media_id}')[0], 200)
        self.assertEqual(self.request('GET', media['url'])[0], 404)

    def test_replace_asset_file_preserves_project_references_and_rolls_back_invalid_edits(self):
        boundary = 'replace-media'
        content_type = f'multipart/form-data; boundary={boundary}'

        def upload_payload(filename, mime_type, content, **fields):
            parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'
                     for name, value in fields.items()]
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{filename}"\r\n'
                         f'Content-Type: {mime_type}\r\n\r\n')
            return ''.join(parts).encode() + content + f'\r\n--{boundary}--\r\n'.encode()

        clip = b'\x00\x00\x00\x18ftypmp42' + bytes(range(32))
        replacement = upload_payload('clip.mp4', 'video/mp4', clip, aspect_ratio=16 / 9)
        self.assertEqual(self.request('PUT', '/api/images/missing', replacement, content_type)[0], 401)
        self.login()
        self.assertEqual(self.request('PUT', '/api/images/missing', replacement, content_type)[0], 404)
        public = json.loads(self.request('GET', '/api/public')[2])
        project_ids = [project['id'] for project in public['projects'][:2]]
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1kAAAAASUVORK5CYII=')
        original = upload_payload('original.png', 'image/png', png, published='true', tag_names='Test tag',
                                  alt_text='Original description', project_ids=json.dumps(project_ids))
        status, _, body = self.request('POST', '/api/images', original, content_type)
        self.assertEqual(status, 201)
        image_id = json.loads(body)['image']
        path = f'/api/images/{image_id}'
        project = public['projects'][0]
        composition = {'columns': 12, 'manual': True, 'hero_id': image_id, 'placements': {}, 'texts': {}, 'rows': 0}
        self.assertEqual(self.request('POST', '/api/projects',
                                      {**project, 'thumbnail_id': image_id, 'composition': composition})[0], 200)

        def public_asset():
            data = json.loads(self.request('GET', '/api/public')[2])
            return data, next(image for image in data['images'] if image['id'] == image_id)

        _, before = public_asset()
        invalid = upload_payload('clip.mp4', 'video/mp4', clip, original_name='Changed', project_ids='["missing"]')
        self.assertEqual(self.request('PUT', path, invalid, content_type)[0], 400)
        self.assertEqual(public_asset()[1], before)
        self.assertEqual(list(server.UPLOADS.iterdir()), [server.UPLOADS / before['filename']])
        self.assertEqual(self.request('GET', before['url'])[2], png)

        self.assertEqual(self.request('PUT', path, replacement, content_type)[0], 200)
        data, after = public_asset()
        for field in ('id', 'original_name', 'alt_text', 'published', 'archived', 'project_ids', 'tag_ids', 'created_at'):
            self.assertEqual(after[field], before[field], field)
        self.assertNotEqual(after['url'], before['url'])
        self.assertEqual(after['mime_type'], 'video/mp4')
        self.assertAlmostEqual(after['aspect_ratio'], 16 / 9)
        self.assertEqual(self.request('GET', after['url'])[2], clip)
        self.assertEqual(self.request('GET', before['url'])[0], 404)
        self.assertEqual(next(p for p in data['projects'] if p['id'] == project['id'])['thumbnail_id'], image_id)
        self.assertEqual(json.loads(data['settings']['project_compositions'])[project['id']], composition)

    def test_project_reordering_is_atomic_and_controls_public_order(self):
        self.assertEqual(self.request('POST', '/api/projects/reorder', {'project_ids': []})[0], 401)
        self.login()
        original = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        ids = [project['id'] for project in reversed(original['projects'])]
        self.assertEqual(self.request('POST', '/api/projects/reorder', {'project_ids': ids})[0], 200)
        reordered = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
        self.assertEqual([project['id'] for project in reordered['projects']], ids)
        self.assertEqual([project['sort_order'] for project in reordered['projects']], list(range(0, len(ids) * 10, 10)))
        public = json.loads(self.request('GET', '/api/public')[2])
        self.assertEqual([project['id'] for project in public['projects']], ids)
        self.assertEqual(reordered['images'], original['images'])
        originals = {project['id']: project for project in original['projects']}
        for project in reordered['projects']:
            for field in ['title', 'description', 'client', 'published', 'slug']:
                self.assertEqual(project[field], originals[project['id']][field])
        for invalid, expected in [(ids[:-1], 409), (ids + [ids[0]], 400), (ids[:-1] + ['unknown'], 409), ([{}], 400), (None, 400)]:
            self.assertEqual(self.request('POST', '/api/projects/reorder', {'project_ids': invalid})[0], expected)
            current = json.loads(self.request('GET', '/api/admin/bootstrap')[2])
            self.assertEqual([project['id'] for project in current['projects']], ids)

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
