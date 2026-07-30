import type {
  NewsArticle,
  GeneratedContent,
  AzureOpenAIMessage,
  AzureOpenAIChatResponse,
  PublishedPost,
} from '../types';
import { CATEGORY_KEYWORDS } from '../config/constants';
import { getRecentPosts, getRelatedPostsByCategory, addLog } from './storageService';

const API_VERSION = '2025-04-01-preview';
const DEPLOYMENT = 'gpt-chat-latest-2';

// ─── Article Selection ────────────────────────────────────────────

/**
 * Use AI to pick the most interesting/relevant article from a list of candidates.
 */
export async function selectBestNews(
  articles: NewsArticle[],
  endpoint: string,
  apiKey: string
): Promise<NewsArticle> {
  if (articles.length === 0) {
    throw new Error('No candidate articles to select from');
  }
  if (articles.length === 1) {
    return articles[0];
  }

  // Cap at 15 articles to keep context manageable
  const subset = articles.slice(0, 15);

  const articleList = subset
    .map(
      (a, i) =>
        `[${i + 1}] Title: ${a.title}\nSource: ${a.domain}\nPublished: ${a.publishedDate ?? 'N/A'}\nSnippet: ${a.content.slice(0, 200)}\nURL: ${a.url}`
    )
    .join('\n\n');

  const systemPrompt = `Sen bir uzay ve astronomi editörüsün. Türkçe uzay blogu için en iyi haberi seçmelisin.

Seçim kriterleri (önem sırasına göre):
1. GÜNCELLIK — En yeni haberler öncelikli (published date'e bak)
2. Bilimsel önem ve yenilik değeri
3. Türk okuyucu kitlesinin ilgisini çekme potansiyeli
4. Görsel çekicilik (blog post olarak iyi olacak konular)
5. Güvenilir kaynak olması
6. Çok teknik olmayan, genel okuyucunun anlayabileceği konular

Sadece seçtiğin haberin numarasını (1-${subset.length}) JSON formatında döndür:
{"selected": <number>, "reason": "<kısa açıklama>"}`;

  const messages: AzureOpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: articleList },
  ];

  const responseText = await callAzureOpenAI(messages, endpoint, apiKey, 200);

  try {
    const parsed = JSON.parse(extractJson(responseText));
    const idx = parsed.selected - 1;
    if (idx >= 0 && idx < subset.length) {
      return subset[idx];
    }
  } catch {
    // If AI response isn't parseable, pick the highest-scored article
  }

  // Fallback: highest Tavily score
  return subset.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
}

// ─── Blog Post Generation ─────────────────────────────────────────

/**
 * Generate a complete Turkish blog post from a news article using Azure OpenAI.
 * Returns content with image placeholders that will be replaced later.
 */
export async function generateBlogPost(
  article: NewsArticle,
  endpoint: string,
  apiKey: string,
  db: D1Database
): Promise<GeneratedContent> {
  // Detect category beforehand to fetch related posts from same category (silo linking)
  const detectedCategory = autoCategories(article.title + ' ' + (article.snippet ?? ''))[0] || 'Uzay';
  const relatedPosts = await getRelatedPostsByCategory(db, detectedCategory, 3);
  const recentPosts = await getRecentPosts(db, 2);

  // Merge and deduplicate, filtering out drafts (posts with empty/null slugs)
  const combinedPosts = [];
  const seenIds = new Set<number>();
  for (const post of [...relatedPosts, ...recentPosts]) {
    if (post.slug && post.slug.trim() !== '' && !seenIds.has(post.wp_post_id)) {
      seenIds.add(post.wp_post_id);
      combinedPosts.push(post);
    }
  }

  const internalLinksContext = formatRecentPosts(combinedPosts.slice(0, 5));
  const systemPrompt = buildBlogPrompt(internalLinksContext);

  const userPrompt = `Aşağıdaki haberi Türkçe blog yazısına dönüştür:

Başlık: ${article.title}
Kaynak: ${article.domain}
URL: ${article.url}
Yayın tarihi: ${article.publishedDate ?? 'Bilinmiyor'}
İçerik:
${article.content}`;

  const messages: AzureOpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  await addLog(db, 'INFO', 'Generating blog post via Azure OpenAI', JSON.stringify({ title: article.title }));

  const responseText = await callAzureOpenAI(messages, endpoint, apiKey, 6000);
  const parsed = JSON.parse(extractJson(responseText));

  // Auto-categorize based on keywords if AI didn't provide categories
  const categories =
    parsed.categories && parsed.categories.length > 0
      ? parsed.categories
      : autoCategories(parsed.title + ' ' + parsed.content_html);

  const contentHtml = parsed.content_html as string;
  const wordCount = countTurkishWords(contentHtml);

  return {
    title: parsed.title,
    meta_description: parsed.meta_description,
    content_html: contentHtml,
    categories,
    tags: parsed.tags ?? [],
    image_search_query: parsed.image_search_query ?? article.title,
    inline_image_queries: parsed.inline_image_queries ?? [],
    source_url: article.url,
    source_title: article.title,
    source_domain: article.domain,
    word_count: wordCount,
    social_sharing_kit: parsed.social_sharing_kit,
  };
}

