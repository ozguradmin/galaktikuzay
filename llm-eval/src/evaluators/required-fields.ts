export interface RequiredFieldsResult {
  present: boolean;
  missing: string[];
}

export function evaluateRequiredFields(
  value: unknown,
  requiredFields: string[],
): RequiredFieldsResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { present: false, missing: [...requiredFields] };
  }
  const object = value as Record<string, unknown>;
  const missing = requiredFields.filter(
    (field) => !(field in object) || object[field] === null || object[field] === "",
  );
  return { present: missing.length === 0, missing };
}
