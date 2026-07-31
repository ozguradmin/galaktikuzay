const URL_PATTERN = /https?:\/\/[^\s"'<>\])}]+/g;

export interface SourceAdherenceResult {
  adherent: boolean;
  outputUrls: string[];
  unexpectedUrls: string[];
}

export function evaluateSourceAdherence(
  output: string,
  allowedUrls: string[],
): SourceAdherenceResult {
  const outputUrls = [...new Set(output.match(URL_PATTERN) ?? [])];
  const allowed = new Set(allowedUrls);
  const unexpectedUrls = outputUrls.filter((url) => !allowed.has(url));
  return {
    adherent: unexpectedUrls.length === 0,
    outputUrls,
    unexpectedUrls,
  };
}
