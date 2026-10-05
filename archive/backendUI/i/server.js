const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOADS_DIR = path.join(ROOT, "uploads");
const MAX_BODY_BYTES = 12 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "library.db"));
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
  );
  CREATE TABLE IF NOT EXISTS image_tags (
    image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (image_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

if (!db.prepare("SELECT value FROM app_meta WHERE key = 'starter_tags_seeded'").get()) {
  const tagCount = db.prepare("SELECT COUNT(*) AS count FROM tags").get().count;
  if (tagCount === 0) {
    const addStarterTag = db.prepare("INSERT INTO tags (name) VALUES (?)");
    for (const name of ["Brand", "Inspiration", "Product", "Social"]) addStarterTag.run(name);
  }
  db.prepare("INSERT INTO app_meta (key, value) VALUES ('starter_tags_seeded', 'true')").run();
}

const MIME_EXTENSIONS = {
  "image/avif": ".avif", "image/gif": ".gif", "image/jpeg": ".jpg",
  "image/png": ".png", "image/webp": ".webp"
};
const STATIC_TYPES = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Image is too large (12 MB maximum)."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(Object.assign(new Error("Invalid JSON body."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function cleanTagIds(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(parseId).filter(Boolean))].slice(0, 30);
}

function listProjects() {
  return db.prepare(`
    SELECT projects.*, COUNT(images.id) AS image_count
    FROM projects LEFT JOIN images ON images.project_id = projects.id
    GROUP BY projects.id ORDER BY projects.created_at DESC, projects.id DESC
  `).all();
}

function listTags() {
  return db.prepare(`
    SELECT tags.*, COUNT(image_tags.image_id) AS image_count
    FROM tags LEFT JOIN image_tags ON image_tags.tag_id = tags.id
    GROUP BY tags.id ORDER BY tags.name COLLATE NOCASE
  `).all();
}

function listImages(tagIds = []) {
  const ids = tagIds.map(parseId).filter(Boolean);
  const where = ids.length ? `WHERE images.id IN (
    SELECT image_id FROM image_tags WHERE tag_id IN (${ids.map(() => "?").join(",")})
    GROUP BY image_id HAVING COUNT(DISTINCT tag_id) = ?
  )` : "";
  const params = ids.length ? [...ids, ids.length] : [];
  const images = db.prepare(`
    SELECT images.*, projects.name AS project_name FROM images
    LEFT JOIN projects ON projects.id = images.project_id
    ${where} ORDER BY images.created_at DESC, images.id DESC
  `).all(...params);
  const tagsForImage = db.prepare(`
    SELECT tags.id, tags.name FROM tags JOIN image_tags ON image_tags.tag_id = tags.id
    WHERE image_tags.image_id = ? ORDER BY tags.name COLLATE NOCASE
  `);
  return images.map((image) => ({
    ...image, url: `/uploads/${image.filename}`, tags: tagsForImage.all(image.id)
  }));
}

function validateRelations(body) {
  const projectId = body.projectId ? parseId(body.projectId) : null;
  if (body.projectId && !projectId) throw Object.assign(new Error("Invalid project."), { status: 400 });
  if (projectId && !db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)) {
    throw Object.assign(new Error("Project not found."), { status: 400 });
  }
  const tagIds = cleanTagIds(body.tagIds);
  if (tagIds.length) {
    const placeholders = tagIds.map(() => "?").join(",");
    const found = db.prepare(`SELECT COUNT(*) AS count FROM tags WHERE id IN (${placeholders})`).get(...tagIds).count;
    if (found !== tagIds.length) throw Object.assign(new Error("One or more tags no longer exist."), { status: 400 });
  }
  return { projectId, tagIds };
}

