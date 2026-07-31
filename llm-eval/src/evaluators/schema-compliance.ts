import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

export interface SchemaComplianceResult {
  compliant: boolean;
  errors: ErrorObject[];
}

export function evaluateSchemaCompliance(
  value: unknown,
  schema: object,
): SchemaComplianceResult {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const compliant = validate(value);
  return { compliant, errors: validate.errors ?? [] };
}
