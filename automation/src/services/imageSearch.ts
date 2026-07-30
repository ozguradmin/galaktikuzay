import type { ImageResult, NasaImagesResponse, SerperResponse } from '../types';

/**
 * Find a relevant image for a blog post.
 * Priority: 1) NASA Images API (public domain), 2) Serper.dev image search.
 */
export async function findImage(
  query: string,
  serperKey: string
): Promise<ImageResult | null> {
  // Try NASA first — public domain, no copyright issues
  const nasaImage = await searchNasaImages(query);
  if (nasaImage) return nasaImage;

  // Fallback to Serper.dev
  const serperImage = await searchSerperImages(query, serperKey);
  if (serperImage) return serperImage;

  return null;
}

// ─── NASA Images API ──────────────────────────────────────────────

async function searchNasaImages(query: string): Promise<ImageResult | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      media_type: 'image',
      page_size: '5',
    });

    const response = await fetch(
      `https://images-api.nasa.gov/search?${params.toString()}`
    );

    if (!response.ok) return null;

    const data = (await response.json()) as NasaImagesResponse;
    const items = data.collection?.items;

    if (!items || items.length === 0) return null;

    // Find the first item with a usable image link
    for (const item of items) {
      const imageLink = item.links?.find(
        (l) => l.rel === 'preview' && l.render === 'image'
      );

      if (imageLink?.href) {
        // Get the high-res version by modifying the thumbnail URL
        const highResUrl = imageLink.href.replace('~thumb', '~medium');
        const title = item.data?.[0]?.title ?? 'NASA Image';

        return {
          url: highResUrl,
          attribution: `NASA / ${title}`,
          source: 'nasa',
          title,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Serper.dev Image Search ──────────────────────────────────────

async function searchSerperImages(
  query: string,
  apiKey: string
): Promise<ImageResult | null> {
  try {
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query + ' space astronomy',
        num: 10,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as SerperResponse;
    const images = data.images;

    if (!images || images.length === 0) return null;

    // Pick a reasonably sized image (at least 600px wide)
    const suitable = images.find(
      (img) => img.imageWidth >= 600 && img.imageHeight >= 300
    );
    const chosen = suitable ?? images[0];

    return {
      url: chosen.imageUrl,
      attribution: `${chosen.source} (${chosen.domain})`,
      source: 'serper',
      title: chosen.title,
    };
  } catch {
    return null;
  }
}