// ─── Azure OpenAI Call ────────────────────────────────────────────

async function callAzureOpenAI(
  messages: AzureOpenAIMessage[],
  endpoint: string,
  apiKey: string,
  maxTokens: number
): Promise<string> {
  const url = `${endpoint}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

  const body: Record<string, unknown> = {
    messages,
    max_completion_tokens: maxTokens,
    // NOTE: No temperature parameter — gpt-chat-latest-2 doesn't support it
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure OpenAI ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as AzureOpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Azure OpenAI returned empty response');
  }

  return content;
}

// ─── Prompt Template ──────────────────────────────────────────────

function buildBlogPrompt(internalLinksContext: string): string {
  return `Sen galaktikuzay.com sitesinde yazı yazan deneyimli bir bilim muhabirisin. Uzay, astronomi ve bilim konularında Türkçe blog yazıları yazıyorsun.

## KİMLİĞİN
- Bir insan yazarsın, makine değil. Kendi fikirlerini ve yorumlarını ekliyorsun.
- Okuyucuyla doğrudan konuşuyorsun ("sen" kullan veya genel hitap).
- Akademik makale değil, sürükleyici ve merak uyandıran bir blog yazısı yazıyorsun.

## GÖREV
Verilen İngilizce uzay haberini orijinal bir Türkçe blog yazısına dönüştür. Bu bir çeviri DEĞİL — haberi kendi kelimelerinle yeniden yaz.

## YAZI KURALLARI & GEO OPTİMİZASYONU (2026)

### 1. Hızlı Özet ve Atomic Answer (AEO)
- Makalenin en başında (birinci H2 başlığından önce), haberi 40-60 kelime ile özetleyen kalın (bold) bir paragraf ekle.
- Bu paragrafı şu HTML yapısı içerisine al (bu sayede yapay zeka arama motorları bu özeti doğrudan alıntılayıp siteni kaynak gösterir):
  <div class="aeo-summary"><p><strong>Hızlı Özet:</strong> [Buraya doğrudan, dolayısız ve net bir şekilde haberi ve anahtar sorunun cevabını yaz. Merak uyandıran, botların kolayca parse edebileceği bir dil kullan.]</p></div>

### 2. Bilgi Yoğunluğu ve HTML Tabloları
- Haberde geçen tüm sayısal verileri (mesafeler, sıcaklıklar, hızlar, kütleler vb.) yazının uygun bir yerinde (örneğin ortalarına doğru) temiz bir HTML <table> tablosu olarak özetle. Örnek:
  <table class="space-data-table"><thead><tr><th>Parametre</th><th>Değer</th></tr></thead><tbody><tr><td>Uzaklık</td><td>10 Milyar Işık Yılı</td></tr><tr><td>Kütle</td><td>Güneş'in 5 Milyar Katı</td></tr></tbody></table>
  Arama motorları ve veri tabanlı AI sistemleri bu yapılandırılmış tablolara öncelik verir.

### 3. Uzunluk ve Yapı
- **En az 1200 kelime, en fazla 1800 kelime** uzunluğunda yaz. Kısa yazma.
- **H2 başlıklar**: En az 3-4 adet. Başlıkların en az yarısı soru formatında (conversational) olmalı (Örn: "Peki bu keşif bizim için ne anlama geliyor?").
- **Paragraflar**: 1-4 cümle. Kısa paragraflar! Mobilde okunabilirlik önemli.

### 4. Dış Kaynaklar ve E-E-A-T
- Orijinal haber kaynağına ve varsa NASA, ESA, Nature gibi resmi kurumlara atıfta bulun.
- Yazının sonuna "Kaynaklar" veya "Referanslar" bölümü ekle ve linkleri <a href="URL" target="_blank" rel="noopener noreferrer">Kaynak Adı</a> formatında ver.

### 5. Dahili (İç) Linkler
Yazının içinde doğal bir şekilde aşağıdaki önceki yazılara bağlantı ekle:
${internalLinksContext || 'Henüz önceki yazı yok.'}
En az 2-3 internal link kullan. Bağlantı metinleri (anchor text) asla "tıklayın" veya "yazı" gibi jenerik olmamalı; doğrudan ilgili konuyu açıklamalıdır.

### 6. Görsel Yerleri
İçerikte **tam olarak 3 adet** görsel placeholder'ı bırak. Format (aynen bu şekilde):
<figure class="wp-block-image aligncenter"><img src="INLINE_IMAGE_1" alt="[görselin açıklaması]" /><figcaption>[kısa açıklama]</figcaption></figure>
<figure class="wp-block-image aligncenter"><img src="INLINE_IMAGE_2" alt="[görselin açıklaması]" /><figcaption>[kısa açıklama]</figcaption></figure>
<figure class="wp-block-image aligncenter"><img src="INLINE_IMAGE_3" alt="[görselin açıklaması]" /><figcaption>[kısa açıklama]</figcaption></figure>

### 7. Yapay Zeka Şablonları ve Yasaklı Kelimeler (AI SLOP)
Aşağıdaki kalıpları kesinlikle KULLANMA. Bunlar arama motorlarının içeriği "değersiz AI içeriği" olarak sınıflandırmasına yol açar:
- "Günümüz dünyasında", "Hızla gelişen teknoloji çağında", "son yıllarda"
- "Kapsamlı bir şekilde", "çok yönlü bir perspektiften", "derinlemesine incelediğimizde"
- "Büyük bir önem taşımaktadır", "kritik bir rol oynamaktadır", "vazgeçilmez bir unsurdur"
- "Hiç şüphesiz", "kuşkusuz", "son derece", "oldukça önemli"
- "Değerlendirilmektedir", "ele alınmaktadır", "gözlemlenmektedir" (aktif fiiller kullan: "keşfetti", "açıkladı")
- "Bu bağlamda", "bu çerçevede", "bu doğrultuda"
- "-mektedir/-maktadır" ile biten akademik ve resmi diller. Yazı samimi, akıcı ve aktif olmalıdır.

### 8. Yapılandırılmış FAQ Schema (JSON-LD)
Yazının en sonuna, konuyla ilgili en çok sorulan 2-3 soruyu içeren bir SSS (FAQ) bölümü ekle. Ardından, bu soruları ve cevapları içeren bir JSON-LD şemasını <script type="application/ld+json">...</script> etiketi içinde html içeriğinin (content_html) en sonuna yapıştır. Örnek:
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Soru 1?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Cevap 1"
      }
    }
  ]
}
</script>

