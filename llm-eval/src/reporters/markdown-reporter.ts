import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvaluationResult, EvaluationRun, ProviderName } from "../types.js";

export interface ProviderSummary {
  provider: ProviderName;
  model: string;
  samples: number;
  successes: number;
  errors: number;
  timeouts: number;
  retries: number;
  successRate: number;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  jsonValidityRate: number | null;
  schemaComplianceRate: number | null;
  estimatedCostUsd: number | null;
}

function rate(values: boolean[]): number | null {
  return values.length === 0
    ? null
    : values.filter(Boolean).length / values.length;
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

export function summarizeProvider(
  provider: ProviderName,
  results: EvaluationResult[],
): ProviderSummary {
  const selected = results.filter((result) => result.provider === provider);
  const completed = selected.filter((result) => result.metrics !== null);
  const latencies = completed.map((result) => result.metrics!.latencyMs);
  const costs = completed
    .map((result) => result.metrics!.estimatedCostUsd)
    .filter((value): value is number => value !== null);
  const schemaValues = completed
    .map((result) => result.metrics!.schemaCompliant)
    .filter((value): value is boolean => value !== null);
  return {
    provider,
    model: selected[0]?.model ?? "n/a",
    samples: selected.length,
    successes: selected.filter((result) => result.success).length,
    errors: selected.filter((result) => !result.success).length,
    timeouts: selected.filter((result) => result.timedOut).length,
    retries: selected.reduce((sum, result) => sum + result.retries, 0),
    successRate: selected.length === 0 ? 0 : selected.filter((r) => r.success).length / selected.length,
    averageLatencyMs:
      latencies.length === 0
        ? null
        : latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
    p95LatencyMs: percentile95(latencies),
    jsonValidityRate: rate(completed.map((result) => result.metrics!.jsonValid)),
    schemaComplianceRate: rate(schemaValues),
    estimatedCostUsd: costs.length === completed.length && costs.length > 0
      ? costs.reduce((sum, value) => sum + value, 0)
      : null,
  };
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function number(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}

function cost(value: number | null): string {
  return value === null ? "not configured" : `$${value.toFixed(6)}`;
}

export function renderMarkdown(run: EvaluationRun): string {
  const providers = (["baseline", "candidate"] as const)
    .filter((provider) => run.results.some((result) => result.provider === provider))
    .map((provider) => summarizeProvider(provider, run.results));
  const failures = run.results.filter((result) => !result.success);
  const lines = [
    "# LLM evaluation summary",
    "",
    `- Dataset: \`${run.metadata.dataset}\``,
    `- Task: \`${run.metadata.task}\``,
    `- Samples: ${new Set(run.results.map((result) => result.id)).size}`,
    `- Mode: ${run.metadata.mock ? "mock (no API calls)" : "live"}`,
    `- Started: ${run.metadata.startedAt}`,
    `- Completed: ${run.metadata.completedAt}`,
    "",
    "## Baseline and candidate comparison",
    "",
    "| Provider | Model | Success | Errors | Timeouts | Retries | Avg latency (ms) | p95 latency (ms) | JSON valid | Schema compliant | Estimated cost |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...providers.map(
      (summary) =>
        `| ${summary.provider} | ${summary.model} | ${percent(summary.successRate)} | ${summary.errors} | ${summary.timeouts} | ${summary.retries} | ${number(summary.averageLatencyMs)} | ${number(summary.p95LatencyMs)} | ${percent(summary.jsonValidityRate)} | ${percent(summary.schemaComplianceRate)} | ${cost(summary.estimatedCostUsd)} |`,
    ),
    "",
    "## Failed samples",
    "",
    ...(failures.length === 0
      ? ["No provider requests failed."]
      : failures.map(
          (result) =>
            `- \`${result.id}\` (${result.provider}): ${result.error ?? "unknown error"}`,
        )),
    "",
  ];
  return lines.join("\n");
}

export async function writeMarkdownReport(
  outputDirectory: string,
  run: EvaluationRun,
): Promise<void> {
  await writeFile(join(outputDirectory, "summary.md"), renderMarkdown(run));
}
