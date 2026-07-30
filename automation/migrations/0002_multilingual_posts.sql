PRAGMA foreign_keys = OFF;

CREATE TABLE published_posts_multilingual (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wp_post_id INTEGER,
    title TEXT NOT NULL,
    slug TEXT,
    source_url TEXT NOT NULL,
    source_title TEXT,
    source_domain TEXT,
    category TEXT,
    tags TEXT,
    meta_description TEXT,
    image_url TEXT,
    word_count INTEGER DEFAULT 0,
    model_used TEXT,
    published_at TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'tr',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source_url, lang)
);

INSERT INTO published_posts_multilingual (
    id, wp_post_id, title, slug, source_url, source_title, source_domain,
    category, tags, meta_description, image_url, word_count, model_used,
    published_at, lang, created_at
)
SELECT
    id, wp_post_id, title, slug, source_url, source_title, source_domain,
    category, tags, meta_description, image_url, word_count, model_used,
    published_at, 'tr', created_at
FROM published_posts;

DROP TABLE published_posts;
ALTER TABLE published_posts_multilingual RENAME TO published_posts;

CREATE INDEX IF NOT EXISTS idx_posts_source_url ON published_posts(source_url);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON published_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_posts_lang ON published_posts(lang);

PRAGMA foreign_keys = ON;
