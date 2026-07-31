import { readFile } from "node:fs/promises";
import { TASK_TYPES, type DatasetRecord, type TaskType } from "../types.js";

function isTask(value: unknown): value is TaskType {
  return typeof value === "string" && TASK_TYPES.includes(value as TaskType);
}

export async function loadDataset(path: string): Promise<DatasetRecord[]> {
  const text = await readFile(path, "utf8");
  const records = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON on dataset line ${index + 1}.`);
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Dataset line ${index + 1} must be an object.`);
      }
      const record = value as Partial<DatasetRecord>;
      if (!record.id || !isTask(record.task) || !record.input) {
        throw new Error(`Dataset line ${index + 1} is missing id, task, or input.`);
      }
      return record as DatasetRecord;
    });
  if (records.length === 0) throw new Error("Dataset contains no records.");
  return records;
}
