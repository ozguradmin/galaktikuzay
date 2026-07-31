export interface JsonValidityResult {
  valid: boolean;
  parsed: unknown | null;
}

export function evaluateJsonValidity(output: string): JsonValidityResult {
  try {
    return { valid: true, parsed: JSON.parse(output) as unknown };
  } catch {
    return { valid: false, parsed: null };
  }
}
