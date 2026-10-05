#!/usr/bin/env python3
"""Dependency-free local CMS and portfolio server for JDDL V1."""

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
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = Path(os.environ.get("JDDL_DATA_DIR", ROOT / "data")).expanduser().resolve()
UPLOADS = Path(os.environ.get("JDDL_UPLOADS_DIR", ROOT / "uploads")).expanduser().resolve()
PROJECTS_DB = DATA / "projects.db"
IMAGES_DB = DATA / "images.db"
SESSION_SECRET_FILE = DATA / "session.secret"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SESSION_LIFETIME = 8 * 60 * 60
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or f"item-{uuid.uuid4().hex[:8]}"


def connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def initialize() -> None:
    DATA.mkdir(exist_ok=True)
    UPLOADS.mkdir(exist_ok=True)
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
        if db.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 0:
            projects = [
                ("identity-systems", "identity-systems", "Identity Systems", "Selected commissions", "Brand identities built to move across campaigns, products and places.", 1, 10),
                ("moving-images", "moving-images", "Moving Images", "Culture and fashion", "Direction and image-making for stories with atmosphere and momentum.", 1, 20),
                ("digital-places", "digital-places", "Digital Places", "Platforms and experiences", "Websites that turn visual systems into responsive, useful environments.", 1, 30),
            ]
            db.executemany("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", projects)
        defaults = {
            "eyebrow": "Who we are",
            "about": "JDDL is an independent creative practice working across identity, image-making and digital experiences. We build visual systems that are precise enough to be useful and open enough to stay alive.",
            "clients": "Adidas\nNew Balance\nNike\nStone Techno\nGlitch Festival\nTerra Kaffe",
        }
        db.executemany("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", defaults.items())

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
        if db.execute("SELECT COUNT(*) FROM images").fetchone()[0] == 0:
            seed_images(db)
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


def seed_images(db: sqlite3.Connection) -> None:
    categories = [
        ("branding-identity", "Branding / Identity"),
        ("web", "Web"),
        ("graphic", "Graphic"),
        ("kampagne", "Kampagne"),
        ("space", "Space"),
        ("merch", "Merch"),
        ("moods-for-mockups", "Moods für Mockups"),
    ]
    for index, (tag_id, name) in enumerate(categories):
        db.execute("INSERT INTO tags (id, slug, name, sort_order) VALUES (?, ?, ?, ?)", (tag_id, tag_id, name, index * 10))

    seeds = [
        ("showcase-01", "branding-identity-cotiere-thumb.jpg", 1.501502, "Cotiere identity presentation", "branding-identity", "identity-systems"),
        ("showcase-02", "branding-identity-screenshot-2026-06-30-121703.jpg", 0.802568, "Brand identity presentation", "branding-identity", "identity-systems"),
        ("showcase-03", "branding-identity-kagel-abholung-transporter.jpg", 0.749625, "Kagel transporter identity", "branding-identity", "identity-systems"),
        ("showcase-04", "branding-identity-screenshot-2026-06-30-121634.jpg", 0.805802, "Brand identity application", "branding-identity", "identity-systems"),
        ("showcase-05", "branding-identity-screenshot-2026-06-30-135907.jpg", 1.506024, "Brand identity artwork", "branding-identity", "identity-systems"),
        ("showcase-06", "web-sez-thumb.jpg", 1.499250, "SEZ website design", "web", "digital-places"),
        ("showcase-07", "web-hkst-thumb.jpg", 1.499250, "HKST website design", "web", "digital-places"),
        ("showcase-08", "web-trailer-neu.jpg", 0.562430, "Responsive website presentation", "web", "digital-places"),
        ("showcase-09", "web-screenshot-2026-06-30-142337.jpg", 0.809717, "Website interface presentation", "web", "digital-places"),
        ("showcase-10", "graphic-screenshot-2026-06-30-142553.jpg", 0.810373, "Graphic design composition", "graphic", "identity-systems"),
        ("showcase-11", "graphic-nc-sticker-overview.jpg", 1.686341, "NC sticker overview", "graphic", "identity-systems"),
        ("showcase-12", "graphic-img-6790.jpg", 1.499250, "Printed graphic design material", "graphic", "identity-systems"),
        ("showcase-13", "graphic-screenshot-2026-06-30-142142.jpg", 0.744602, "Graphic design presentation", "graphic", "identity-systems"),
        ("showcase-14", "kampagne-sez-thumb-infopoint-hoch.jpg", 0.666667, "SEZ campaign infopoint", "kampagne", "moving-images"),
        ("showcase-15", "kampagne-trailer-neu-1.jpg", 0.562430, "Campaign presentation", "kampagne", "moving-images"),
        ("showcase-16", "kampagne-weltspiele-iphone-story.jpg", 1.499250, "Weltspiele mobile campaign", "kampagne", "moving-images"),
        ("showcase-17", "space-designreport-3-web.jpg", 0.666667, "Designreport spatial installation", "space", "identity-systems"),
        ("showcase-18", "space-credibil-hochformat-1.jpg", 0.749625, "Credibil spatial design", "space", "identity-systems"),
        ("showcase-19", "space-credibil-querformat-3.jpg", 1.483680, "Credibil exhibition view", "space", "identity-systems"),
        ("showcase-20", "space-akh-hochformat-14.jpg", 0.526039, "AKH spatial installation", "space", "identity-systems"),
        ("showcase-21", "merch-screenshot-2026-06-30-142448.jpg", 0.790514, "Merchandise presentation", "merch", "identity-systems"),
        ("showcase-22", "merch-frame-1686561102.jpg", 0.749625, "Merchandise detail", "merch", "identity-systems"),
        ("showcase-23", "moods-for-mockups-image-377.jpg", 0.706714, "Mockup mood reference", "moods-for-mockups", "moving-images"),
    ]
    for image_id, filename, ratio, alt, tag_id, project_id in seeds:
        url = f"/{filename}"
        db.execute(
            "INSERT INTO images (id, remote_url, original_name, mime_type, alt_text, aspect_ratio) VALUES (?, ?, ?, 'image/jpeg', ?, ?)",
            (image_id, url, filename, alt, ratio),
        )
        db.execute("INSERT INTO image_tags VALUES (?, ?)", (image_id, tag_id))
        db.execute("INSERT INTO image_projects VALUES (?, ?, 0)", (image_id, project_id))


