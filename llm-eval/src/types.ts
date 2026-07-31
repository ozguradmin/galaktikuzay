export const TASK_TYPES = ["story-selection", "article-generation", "translation"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type ProviderName = "baseline" | "candidate";

export interface Source {
  url: string;
  title?: string;
  content?: string;
}

export interface DatasetRecord {
  id: string;
  task: TaskType;
  input: {
    language?: string;
    targetLanguage?: string;
    sources?: Source[];
    candidates?: Array<Record<string, unknown>>;
    text?: string;
    [key: string]: unknown;
  };
  expected?: {
    requiredFields?: string[];
    allowedSourceUrls?: string[];
    targetLanguage?: string;
    [key: string]: unknown;
  };
}

export interface ProviderConfig {
  name: ProviderName;
  baseUrl: string;
  apiKey: string;
  apiKeyHeader: string;
  model: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  latencyMs: number;
  firstTokenLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  retries: number;
}

export interface EvaluationMetrics {
  jsonValid: boolean;
  schemaCompliant: boolean | null;
  requiredFieldsPresent: boolean;
  missingRequiredFields: string[];
  sourceAdherent: boolean;
  unexpectedSourceUrls: string[];
  languageConsistent: boolean | null;
  latencyMs: number;
  firstTokenLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface EvaluationResult {
  id: string;
  task: TaskType;
  provider: ProviderName;
  model: string;
  success: boolean;
  timedOut: boolean;
  retries: number;
  output: string | null;
  parsedOutput: unknown | null;
  metrics: EvaluationMetrics | null;
  error: string | null;
}

export interface RunMetadata {
  dataset: string;
  task: TaskType;
  startedAt: string;
  completedAt: string;
  mock: boolean;
  models: Partial<Record<ProviderName, string>>;
}

export interface EvaluationRun {
  metadata: RunMetadata;
  results: EvaluationResult[];
}

export interface CliOptions {
  dataset: string;
  task: TaskType;
  output: string;
  baselineOnly: boolean;
  candidateOnly: boolean;
  limit?: number;
  concurrency: number;
  temperature: number;
  mock: boolean;
}
