const MARKERS: Record<string, string[]> = {
  tr: [" ve ", " bir ", " için ", " ile ", "ğ", "ş", "ı"],
  en: [" the ", " and ", " is ", " of ", " to "],
  de: [" der ", " die ", " und ", " ist ", " für "],
  es: [" el ", " la ", " de ", " y ", " para "],
  fr: [" le ", " la ", " de ", " et ", " pour "],
  nl: [" de ", " het ", " en ", " van ", " voor "],
};

export function evaluateLanguageConsistency(
  output: string,
  targetLanguage?: string,
): boolean | null {
  if (!targetLanguage) return null;
  const markers = MARKERS[targetLanguage.toLowerCase()];
  if (!markers) return null;
  const normalized = ` ${output.toLowerCase()} `;
  return markers.some((marker) => normalized.includes(marker));
}
