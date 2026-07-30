import type { NewsArticle, TavilyResponse } from '../types';
import { CONFIG } from '../config/constants';
import { isUrlPublished, cacheNews, isNewsCached } from './storageService';
import { addLog } from './storageService';

/**
 * Search for recent space news using Tavily API.
 * Runs several queries in parallel, deduplicates, filters by date, and removes already-published URLs.
 */
export async function searchNews(
  tavilyKey: string,
  db: D1Database
): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];
  const seenUrls = new Set<string>();

  // Run multiple search queries in parallel
  const searchPromises = CONFIG.NEWS_QUERIES.map((query) =>
    searchTavily(tavilyKey, query)
  );

  const results = await Promise.allSettled(searchPromises);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      for (const article of result.value) {
        if (seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);
        allArticles.push(article);
      }
    } else if (result.status === 'rejected') {
      await addLog(db, 'WARN', 'Tavily search query failed', JSON.stringify({ error: String(result.reason) }));
    }
  }

  await addLog(db, 'INFO', `Tavily returned ${allArticles.length} unique articles`);

  // ── Layer 1: Client-side date filtering ──
  // Reject any article with a published_date older than our cutoff
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.NEWS_SEARCH_DAYS);
  
  const freshArticles: NewsArticle[] = [];
  let staleCount = 0;

  for (const article of allArticles) {
    if (article.publishedDate) {
      const pubDate = new Date(article.publishedDate);
      if (!isNaN(pubDate.getTime()) && pubDate < cutoffDate) {
        staleCount++;
        continue; // Skip stale article
      }
    }
    // Keep articles with valid recent dates OR articles with no date (can't verify)
    freshArticles.push(article);
  }

  if (staleCount > 0) {
    await addLog(db, 'INFO', `Filtered out ${staleCount} stale articles (older than ${CONFIG.NEWS_SEARCH_DAYS} days)`);
  }

  // ── Layer 2: Filter out already-published URLs ──
  const candidates: NewsArticle[] = [];
  for (const article of freshArticles) {
    const published = await isUrlPublished(db, article.url);
    if (published) continue;

    const cached = await isNewsCached(db, article.url);
    if (cached) continue;

    // Cache the news URL for tracking
    await cacheNews(db, article.url, article.title, article.domain);
    candidates.push(article);
  }

  await addLog(
    db,
    'INFO',
    `${candidates.length} candidate articles after filtering (removed ${staleCount} stale, ${freshArticles.length - candidates.length} already published)`
  );

  return candidates;
}

async function searchTavily(
  apiKey: string,
  query: string
): Promise<NewsArticle[]> {
  // Calculate date range for the last N days
  const endDate = getTodayDate();
  const startDate = getDateDaysAgo(CONFIG.NEWS_SEARCH_DAYS);

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      topic: 'news',                    // Critical: optimizes for news, returns published_date
      search_depth: 'advanced',
      include_domains: CONFIG.NEWS_SOURCES,
      start_date: startDate,            // "YYYY-MM-DD" — strict date filtering
      end_date: endDate,                // "YYYY-MM-DD"
      max_results: 10,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Tavily API ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as TavilyResponse;

  return data.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    snippet: r.content.slice(0, 300),
    domain: extractDomain(r.url),
    publishedDate: r.published_date,
    score: r.score,
  }));
}

// ── Date helpers ──────────────────────────────────────────────────

function getTodayDate(): string {
  // Use Turkey time (UTC+3) for date calculation
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return now.toISOString().split('T')[0];
}

function getDateDaysAgo(days: number): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

