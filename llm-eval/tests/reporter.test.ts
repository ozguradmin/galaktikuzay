import { describe, expect, it } from "vitest";
import { renderMarkdown, summarizeProvider } from "../src/reporters/markdown-reporter.js";
import type { EvaluationRun } from "../src/types.js";

const run: EvaluationRun = {
  metadata: {
    dataset: "data/synthetic.jsonl",
    task: "article-generation",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    mock: true,
    models: { baseline: "mock" },
  },
  results: [
    {
      id: "article-001",
      task: "article-generation",
      provider: "baseline",
      model: "mock",
      success: true,
      timedOut: false,
      retries: 0,
      output: "{}",
      parsedOutput: {},
      error: null,
      metrics: {
        jsonValid: true,
        schemaCompliant: true,
        requiredFieldsPresent: true,
        missingRequiredFields: [],
        sourceAdherent: true,
        unexpectedSourceUrls: [],
        languageConsistent: true,
        latencyMs: 20,
        firstTokenLatencyMs: null,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        estimatedCostUsd: null,
      },
    },
  ],
};

describe("markdown reporter", () => {
  it("summarizes reliability and latency", () => {
    expect(summarizeProvider("baseline", run.results)).toMatchObject({
      successes: 1,
      errors: 0,
      averageLatencyMs: 20,
      p95LatencyMs: 20,
    });
  });

  it("renders the comparison and unconfigured cost", () => {
    const markdown = renderMarkdown(run);
    expect(markdown).toContain("Baseline and candidate comparison");
    expect(markdown).toContain("not configured");
  });
});
