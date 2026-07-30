import type {
  GeneratedContent,
  SupportedLanguage,
} from './types';
import { addLog } from './storage';

const API_VERSION = '2025-04-01-preview';
const DEPLOYMENT = 'gpt-chat-latest-2';
const MAX_RETRIES = 3;

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  nl: 'Dutch',
};

export async function translateContent(
  content: GeneratedContent,
  targetLang: SupportedLanguage,
  endpoint: string,
  apiKey: string,
  db: D1Database
): Promise<GeneratedContent> {
  const targetLanguageName = LANGUAGE_NAMES[targetLang];

  await addLog(
    db,
    'INFO',
    `Translating content to ${targetLanguageName} (${targetLang})...`,
    JSON.stringify({ originalTitle: content.title })
  );

  const systemPrompt = `You are a professional science journalist and translator. Your task is to translate a Turkish space/astronomy blog post JSON into highly natural, fluent, and engaging ${targetLanguageName}.

## CRITICAL TRANSLATION RULES:
1. **Output Format**: Return ONLY a valid JSON object matching the input structure. Do not wrap it in markdown code blocks or add any conversational text.
2. **HTML Formatting & Structure**: In "content_html", you must translate all Turkish texts (headings, body text, table headers and cells, FAQ questions/answers). Do NOT modify or remove any HTML tags, CSS classes (like "aeo-summary", "space-data-table", "wp-block-image", "aligncenter"), styles, or figures.
3. **Images**: Keep all <img> and <figure> tags exactly as they are. Do not modify the image "src" URLs. Translate the "alt" attributes and <figcaption> text to ${targetLanguageName} naturally.
4. **Links**: Maintain all <a> anchor links. Keep the href URLs exactly the same. Do not translate the URL paths, but translate the link text inside the anchor tags.
5. **JSON-LD FAQ Schema**: SSS (FAQ) section at the bottom of the page and the corresponding <script type="application/ld+json"> tag containing the FAQ schema must be fully translated. Ensure the JSON schema inside the script tag is valid and translated to match the translated FAQ.
6. **Summary Label**: If there is a bold label like "Hızlı Özet:" inside the <div class="aeo-summary">, YOU MUST translate it to the natural equivalent in ${targetLanguageName} (e.g. "Zusammenfassung:" for German, "Résumé Rapide:" for French, "Resumen Rápido:" for Spanish, "Quick Summary:" for English).
7. **Editorial Note**: There is an editorial commentary section inside <div class="guz-editorial-note">. Translate this preserving the personal, subjective, and engaging tone of an editor (e.g., using first-person language if present). Do not sound like an AI.
8. **SEO Elements**:
   - Translate the "title" (should be 45-65 characters in ${targetLanguageName}).
   - Translate the "meta_description" (should be 130-155 characters in ${targetLanguageName}).
   - Translate "categories" (e.g., "Uzay" -> "Space", "Astronomi" -> "Astronomy", "Teknoloji" -> "Technology", "Keşifler" -> "Discoveries").
   - Translate "tags" naturally to ${targetLanguageName}.
9. **Social Sharing**: Translate "social_sharing_kit.twitter_hook" and "social_sharing_kit.reddit_post" to natural, engaging ${targetLanguageName} with appropriate emojis. Do not include link placeholders, just translate the copy.
10. **Writing Tone**: Do not use direct literal translation. Write as if the article was originally written in ${targetLanguageName} by a professional science writer. Avoid AI slop words.`;

  const input = {
    title: content.title,
    meta_description: content.meta_description,
    content_html: content.content_html,
    categories: content.categories,
    tags: content.tags,
    social_sharing_kit: content.social_sharing_kit,
  };

  const responseText = await callAzureOpenAI(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Translate the following Turkish blog post JSON into ` +
          `${targetLanguageName}:\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
    endpoint,
    apiKey,
    6000
  );

  try {
    const parsed = JSON.parse(extractJson(responseText)) as Partial<GeneratedContent>;
    let finalHtml = parsed.content_html || content.content_html;

    const internalLinkPattern =
      /href="https:\/\/galaktikuzay\.com\/(?!wp-content\/|wp-json\/|wp-admin\/|wp-includes\/)([^"]*)"/g;
    finalHtml = finalHtml.replace(
      internalLinkPattern,
      `href="https://galaktikuzay.com/${targetLang}/$1"`
    );

    return {
      title: parsed.title || content.title,
      meta_description:
        parsed.meta_description || content.meta_description,
      content_html: finalHtml,
      categories: parsed.categories || content.categories,
      tags: parsed.tags || content.tags,
      image_search_query: content.image_search_query,
      inline_image_queries: content.inline_image_queries,
      source_url: content.source_url,
      source_title: content.source_title,
      source_domain: content.source_domain,
      word_count: countWords(finalHtml),
      social_sharing_kit:
        parsed.social_sharing_kit || content.social_sharing_kit,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      db,
      'ERROR',
      `Translation to ${targetLanguageName} failed: ${message}`
    );
    throw error;
  }
}

async function callAzureOpenAI(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  endpoint: string,
  apiKey: string,
  maxTokens: number
): Promise<string> {
  const url =
    `${endpoint}/openai/deployments/${DEPLOYMENT}/chat/completions` +
    `?api-version=${API_VERSION}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          messages,
          max_completion_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < MAX_RETRIES) {
          await wait(2 ** attempt * 1000);
          continue;
        }
        throw new Error(
          `Azure OpenAI translation failed (${response.status}): ${detail}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const result = data.choices?.[0]?.message?.content;
      if (result) return result;

      if (attempt < MAX_RETRIES) {
        await wait(2 ** attempt * 1000);
        continue;
      }
      throw new Error(
        `Azure OpenAI returned empty response after ${MAX_RETRIES} attempts`
      );
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      await wait(2 ** attempt * 1000);
    }
  }

  throw new Error('Azure OpenAI failed after all retry attempts');
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch?.[0] || text;
}

function countWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
