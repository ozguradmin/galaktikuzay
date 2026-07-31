import { describe, expect, it } from "vitest";
import { evaluateSchemaCompliance } from "../src/evaluators/schema-compliance.js";

const schema = {
  type: "object",
  required: ["title", "sources"],
  properties: {
    title: { type: "string" },
    sources: { type: "array" },
  },
};

describe("evaluateSchemaCompliance", () => {
  it("accepts a matching object", () => {
    expect(
      evaluateSchemaCompliance({ title: "Synthetic", sources: [] }, schema).compliant,
    ).toBe(true);
  });

  it("reports a missing required field", () => {
    const result = evaluateSchemaCompliance({ title: "Synthetic" }, schema);
    expect(result.compliant).toBe(false);
    expect(result.errors[0]?.keyword).toBe("required");
  });
});
