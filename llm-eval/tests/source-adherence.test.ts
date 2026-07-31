import { describe, expect, it } from "vitest";
import { evaluateSourceAdherence } from "../src/evaluators/source-adherence.js";

describe("evaluateSourceAdherence", () => {
  it("accepts URLs from the supplied allowlist", () => {
    const url = "https://example.com/synthetic-source";
    expect(evaluateSourceAdherence(`Source: ${url}`, [url])).toMatchObject({
      adherent: true,
      unexpectedUrls: [],
    });
  });

  it("flags an invented URL", () => {
    const invented = "https://invalid.example/invented";
    expect(evaluateSourceAdherence(`Source: ${invented}`, [])).toMatchObject({
      adherent: false,
      unexpectedUrls: [invented],
    });
  });
});
