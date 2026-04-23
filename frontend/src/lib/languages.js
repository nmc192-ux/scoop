/**
 * Supported UI + translation languages.
 *
 * `code`     — ISO 639-1 used as the MyMemory/DeepL/Google target.
 * `label`    — English name shown in the picker.
 * `native`   — the language's own endonym (for the picker).
 * `rtl`      — whether the script flows right-to-left.
 * `font`     — optional CSS `font-family` override for scripts that need it.
 * `flag`     — representative flag emoji; not a perfect mapping (many
 *              languages span countries) but a useful visual cue.
 */
export const LANGUAGES = [
  { code: "en", label: "English",    native: "English",    flag: "🇺🇸", rtl: false },
  { code: "es", label: "Spanish",    native: "Español",    flag: "🇪🇸", rtl: false },
  { code: "fr", label: "French",     native: "Français",   flag: "🇫🇷", rtl: false },
  { code: "de", label: "German",     native: "Deutsch",    flag: "🇩🇪", rtl: false },
  { code: "it", label: "Italian",    native: "Italiano",   flag: "🇮🇹", rtl: false },
  { code: "pt", label: "Portuguese", native: "Português",  flag: "🇵🇹", rtl: false },
  { code: "nl", label: "Dutch",      native: "Nederlands", flag: "🇳🇱", rtl: false },
  { code: "ru", label: "Russian",    native: "Русский",    flag: "🇷🇺", rtl: false },
  { code: "tr", label: "Turkish",    native: "Türkçe",     flag: "🇹🇷", rtl: false },
  { code: "pl", label: "Polish",     native: "Polski",     flag: "🇵🇱", rtl: false },
  { code: "ar", label: "Arabic",     native: "العربية",     flag: "🇸🇦", rtl: true  },
  { code: "fa", label: "Persian",    native: "فارسی",       flag: "🇮🇷", rtl: true  },
  { code: "ur", label: "Urdu",       native: "اُردُو",       flag: "🇵🇰", rtl: true,
    font: "'Noto Nastaliq Urdu', serif" },
  { code: "hi", label: "Hindi",      native: "हिन्दी",       flag: "🇮🇳", rtl: false },
  { code: "bn", label: "Bengali",    native: "বাংলা",        flag: "🇧🇩", rtl: false },
  { code: "id", label: "Indonesian", native: "Indonesia",  flag: "🇮🇩", rtl: false },
  { code: "ms", label: "Malay",      native: "Melayu",     flag: "🇲🇾", rtl: false },
  { code: "zh", label: "Chinese",    native: "中文",        flag: "🇨🇳", rtl: false },
  { code: "ja", label: "Japanese",   native: "日本語",       flag: "🇯🇵", rtl: false },
  { code: "ko", label: "Korean",     native: "한국어",        flag: "🇰🇷", rtl: false },
  { code: "sw", label: "Swahili",    native: "Kiswahili",  flag: "🇰🇪", rtl: false },
];

export const LANG_BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

export function isRtl(code) { return !!LANG_BY_CODE[code]?.rtl; }
export function nativeName(code) { return LANG_BY_CODE[code]?.native || code; }
export function langFlag(code) { return LANG_BY_CODE[code]?.flag || "🌐"; }
export function langFont(code) { return LANG_BY_CODE[code]?.font || undefined; }

/**
 * Country-code → likely primary language fallback. Used as a soft default
 * when a country is selected but the user hasn't picked a language yet.
 */
export const COUNTRY_TO_LANG = {
  US: "en", GB: "en", CA: "en", AU: "en", IE: "en", NZ: "en", ZA: "en", NG: "en",
  IN: "en", PK: "en", BD: "bn", LK: "en",
  DE: "de", AT: "de", CH: "de",
  FR: "fr", BE: "fr", LU: "fr",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es",
  IT: "it", PT: "pt", BR: "pt",
  NL: "nl", RU: "ru", UA: "ru",
  TR: "tr", PL: "pl",
  SA: "ar", AE: "ar", EG: "ar", MA: "ar", DZ: "ar", IQ: "ar", JO: "ar", LB: "ar", KW: "ar", QA: "ar", BH: "ar", OM: "ar",
  IR: "fa", AF: "fa",
  CN: "zh", TW: "zh", HK: "zh", SG: "zh",
  JP: "ja", KR: "ko",
  ID: "id", MY: "ms", PH: "en",
  KE: "sw", TZ: "sw", UG: "en",
};
