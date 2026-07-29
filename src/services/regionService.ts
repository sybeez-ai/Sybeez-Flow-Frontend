/**
 * Region profile from signup country:
 * currency, locale, and which legal consent to show (GDPR / Terms).
 */

import { currencyService } from "@/services/currencyService";
import { netWorthService } from "@/services/netWorthService";
import { usGetItem, usSetItem, usGetJSON, usSetJSON } from "@/services/userStorage";

export type ConsentKind = "gdpr" | "terms_asia" | "terms_general";

export type RegionArea = "europe" | "asia" | "americas" | "africa" | "oceania" | "other";

export interface RegionProfile {
  country: string;
  countryCode: string;
  currency: string;
  locale: string;
  area: RegionArea;
  consentKind: ConsentKind;
  timezone?: string;
  detectedAt: string;
}

const PROFILE_KEY = "sybeez_region_profile";
const CONSENT_KEY = "sybeez_legal_consent";

/** ISO country → currency */
const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  IE: "EUR",
  FR: "EUR",
  DE: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  PT: "EUR",
  FI: "EUR",
  GR: "EUR",
  LU: "EUR",
  SK: "EUR",
  SI: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  MT: "EUR",
  CY: "EUR",
  HR: "EUR",
  CH: "CHF",
  SE: "SEK",
  NO: "USD", // NOK not in list — fall back handled below; use EUR-ish via USD rates
  DK: "EUR",
  PL: "EUR",
  CZ: "EUR",
  RO: "EUR",
  HU: "EUR",
  BG: "EUR",
  IN: "INR",
  JP: "JPY",
  CN: "CNY",
  HK: "HKD",
  SG: "SGD",
  AE: "AED",
  SA: "AED",
  KR: "USD",
  TH: "USD",
  MY: "USD",
  ID: "USD",
  PH: "USD",
  VN: "USD",
  PK: "USD",
  BD: "USD",
  LK: "USD",
  NP: "INR",
  AU: "AUD",
  NZ: "NZD",
  ZA: "ZAR",
  BR: "BRL",
  MX: "USD",
  AR: "USD",
  CL: "USD",
  CO: "USD",
};

const EU_EEA_UK = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "UK", "CH",
]);

const ASIA = new Set([
  "IN", "JP", "CN", "HK", "SG", "KR", "TW", "TH", "MY", "ID", "PH", "VN", "PK",
  "BD", "LK", "NP", "MM", "KH", "LA", "BN", "MN", "KZ", "UZ", "AE", "SA", "QA",
  "KW", "BH", "OM", "IQ", "IR", "IL", "JO", "LB", "TR",
]);

const AMERICAS = new Set([
  "US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "VE", "EC", "UY", "PY", "BO",
  "CR", "PA", "GT", "HN", "SV", "NI", "DO", "CU", "JM", "TT",
]);

const OCEANIA = new Set(["AU", "NZ", "FJ", "PG"]);

const AFRICA = new Set([
  "ZA", "NG", "EG", "KE", "GH", "MA", "TZ", "UG", "ET", "DZ", "TN",
]);

const COUNTRY_LOCALE: Record<string, string> = {
  US: "en-US",
  GB: "en-GB",
  IE: "en-IE",
  IN: "en-IN",
  AU: "en-AU",
  CA: "en-CA",
  FR: "fr-FR",
  DE: "de-DE",
  ES: "es-ES",
  IT: "it-IT",
  NL: "nl-NL",
  PT: "pt-PT",
  BR: "pt-BR",
  JP: "ja-JP",
  CN: "zh-CN",
  HK: "zh-HK",
  SG: "en-SG",
  AE: "ar-AE",
  SE: "sv-SE",
  CH: "de-CH",
  ZA: "en-ZA",
  NZ: "en-NZ",
};

const SUPPORTED_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "INR", "JPY", "CNY", "CAD", "AUD", "CHF", "AED", "SGD",
  "HKD", "SEK", "NZD", "ZAR", "BRL",
]);

export function areaFromCountryCode(code: string): RegionArea {
  const c = code.toUpperCase();
  if (EU_EEA_UK.has(c)) return "europe";
  if (ASIA.has(c)) return "asia";
  if (AMERICAS.has(c)) return "americas";
  if (OCEANIA.has(c)) return "oceania";
  if (AFRICA.has(c)) return "africa";
  return "other";
}

export function consentKindForArea(area: RegionArea): ConsentKind {
  if (area === "europe") return "gdpr";
  if (area === "asia") return "terms_asia";
  return "terms_general";
}

