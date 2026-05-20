import type { CountryCode } from "libphonenumber-js";

export type PhoneCountryOption = {
  code: CountryCode;
  name: string;
  dial: string;
};

/** Pays proposés à l'inscription (Burkina par défaut + Afrique de l'Ouest). */
export const REGISTRATION_PHONE_COUNTRIES: PhoneCountryOption[] = [
  { code: "BF", name: "Burkina Faso", dial: "+226" },
  { code: "CI", name: "Côte d'Ivoire", dial: "+225" },
  { code: "ML", name: "Mali", dial: "+223" },
  { code: "NE", name: "Niger", dial: "+227" },
  { code: "SN", name: "Sénégal", dial: "+221" },
  { code: "TG", name: "Togo", dial: "+228" },
  { code: "BJ", name: "Bénin", dial: "+229" },
  { code: "GH", name: "Ghana", dial: "+233" },
  { code: "GN", name: "Guinée", dial: "+224" },
  { code: "CM", name: "Cameroun", dial: "+237" },
];

export const DEFAULT_PHONE_COUNTRY: CountryCode = "BF";

export function getPhoneCountryOption(code: CountryCode): PhoneCountryOption | undefined {
  return REGISTRATION_PHONE_COUNTRIES.find((c) => c.code === code);
}
