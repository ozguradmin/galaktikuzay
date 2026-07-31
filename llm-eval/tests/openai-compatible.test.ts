import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/providers/openai-compatible.js";
import type {
  DatasetRecord,
  ProviderConfig,
  ResponseFormatMode,
} from "../src/types.js";

const record: DatasetRecord = {
  id: "article-test",
  task: "article-generation",
  input: { language: "tr", sources: [] },
};

function config(responseFormatMode: ResponseFormatMode): ProviderConfig {
  return {
    name: "baseline",
    baseUrl: "https://provider.example/v1",
    apiKey: "test-placeholder-key",
    apiKeyHeader: "authorization",
    model: "test-model",
    headers: {},
    query: {},
    timeoutMs: 1_000,
    maxRetries: 0,
    responseFormatMode,
  };
}

function response(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function successResponse(): Response {
  return response(200, {
    model: "test-model",
    choices: [{ message: { content: '{"title":"Synthetic"}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI-compatible response format modes", () => {
  it("omits response_format in none mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAICompatibleProvider(config("none")).complete(record, 0);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestBody(fetchMock)).not.toHaveProperty("response_format");
  });

  it("sends json_object in json_object mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAICompatibleProvider(config("json_object")).complete(record, 0);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestBody(fetchMock)).toMatchObject({
      response_format: { type: "json_object" },
    });
  });

  it("falls back once without response_format for an unsupported auto request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(400, {
          error: { message: "Unsupported parameter: response_format" },
        }),
      )
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAICompatibleProvider(config("auto")).complete(
      record,
      0,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 0)).toHaveProperty("response_format");
    expect(requestBody(fetchMock, 1)).not.toHaveProperty("response_format");
    expect(result.retries).toBe(0);
    expect(result.responseFormatFallbacks).toBe(1);
  });

  it("does not fall back for an authorization error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(401, {
        error: { message: "Unauthorized; response_format was not evaluated" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new OpenAICompatibleProvider(config("auto")).complete(record, 0),
    ).rejects.toMatchObject({
      retries: 0,
      responseFormatFallbacks: 0,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