export function currencyForCountryCode(code: string): string {
  const c = code.toUpperCase();
  const mapped = COUNTRY_CURRENCY[c] || (EU_EEA_UK.has(c) ? "EUR" : "USD");
  return SUPPORTED_CURRENCIES.has(mapped) ? mapped : "USD";
}

export function localeForCountryCode(code: string): string {
  const c = code.toUpperCase();
  return COUNTRY_LOCALE[c] || (EU_EEA_UK.has(c) ? "en-GB" : "en-US");
}

export function buildRegionProfile(input: {
  country: string;
  countryCode: string;
}): RegionProfile {
  const countryCode = (input.countryCode || "").toUpperCase();
  const area = areaFromCountryCode(countryCode);
  return {
    country: input.country || "Unknown",
    countryCode,
    currency: currencyForCountryCode(countryCode),
    locale: localeForCountryCode(countryCode),
    area,
    consentKind: consentKindForArea(area),
    detectedAt: new Date().toISOString(),
  };
}

export function getRegionProfile(): RegionProfile | null {
  try {
    const raw = usGetItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RegionProfile;
  } catch {
    return null;
  }
}

export function saveRegionProfile(profile: RegionProfile): void {
  usSetItem(PROFILE_KEY, JSON.stringify(profile));
}

export interface LegalConsentRecord {
  kind: ConsentKind;
  accepted: boolean;
  acceptedAt: string;
  country: string;
  countryCode: string;
}

export function getLegalConsent(): LegalConsentRecord | null {
  try {
    const raw = usGetItem(CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LegalConsentRecord;
  } catch {
    return null;
  }
}

export function saveLegalConsent(record: LegalConsentRecord): void {
  usSetItem(CONSENT_KEY, JSON.stringify(record));
}

/** Apply currency / locale everywhere after registration. */
export function applyRegionProfile(profile: RegionProfile): void {
  saveRegionProfile(profile);
  currencyService.setBaseCurrency(profile.currency);
  try {
    netWorthService.setDisplayCurrency(profile.currency);
  } catch {
    /* optional */
  }

  try {
    const raw = usGetItem("sybeez_settings");
    const settings = raw ? JSON.parse(raw) : {};
    settings.preferences = {
      ...(settings.preferences || {}),
      currency: profile.currency,
      language: profile.locale.startsWith("fr")
        ? "fr"
        : profile.locale.startsWith("de")
          ? "de"
          : profile.locale.startsWith("es")
            ? "es"
            : profile.locale.startsWith("ja")
              ? "ja"
              : profile.locale.startsWith("zh")
                ? "zh"
                : "en",
    };
    settings.region = {
      country: profile.country,
      countryCode: profile.countryCode,
      area: profile.area,
      consentKind: profile.consentKind,
    };
    usSetItem("sybeez_settings", JSON.stringify(settings));
  } catch {
    /* ignore */
  }

  try {
    window.dispatchEvent(
      new CustomEvent("sybeez:region-changed", { detail: { profile } }),
    );
  } catch {
    /* ignore */
  }
}

export function consentCopy(kind: ConsentKind): {
  title: string;
  body: string;
  checkbox: string;
} {
  if (kind === "gdpr") {
    return {
      title: "GDPR consent",
      body: "Because you’re registering from Europe, we need your consent under GDPR to process your personal data to provide Sybeez Flow (account, finance & planner data you enter).",
      checkbox:
        "I agree to the processing of my personal data under GDPR and accept the Privacy Policy",
    };
  }
  if (kind === "terms_asia") {
    return {
      title: "Terms & conditions",
      body: "You’re registering from Asia. Please review and accept our Terms & Conditions to create your account.",
      checkbox: "I have read and accept the Terms & Conditions",
    };
  }
  return {
    title: "Terms of use",
    body: "Please accept our Terms of Service and Privacy Policy to create your account.",
    checkbox: "I accept the Terms of Service and Privacy Policy",
  };
}

/** Format money in the user's registered/base currency. */
export function formatAppMoney(amount: number): string {
  const code = currencyService.getBaseCurrency() || getRegionProfile()?.currency || "USD";
  return currencyService.format(amount || 0, code);
}

export function appCurrencyCode(): string {
  return currencyService.getBaseCurrency() || getRegionProfile()?.currency || "USD";
}

export function appCurrencySymbol(): string {
  return currencyService.getCurrency(appCurrencyCode()).symbol;
}
