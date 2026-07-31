#!/usr/bin/env node
import "dotenv/config";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadProviderConfig } from "./config.js";
import { writeCsvReport } from "./reporters/csv-reporter.js";
import { writeJsonReport } from "./reporters/json-reporter.js";
import { writeMarkdownReport } from "./reporters/markdown-reporter.js";
import { evaluateRecord, runWithConcurrency } from "./runner.js";
import { TASK_TYPES, type CliOptions, type ProviderName } from "./types.js";
import { loadDataset } from "./utils/dataset.js";

function help(): never {
  console.error(`Usage: npm run eval -- --dataset <jsonl> --task <task> --output <directory> [options]

Tasks: ${TASK_TYPES.join(", ")}
Options:
  --baseline-only       Evaluate only the baseline provider
  --candidate-only      Evaluate only the candidate provider
  --limit <number>      Limit dataset records
  --concurrency <n>     Concurrent provider requests (default: 2)
  --temperature <n>     Sampling temperature (default: 0)
  --mock                 Use deterministic local fixtures; make no API calls`);
  process.exit(1);
}

function parseNumber(name: string, value: string | undefined, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${name} must be a number greater than or equal to ${minimum}.`);
  }
  return parsed;
}

export function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    if (["--baseline-only", "--candidate-only", "--mock"].includes(argument)) {
      flags.add(argument);
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    values.set(argument, value);
  }
  const dataset = values.get("--dataset");
  const task = values.get("--task");
  const output = values.get("--output");
  if (!dataset || !task || !output) help();
  if (!TASK_TYPES.includes(task as CliOptions["task"])) {
    throw new Error(`Unsupported task: ${task}`);
  }
  const baselineOnly = flags.has("--baseline-only");
  const candidateOnly = flags.has("--candidate-only");
  if (baselineOnly && candidateOnly) {
    throw new Error("--baseline-only and --candidate-only cannot be combined.");
  }
  return {
    dataset,
    task: task as CliOptions["task"],
    output,
    baselineOnly,
    candidateOnly,
    limit: values.has("--limit")
      ? Math.floor(parseNumber("--limit", values.get("--limit"), 1))
      : undefined,
    concurrency: Math.floor(
      parseNumber("--concurrency", values.get("--concurrency") ?? "2", 1),
    ),
    temperature: parseNumber(
      "--temperature",
      values.get("--temperature") ?? "0",
      0,
    ),
    mock: flags.has("--mock"),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const allRecords = await loadDataset(resolve(options.dataset));
  const wrongTask = allRecords.find((record) => record.task !== options.task);
  if (wrongTask) {
    throw new Error(
      `Dataset record ${wrongTask.id} has task ${wrongTask.task}, expected ${options.task}.`,
    );
  }
  const records = allRecords.slice(0, options.limit);
  const providerNames: ProviderName[] = options.baselineOnly
    ? ["baseline"]
    : options.candidateOnly
      ? ["candidate"]
      : ["baseline", "candidate"];
  const configs = providerNames.map((name) => loadProviderConfig(name, options.mock));
  const schema =
    options.task === "article-generation"
      ? (JSON.parse(
          await readFile(resolve("schemas/article-output.schema.json"), "utf8"),
        ) as object)
      : undefined;
  const jobs = records.flatMap((record) => configs.map((config) => ({ record, config })));
  const startedAt = new Date().toISOString();
  const results = await runWithConcurrency(jobs, options.concurrency, ({ record, config }) =>
    evaluateRecord({
      record,
      config,
      temperature: options.temperature,
      mock: options.mock,
      schema,
    }),
  );
  const run = {
    metadata: {
      dataset: options.dataset,
      task: options.task,
      startedAt,
      completedAt: new Date().toISOString(),
      mock: options.mock,
      models: Object.fromEntries(configs.map((config) => [config.name, config.model])),
    },
    results,
  };
  const outputDirectory = resolve(options.output);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeJsonReport(outputDirectory, run),
    writeCsvReport(outputDirectory, run),
    writeMarkdownReport(outputDirectory, run),
  ]);
  console.log(`Evaluated ${records.length} sample(s) across ${configs.length} provider(s).`);
  console.log(`Reports written to ${outputDirectory}`);
  if (results.some((result) => !result.success)) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
