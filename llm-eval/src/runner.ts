import type {
  CompletionResult,
  DatasetRecord,
  EvaluationMetrics,
  EvaluationResult,
  ProviderConfig,
} from "./types.js";
import { evaluateJsonValidity } from "./evaluators/json-validity.js";
import { evaluateLanguageConsistency } from "./evaluators/language-consistency.js";
import { estimateCost } from "./evaluators/performance.js";
import { evaluateRequiredFields } from "./evaluators/required-fields.js";
import { evaluateSchemaCompliance } from "./evaluators/schema-compliance.js";
import { evaluateSourceAdherence } from "./evaluators/source-adherence.js";
import {
  mockCompletion,
  OpenAICompatibleProvider,
  ProviderRequestError,
} from "./providers/openai-compatible.js";

interface RunRecordOptions {
  record: DatasetRecord;
  config: ProviderConfig;
  temperature: number;
  mock: boolean;
  schema?: object;
}

function metricsFor(
  completion: CompletionResult,
  record: DatasetRecord,
  config: ProviderConfig,
  schema?: object,
): { parsed: unknown | null; metrics: EvaluationMetrics } {
  const json = evaluateJsonValidity(completion.content);
  const required = evaluateRequiredFields(
    json.parsed,
    record.expected?.requiredFields ?? [],
  );
  const source = evaluateSourceAdherence(
    completion.content,
    record.expected?.allowedSourceUrls ?? [],
  );
  const schemaCompliant =
    json.valid && schema
      ? evaluateSchemaCompliance(json.parsed, schema).compliant
      : schema
        ? false
        : null;
  return {
    parsed: json.parsed,
    metrics: {
      jsonValid: json.valid,
      schemaCompliant,
      requiredFieldsPresent: required.present,
      missingRequiredFields: required.missing,
      sourceAdherent: source.adherent,
      unexpectedSourceUrls: source.unexpectedUrls,
      languageConsistent: evaluateLanguageConsistency(
        completion.content,
        record.input.targetLanguage ??
          record.expected?.targetLanguage ??
          record.input.language,
      ),
      latencyMs: completion.latencyMs,
      firstTokenLatencyMs: completion.firstTokenLatencyMs,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      totalTokens: completion.totalTokens,
      estimatedCostUsd: estimateCost(
        completion.inputTokens,
        completion.outputTokens,
        config.inputCostPerMillion,
        config.outputCostPerMillion,
      ),
    },
  };
}

function safeError(error: unknown, apiKey: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message;
}

export async function evaluateRecord({
  record,
  config,
  temperature,
  mock,
  schema,
}: RunRecordOptions): Promise<EvaluationResult> {
  let completion: CompletionResult;
  try {
    completion = mock
      ? await mockCompletion(record, config)
      : await new OpenAICompatibleProvider(config).complete(record, temperature);
  } catch (error) {
    const message = safeError(error, config.apiKey);
    const providerError = error instanceof ProviderRequestError ? error : null;
    return {
      id: record.id,
      task: record.task,
      provider: config.name,
      model: config.model,
      success: false,
      timedOut: providerError?.timedOut ?? /timed out/i.test(message),
      retries: providerError?.retries ?? 0,
      output: null,
      parsedOutput: null,
      metrics: null,
      error: message,
    };
  }
  const evaluated = metricsFor(completion, record, config, schema);
  return {
    id: record.id,
    task: record.task,
    provider: config.name,
    model: completion.model,
    success: true,
    timedOut: false,
    retries: completion.retries,
    output: completion.content,
    parsedOutput: evaluated.parsed,
    metrics: evaluated.metrics,
    error: null,
  };
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function consume(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => consume()),
  );
  return results;
}
