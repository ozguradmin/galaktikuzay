-- Published Posts table
CREATE TABLE IF NOT EXISTS published_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wp_post_id INTEGER,
    title TEXT NOT NULL,
    slug TEXT,
    source_url TEXT NOT NULL UNIQUE,
    source_title TEXT,
    source_domain TEXT,
    category TEXT,
    tags TEXT, -- JSON array
    meta_description TEXT,
    image_url TEXT,
    word_count INTEGER DEFAULT 0,
    model_used TEXT,
    published_at TEXT NOT NULL, -- ISO 8601
    created_at TEXT DEFAULT (datetime('now'))
);

-- System Logs table  
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR')),
    message TEXT NOT NULL,
    detail TEXT, -- JSON
    created_at TEXT DEFAULT (datetime('now'))
);

-- System Config table
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- News Cache table (to avoid duplicates)
CREATE TABLE IF NOT EXISTS news_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source_domain TEXT,
    found_at TEXT DEFAULT (datetime('now')),
    selected INTEGER DEFAULT 0, -- 0=not selected, 1=selected, 2=rejected
    reason TEXT
);

-- Insert default config
INSERT OR REPLACE INTO system_config (key, value) VALUES
    ('is_active', 'true'),
    ('posts_per_day', '1'),
    ('current_phase', '1'),
    ('phase_start_date', datetime('now')),
    ('timezone', 'Europe/Istanbul'),
    ('publish_times', '["10:00"]'),
    ('last_publish_time', ''),
    ('total_published', '0');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_posts_source_url ON published_posts(source_url);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON published_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_news_url ON news_cache(url);
