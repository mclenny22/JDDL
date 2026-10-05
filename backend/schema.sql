
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
            
CREATE UNIQUE INDEX IF NOT EXISTS one_project_per_image ON image_projects(image_id);
CREATE TABLE IF NOT EXISTS private_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
