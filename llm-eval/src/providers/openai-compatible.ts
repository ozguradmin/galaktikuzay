import type {
  CompletionResult,
  DatasetRecord,
  ProviderConfig,
  TaskType,
} from "../types.js";

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly retries: number,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

function completionUrl(config: ProviderConfig): URL {
  const trimmed = config.baseUrl.replace(/\/$/, "");
  const url = new URL(
    trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`,
  );
  for (const [key, value] of Object.entries(config.query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function systemPrompt(task: TaskType): string {
  const base = "Return only valid JSON. Never invent source URLs.";
  if (task === "story-selection") {
    return `${base} Select the strongest news candidate. Return selectedStoryId and reasoning.`;
  }
  if (task === "article-generation") {
    return `${base} Write a source-grounded article in the requested language. Return title, summary, content, and sources.`;
  }
  return `${base} Translate into the requested target language. Return targetLanguage and translatedText.`;
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class OpenAICompatibleProvider {
  constructor(private readonly config: ProviderConfig) {}

  async complete(
    record: DatasetRecord,
    temperature: number,
  ): Promise<CompletionResult> {
    let retries = 0;
    while (true) {
      const started = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          ...this.config.headers,
        };
        headers[this.config.apiKeyHeader] =
          this.config.apiKeyHeader.toLowerCase() === "authorization"
            ? `Bearer ${this.config.apiKey}`
            : this.config.apiKey;
        const response = await fetch(completionUrl(this.config), {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.model,
            temperature,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt(record.task) },
              { role: "user", content: JSON.stringify(record.input) },
            ],
          }),
        });
        const latencyMs = performance.now() - started;
        const payload = (await response.json()) as ChatCompletionResponse;
        if (!response.ok) {
          const message = payload.error?.message ?? `HTTP ${response.status}`;
          if (isRetryable(response.status) && retries < this.config.maxRetries) {
            retries += 1;
            await wait(250 * 2 ** (retries - 1));
            continue;
          }
          throw new ProviderRequestError(
            `Provider request failed: ${message}`,
            retries,
            false,
          );
        }
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
          throw new ProviderRequestError(
            "Provider returned no message content.",
            retries,
            false,
          );
        }
        return {
          content,
          model: payload.model ?? this.config.model,
          latencyMs,
          firstTokenLatencyMs: null,
          inputTokens: payload.usage?.prompt_tokens ?? null,
          outputTokens: payload.usage?.completion_tokens ?? null,
          totalTokens: payload.usage?.total_tokens ?? null,
          retries,
        };
      } catch (error) {
        if (error instanceof ProviderRequestError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
          if (retries < this.config.maxRetries) {
            retries += 1;
            continue;
          }
          throw new ProviderRequestError(
            `Request timed out after ${this.config.timeoutMs}ms.`,
            retries,
            true,
          );
        }
        if (retries < this.config.maxRetries) {
          retries += 1;
          await wait(250 * 2 ** (retries - 1));
          continue;
        }
        throw new ProviderRequestError(
          error instanceof Error ? error.message : String(error),
          retries,
          false,
        );
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

function mockPayload(record: DatasetRecord): Record<string, unknown> {
  if (record.task === "story-selection") {
    const first = record.input.candidates?.[0];
    return {
      selectedStoryId: first?.id ?? "synthetic-story-1",
      reasoning: "İlk sentetik aday daha güncel ve ilgili bir hikâyedir.",
    };
  }
  if (record.task === "translation") {
    const targetLanguage =
      record.input.targetLanguage ?? record.expected?.targetLanguage ?? "en";
    const translations: Record<string, string> = {
      en: "The synthetic text is a fictional test of the translation workflow.",
      de: "Der synthetische Text ist ein fiktiver Test für die Übersetzung.",
      es: "El texto sintético es una prueba ficticia para la traducción.",
      fr: "Le texte synthétique est un test fictif pour la traduction.",
      nl: "De synthetische tekst is een fictieve test voor de vertaling.",
    };
    return {
      targetLanguage,
      translatedText:
        translations[targetLanguage] ?? "Synthetic translated text produced by mock mode.",
    };
  }
  return {
    title: "Sentetik astronomi makalesi",
    summary: "Bu, ağ isteği olmadan üretilen kurgusal bir özettir.",
    content: "Bu içerik yalnızca yerel değerlendirme için sentetik bir test metnidir.",
    sources: (record.input.sources ?? []).map((source) => ({
      url: source.url,
      title: source.title,
    })),
  };
}

export async function mockCompletion(
  record: DatasetRecord,
  config: ProviderConfig,
): Promise<CompletionResult> {
  const started = performance.now();
  await Promise.resolve();
  const content = JSON.stringify(mockPayload(record));
  const inputTokens = Math.ceil(JSON.stringify(record.input).length / 4);
  const outputTokens = Math.ceil(content.length / 4);
  return {
    content,
    model: config.model,
    latencyMs: performance.now() - started,
    firstTokenLatencyMs: null,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    retries: 0,
  };
}
