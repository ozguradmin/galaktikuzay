import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvaluationRun } from "../types.js";

export async function writeJsonReport(
  outputDirectory: string,
  run: EvaluationRun,
): Promise<void> {
  await writeFile(join(outputDirectory, "results.json"), `${JSON.stringify(run, null, 2)}\n`);
}
