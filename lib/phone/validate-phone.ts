import examples from "libphonenumber-js/mobile/examples";
import {
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

import { getPhoneCountryOption } from "@/lib/phone/phone-countries";

export type PhoneValidationResult =
  | { ok: true; e164: string; national: string; international: string }
  | { ok: false; message: string };

/** Exemple national pour le placeholder (ex. Burkina : 70 12 34 56). */
export function getPhonePlaceholder(country: CountryCode): string {
  try {
    const ex = getExampleNumber(country, examples);
    if (ex) return ex.formatNational();
  } catch {
    /* ignore */
  }
  return "Numéro mobile";
}

function countryLabel(country: CountryCode): string {
  return getPhoneCountryOption(country)?.name ?? country;
}

/**
 * Valide un numéro pour le pays choisi (mobile).
 * Retourne le numéro en E.164 (+226…) pour stockage fiable.
 */
export function validatePhoneForCountry(raw: string, country: CountryCode): PhoneValidationResult {
  const input = raw.trim();
  if (!input) {
    return {
      ok: false,
      message: `Indiquez un numéro de téléphone mobile (${countryLabel(country)}).`,
    };
  }

  const parsed = parsePhoneNumberFromString(input, country);
  if (!parsed) {
    return {
      ok: false,
      message: `Numéro invalide pour ${countryLabel(country)}. Exemple : ${getPhonePlaceholder(country)}`,
    };
  }

  if (!parsed.isValid()) {
    return {
      ok: false,
      message: `Numéro invalide pour ${countryLabel(country)}. Exemple : ${getPhonePlaceholder(country)}`,
    };
  }

  const type = parsed.getType();
  if (type && type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") {
    return {
      ok: false,
      message: `Utilisez un numéro mobile valide pour ${countryLabel(country)}.`,
    };
  }

  return {
    ok: true,
    e164: parsed.format("E.164"),
    national: parsed.formatNational(),
    international: parsed.formatInternational(),
  };
}
