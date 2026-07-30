export interface Env {
  DB: D1Database;
  AZURE_OPENAI_ENDPOINT: string;
  AZURE_OPENAI_KEY: string;
  WP_SITE_URL: string;
  WP_USERNAME: string;
  WP_APP_PASSWORD: string;
  TELEGRAM_BOT_TOKEN: string;
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

export interface TranslationPayload {
  wpPostId: number;
  lang: SupportedLanguage;
  content: GeneratedContent;
  asDraft: boolean;
  translationsMap: Record<string, number>;
  mediaId: number | null;
}

export type SupportedLanguage = 'en' | 'de' | 'es' | 'fr' | 'nl';

export interface WordPressPost {
  id: number;
  slug: string;
  link: string;
}
