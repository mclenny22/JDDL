import json
import sqlite3
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch
from backend import cloud, server


class CloudStorageTests(unittest.TestCase):
    def test_initialization_keeps_edits_and_private_secrets_out_of_payload(self):
        with tempfile.TemporaryDirectory() as folder:
            db_path = Path(folder) / 'cloud.db'
            class Connection(cloud.CloudConnection):
                def __init__(self):
                    self.connection = sqlite3.connect(db_path)
                    self.connection.execute('PRAGMA foreign_keys=ON')
            with patch.dict('sys.modules', {'libsql': SimpleNamespace(Error=sqlite3.Error)}), patch.object(cloud, 'CloudConnection', Connection), patch.object(server, 'connect', lambda path: Connection()):
                cloud.initialize_cloud(server.SEED, server.ROOT / 'schema.sql')
                with Connection() as db:
                    db.execute('UPDATE projects SET description=?', ('Edited in CMS',))
                    db.execute('DELETE FROM image_tags')
                    db.execute('DELETE FROM images')
                    secret = db.execute("SELECT value FROM private_config WHERE key='session_secret'").fetchone()[0]
                cloud.initialize_cloud(server.SEED, server.ROOT / 'schema.sql')
                payload = server.public_payload()
                self.assertEqual(payload['images'], [])
                self.assertTrue(all(p['description'] == 'Edited in CMS' for p in payload['projects']))
                self.assertNotIn(secret, json.dumps(payload))
                self.assertEqual(cloud.cloud_secret().decode(), secret)

    def test_cloud_has_no_implicit_admin_password(self):
        with patch.dict('os.environ', {}, clear=True), patch.object(server, 'CLOUD', True):
            with self.assertRaisesRegex(RuntimeError, 'ADMIN_PASSWORD'):
                server.get_admin_password()
