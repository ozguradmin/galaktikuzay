import { Hono } from 'hono';
import type { Env, TelegramUpdate, GeneratedContent } from './types';
import { CONFIG } from './config/constants';

// Services
import {
  addLog,
  getConfig,
  setConfig,
  getRecentLogs,
  getStats,
  getRecentPosts,
  savePublishedPost,
  cleanOldLogs,
  markNewsSelected,
} from './services/storageService';
import { searchNews } from './services/newsSearch';
import { selectBestNews, generateBlogPost } from './services/contentGenerator';
import { findImage } from './services/imageSearch';
import { uploadImageToWP, publishPost } from './services/wordpressPublisher';
import { postTweet } from './services/twitterPublisher';
import {
  sendMessage,
  sendPostNotification,
  sendErrorNotification,
  handleCommand,
  sendWeeklyReport,
} from './services/telegramBot';
import { shouldPublishNow, getNextPublishTime, getCurrentPhase } from './services/scheduler';

// ─── Hono App ─────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// Dashboard endpoints are called by the Next.js server-side proxy. The token
// never reaches browser JavaScript.
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/cron-trigger') {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!c.env.DASHBOARD_API_TOKEN || authHeader !== `Bearer ${c.env.DASHBOARD_API_TOKEN}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

// ─── Telegram Webhook ─────────────────────────────────────────────

app.post('/telegram/webhook', async (c) => {
  const env = c.env;

  try {
    const update = (await c.req.json()) as TelegramUpdate;
    const text = update.message?.text;
    const chatId = update.message?.chat?.id;

    if (!text || !chatId) {
      return c.json({ ok: true });
    }

    // Only respond to our chat
    if (String(chatId) !== env.TELEGRAM_CHAT_ID) {
      return c.json({ ok: true });
    }

    // Handle commands
    if (text.startsWith('/')) {
      const command = text.split(' ')[0].split('@')[0]; // strip @botname

      // Special case: /force triggers a publish
      if (command === '/force') {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          env.TELEGRAM_CHAT_ID,
          '🔄 <b>Zorla yayın</b> komutu alındı.\n\nYayın süreci başlatılıyor...'
        );

        // Run the publish pipeline (don't await — respond immediately)
        c.executionCtx.waitUntil(runPublishPipeline(env, true));

        return c.json({ ok: true });
      }

      const response = await handleCommand(command, env.DB, env);
      await sendMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, response);
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ ok: true }); // Always return 200 to Telegram
  }
});

// ─── Dashboard API Routes ─────────────────────────────────────────

app.get('/api/status', async (c) => {
  const env = c.env;
  const isActive = (await getConfig(env.DB, 'is_active')) === 'true';
  const phase = await getCurrentPhase(env.DB);
  const stats = await getStats(env.DB);
  const nextPublish = await getNextPublishTime(env.DB);

  return c.json({
    status: isActive ? 'active' : 'paused',
    phase: {
      week: phase.week,
      postsPerDay: phase.postsPerDay,
      times: phase.times,
    },
    stats,
    nextPublishTime: nextPublish,
  });
});

app.get('/api/posts', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const posts = await getRecentPosts(c.env.DB, Math.min(limit, 100));
  return c.json({ posts });
});

app.get('/api/logs', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const level = c.req.query('level') ?? undefined;
  const logs = await getRecentLogs(c.env.DB, Math.min(limit, 200), level);
  return c.json({ logs });
});

app.get('/api/config', async (c) => {
  const db = c.env.DB;
  const keys = [
    'is_active',
    'posts_per_day',
    'current_phase',
    'phase_start_date',
    'publish_times',
    'last_publish_time',
    'total_published',
    'auto_publish',
    'schedule_mode',
  ];

  const config: Record<string, string | null> = {};
  for (const key of keys) {
    config[key] = await getConfig(db, key);
  }

  // If schedule_mode is auto or not set, dynamically return the current phase values
  const mode = config['schedule_mode'] ?? 'auto';
  if (mode === 'auto') {
    const phase = await getCurrentPhase(db);
    config['posts_per_day'] = String(phase.postsPerDay);
    config['publish_times'] = phase.times.join(',');
  }

  return c.json({ config });
});

app.post('/api/config', async (c) => {
  const body = (await c.req.json()) as Record<string, string>;
  const db = c.env.DB;

  // Only allow updating safe keys
  const allowedKeys = new Set([
    'is_active',
    'posts_per_day',
    'publish_times',
    'phase_start_date',
    'auto_publish',
    'schedule_mode',
  ]);

  const updated: string[] = [];
  let shouldSwitchToManual = false;

  for (const [key, value] of Object.entries(body)) {
    if (allowedKeys.has(key)) {
      await setConfig(db, key, value);
      updated.push(key);
      if (key === 'posts_per_day' || key === 'publish_times') {
        shouldSwitchToManual = true;
      }
    }
  }

  if (shouldSwitchToManual && body['schedule_mode'] === undefined) {
    await setConfig(db, 'schedule_mode', 'manual');
    updated.push('schedule_mode');
  }

  await addLog(c.env.DB, 'INFO', `Config updated: ${updated.join(', ')}`);
  return c.json({ success: true, updated });
});

