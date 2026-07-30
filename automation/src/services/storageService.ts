import type { PublishedPost, SystemLog, PublishStats } from '../types';

// ─── Config Helpers ───────────────────────────────────────────────

export async function getConfig(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT value FROM system_config WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, value)
    .run();
}

// ─── Published Posts ──────────────────────────────────────────────

export async function isUrlPublished(db: D1Database, url: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM published_posts WHERE source_url = ? LIMIT 1')
    .bind(url)
    .first();
  return row !== null;
}

export async function savePublishedPost(db: D1Database, post: PublishedPost): Promise<void> {
  await db
    .prepare(
      `INSERT INTO published_posts
       (wp_post_id, title, slug, source_url, source_title, source_domain,
        category, tags, meta_description, image_url, word_count, model_used, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      post.wp_post_id,
      post.title,
      post.slug ?? null,
      post.source_url,
      post.source_title,
      post.source_domain,
      post.category,
      post.tags,
      post.meta_description,
      post.image_url ?? null,
      post.word_count,
      post.model_used,
      post.published_at
    )
    .run();
}

export async function getRecentPosts(
  db: D1Database,
  limit = 10
): Promise<PublishedPost[]> {
  const { results } = await db
    .prepare('SELECT * FROM published_posts ORDER BY published_at DESC LIMIT ?')
    .bind(limit)
    .all<PublishedPost>();
  return results ?? [];
}

export async function getRelatedPostsByCategory(
  db: D1Database,
  category: string,
  limit = 3
): Promise<PublishedPost[]> {
  // Simple wildcard match for categories since they can be comma-separated strings (e.g. "Uzay, Keşifler")
  const { results } = await db
    .prepare('SELECT * FROM published_posts WHERE category LIKE ? ORDER BY published_at DESC LIMIT ?')
    .bind(`%${category}%`, limit)
    .all<PublishedPost>();
  return results ?? [];
}

export async function getTodayPublishCount(db: D1Database, todayDateStr: string): Promise<number> {
  // todayDateStr should be 'YYYY-MM-DD' in Turkey time
  const row = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM published_posts
       WHERE published_at >= ? AND published_at < ?`
    )
    .bind(todayDateStr + 'T00:00:00', todayDateStr + 'T23:59:59')
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

// ─── Logs ─────────────────────────────────────────────────────────

export async function addLog(
  db: D1Database,
  level: SystemLog['level'],
  message: string,
  detail?: string
): Promise<void> {
  const logPrefix = `[${level}]`;
  if (level === 'ERROR') {
    console.error(logPrefix, message, detail ?? '');
  } else if (level === 'WARN') {
    console.warn(logPrefix, message, detail ?? '');
  } else {
    console.log(logPrefix, message, detail ?? '');
  }

  try {
    await db
      .prepare(
        `INSERT INTO system_logs (level, message, detail, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .bind(level, message, detail ?? null)
      .run();
  } catch (err) {
    console.error('Failed to write log to DB:', err);
  }
}

export async function getRecentLogs(
  db: D1Database,
  limit = 50,
  level?: string
): Promise<SystemLog[]> {
  let sql = 'SELECT * FROM system_logs';
  const params: (string | number)[] = [];

  if (level) {
    sql += ' WHERE level = ?';
    params.push(level);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(sql);
  const { results } = await stmt.bind(...params).all<SystemLog>();
  return results ?? [];
}

export async function cleanOldLogs(db: D1Database, days: number): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM system_logs WHERE created_at < datetime('now', '-' || ? || ' days')`
    )
    .bind(days)
    .run();
  return result.meta?.changes ?? 0;
}

// ─── News Cache ───────────────────────────────────────────────────

export async function cacheNews(
  db: D1Database,
  url: string,
  title: string,
  domain: string
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO news_cache (url, title, source_domain, found_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
    .bind(url, title, domain)
    .run();
}

export async function isNewsCached(db: D1Database, url: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM news_cache WHERE url = ? AND selected = 1 LIMIT 1')
    .bind(url)
    .first();
  return row !== null;
}

export async function markNewsSelected(
  db: D1Database,
  url: string,
  selected: number,
  reason?: string
): Promise<void> {
  await db
    .prepare('UPDATE news_cache SET selected = ?, reason = ? WHERE url = ?')
    .bind(selected, reason ?? null, url)
    .run();
}

// ─── Stats ────────────────────────────────────────────────────────

export async function getStats(db: D1Database): Promise<PublishStats> {
  const now = new Date();
  const todayStr = toTurkeyDateStr(now);

  // Calculate start of week (Monday)
  const dayOfWeek = now.getUTCDay();
  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
  const weekStr = startOfWeek.toISOString().slice(0, 10);

  // Start of month
  const monthStr = todayStr.slice(0, 7) + '-01';

  const [totalRow, todayRow, weekRow, monthRow, lastRow, avgRow] = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM published_posts').first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM published_posts
         WHERE published_at >= ? AND published_at < ?`
      )
      .bind(todayStr + 'T00:00:00', todayStr + 'T23:59:59')
      .first<{ cnt: number }>(),
    db
      .prepare('SELECT COUNT(*) as cnt FROM published_posts WHERE published_at >= ?')
      .bind(weekStr + 'T00:00:00')
      .first<{ cnt: number }>(),
    db
      .prepare('SELECT COUNT(*) as cnt FROM published_posts WHERE published_at >= ?')
      .bind(monthStr + 'T00:00:00')
      .first<{ cnt: number }>(),
    db
      .prepare('SELECT published_at FROM published_posts ORDER BY published_at DESC LIMIT 1')
      .first<{ published_at: string }>(),
    db
      .prepare('SELECT AVG(word_count) as avg FROM published_posts')
      .first<{ avg: number }>(),
  ]);

  return {
    total: totalRow?.cnt ?? 0,
    today: todayRow?.cnt ?? 0,
    thisWeek: weekRow?.cnt ?? 0,
    thisMonth: monthRow?.cnt ?? 0,
    lastPublished: lastRow?.published_at,
    avgWordCount: Math.round(avgRow?.avg ?? 0),
  };
}

function toTurkeyDateStr(date: Date): string {
  // Turkey is UTC+3
  const turkeyMs = date.getTime() + 3 * 60 * 60 * 1000;
  return new Date(turkeyMs).toISOString().slice(0, 10);
}
