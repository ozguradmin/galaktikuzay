import { describe, expect, it } from "vitest";
import { evaluateJsonValidity } from "../src/evaluators/json-validity.js";

describe("evaluateJsonValidity", () => {
  it("parses valid JSON", () => {
    expect(evaluateJsonValidity('{"title":"Synthetic"}')).toEqual({
      valid: true,
      parsed: { title: "Synthetic" },
    });
  });

  it("rejects malformed JSON", () => {
    expect(evaluateJsonValidity("{not-json")).toEqual({ valid: false, parsed: null });
  });
});
