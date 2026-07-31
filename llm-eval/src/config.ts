import type {
  ProviderConfig,
  ProviderName,
  ResponseFormatMode,
} from "./types.js";

const RESPONSE_FORMAT_MODES = ["auto", "json_object", "none"] as const;

function optionalNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return value;
}

function jsonObject(name: string): Record<string, string> {
  const raw = process.env[name];
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON.`);
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${name} must be a JSON object.`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item)]),
  );
}

function responseFormatMode(name: string): ResponseFormatMode {
  const value = process.env[name] ?? "auto";
  if (!RESPONSE_FORMAT_MODES.includes(value as ResponseFormatMode)) {
    throw new Error(
      `${name} must be one of: ${RESPONSE_FORMAT_MODES.join(", ")}.`,
    );
  }
  return value as ResponseFormatMode;
}

export function loadProviderConfig(name: ProviderName, mock: boolean): ProviderConfig {
  const prefix = name.toUpperCase();
  const baseUrl = process.env[`${prefix}_BASE_URL`] ?? "";
  const apiKey = process.env[`${prefix}_API_KEY`] ?? "";
  const model = process.env[`${prefix}_MODEL`] ?? (mock ? `${name}-mock-model` : "");

  if (!mock) {
    const missing = [
      !baseUrl && `${prefix}_BASE_URL`,
      !apiKey && `${prefix}_API_KEY`,
      !model && `${prefix}_MODEL`,
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(
        `Missing configuration for ${name}: ${missing.join(", ")}. ` +
          "Set local environment variables or run with --mock.",
      );
    }
  }

  return {
    name,
    baseUrl,
    apiKey,
    apiKeyHeader: process.env[`${prefix}_API_KEY_HEADER`] ?? "authorization",
    model,
    headers: jsonObject(`${prefix}_HEADERS_JSON`),
    query: jsonObject(`${prefix}_QUERY_JSON`),
    inputCostPerMillion: optionalNumber(`${prefix}_INPUT_COST_PER_MILLION`),
    outputCostPerMillion: optionalNumber(`${prefix}_OUTPUT_COST_PER_MILLION`),
    timeoutMs: optionalNumber("REQUEST_TIMEOUT_MS") ?? 60_000,
    maxRetries: optionalNumber("MAX_RETRIES") ?? 2,
    responseFormatMode: responseFormatMode(`${prefix}_RESPONSE_FORMAT_MODE`),
  };
}
