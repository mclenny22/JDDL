"""Durable Turso database and Vercel Blob storage for the hosted CMS."""
import json
import os
import secrets
import sqlite3


class Row(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class Result:
    def __init__(self, cursor):
        self.rowcount = cursor.rowcount
        columns = [column[0] for column in cursor.description or ()]
        self.rows = iter(Row(zip(columns, row)) for row in (cursor.fetchall() or []))

    def __iter__(self):
        return self.rows

    def fetchone(self):
        return next(self.rows, None)

    def fetchall(self):
        return list(self.rows)


class CloudConnection:
    def __init__(self):
        import libsql
        self.connection = libsql.connect(
            database=os.environ['TURSO_DATABASE_URL'],
            auth_token=os.environ['TURSO_AUTH_TOKEN'],
        )
        self.connection.execute('PRAGMA foreign_keys=ON')

    def execute(self, sql, params=()):
        import libsql
        try:
            return Result(self.connection.execute(sql, params))
        except libsql.Error as error:
            if any(word in str(error).lower() for word in ('constraint', 'unique', 'foreign key')):
                raise sqlite3.IntegrityError(str(error)) from error
            raise

    def executemany(self, sql, rows):
        self.connection.executemany(sql, list(rows))

    def __enter__(self):
        return self

    def __exit__(self, kind, value, traceback):
        try:
            self.connection.rollback() if kind else self.connection.commit()
        finally:
            self.connection.close()


def initialize_cloud(seed_path, schema_path):
    # Serialize cold-start initialization. Seed only once, even if all content
    # is later intentionally removed through the CMS.
    with CloudConnection() as db:
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='private_config'").fetchone():
            if db.execute("SELECT 1 FROM private_config WHERE key='initialized'").fetchone():
                return
        db.execute('BEGIN IMMEDIATE')
        for statement in schema_path.read_text().split(';'):
            if statement.strip():
                db.execute(statement)
        if not db.execute("SELECT 1 FROM private_config WHERE key='initialized'").fetchone():
            from .server import seed_images
            seed = json.loads(seed_path.read_text())
            for project in seed['projects']:
                fields = ('id', 'slug', 'title', 'client', 'description', 'published', 'sort_order')
                db.execute('INSERT INTO projects (id,slug,title,client,description,published,sort_order) VALUES (?,?,?,?,?,?,?)', tuple(project[k] for k in fields))
            db.executemany('INSERT INTO settings VALUES (?,?)', seed['settings'].items())
            seed_images(db, seed)
            db.execute("INSERT INTO private_config VALUES ('initialized','1')")
        db.execute("INSERT OR IGNORE INTO private_config VALUES ('session_secret',?)", (secrets.token_hex(32),))


def cloud_secret():
    with CloudConnection() as db:
        return db.execute("SELECT value FROM private_config WHERE key='session_secret'").fetchone()[0].encode()


def store_upload(filename, content, mime_type):
    from vercel.blob import put
    if not os.environ.get('BLOB_READ_WRITE_TOKEN'):
        raise ValueError('Verbinde einen Vercel Blob-Speicher, bevor du Bilder hochlädst')
    result = put('jddl/' + filename, content, access='public', content_type=mime_type)
    return result.url


def delete_upload(url):
    from vercel.blob import delete
    delete(url)