function serveFile(res, filePath, contentType) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": filePath.startsWith(UPLOADS_DIR) ? "public, max-age=31536000, immutable" : "no-cache"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch { json(res, 404, { error: "Not found." }); }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/projects") return json(res, 200, listProjects());
  if (req.method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    if (!name) return json(res, 400, { error: "Project name is required." });
    const result = db.prepare("INSERT INTO projects (name, description) VALUES (?, ?)").run(name, description);
    return json(res, 201, db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid));
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === "PUT") {
    const id = parseId(projectMatch[1]);
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    if (!name) return json(res, 400, { error: "Project name is required." });
    const result = db.prepare("UPDATE projects SET name = ?, description = ? WHERE id = ?").run(name, description, id);
    if (!result.changes) return json(res, 404, { error: "Project not found." });
    return json(res, 200, db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
  }
  if (projectMatch && req.method === "DELETE") {
    const result = db.prepare("DELETE FROM projects WHERE id = ?").run(parseId(projectMatch[1]));
    return result.changes ? json(res, 200, { ok: true }) : json(res, 404, { error: "Project not found." });
  }

  if (req.method === "GET" && url.pathname === "/api/tags") return json(res, 200, listTags());
  if (req.method === "POST" && url.pathname === "/api/tags") {
    const body = await readJson(req);
    const name = String(body.name || "").trim().slice(0, 60);
    if (!name) return json(res, 400, { error: "Tag name is required." });
    try {
      const result = db.prepare("INSERT INTO tags (name) VALUES (?)").run(name);
      return json(res, 201, db.prepare("SELECT * FROM tags WHERE id = ?").get(result.lastInsertRowid));
    } catch (error) {
      if (error.code === "ERR_SQLITE_CONSTRAINT_UNIQUE") return json(res, 409, { error: "A tag with that name already exists." });
      throw error;
    }
  }
  const tagMatch = url.pathname.match(/^\/api\/tags\/(\d+)$/);
  if (tagMatch && req.method === "PUT") {
    const id = parseId(tagMatch[1]);
    const body = await readJson(req);
    const name = String(body.name || "").trim().slice(0, 60);
    if (!name) return json(res, 400, { error: "Tag name is required." });
    try {
      const result = db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(name, id);
      if (!result.changes) return json(res, 404, { error: "Tag not found." });
      return json(res, 200, db.prepare("SELECT * FROM tags WHERE id = ?").get(id));
    } catch (error) {
      if (error.code === "ERR_SQLITE_CONSTRAINT_UNIQUE") return json(res, 409, { error: "A tag with that name already exists." });
      throw error;
    }
  }
  if (tagMatch && req.method === "DELETE") {
    const result = db.prepare("DELETE FROM tags WHERE id = ?").run(parseId(tagMatch[1]));
    return result.changes ? json(res, 200, { ok: true }) : json(res, 404, { error: "Tag not found." });
  }

  if (req.method === "GET" && url.pathname === "/api/images") return json(res, 200, listImages(url.searchParams.getAll("tag")));
  if (req.method === "POST" && url.pathname === "/api/images") {
    const body = await readJson(req);
    const match = String(body.dataUrl || "").match(/^data:(image\/(?:avif|gif|jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) return json(res, 400, { error: "Choose a valid AVIF, GIF, JPEG, PNG, or WebP image." });
    const { projectId, tagIds } = validateRelations(body);
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return json(res, 400, { error: "Image must be smaller than 10 MB." });
    const filename = `${crypto.randomUUID()}${MIME_EXTENSIONS[match[1]]}`;
    const originalName = String(body.originalName || "Untitled image").trim().slice(0, 240) || "Untitled image";
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer, { flag: "wx" });
    try {
      db.exec("BEGIN");
      const result = db.prepare("INSERT INTO images (filename, original_name, project_id) VALUES (?, ?, ?)").run(filename, originalName, projectId);
      const linkTag = db.prepare("INSERT INTO image_tags (image_id, tag_id) VALUES (?, ?)");
      for (const tagId of tagIds) linkTag.run(result.lastInsertRowid, tagId);
      db.exec("COMMIT");
      return json(res, 201, listImages().find((image) => image.id === result.lastInsertRowid));
    } catch (error) {
      db.exec("ROLLBACK");
      fs.rmSync(filePath, { force: true });
      throw error;
    }
  }

  const imageMatch = url.pathname.match(/^\/api\/images\/(\d+)$/);
  if (imageMatch && req.method === "PUT") {
    const id = parseId(imageMatch[1]);
    const body = await readJson(req);
    if (!db.prepare("SELECT id FROM images WHERE id = ?").get(id)) return json(res, 404, { error: "Image not found." });
    const originalName = String(body.originalName || "").trim().slice(0, 240);
    if (!originalName) return json(res, 400, { error: "Image name is required." });
    const { projectId, tagIds } = validateRelations(body);
    try {
      db.exec("BEGIN");
      db.prepare("UPDATE images SET original_name = ?, project_id = ? WHERE id = ?").run(originalName, projectId, id);
      db.prepare("DELETE FROM image_tags WHERE image_id = ?").run(id);
      const linkTag = db.prepare("INSERT INTO image_tags (image_id, tag_id) VALUES (?, ?)");
      for (const tagId of tagIds) linkTag.run(id, tagId);
      db.exec("COMMIT");
      return json(res, 200, listImages().find((item) => item.id === id));
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  if (imageMatch && req.method === "DELETE") {
    const id = parseId(imageMatch[1]);
    const image = db.prepare("SELECT filename FROM images WHERE id = ?").get(id);
    if (!image) return json(res, 404, { error: "Image not found." });
    db.prepare("DELETE FROM images WHERE id = ?").run(id);
    fs.rmSync(path.join(UPLOADS_DIR, image.filename), { force: true });
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: "Not found." });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (url.pathname.startsWith("/uploads/")) {
      const filename = path.basename(url.pathname);
      const extension = path.extname(filename);
      const imageType = Object.entries(MIME_EXTENSIONS).find(([, ext]) => ext === extension)?.[0];
      return serveFile(res, path.join(UPLOADS_DIR, filename), imageType || "application/octet-stream");
    }
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = path.resolve(PUBLIC_DIR, requested);
    if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) return json(res, 403, { error: "Forbidden." });
    return serveFile(res, filePath, STATIC_TYPES[path.extname(filePath)]);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.status || 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(PORT, () => console.log(`Tiny Image Library is running at http://localhost:${PORT}`));
