import type { GeneratedContent, SupportedLanguage } from './types';

export async function addLog(
  db: D1Database,
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  detail?: string
): Promise<void> {
  if (level === 'ERROR') console.error(`[${level}]`, message, detail ?? '');
  else if (level === 'WARN') console.warn(`[${level}]`, message, detail ?? '');
  else console.log(`[${level}]`, message, detail ?? '');

  try {
    await db
      .prepare(
        `INSERT INTO system_logs (level, message, detail, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .bind(level, message, detail ?? null)
      .run();
  } catch (error) {
    console.error('Failed to write translator log:', error);
  }
}

export async function saveTranslation(
  db: D1Database,
  wpPostId: number,
  slug: string,
  content: GeneratedContent,
  lang: SupportedLanguage
): Promise<void> {
  const publishedAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO published_posts
       (wp_post_id, title, slug, source_url, source_title, source_domain,
        category, tags, meta_description, image_url, word_count, model_used,
        published_at, lang)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      wpPostId,
      content.title,
      slug,
      content.source_url,
      content.source_title,
      content.source_domain,
      content.categories.join(', '),
      JSON.stringify(content.tags),
      content.meta_description,
      null,
      content.word_count,
      'gpt-chat-latest-2',
      publishedAt,
      lang
    )
    .run();
}
