#!/usr/bin/env python3
"""Dependency-free CMS and horizontal portfolio server for JDDL."""

from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import time
import uuid
from email import policy
from email.parser import BytesParser
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin, urlparse
from .cloud import CloudConnection, initialize_cloud, cloud_secret, store_upload, delete_upload


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
FRONTEND = ROOT.parent / "frontend"
SEED = ROOT / "seed" / "content.json"
DATA = Path(os.environ.get("JDDL_DATA_DIR", ROOT.parent / "data")).expanduser().resolve()
UPLOADS = Path(os.environ.get("JDDL_UPLOADS_DIR", ROOT.parent / "uploads")).expanduser().resolve()
PROJECTS_DB = DATA / "projects.db"
IMAGES_DB = DATA / "images.db"
SESSION_SECRET_FILE = DATA / "session.secret"
CLOUD = bool(os.environ.get("TURSO_DATABASE_URL"))
MAX_UPLOAD_BYTES = (4 if os.environ.get("VERCEL") else 20) * 1024 * 1024
SESSION_LIFETIME = 8 * 60 * 60
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or f"item-{uuid.uuid4().hex[:8]}"


def connect(path: Path) -> sqlite3.Connection:
    if CLOUD:
        return CloudConnection()
    if os.environ.get("VERCEL"):
        raise RuntimeError("Connect the Turso database before deploying the CMS")
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def initialize() -> None:
    if CLOUD:
        initialize_cloud(SEED, ROOT / "schema.sql")
        return
    DATA.mkdir(parents=True, exist_ok=True)
    UPLOADS.mkdir(parents=True, exist_ok=True)
    new_projects = not PROJECTS_DB.exists()
    new_images = not IMAGES_DB.exists()
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    get_admin_password()
    if not SESSION_SECRET_FILE.exists():
        SESSION_SECRET_FILE.write_text(secrets.token_hex(32), encoding="utf-8")
        SESSION_SECRET_FILE.chmod(0o600)

    with connect(PROJECTS_DB) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                client TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                published INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        if new_projects:
            for project in seed["projects"]:
                db.execute(
                    "INSERT INTO projects (id, slug, title, client, description, published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    tuple(project[key] for key in ("id", "slug", "title", "client", "description", "published", "sort_order")),
                )
        db.executemany("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", seed["settings"].items())

    with connect(IMAGES_DB) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                filename TEXT,
                remote_url TEXT,
                original_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                alt_text TEXT NOT NULL DEFAULT '',
                aspect_ratio REAL NOT NULL DEFAULT 1,
                published INTEGER NOT NULL DEFAULT 1,
                archived INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS image_tags (
                image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (image_id, tag_id)
            );
            CREATE TABLE IF NOT EXISTS image_projects (
                image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
                project_id TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (image_id, project_id)
            );
            """
        )
        if new_images:
            seed_images(db, seed)
        db.execute(
            """DELETE FROM image_projects
               WHERE EXISTS (
                 SELECT 1 FROM image_projects AS preferred
                 WHERE preferred.image_id = image_projects.image_id
                   AND (preferred.sort_order < image_projects.sort_order
                     OR (preferred.sort_order = image_projects.sort_order AND preferred.project_id < image_projects.project_id))
               )"""
        )
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_project_per_image ON image_projects(image_id)")


def seed_images(db: sqlite3.Connection, seed: dict) -> None:
    for tag in seed["tags"]:
        db.execute("INSERT INTO tags (id, slug, name, sort_order) VALUES (?, ?, ?, ?)",
                   tuple(tag[key] for key in ("id", "slug", "name", "sort_order")))
    for image in seed["images"]:
        fields = ("id", "filename", "remote_url", "original_name", "mime_type", "alt_text", "aspect_ratio", "published", "archived")
        db.execute(
            "INSERT INTO images (id, filename, remote_url, original_name, mime_type, alt_text, aspect_ratio, published, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            tuple(image[key] for key in fields),
        )
        db.executemany("INSERT INTO image_tags VALUES (?, ?)", [(image["id"], tag) for tag in image["tag_ids"]])
        db.executemany("INSERT INTO image_projects VALUES (?, ?, ?)",
                       [(image["id"], project, order) for order, project in enumerate(image["project_ids"])])


def get_admin_password() -> str:
    configured = os.environ.get("ADMIN_PASSWORD")
    if configured is not None:
        if not configured:
            raise ValueError("ADMIN_PASSWORD must not be empty")
        return configured
    if CLOUD or os.environ.get("VERCEL"):
        raise RuntimeError("Set ADMIN_PASSWORD in Vercel before using the CMS")
    password_file = DATA / "admin.password"
    if not password_file.exists():
        password_file.write_text(secrets.token_urlsafe(24), encoding="utf-8")
        password_file.chmod(0o600)
    return password_file.read_text(encoding="utf-8").strip()


def get_secret() -> bytes:
    if CLOUD:
        return cloud_secret()
    return SESSION_SECRET_FILE.read_text(encoding="utf-8").strip().encode()


def sign_session(expires: int) -> str:
    payload = str(expires)
    signature = hmac.new(get_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def valid_session(value: str | None) -> bool:
    if not value or "." not in value:
        return False
    expires, signature = value.split(".", 1)
    if not expires.isdigit() or int(expires) < int(time.time()):
        return False
    expected = hmac.new(get_secret(), expires.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def public_payload(admin: bool = False) -> dict:
    with connect(PROJECTS_DB) as projects_db, connect(IMAGES_DB) as images_db:
        project_where = "" if admin else "WHERE published = 1"
        image_where = "" if admin else "WHERE archived = 0 AND published = 1"
        projects = [dict(row) for row in projects_db.execute(f"SELECT * FROM projects {project_where} ORDER BY sort_order, title")]
        settings = {row["key"]: row["value"] for row in projects_db.execute("SELECT key, value FROM settings")}
        tags = [dict(row) for row in images_db.execute("SELECT * FROM tags ORDER BY sort_order, name")]
        tag_links, project_links = {}, {}
        for link in images_db.execute("SELECT image_id, tag_id FROM image_tags"):
            tag_links.setdefault(link["image_id"], []).append(link["tag_id"])
        for link in images_db.execute("SELECT image_id, project_id FROM image_projects ORDER BY sort_order"):
            project_links.setdefault(link["image_id"], []).append(link["project_id"])
        images = []
        for row in images_db.execute(f"SELECT * FROM images {image_where} ORDER BY created_at, id"):
            item = dict(row)
            item["url"] = item["remote_url"] or f"/uploads/{item['filename']}"
            item["tag_ids"] = tag_links.get(item["id"], [])
            item["project_ids"] = project_links.get(item["id"], [])
            images.append(item)
    return {"projects": projects, "images": images, "tags": tags, "settings": settings}


class Handler(SimpleHTTPRequestHandler):
    server_version = "JDDL/2.0"

    def public_api_headers(self) -> dict:
        # CORS applies only to the read-only content endpoint, never admin APIs.
        origins = os.environ.get("PUBLIC_API_ORIGINS", "*").strip()
        headers = {"Vary": "Origin"}
        origin = self.headers.get("Origin")
        if origins == "*":
            headers["Access-Control-Allow-Origin"] = "*"
        elif origin and origin in {value.strip() for value in origins.split(",") if value.strip()}:
            headers["Access-Control-Allow-Origin"] = origin
        return headers

    def do_OPTIONS(self) -> None:
        if urlparse(self.path).path != "/api/public":
            return self.send_error(405)
        self.send_response(204)
        for key, value in self.public_api_headers().items():
            self.send_header(key, value)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Allow", "GET, HEAD, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def json_response(self, payload: dict | list, status: int = 200, headers: dict | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_UPLOAD_BYTES:
            raise ValueError("Die Anfrage ist zu groß")
        return json.loads(self.rfile.read(length) or b"{}")

    def session_value(self) -> str | None:
        jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        return jar.get("jddl_session").value if jar.get("jddl_session") else None

    def require_admin(self) -> bool:
        if valid_session(self.session_value()):
            return True
        self.json_response({"error": "Bitte melde dich an"}, 401)
        return False

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/public":
            payload = public_payload()
            base_url = os.environ.get("PUBLIC_BASE_URL", "").strip()
            if base_url:
                for item in payload["images"]:
                    item["url"] = urljoin(base_url.rstrip("/") + "/", item["url"])
            return self.json_response(payload, headers=self.public_api_headers())
        if path == "/api/session":
            return self.json_response({"authenticated": valid_session(self.session_value())})
        if path == "/api/admin/bootstrap":
            if self.require_admin():
                return self.json_response(public_payload(admin=True))
            return
        if path == "/admin" or path == "/admin/":
            return self.serve_file(STATIC / "admin.html")
        if path.startswith("/uploads/"):
            target = (UPLOADS / Path(path).name).resolve()
            if target.parent != UPLOADS.resolve() or not target.is_file():
                return self.send_error(404)
            return self.serve_file(target)
        if path == "/":
            return self.serve_file(FRONTEND / "index.html")
        if path.startswith("/admin-assets/"):
            base, relative = STATIC, path.removeprefix("/admin-assets/")
        else:
            base, relative = FRONTEND, path.lstrip("/")
        target = (base / relative).resolve()
        if target.is_relative_to(base.resolve()) and target.is_file():
            return self.serve_file(target)
        # Preserve the existing image URLs in both databases.
        legacy = (STATIC / Path(path).name).resolve()
        if path.count("/") == 1 and legacy.is_file() and legacy.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
            return self.serve_file(legacy)
        self.send_error(404)

    def do_HEAD(self) -> None:
        self.do_GET()

    def serve_file(self, target: Path) -> None:
        content = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime.startswith("text/") or mime in {"application/javascript", "application/json"} else mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/api/login":
                supplied = str(self.read_json().get("password", ""))
                configured = get_admin_password()
                if not hmac.compare_digest(supplied, configured):
                    return self.json_response({"error": "Falsches Passwort"}, 401)
                expires = int(time.time()) + SESSION_LIFETIME
                secure = "; Secure" if os.environ.get("COOKIE_SECURE") == "1" or os.environ.get("VERCEL") else ""
                cookie = f"jddl_session={sign_session(expires)}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_LIFETIME}{secure}"
                return self.json_response({"authenticated": True}, headers={"Set-Cookie": cookie})
            if path == "/api/logout":
                return self.json_response({"authenticated": False}, headers={"Set-Cookie": "jddl_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"})
            if not self.require_admin():
                return
            if path == "/api/projects/reorder":
                return self.reorder_projects(self.read_json())
            if path == "/api/projects":
                return self.save_project(self.read_json())
            if path == "/api/tags":
                return self.create_tag(self.read_json())
            if path == "/api/settings":
                return self.save_settings(self.read_json())
            if path == "/api/images":
                return self.upload_image()
        except (ValueError, json.JSONDecodeError, sqlite3.IntegrityError) as error:
            return self.json_response({"error": str(error)}, 400)
        self.send_error(404)

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        if not self.require_admin():
            return
        tag_match = re.fullmatch(r"/api/tags/([a-zA-Z0-9-]+)", path)
        if tag_match:
            try:
                return self.update_tag(tag_match.group(1), self.read_json())
            except (ValueError, json.JSONDecodeError, sqlite3.IntegrityError) as error:
                return self.json_response({"error": str(error)}, 400)
        match = re.fullmatch(r"/api/images/([a-zA-Z0-9-]+)", path)
        if not match:
            return self.send_error(404)
        try:
            return self.update_image(match.group(1), self.read_json())
        except (ValueError, json.JSONDecodeError, sqlite3.IntegrityError) as error:
            return self.json_response({"error": str(error)}, 400)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if not self.require_admin():
            return
        try:
            project_match = re.fullmatch(r"/api/projects/([a-zA-Z0-9-]+)", path)
            if project_match:
                return self.delete_project(project_match.group(1))
            tag_match = re.fullmatch(r"/api/tags/([a-zA-Z0-9-]+)", path)
            if tag_match:
                return self.delete_tag(tag_match.group(1))
            image_match = re.fullmatch(r"/api/images/([a-zA-Z0-9-]+)", path)
            if image_match:
                return self.delete_image(image_match.group(1))
        except sqlite3.IntegrityError as error:
            return self.json_response({"error": str(error)}, 400)
        self.send_error(404)

    def save_project(self, payload: dict) -> None:
        title = str(payload.get("title", "")).strip()
        if not title:
            raise ValueError("Bitte gib einen Projekttitel ein")
        project_id = str(payload.get("id") or slugify(title))
        values = (
            project_id,
            slugify(str(payload.get("slug") or title)),
            title,
            str(payload.get("client", "")).strip(),
            str(payload.get("description", "")).strip(),
            int(bool(payload.get("published", True))),
            int(payload.get("sort_order", 0)),
        )
        with connect(PROJECTS_DB) as db:
            db.execute(
                """INSERT INTO projects (id, slug, title, client, description, published, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, title=excluded.title,
                   client=excluded.client, description=excluded.description, published=excluded.published,
                   sort_order=excluded.sort_order, updated_at=CURRENT_TIMESTAMP""",
                values,
            )
        self.json_response({"project": project_id})

    def reorder_projects(self, payload: dict) -> None:
        project_ids = payload.get("project_ids")
        if not isinstance(project_ids, list) or any(not isinstance(item, str) for item in project_ids):
            raise ValueError("Bitte übermittle eine vollständige Projektliste")
        if len(project_ids) != len(set(project_ids)):
            raise ValueError("Jedes Projekt darf nur einmal vorkommen")
        with connect(PROJECTS_DB) as db:
            db.execute("BEGIN IMMEDIATE")
            existing_ids = {row["id"] for row in db.execute("SELECT id FROM projects")}
            if set(project_ids) != existing_ids:
                return self.json_response({"error": "Die Projektliste hat sich geändert. Bitte lade sie neu."}, 409)
            db.executemany(
                "UPDATE projects SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                [(position * 10, project_id) for position, project_id in enumerate(project_ids)],
            )
        self.json_response({"project_ids": project_ids})

    def delete_project(self, project_id: str) -> None:
        with connect(PROJECTS_DB) as projects_db:
            exists = projects_db.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone()
            if not exists:
                return self.json_response({"error": "Projekt nicht gefunden"}, 404)
            projects_db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        with connect(IMAGES_DB) as images_db:
            images_db.execute("DELETE FROM image_projects WHERE project_id = ?", (project_id,))
        self.json_response({"deleted": True})

    def create_tag(self, payload: dict) -> None:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("Bitte gib einen Tag-Namen ein")
        tag_id = slugify(name)
        with connect(IMAGES_DB) as db:
            sort_order = db.execute("SELECT COALESCE(MAX(sort_order), 0) + 10 FROM tags").fetchone()[0]
            db.execute("INSERT INTO tags (id, slug, name, sort_order) VALUES (?, ?, ?, ?)", (tag_id, tag_id, name, sort_order))
        self.json_response({"tag": tag_id}, 201)

    def update_tag(self, tag_id: str, payload: dict) -> None:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("Bitte gib einen Tag-Namen ein")
        with connect(IMAGES_DB) as db:
            result = db.execute("UPDATE tags SET name = ? WHERE id = ?", (name, tag_id))
            if not result.rowcount:
                return self.json_response({"error": "Tag nicht gefunden"}, 404)
        self.json_response({"tag": tag_id})

    def delete_tag(self, tag_id: str) -> None:
        with connect(IMAGES_DB) as db:
            result = db.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
            if not result.rowcount:
                return self.json_response({"error": "Tag nicht gefunden"}, 404)
        self.json_response({"deleted": True})

    def save_settings(self, payload: dict) -> None:
        allowed = {"eyebrow", "about", "clients"}
        with connect(PROJECTS_DB) as db:
            for key, value in payload.items():
                if key in allowed:
                    db.execute("INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))
        self.json_response({"saved": True})

    def multipart(self) -> tuple[dict, dict]:
        content_type = self.headers.get("Content-Type", "")
        length = int(self.headers.get("Content-Length", "0"))
        if "multipart/form-data" not in content_type:
            raise ValueError("Die Anfrage muss ein Datei-Upload sein")
        if length > MAX_UPLOAD_BYTES:
            raise ValueError(f"Der Bild-Upload muss kleiner als {MAX_UPLOAD_BYTES // (1024 * 1024)} MB sein")
        raw = self.rfile.read(length)
        message = BytesParser(policy=policy.default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + raw
        )
        fields, files = {}, {}
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            filename = part.get_filename()
            content = part.get_payload(decode=True) or b""
            if filename:
                files[name] = {"filename": filename, "type": part.get_content_type(), "content": content}
            elif name:
                fields[name] = content.decode("utf-8")
        return fields, files

    def upload_image(self) -> None:
        fields, files = self.multipart()
        upload = files.get("image")
        if not upload or not upload["content"]:
            raise ValueError("Wähle ein Bild zum Hochladen aus")
        if upload["type"] not in ALLOWED_IMAGE_TYPES:
            raise ValueError("Unterstützte Formate: JPEG, PNG, WebP, GIF und AVIF")
        image_id = uuid.uuid4().hex
        extension = mimetypes.guess_extension(upload["type"]) or Path(upload["filename"]).suffix.lower() or ".img"
        filename = f"{image_id}{extension.replace('.jpe', '.jpg')}"
        remote_url = store_upload(filename, upload["content"], upload["type"]) if CLOUD else None
        if not CLOUD:
            (UPLOADS / filename).write_bytes(upload["content"])
        ratio = float(fields.get("aspect_ratio") or 1)
        published = int(str(fields.get("published", "false")).lower() == "true")
        archived = int(str(fields.get("archived", str(not published))).lower() == "true")
        with connect(IMAGES_DB) as db:
            db.execute(
                "INSERT INTO images (id, filename, remote_url, original_name, mime_type, alt_text, aspect_ratio, published, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (image_id, filename, remote_url, str(fields.get("original_name") or Path(upload["filename"]).name).strip(), upload["type"], fields.get("alt_text", ""), ratio, published, archived),
            )
            self.replace_image_links(db, image_id, fields.get("tag_names", ""), fields.get("project_ids", "[]"))
        self.json_response({"image": image_id}, 201)

    def replace_image_links(self, db: sqlite3.Connection, image_id: str, tag_names: str, project_ids_json: str | list) -> None:
        names = [name.strip() for name in str(tag_names).split(",") if name.strip()]
        project_ids = project_ids_json if isinstance(project_ids_json, list) else json.loads(project_ids_json or "[]")
        if not isinstance(project_ids, list):
            raise ValueError("Die Projektauswahl muss eine Liste sein")
        project_ids = project_ids[:1]
        db.execute("DELETE FROM image_tags WHERE image_id = ?", (image_id,))
        db.execute("DELETE FROM image_projects WHERE image_id = ?", (image_id,))
        for position, name in enumerate(names):
            existing = db.execute("SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
            tag_id = existing["id"] if existing else slugify(name)
            if not existing:
                db.execute("INSERT INTO tags (id, slug, name, sort_order) VALUES (?, ?, ?, ?)", (tag_id, tag_id, name, position * 10 + 100))
            db.execute("INSERT OR IGNORE INTO image_tags VALUES (?, ?)", (image_id, tag_id))
        for position, project_id in enumerate(project_ids):
            db.execute("INSERT OR IGNORE INTO image_projects VALUES (?, ?, ?)", (image_id, str(project_id), position))

    def update_image(self, image_id: str, payload: dict) -> None:
        with connect(IMAGES_DB) as db:
            exists = db.execute("SELECT 1 FROM images WHERE id = ?", (image_id,)).fetchone()
            if not exists:
                return self.json_response({"error": "Bild nicht gefunden"}, 404)
            db.execute(
                "UPDATE images SET original_name=?, alt_text=?, aspect_ratio=?, published=?, archived=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (
                    str(payload.get("original_name", "")).strip() or "Untitled image",
                    str(payload.get("alt_text", "")),
                    float(payload.get("aspect_ratio", 1)),
                    int(bool(payload.get("published", True))),
                    int(bool(payload.get("archived", False))),
                    image_id,
                ),
            )
            tag_names = payload.get("tag_names", "")
            self.replace_image_links(db, image_id, tag_names, payload.get("project_ids", []))
        self.json_response({"image": image_id})

    def delete_image(self, image_id: str) -> None:
        with connect(IMAGES_DB) as db:
            image = db.execute("SELECT filename, remote_url FROM images WHERE id = ?", (image_id,)).fetchone()
            if not image:
                return self.json_response({"error": "Bild nicht gefunden"}, 404)
            db.execute("DELETE FROM images WHERE id = ?", (image_id,))
        if CLOUD and image["filename"] and image["remote_url"]:
            delete_upload(image["remote_url"])
        elif image["filename"]:
            (UPLOADS / Path(image["filename"]).name).unlink(missing_ok=True)
        self.json_response({"deleted": True})


def run() -> None:
    initialize()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "4174"))
    if host not in {"127.0.0.1", "localhost", "::1"} and "ADMIN_PASSWORD" not in os.environ:
        raise SystemExit("Set ADMIN_PASSWORD before exposing JDDL beyond localhost.")
    print(f"JDDL running at http://{host}:{port}")
    password_note = "configured through ADMIN_PASSWORD" if "ADMIN_PASSWORD" in os.environ else f"local password stored in {DATA / 'admin.password'}"
    print(f"Admin: /admin ({password_note})")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    run()