app.post('/api/force-publish', async (c) => {
  const env = c.env;
  try {
    await runPublishPipeline(env, true, false);
    return c.json({ success: true, message: 'Yayın süreci başarıyla tamamlandı' });
  } catch (err) {
    return c.json({ success: false, message: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// Generate draft for review (dashboard "Örnek İçerik Üret" button)
app.post('/api/generate-draft', async (c) => {
  const env = c.env;
  try {
    await runPublishPipeline(env, true, true);
    return c.json({ success: true, message: 'Taslak başarıyla oluşturuldu' });
  } catch (err) {
    return c.json({ success: false, message: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// Secure cron trigger via HTTP (bypasses the 30-second waitUntil limit by running in an HTTP execution context)
app.post('/api/cron-trigger', async (c) => {
  const env = c.env;
  const authHeader = c.req.header('Authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    await handleCron(env);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, message: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// Serve dynamic llms.txt for AI crawlers
app.get('/llms.txt', async (c) => {
  const env = c.env;
  try {
    const { results } = await env.DB
      .prepare('SELECT wp_post_id, title, slug, meta_description, word_count, published_at FROM published_posts ORDER BY published_at DESC LIMIT 50')
      .all<{ wp_post_id: number; title: string; slug: string; meta_description: string; word_count: number; published_at: string }>();

    let markdown = `# Galaktik Uzay\n\n`;
    markdown += `Uzay keşifleri, astronomi, uzay teknolojileri ve evrenin gizemleri hakkında en güncel haberler, analizler ve derinlemesine makaleler.\n\n`;
    markdown += `## Son Makaleler\n\n`;

    if (results && results.length > 0) {
      for (const post of results) {
        const url = post.slug ? `${env.WP_SITE_URL}/${post.slug}` : `${env.WP_SITE_URL}/?p=${post.wp_post_id}`;
        const date = post.published_at ? post.published_at.slice(0, 10) : '';
        markdown += `- [${post.title}](${url}) - ${post.meta_description || ''} (Yayınlanma: ${date}, Kelime: ${post.word_count})\n`;
      }
    } else {
      markdown += `Henüz makale bulunmamaktadır.\n`;
    }

    return c.text(markdown, 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    });
  } catch (err) {
    return c.text('Error generating llms.txt', 500);
  }
});

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'galaktikuzay-automation',
    status: 'running',
    version: '1.0.0',
  });
});

// ─── Publish Pipeline ─────────────────────────────────────────────

async function runPublishPipeline(env: Env, forced = false, asDraft = false): Promise<void> {
  const db = env.DB;

  try {
    await addLog(db, 'INFO', `Yayın süreci başlatıldı${forced ? ' (zorla)' : ''}`);

    // Step 1: Search for news
    await addLog(db, 'INFO', 'Haberler aranıyor...');
    const candidates = await searchNews(env.TAVILY_API_KEY, db);

    if (candidates.length === 0) {
      await addLog(db, 'WARN', 'Uygun haber bulunamadı');
      if (forced) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          env.TELEGRAM_CHAT_ID,
          '⚠️ Yayınlanabilecek yeni haber bulunamadı.'
        );
      }
      return;
    }

    // Step 2: Select best article via AI
    await addLog(db, 'INFO', `${candidates.length} aday arasından en iyi haber seçiliyor...`);
    const bestArticle = await selectBestNews(
      candidates,
      env.AZURE_OPENAI_ENDPOINT,
      env.AZURE_OPENAI_KEY
    );

    await addLog(db, 'INFO', `Seçilen haber: ${bestArticle.title}`, JSON.stringify({
      url: bestArticle.url,
      domain: bestArticle.domain,
    }));

    // Mark as selected in news cache
    await markNewsSelected(db, bestArticle.url, 1, 'AI tarafından seçildi');

    // Step 3: Generate blog content via AI
    await addLog(db, 'INFO', 'Blog yazısı oluşturuluyor...');
    const content = await generateBlogPost(
      bestArticle,
      env.AZURE_OPENAI_ENDPOINT,
      env.AZURE_OPENAI_KEY,
      db
    );

    await addLog(db, 'INFO', `Blog yazısı oluşturuldu: "${content.title}" (${content.word_count} kelime)`);

    // Step 4: Find a relevant featured image
    await addLog(db, 'INFO', 'Öne çıkan görsel aranıyor...');
    const image = await findImage(content.image_search_query, env.SERPER_API_KEY);

    let mediaId: number | null = null;
    if (image) {
      await addLog(db, 'INFO', `Öne çıkan görsel bulundu (${image.source}): ${image.title}`);

      // Step 5: Upload featured image to WordPress
      const media = await uploadImageToWP(image.url, image.attribution, env);
      if (media) {
        mediaId = media.id;
        await addLog(db, 'INFO', `Öne çıkan görsel WordPress'e yüklendi: media ID ${media.id}`);
      } else {
        await addLog(db, 'WARN', 'Öne çıkan görsel WordPress\'e yüklenemedi, görselsiz devam ediliyor');
      }
    } else {
      await addLog(db, 'WARN', 'Uygun öne çıkan görsel bulunamadı, görselsiz devam ediliyor');
    }

    // Step 5.5: Search and process inline images
    if (content.inline_image_queries && content.inline_image_queries.length > 0) {
      await addLog(db, 'INFO', `${content.inline_image_queries.length} adet satır içi görsel aranıyor...`);
      let updatedHtml = content.content_html;
      
      for (let i = 0; i < content.inline_image_queries.length; i++) {
        const query = content.inline_image_queries[i];
        const placeholderIndex = i + 1;
        const placeholder = `INLINE_IMAGE_${placeholderIndex}`;
        
        await addLog(db, 'INFO', `Satır içi görsel ${placeholderIndex} aranıyor: "${query}"`);
        const inlineImg = await findImage(query, env.SERPER_API_KEY);
        
        if (inlineImg) {
          await addLog(db, 'INFO', `Satır içi görsel ${placeholderIndex} bulundu (${inlineImg.source}): ${inlineImg.title}`);
          const media = await uploadImageToWP(inlineImg.url, inlineImg.attribution, env);
          if (media) {
            await addLog(db, 'INFO', `Satır içi görsel ${placeholderIndex} WordPress'e yüklendi: ID ${media.id}`);
            updatedHtml = updatedHtml.replace(placeholder, media.source_url);
          } else {
            await addLog(db, 'WARN', `Satır içi görsel ${placeholderIndex} WordPress'e yüklenemedi, figür kaldırılıyor`);
            updatedHtml = removeFigurePlaceholder(updatedHtml, placeholder);
          }
        } else {
          await addLog(db, 'WARN', `Satır içi görsel ${placeholderIndex} bulunamadı, figür kaldırılıyor`);
          updatedHtml = removeFigurePlaceholder(updatedHtml, placeholder);
        }
      }
      content.content_html = updatedHtml;
    }

    // Apply styling to all image tags in content HTML to prevent overflow
    content.content_html = content.content_html.replace(/<img([^>]*src="http[^>]*)/gi, (match) => {
      if (match.includes('style=')) return match;
      return '<img style="max-width: 100%; max-height: 400px; width: auto; height: auto; display: block; margin: 25px auto;"' + match.substring(4);
    });

    // Step 6: Publish/Draft to WordPress
    const statusLabel = asDraft ? 'taslak' : 'yayın';
    await addLog(db, 'INFO', `WordPress'e ${statusLabel} olarak gönderiliyor...`);
    const wpPost = await publishPost(content, mediaId, env, asDraft);

    await addLog(db, 'INFO', `WordPress ${statusLabel} başarılı: ID ${wpPost.id}`, JSON.stringify({
      slug: wpPost.slug,
      link: wpPost.link,
      status: asDraft ? 'draft' : 'publish',
    }));

    // Step 7: Save to DB
    const turkeyNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const publishedAt = turkeyNow.toISOString();

    await savePublishedPost(db, {
      wp_post_id: wpPost.id,
      title: content.title,
      slug: wpPost.slug,
      source_url: content.source_url,
      source_title: content.source_title,
      source_domain: content.source_domain,
      category: content.categories.join(', '),
      tags: JSON.stringify(content.tags),
      meta_description: content.meta_description,
      image_url: image?.url,
      word_count: content.word_count,
      model_used: 'gpt-chat-latest-2',
      published_at: publishedAt,
    });

    // Update last publish time & total count
    await setConfig(db, 'last_publish_time', publishedAt);
    const totalStr = await getConfig(db, 'total_published') ?? '0';
    await setConfig(db, 'total_published', String(parseInt(totalStr, 10) + 1));

    // Step 7.5: Post to X (Twitter) if the post is published live (not as a draft)
    if (!asDraft && content.social_sharing_kit?.twitter_hook) {
      await addLog(db, 'INFO', 'X (Twitter) paylaşımı yapılıyor...');
      try {
        const tweetText = `${content.social_sharing_kit.twitter_hook}\n\n${wpPost.link}`;
        const tweet = await postTweet(tweetText, env);
        if (tweet) {
          await addLog(db, 'INFO', `X (Twitter) paylaşımı başarılı: Tweet ID ${tweet.id}`);
        } else {
          await addLog(db, 'WARN', 'X (Twitter) paylaşımı başarısız oldu.');
        }
      } catch (err) {
        await addLog(db, 'ERROR', `X (Twitter) paylaşımı sırasında hata oluştu: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Step 8: Send Telegram notification
    await sendPostNotification(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, {
      title: content.title,
      slug: wpPost.slug,
      source_domain: content.source_domain,
      word_count: content.word_count,
      categories: content.categories,
      wpUrl: wpPost.link,
      social_sharing_kit: content.social_sharing_kit,
    });

    const emoji = asDraft ? '📝' : '✅';
    const draftLink = asDraft ? `\n🔗 Taslak: ${env.WP_SITE_URL}/wp-admin/post.php?post=${wpPost.id}&action=edit` : '';
    await addLog(db, 'INFO', `${emoji} ${asDraft ? 'Taslak' : 'Yayın'} tamamlandı: "${content.title}"${draftLink}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await addLog(db, 'ERROR', `Yayın süreci hatası: ${errorMessage}`, JSON.stringify({
      stack: error instanceof Error ? error.stack : undefined,
    }));

    // Send error notification via Telegram
    try {
      await sendErrorNotification(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_CHAT_ID,
        errorMessage
      );
    } catch {
      console.error('Failed to send error notification to Telegram');
    }
  }
}

// ─── Cron Handler ─────────────────────────────────────────────────

async function handleCron(env: Env): Promise<void> {
  const db = env.DB;

  try {
    // Clean old logs
    const cleaned = await cleanOldLogs(db, CONFIG.LOG_RETENTION_DAYS);
    if (cleaned > 0) {
      await addLog(db, 'INFO', `${cleaned} eski log kaydı temizlendi`);
    }

    // Check if it's time to send weekly report
    const lastWeeklyReport = await getConfig(db, 'last_weekly_report_time');
    const nowMs = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    let shouldSendReport = false;

    if (!lastWeeklyReport) {
      shouldSendReport = true;
    } else {
      const lastReportDate = new Date(lastWeeklyReport);
      if (nowMs - lastReportDate.getTime() >= oneWeekMs) {
        shouldSendReport = true;
      }
    }

    if (shouldSendReport) {
      try {
        await addLog(db, 'INFO', 'Haftalık rapor Telegram\'a gönderiliyor...');
        await sendWeeklyReport(db, env);
        const turkeyNowStr = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
        await setConfig(db, 'last_weekly_report_time', turkeyNowStr);
        await addLog(db, 'INFO', 'Haftalık rapor başarıyla gönderildi.');
      } catch (err) {
        await addLog(db, 'ERROR', `Haftalık rapor gönderme hatası: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Check if it's time to publish
    const scheduleCheck = await shouldPublishNow(db);

    await addLog(
      db,
      'INFO',
      `Cron tetiklendi — ${scheduleCheck.turkeyTime} TR | ${scheduleCheck.reason}`,
      JSON.stringify({
        phase: scheduleCheck.currentPhase,
        todayCount: scheduleCheck.todayPublishCount,
        shouldPublish: scheduleCheck.shouldPublish,
      })
    );

    if (!scheduleCheck.shouldPublish) {
      return;
    }

    // Run the publish pipeline
    // Auto-publish mode: check config. Default is publish, but can be set to draft-only.
    const autoPublishMode = await getConfig(db, 'auto_publish');
    const asDraft = autoPublishMode === 'draft';
    await runPublishPipeline(env, false, asDraft);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Cron handler error:', errorMessage);

    try {
      await addLog(db, 'ERROR', `Cron hatası: ${errorMessage}`);
      await sendErrorNotification(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_CHAT_ID,
        `Cron hatası: ${errorMessage}`
      );
    } catch {
      // Last resort
      console.error('Failed to log cron error');
    }
  }
}

function removeFigurePlaceholder(html: string, placeholder: string): string {
  const escapedPlaceholder = placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`<figure[^>]*>[\\s\\S]*?${escapedPlaceholder}[\\s\\S]*?<\\/figure>`, 'gi');
  return html.replace(regex, '');
}

async function triggerCronViaHttp(env: Env): Promise<void> {
  const workerUrl = env.WORKER_URL || 'https://galaktikuzay-automation.ozgurglr256.workers.dev';
  try {
    const res = await fetch(`${workerUrl}/api/cron-trigger`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CRON_SECRET}`
      }
    });
    if (!res.ok) {
      console.error(`Cron HTTP trigger failed with status ${res.status}`);
    }
  } catch (err) {
    console.error('Failed to trigger cron via HTTP:', err);
  }
}

// ─── Export ───────────────────────────────────────────────────────

export default {
  fetch: app.fetch,
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleCron(env));
  },
};
