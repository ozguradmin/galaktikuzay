import type { SupportedLanguage } from './types';

export const CATEGORY_IDS: Record<
  SupportedLanguage,
  Record<string, number>
> = {
  en: {
    space: 128262,
    astronomy: 128533,
    technology: 128523,
    discoveries: 128491,
    general: 128209,
  },
  de: {
    weltraum: 128260,
    astronomie: 128535,
    technologie: 128525,
    entdeckungen: 128494,
    allgemein: 128214,
  },
  fr: {
    espace: 128256,
    astronomie: 128537,
    technologie: 128527,
    découvertes: 128500,
    général: 128219,
  },
  es: {
    espacio: 128258,
    astronomía: 128539,
    tecnología: 128529,
    descubrimientos: 128497,
    general: 128229,
  },
  nl: {
    ruimte: 128521,
    astronomie: 128541,
    technologie: 128531,
    ontdekkingen: 128503,
    algemeen: 128224,
  },
};

export const DEFAULT_CATEGORY_IDS: Record<SupportedLanguage, number> = {
  en: 128262,
  de: 128260,
  fr: 128256,
  es: 128258,
  nl: 128521,
};