def get_secret() -> bytes:
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
        images = []
        for row in images_db.execute(f"SELECT * FROM images {image_where} ORDER BY created_at, id"):
            item = dict(row)
            item["url"] = item["remote_url"] or f"/uploads/{item['filename']}"
            item["tag_ids"] = [r[0] for r in images_db.execute("SELECT tag_id FROM image_tags WHERE image_id = ?", (item["id"],))]
            item["project_ids"] = [r[0] for r in images_db.execute("SELECT project_id FROM image_projects WHERE image_id = ? ORDER BY sort_order", (item["id"],))]
            images.append(item)
    return {"projects": projects, "images": images, "tags": tags, "settings": settings}


class Handler(SimpleHTTPRequestHandler):
    server_version = "JDDL-V1/1.0"

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
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_UPLOAD_BYTES:
            raise ValueError("Request is too large")
        return json.loads(self.rfile.read(length) or b"{}")

    def session_value(self) -> str | None:
        jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        return jar.get("jddl_session").value if jar.get("jddl_session") else None

    def require_admin(self) -> bool:
        if valid_session(self.session_value()):
            return True
        self.json_response({"error": "Authentication required"}, 401)
        return False

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/public":
            return self.json_response(public_payload())
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
            return self.serve_file(STATIC / "index.html")
        target = (STATIC / path.lstrip("/")).resolve()
        if target.parent == STATIC.resolve() and target.is_file():
            return self.serve_file(target)
        self.send_error(404)

    def serve_file(self, target: Path) -> None:
        content = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime.startswith("text/") or mime in {"application/javascript", "application/json"} else mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/api/login":
                supplied = str(self.read_json().get("password", ""))
                configured = os.environ["ADMIN_PASSWORD"]
                if not hmac.compare_digest(supplied, configured):
                    return self.json_response({"error": "Incorrect password"}, 401)
                expires = int(time.time()) + SESSION_LIFETIME
                secure = "; Secure" if os.environ.get("COOKIE_SECURE") == "1" else ""
                cookie = f"jddl_session={sign_session(expires)}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_LIFETIME}{secure}"
                return self.json_response({"authenticated": True}, headers={"Set-Cookie": cookie})
            if path == "/api/logout":
                return self.json_response({"authenticated": False}, headers={"Set-Cookie": "jddl_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"})
            if not self.require_admin():
                return
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
            raise ValueError("Project title is required")
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

    def delete_project(self, project_id: str) -> None:
        with connect(PROJECTS_DB) as projects_db:
            exists = projects_db.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone()
            if not exists:
                return self.json_response({"error": "Project not found"}, 404)
            projects_db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        with connect(IMAGES_DB) as images_db:
            images_db.execute("DELETE FROM image_projects WHERE project_id = ?", (project_id,))
        self.json_response({"deleted": True})

    def create_tag(self, payload: dict) -> None:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("Tag name is required")
        tag_id = slugify(name)
        with connect(IMAGES_DB) as db:
            sort_order = db.execute("SELECT COALESCE(MAX(sort_order), 0) + 10 FROM tags").fetchone()[0]
            db.execute("INSERT INTO tags (id, slug, name, sort_order) VALUES (?, ?, ?, ?)", (tag_id, tag_id, name, sort_order))
        self.json_response({"tag": tag_id}, 201)

    def update_tag(self, tag_id: str, payload: dict) -> None:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("Tag name is required")
        with connect(IMAGES_DB) as db:
            result = db.execute("UPDATE tags SET name = ? WHERE id = ?", (name, tag_id))
            if not result.rowcount:
                return self.json_response({"error": "Tag not found"}, 404)
        self.json_response({"tag": tag_id})

    def delete_tag(self, tag_id: str) -> None:
        with connect(IMAGES_DB) as db:
            result = db.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
            if not result.rowcount:
                return self.json_response({"error": "Tag not found"}, 404)
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
            raise ValueError("Expected multipart form data")
        if length > MAX_UPLOAD_BYTES:
            raise ValueError("Image must be smaller than 20 MB")
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
            raise ValueError("Choose an image to upload")
        if upload["type"] not in ALLOWED_IMAGE_TYPES:
            raise ValueError("Supported formats: JPEG, PNG, WebP, GIF and AVIF")
        image_id = uuid.uuid4().hex
        extension = mimetypes.guess_extension(upload["type"]) or Path(upload["filename"]).suffix.lower() or ".img"
        filename = f"{image_id}{extension.replace('.jpe', '.jpg')}"
        (UPLOADS / filename).write_bytes(upload["content"])
        ratio = float(fields.get("aspect_ratio") or 1)
        published = int(str(fields.get("published", "true")).lower() == "true")
        archived = int(str(fields.get("archived", "false")).lower() == "true")
        with connect(IMAGES_DB) as db:
            db.execute(
                "INSERT INTO images (id, filename, original_name, mime_type, alt_text, aspect_ratio, published, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (image_id, filename, str(fields.get("original_name") or Path(upload["filename"]).name).strip(), upload["type"], fields.get("alt_text", ""), ratio, published, archived),
            )
            self.replace_image_links(db, image_id, fields.get("tag_names", ""), fields.get("project_ids", "[]"))
        self.json_response({"image": image_id}, 201)

    def replace_image_links(self, db: sqlite3.Connection, image_id: str, tag_names: str, project_ids_json: str | list) -> None:
        names = [name.strip() for name in str(tag_names).split(",") if name.strip()]
        project_ids = project_ids_json if isinstance(project_ids_json, list) else json.loads(project_ids_json or "[]")
        if not isinstance(project_ids, list):
            raise ValueError("Project selection must be a list")
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
                return self.json_response({"error": "Image not found"}, 404)
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
            image = db.execute("SELECT filename FROM images WHERE id = ?", (image_id,)).fetchone()
            if not image:
                return self.json_response({"error": "Image not found"}, 404)
            db.execute("DELETE FROM images WHERE id = ?", (image_id,))
        if image["filename"]:
            (UPLOADS / Path(image["filename"]).name).unlink(missing_ok=True)
        self.json_response({"deleted": True})


if __name__ == "__main__":
    if not os.environ.get("ADMIN_PASSWORD"):
        raise SystemExit("Set ADMIN_PASSWORD to run this archived prototype.")
    initialize()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "4173"))
    if host not in {"127.0.0.1", "localhost", "::1"} and "ADMIN_PASSWORD" not in os.environ:
        raise SystemExit("Set ADMIN_PASSWORD before exposing V1 beyond localhost.")
    print(f"JDDL V1 running at http://{host}:{port}")
    password_note = "configured through ADMIN_PASSWORD" if "ADMIN_PASSWORD" in os.environ else "ADMIN_PASSWORD required"
    print(f"Admin: /admin ({password_note})")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
