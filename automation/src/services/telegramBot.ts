import type { Env, PublishedPost, PublishStats } from '../types';
import { CONFIG } from '../config/constants';
import { getConfig, setConfig, getRecentLogs, getStats } from './storageService';
import { getNextPublishTime, getCurrentPhase } from './scheduler';

// ─── Core Messaging ───────────────────────────────────────────────

export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML'
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: false,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error(`Telegram sendMessage failed: ${err}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Telegram sendMessage error:', error);
    return false;
  }
}

// ─── Notifications ────────────────────────────────────────────────

export async function sendPostNotification(
  token: string,
  chatId: string,
  post: {
    title: string;
    slug?: string;
    source_domain: string;
    word_count: number;
    categories: string[];
    wpUrl: string;
    social_sharing_kit?: {
      twitter_hook: string;
      reddit_post: string;
    };
  }
): Promise<void> {
  let message = `🚀 <b>Yeni Yazı Yayınlandı!</b>

📝 <b>${escapeHtml(post.title)}</b>

🔗 <a href="${post.wpUrl}">Yazıyı Oku</a>
📰 Kaynak: ${escapeHtml(post.source_domain)}
📊 ${post.word_count} kelime
🏷️ ${post.categories.join(', ')}

<i>Otomatik yayınlandı — galaktikuzay.com</i>`;

  if (post.social_sharing_kit) {
    message += `\n\n📢 <b>Sosyal Medya Paylaşım Şablonları:</b>\n\n` +
      `🐦 <b>X (Twitter):</b>\n` +
      `<code>${escapeHtml(post.social_sharing_kit.twitter_hook)}\n\n👉 ${post.wpUrl}</code>\n\n` +
      `👾 <b>Reddit:</b>\n` +
      `<code>${escapeHtml(post.social_sharing_kit.reddit_post)}\n\n👉 ${post.wpUrl}</code>`;
  }

  await sendMessage(token, chatId, message);
}

export async function sendErrorNotification(
  token: string,
  chatId: string,
  error: string
): Promise<void> {
  const message = `⚠️ <b>Hata Bildirimi</b>

❌ ${escapeHtml(error)}

<i>Lütfen /logs komutu ile detayları kontrol edin.</i>`;

  await sendMessage(token, chatId, message);
}

// ─── Command Handler ──────────────────────────────────────────────

export async function handleCommand(
  command: string,
  db: D1Database,
  env: Env
): Promise<string> {
  const cmd = command.trim().toLowerCase().replace('/', '');

  switch (cmd) {
    case 'status':
      return await cmdStatus(db);
    case 'next':
      return await cmdNext(db);
    case 'pause':
      return await cmdPause(db);
    case 'resume':
      return await cmdResume(db);
    case 'force':
      return cmdForce();
    case 'logs':
      return await cmdLogs(db);
    case 'stats':
      return await cmdStats(db, env);
    case 'help':
      return cmdHelp();
    default:
      return '❓ Bilinmeyen komut. /help yazarak komut listesini görebilirsiniz.';
  }
}

// ─── Individual Command Implementations ───────────────────────────

async function cmdStatus(db: D1Database): Promise<string> {
  const isActive = (await getConfig(db, 'is_active')) === 'true';
  const phase = await getCurrentPhase(db);
  const stats = await getStats(db);
  const lastPublish = await getConfig(db, 'last_publish_time');

  const statusEmoji = isActive ? '🟢' : '🔴';
  const statusText = isActive ? 'Aktif' : 'Duraklatıldı';

  return `📊 <b>Sistem Durumu</b>

${statusEmoji} Durum: <b>${statusText}</b>
📅 Faz: Hafta ${phase.week} (günde ${phase.postsPerDay} yazı)
⏰ Yayın saatleri: ${phase.times.join(', ')}

📈 <b>Bugünkü İstatistikler</b>
• Bugün: ${stats.today} yazı yayınlandı
• Bu hafta: ${stats.thisWeek}
• Toplam: ${stats.total}

🕐 Son yayın: ${lastPublish || 'Henüz yok'}`;
}

async function cmdNext(db: D1Database): Promise<string> {
  const isActive = (await getConfig(db, 'is_active')) === 'true';
  if (!isActive) {
    return '⏸️ Otomasyon duraklatıldı. Sonraki yayın zamanı hesaplanamıyor.\n/resume ile devam ettirin.';
  }

  const nextTime = await getNextPublishTime(db);
  if (!nextTime) {
    return '✅ Bugünkü tüm yayınlar tamamlandı. Yarın devam edilecek.';
  }

  const formattedTime = formatTurkeyDateHuman(nextTime);
  return `⏰ <b>Sonraki Yayın</b>\n\n📅 ${formattedTime}\n\n<i>±${CONFIG.TIME_JITTER_MINUTES} dakika sapma olabilir.</i>`;
}

async function cmdPause(db: D1Database): Promise<string> {
  await setConfig(db, 'is_active', 'false');
  return '⏸️ Otomasyon <b>duraklatıldı</b>.\n\nYeniden başlatmak için /resume kullanın.';
}

async function cmdResume(db: D1Database): Promise<string> {
  await setConfig(db, 'is_active', 'true');
  return '▶️ Otomasyon <b>devam ettiriliyor</b>.\n\nSistem bir sonraki cron tetikleyicisinde çalışacak.';
}

function cmdForce(): string {
  // The actual force-publish is handled by the webhook route
  return '🔄 <b>Zorla yayın</b> komutu alındı.\n\nYayın süreci başlatılıyor... Bu birkaç dakika sürebilir.';
}

async function cmdLogs(db: D1Database): Promise<string> {
  const logs = await getRecentLogs(db, 10);

  if (logs.length === 0) {
    return '📋 Henüz log kaydı bulunmuyor.';
  }

  const logLines = logs.map((log) => {
    const icon = log.level === 'ERROR' ? '❌' : log.level === 'WARN' ? '⚠️' : 'ℹ️';
    const time = log.created_at?.slice(11, 16) ?? '';
    return `${icon} [${time}] ${log.message}`;
  });

  return `📋 <b>Son 10 Log</b>\n\n${logLines.join('\n')}`;
}

async function cmdStats(db: D1Database, env: Env): Promise<string> {
  const stats = await getStats(db);
  
  let visitorStatsText = '';
  try {
    const vStats = await getWebsiteVisitorStats(env);
    visitorStatsText = `📈 <b>Ziyaretçi Analitiği (Jetpack)</b>
• Bugün: <b>${vStats.today.visitors}</b> tekil (${vStats.today.views} sayfa)
• Dün: <b>${vStats.yesterday.visitors}</b> tekil (${vStats.yesterday.views} sayfa)
• Son 7 Gün: <b>${vStats.week.visitors}</b> tekil (${vStats.week.views} sayfa)
• Son 30 Gün: <b>${vStats.month.visitors}</b> tekil (${vStats.month.views} sayfa)
`;
  } catch (err) {
    visitorStatsText = `📈 <b>Ziyaretçi Analitiği (Jetpack)</b>\n⚠️ İstatistikler şu anda alınamıyor.\n`;
    console.error('Visitor stats error:', err);
  }

  return `📊 <b>İstatistikler</b>

${visitorStatsText}
📝 <b>Yayın Sayıları</b>
• Bugün: ${stats.today} yazı yayınlandı
• Bu hafta: ${stats.thisWeek}
• Bu ay: ${stats.thisMonth}
• Toplam: ${stats.total}

📏 Ortalama kelime sayısı: ${stats.avgWordCount} kelime
🕐 Son yayın: ${stats.lastPublished || 'Henüz yok'}`;
}

function cmdHelp(): string {
  const commands = CONFIG.TELEGRAM_COMMANDS.map(
    (c) => `/${c.command} — ${c.description}`
  ).join('\n');

  return `🤖 <b>Galaktik Uzay Bot Komutları</b>\n\n${commands}`;
}

// ─── Helpers ──────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface VisitorStats {
  today: { views: number; visitors: number };
  yesterday: { views: number; visitors: number };
  week: { views: number; visitors: number };
  month: { views: number; visitors: number };
}

export async function getWebsiteVisitorStats(env: Env): Promise<VisitorStats> {
  const credentials = `${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`;
  const authHeader = `Basic ${btoa(credentials)}`;
  const siteId = '222020231';
  const url = `${env.WP_SITE_URL}/wp-json/jetpack/v4/stats-app/sites/${siteId}/stats`;

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      'User-Agent': 'GalaktikUzay-Bot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`WordPress Stats API failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as any;
  const stats = data.stats;
  const visitsData = data.visits?.data || [];

  // Calculate 1 week (last 7 days)
  let weekViews = 0;
  let weekVisitors = 0;
  const last7Days = visitsData.slice(-7);
  for (const day of last7Days) {
    weekViews += Number(day[1]) || 0;
    weekVisitors += Number(day[2]) || 0;
  }

  // Calculate 1 month (all 30 days)
  let monthViews = 0;
  let monthVisitors = 0;
  for (const day of visitsData) {
    monthViews += Number(day[1]) || 0;
    monthVisitors += Number(day[2]) || 0;
  }

  return {
    today: {
      views: stats.views_today || 0,
      visitors: stats.visitors_today || 0,
    },
    yesterday: {
      views: stats.views_yesterday || 0,
      visitors: stats.visitors_yesterday || 0,
    },
    week: {
      views: weekViews,
      visitors: weekVisitors,
    },
    month: {
      views: monthViews,
      visitors: monthVisitors,
    },
  };
}

function formatTurkeyDateHuman(isoString: string): string {
  const date = new Date(isoString);
  // Turkey is UTC+3. Since date is UTC, we offset it to Turkey local
  const turkeyTime = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const h = String(turkeyTime.getUTCHours()).padStart(2, '0');
  const m = String(turkeyTime.getUTCMinutes()).padStart(2, '0');
  
  const now = new Date();
  const turkeyNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  
  const isToday = turkeyTime.getUTCDate() === turkeyNow.getUTCDate() &&
                  turkeyTime.getUTCMonth() === turkeyNow.getUTCMonth() &&
                  turkeyTime.getUTCFullYear() === turkeyNow.getUTCFullYear();
                  
  const tomorrow = new Date(turkeyNow.getTime() + 24 * 60 * 60 * 1000);
  const isTomorrow = turkeyTime.getUTCDate() === tomorrow.getUTCDate() &&
                     turkeyTime.getUTCMonth() === tomorrow.getUTCMonth() &&
                     turkeyTime.getUTCFullYear() === tomorrow.getUTCFullYear();
                     
  if (isToday) {
    return `Bugün ${h}:${m} (Türkiye saati)`;
  } else if (isTomorrow) {
    return `Yarın ${h}:${m} (Türkiye saati)`;
  } else {
    const day = String(turkeyTime.getUTCDate()).padStart(2, '0');
    const month = String(turkeyTime.getUTCMonth() + 1).padStart(2, '0');
    return `${day}.${month} ${h}:${m} (Türkiye saati)`;
  }
}

export async function sendWeeklyReport(db: D1Database, env: Env): Promise<void> {
  const statsText = await cmdStats(db, env);
  const message = `📢 <b>HAFTALIK ÖZET RAPORU</b>\n\n${statsText}`;
  await sendMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, message);
}
