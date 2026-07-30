import type { Env, GeneratedContent } from '../types';
import { addLog } from './storageService';

const TARGET_LANGUAGES = ['en', 'de', 'es', 'fr', 'nl'] as const;

type TargetLanguage = (typeof TARGET_LANGUAGES)[number];
type TranslationMap = Record<string, number>;

interface TranslatorResponse {
  success?: boolean;
  id?: number;
  error?: string;
}

export async function publishTranslations(
  env: Env,
  db: D1Database,
  wpPostId: number,
  content: GeneratedContent,
  mediaId: number | null,
  asDraft: boolean
): Promise<TranslationMap> {
  const translations: TranslationMap = { tr: wpPostId };

  await addLog(db, 'INFO', 'Türkçe makalenin dili kuruluyor...');
  const turkishLinked = await linkPostTranslations(
    wpPostId,
    'tr',
    translations,
    env
  );
  if (!turkishLinked) {
    await addLog(
      db,
      'WARN',
      'Türkçe makale Polylang dil eşlemesine bağlanamadı; çevirilere devam ediliyor'
    );
  }

  for (const lang of TARGET_LANGUAGES) {
    await publishLanguage(
      env,
      db,
      wpPostId,
      lang,
      content,
      mediaId,
      asDraft,
      translations
    );
  }

  // Each Translator response links the map known at that point. Relink the
  // Turkish source once with the complete map so every language is grouped.
  const finalLinked = await linkPostTranslations(
    wpPostId,
    'tr',
    translations,
    env
  );
  if (!finalLinked) {
    await addLog(
      db,
      'WARN',
      'Tam çeviri haritası Türkçe makaleye bağlanamadı'
    );
  }

  return translations;
}

async function publishLanguage(
  env: Env,
  db: D1Database,
  wpPostId: number,
  lang: TargetLanguage,
  content: GeneratedContent,
  mediaId: number | null,
  asDraft: boolean,
  translations: TranslationMap
): Promise<void> {
  await addLog(
    db,
    'INFO',
    `"${lang.toUpperCase()}" dili için çeviri ve yayın başlatıldı (Service Binding)...`
  );

  try {
    const response = await env.TRANSLATOR.fetch(
      new Request('https://galaktikuzay-translator/api/internal/translate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TELEGRAM_BOT_TOKEN}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          wpPostId,
          lang,
          content,
          asDraft,
          translationsMap: translations,
          mediaId,
        }),
      })
    );

    const result = (await response.json()) as TranslatorResponse;
    if (!response.ok || !result.success || !result.id) {
      throw new Error(
        result.error || `Translator Worker ${response.status} döndürdü`
      );
    }

    translations[lang] = result.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      db,
      'ERROR',
      `"${lang.toUpperCase()}" çeviri/yayın işlemi başarısız: ${message}`
    );
  }
}

async function linkPostTranslations(
  postId: number,
  lang: string,
  translations: TranslationMap,
  env: Env
): Promise<boolean> {
  const credentials = btoa(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`);
  const bridgeUrl =
    `${env.WP_SITE_URL}/wp-json/galaktikuzay/v1/set-post-translations`;

  try {
    const response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        post_id: postId,
        lang,
        translations,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(
        `Translation linking failed (${response.status}): ${detail}`
      );
      return false;
    }

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error('Translation linking failed:', error);
    return false;
  }
}
