import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvaluationRun } from "../types.js";

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function writeCsvReport(
  outputDirectory: string,
  run: EvaluationRun,
): Promise<void> {
  const headers = [
    "id",
    "task",
    "provider",
    "model",
    "success",
    "timedOut",
    "retries",
    "jsonValid",
    "schemaCompliant",
    "requiredFieldsPresent",
    "sourceAdherent",
    "languageConsistent",
    "latencyMs",
    "firstTokenLatencyMs",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "estimatedCostUsd",
    "error",
  ];
  const rows = run.results.map((result) =>
    [
      result.id,
      result.task,
      result.provider,
      result.model,
      result.success,
      result.timedOut,
      result.retries,
      result.metrics?.jsonValid,
      result.metrics?.schemaCompliant,
      result.metrics?.requiredFieldsPresent,
      result.metrics?.sourceAdherent,
      result.metrics?.languageConsistent,
      result.metrics?.latencyMs,
      result.metrics?.firstTokenLatencyMs,
      result.metrics?.inputTokens,
      result.metrics?.outputTokens,
      result.metrics?.totalTokens,
      result.metrics?.estimatedCostUsd,
      result.error,
    ]
      .map(cell)
      .join(","),
  );
  await writeFile(
    join(outputDirectory, "results.csv"),
    `${headers.map(cell).join(",")}\n${rows.join("\n")}\n`,
  );
}