## HTML FORMAT
Sadece H2, H3, <p>, <ul>, <li>, <strong>, <em>, <a>, <table>, <blockquote> ve <script> etiketlerini kullan.

## ÇIKTI FORMATI
Yanıtını SADECE aşağıdaki JSON formatında ver. Başka hiçbir şey ekleme, açıklama yapma:
{
  "title": "Türkçe başlık (45-65 karakter)",
  "meta_description": "SEO meta açıklaması (130-155 karakter)",
  "content_html": "<p>Özet kutusu...</p><h2>Başlık</h2><p>İçerik...</p><table>...</table><script type=\"application/ld+json\">...</script>",
  "categories": ["Uzay"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "image_search_query": "English query for featured image",
  "inline_image_queries": ["query 1", "query 2", "query 3"],
  "social_sharing_kit": {
    "twitter_hook": "X/Twitter için dikkat çekici, kısa, emoji içeren paylaşım metni (link içermesin, linki biz ekleyeceğiz)",
    "reddit_post": "Reddit'te paylaşmaya uygun, r/space veya benzeri bir kanalda ilgi çekecek başlık ve kısa açıklama içeren metin taslağı"
  }
}

## KATEGORİ SEÇENEKLERİ
Şu kategorilerden 1-2 tane seç: Uzay, Astronomi, Teknoloji, Keşifler

## TAG KURALLARI
- 5-7 tag kullan, Türkçe olmalı, konuyla ilgili olmalı.`;
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatRecentPosts(posts: PublishedPost[]): string {
  if (posts.length === 0) return '';

  return posts
    .map((p) => {
      const url = p.slug ? `https://galaktikuzay.com/${p.slug}` : `https://galaktikuzay.com/?p=${p.wp_post_id}`;
      return `- [${p.title}](${url})`;
    })
    .join('\n');
}

function autoCategories(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matched.push(category);
    }
  }

  return matched.length > 0 ? matched.slice(0, 2) : ['Uzay'];
}

function countTurkishWords(html: string): number {
  // Strip HTML tags
  const text = html.replace(/<[^>]+>/g, ' ');
  // Split on whitespace, filter empty
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

/**
 * Extract a JSON object from text that might have markdown fences or extra content.
 */
function extractJson(text: string): string {
  // Try to find JSON inside code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text;
}

