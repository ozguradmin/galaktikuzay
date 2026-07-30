import type { Env, GeneratedContent, WPPostResponse, WPMediaResponse } from '../types';
import { CONFIG } from '../config/constants';

// ─── Image Upload ─────────────────────────────────────────────────

/**
 * Download an image from a URL and upload it to the WordPress media library.
 */
export async function uploadImageToWP(
  imageUrl: string,
  attribution: string,
  env: Env
): Promise<WPMediaResponse | null> {
  try {
    // Download the image
    const imageResponse = await fetch(imageUrl, {
      headers: { 'User-Agent': 'GalaktikUzay-Bot/1.0' },
    });

    if (!imageResponse.ok) {
      throw new Error(`Image download failed: ${imageResponse.status}`);
    }

    const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
    const imageBuffer = await imageResponse.arrayBuffer();

    if (imageBuffer.byteLength === 0) {
      throw new Error('Downloaded image is empty');
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const ext = extMap[contentType] ?? 'jpg';
    const filename = `galaktikuzay-${Date.now()}.${ext}`;

    // Upload to WordPress
    const authHeader = makeAuthHeader(env.WP_USERNAME, env.WP_APP_PASSWORD);
    const wpApiUrl = `${env.WP_SITE_URL}/wp-json/wp/v2/media`;

    const uploadResponse = await fetch(wpApiUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': contentType,
      },
      body: imageBuffer,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`WP media upload ${uploadResponse.status}: ${errText}`);
    }

    const media = (await uploadResponse.json()) as WPMediaResponse;

    // Update the media alt text / caption with attribution
    await fetch(`${wpApiUrl}/${media.id}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        alt_text: attribution,
        caption: attribution,
      }),
    });

    return media;
  } catch (error) {
    console.error('Image upload failed:', error);
    return null;
  }
}

// ─── Post Publishing ──────────────────────────────────────────────

/**
 * Create a new WordPress post with categories, tags, featured image, and Yoast SEO data.
 * By default creates a DRAFT. Set asDraft=false to publish immediately.
 */
export async function publishPost(
  content: GeneratedContent,
  mediaId: number | null,
  env: Env,
  asDraft: boolean = false
): Promise<WPPostResponse> {
  const authHeader = makeAuthHeader(env.WP_USERNAME, env.WP_APP_PASSWORD);
  const wpApiUrl = `${env.WP_SITE_URL}/wp-json/wp/v2`;

  // Resolve category IDs from our known mapping (instant, no API calls)
  const categoryIds = content.categories
    .map((name) => CONFIG.WP_CATEGORIES[name])
    .filter((id): id is number => !!id);

  // Build post data
  const postData: Record<string, unknown> = {
    title: content.title,
    content: content.content_html,
    excerpt: content.meta_description,
    status: asDraft ? 'draft' : 'publish',
    categories: categoryIds.length > 0 ? categoryIds : [128245], // Default: Turkish "Uzay"
  };

  if (mediaId) {
    postData.featured_media = mediaId;
  }

  // Create the post
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

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

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`WP post publish ${response.status}: ${errText}`);
    }

    const wpPost = (await response.json()) as WPPostResponse;

    // Set tags and Yoast meta in parallel (best-effort, don't block)
    const tagPromise = setPostTags(wpPost.id, content.tags, wpApiUrl, authHeader);
    const yoastPromise = setYoastMeta(wpPost.id, content.meta_description, wpApiUrl, authHeader);
    await Promise.allSettled([tagPromise, yoastPromise]);

    return wpPost;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function makeAuthHeader(username: string, appPassword: string): string {
  const credentials = `${username}:${appPassword}`;
  const encoded = btoa(credentials);
  return `Basic ${encoded}`;
}

/**
 * Set tags on a post by updating it with tag names.
 * WordPress will auto-create tags that don't exist.
 */
async function setPostTags(
  postId: number,
  tagNames: string[],
  wpApiUrl: string,
  authHeader: string
): Promise<void> {
  if (tagNames.length === 0) return;

  try {
    // Resolve tag IDs in parallel (max 5 concurrent)
    const tagIds: number[] = [];
    const batchSize = 5;

    for (let i = 0; i < tagNames.length; i += batchSize) {
      const batch = tagNames.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (name) => {
          // Search first
          const searchRes = await fetch(
            `${wpApiUrl}/tags?search=${encodeURIComponent(name)}&per_page=1`,
            { headers: { Authorization: authHeader } }
          );
          if (searchRes.ok) {
            const tags = (await searchRes.json()) as Array<{ id: number; name: string }>;
            if (tags.length > 0) return tags[0].id;
          }

          // Create if not found
          const createRes = await fetch(`${wpApiUrl}/tags`, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({ name }),
          });
          if (createRes.ok) {
            const created = (await createRes.json()) as { id: number };
            return created.id;
          }
          return null;
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) tagIds.push(r.value);
      }
    }

    // Update post with resolved tag IDs
    if (tagIds.length > 0) {
      await fetch(`${wpApiUrl}/posts/${postId}`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ tags: tagIds }),
      });
    }
  } catch {
    // Tag assignment is best-effort
  }
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
    // Yoast meta update is best-effort
  }
}

