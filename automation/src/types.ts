// ─── Environment & Bindings ───────────────────────────────────────
export interface Env {
  // D1 database binding
  DB: D1Database;

  // Secrets (set via `wrangler secret put`)
  AZURE_OPENAI_KEY: string;
  AZURE_OPENAI_ENDPOINT: string;
  TAVILY_API_KEY: string;
  SERPER_API_KEY: string;
  WP_APP_PASSWORD: string;
  TELEGRAM_BOT_TOKEN: string;
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_SECRET: string;
  DASHBOARD_API_TOKEN: string;
  CRON_SECRET: string;

  // Vars (set in wrangler.toml [vars])
  TIMEZONE: string;
  WP_SITE_URL: string;
  WORKER_URL: string;

  // Private configuration (set via `wrangler secret put`)
  WP_USERNAME: string;
  TELEGRAM_CHAT_ID: string;
}

// ─── Database Row Types ───────────────────────────────────────────
export interface PublishedPost {
  id?: number;
  wp_post_id: number;
  title: string;
  slug?: string;
  source_url: string;
  source_title: string;
  source_domain: string;
  category: string;
  tags: string; // JSON array string
  meta_description: string;
  image_url?: string;
  word_count: number;
  model_used: string;
  published_at: string; // ISO 8601
  created_at?: string;
}

export interface SystemLog {
  id?: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  detail?: string; // JSON string
  created_at?: string;
}

export interface SystemConfig {
  key: string;
  value: string;
  updated_at?: string;
}

export interface NewsCacheRow {
  id?: number;
  url: string;
  title: string;
  source_domain?: string;
  found_at?: string;
  selected: number; // 0=not selected, 1=selected, 2=rejected
  reason?: string;
}

// ─── Domain Models ────────────────────────────────────────────────
export interface NewsArticle {
  title: string;
  url: string;
  content: string;
  snippet?: string;
  domain: string;
  publishedDate?: string;
  score?: number;
}

export interface GeneratedContent {
  title: string;
  meta_description: string;
  content_html: string;
  categories: string[];
  tags: string[];
  image_search_query: string;
  inline_image_queries?: string[];
  source_url: string;
  source_title: string;
  source_domain: string;
  word_count: number;
  social_sharing_kit?: {
    twitter_hook: string;
    reddit_post: string;
  };
}

export interface ImageResult {
  url: string;
  attribution: string;
  source: 'nasa' | 'serper';
  title?: string;
}

// ─── Schedule ─────────────────────────────────────────────────────
export interface PhaseInfo {
  week: number;
  postsPerDay: number;
  times: string[];
}

export interface ScheduleCheck {
  shouldPublish: boolean;
  reason: string;
  currentPhase: PhaseInfo;
  todayPublishCount: number;
  turkeyTime: string;
}

// ─── External API Responses ───────────────────────────────────────

// Tavily Search API
export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  score: number;
  published_date?: string;
}

export interface TavilyResponse {
  results: TavilySearchResult[];
  query: string;
  answer?: string;
}

// Serper.dev Image Search
export interface SerperImageResult {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  thumbnailUrl: string;
  source: string;
  domain: string;
  link: string;
}

export interface SerperResponse {
  images: SerperImageResult[];
  searchParameters?: {
    q: string;
    type: string;
  };
}

// NASA Images API
export interface NasaImageItem {
  data: Array<{
    title: string;
    description?: string;
    nasa_id: string;
    media_type: string;
    date_created: string;
  }>;
  links?: Array<{
    href: string;
    rel: string;
    render?: string;
  }>;
}

export interface NasaImagesResponse {
  collection: {
    items: NasaImageItem[];
    metadata: { total_hits: number };
  };
}

// WordPress REST API
export interface WPPostResponse {
  id: number;
  link: string;
  slug: string;
  title: { rendered: string };
  status: string;
}

export interface WPMediaResponse {
  id: number;
  source_url: string;
  title: { rendered: string };
}

// Telegram Bot API
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
}

// Azure OpenAI
export interface AzureOpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AzureOpenAIChatResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ─── Stats ────────────────────────────────────────────────────────
export interface PublishStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  lastPublished?: string;
  avgWordCount: number;
}
