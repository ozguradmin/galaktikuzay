import {
  CATEGORY_IDS,
  DEFAULT_CATEGORY_IDS,
} from './categories';
import type {
  Env,
  GeneratedContent,
  SupportedLanguage,
  WordPressPost,
} from './types';

export async function publishTranslation(
  content: GeneratedContent,
  mediaId: number | null,
  env: Env,
  asDraft: boolean,
  lang: SupportedLanguage
): Promise<WordPressPost> {
  const authHeader = makeAuthHeader(env.WP_USERNAME, env.WP_APP_PASSWORD);
  const wpApiUrl = `${env.WP_SITE_URL}/wp-json/wp/v2`;
  const languageCategories = CATEGORY_IDS[lang];
  const categoryIds = content.categories
    .map((name) => languageCategories[name.toLowerCase().trim()])
    .filter((id): id is number => Boolean(id));

  const postData: Record<string, unknown> = {
    title: content.title,
    content: content.content_html,
    excerpt: content.meta_description,
    status: asDraft ? 'draft' : 'publish',
    categories:
      categoryIds.length > 0
        ? categoryIds
        : [DEFAULT_CATEGORY_IDS[lang]],
  };
  if (mediaId) postData.featured_media = mediaId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${wpApiUrl}/posts`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(postData),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`WP post publish ${response.status}: ${detail}`);
    }

    const post = (await response.json()) as WordPressPost;
    await setYoastMeta(
      post.id,
      content.meta_description,
      wpApiUrl,
      authHeader
    );
    return post;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export async function linkPostTranslations(
  postId: number,
  lang: string,
  translations: Record<string, number>,
  env: Env
): Promise<boolean> {
  try {
    const response = await fetch(
      `${env.WP_SITE_URL}/wp-json/galaktikuzay/v1/set-post-translations`,
      {
        method: 'POST',
        headers: {
          Authorization: makeAuthHeader(
            env.WP_USERNAME,
            env.WP_APP_PASSWORD
          ),
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          post_id: postId,
          lang,
          translations,
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error(
        `Link translations failed (${response.status}): ${detail}`
      );
      return false;
    }

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error('Link translations error:', error);
    return false;
  }
}

function makeAuthHeader(username: string, appPassword: string): string {
  return `Basic ${btoa(`${username}:${appPassword}`)}`;
}

async function setYoastMeta(
  postId: number,
  metaDescription: string,
  wpApiUrl: string,
  authHeader: string
): Promise<void> {
  try {
    await fetch(`${wpApiUrl}/posts/${postId}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        meta: {
          _yoast_wpseo_metadesc: metaDescription,
        },
      }),
    });
  } catch {
    // Metadata is best-effort and must not block publishing.
  }
}
