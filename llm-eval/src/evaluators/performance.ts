export function estimateCost(
  inputTokens: number | null,
  outputTokens: number | null,
  inputCostPerMillion?: number,
  outputCostPerMillion?: number,
): number | null {
  if (
    inputTokens === null ||
    outputTokens === null ||
    inputCostPerMillion === undefined ||
    outputCostPerMillion === undefined
  ) {
    return null;
  }
  return (
    (inputTokens * inputCostPerMillion + outputTokens * outputCostPerMillion) /
    1_000_000
  );
}
