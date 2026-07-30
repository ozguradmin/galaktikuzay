import { Hono } from 'hono';
import type { Env, TranslationPayload } from './types';
import { addLog, saveTranslation } from './storage';
import { translateContent } from './translator';
import {
  linkPostTranslations,
  publishTranslation,
} from './wordpress';

const app = new Hono<{ Bindings: Env }>();

app.post('/api/internal/translate', async (c) => {
  const env = c.env;
  const authHeader = c.req.header('Authorization');

  if (
    !env.TELEGRAM_BOT_TOKEN ||
    authHeader !== `Bearer ${env.TELEGRAM_BOT_TOKEN}`
  ) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await c.req.json<TranslationPayload>();
  const {
    lang,
    content,
    asDraft,
    translationsMap,
    mediaId,
  } = payload;

  try {
    await addLog(
      env.DB,
      'INFO',
      `"[Translator] ${lang.toUpperCase()}" dili için çeviri başlatıldı...`
    );

    const translatedContent = await translateContent(
      content,
      lang,
      env.AZURE_OPENAI_ENDPOINT,
      env.AZURE_OPENAI_KEY,
      env.DB
    );

    await addLog(
      env.DB,
      'INFO',
      `"[Translator] ${lang.toUpperCase()}" sürümü WordPress'e gönderiliyor...`
    );

    const translatedPost = await publishTranslation(
      translatedContent,
      mediaId,
      env,
      asDraft,
      lang
    );

    translationsMap[lang] = translatedPost.id;
    const linked = await linkPostTranslations(
      translatedPost.id,
      lang,
      translationsMap,
      env
    );
    if (!linked) {
      await addLog(
        env.DB,
        'WARN',
        `"[Translator] ${lang.toUpperCase()}" Polylang eşlemesi tamamlanamadı`
      );
    }

    await saveTranslation(
      env.DB,
      translatedPost.id,
      translatedPost.slug,
      translatedContent,
      lang
    );

    await addLog(
      env.DB,
      'INFO',
      `"[Translator] ${lang.toUpperCase()}" sürümü başarıyla yayınlandı: ID ${translatedPost.id}`
    );

    return c.json({ success: true, id: translatedPost.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      env.DB,
      'ERROR',
      `"[Translator] ${lang.toUpperCase()}" sürümü işlenirken hata oluştu: ${message}`
    );
    return c.json({ error: message }, 500);
  }
});

app.get('/health', (c) =>
  c.json({ ok: true, service: 'galaktikuzay-translator' })
);

export default app;
