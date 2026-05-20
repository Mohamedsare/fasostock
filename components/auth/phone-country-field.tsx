"use client";

import {
  DEFAULT_PHONE_COUNTRY,
  getPhoneCountryOption,
  REGISTRATION_PHONE_COUNTRIES,
  type PhoneCountryOption,
} from "@/lib/phone/phone-countries";
import { countryFlagEmoji } from "@/lib/phone/country-flag";
import { getPhonePlaceholder } from "@/lib/phone/validate-phone";
import { cn } from "@/lib/utils/cn";
import { Check, ChevronDown, Search } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type PhoneCountryFieldProps = {
  country: CountryCode;
  onCountryChange: (code: CountryCode) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
};

function CountryFlag({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[1.15rem] leading-none shadow-sm ring-1 ring-black/[0.06]",
        className,
      )}
      aria-hidden
    >
      {countryFlagEmoji(code)}
    </span>
  );
}

function CountryOptionRow({
  option,
  selected,
  onPick,
}: {
  option: PhoneCountryOption;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
          selected
            ? "bg-[color-mix(in_srgb,var(--fs-accent)_10%,white)] text-fs-text"
            : "text-neutral-800 hover:bg-neutral-50",
        )}
      >
        <CountryFlag code={option.code} />
        <span className="min-w-0 flex-1 truncate font-medium">{option.name}</span>
        <span className="shrink-0 tabular-nums text-neutral-500">{option.dial}</span>
        {selected ? <Check className="h-4 w-4 shrink-0 text-fs-accent" strokeWidth={2.5} /> : null}
      </button>
    </li>
  );
}

export function PhoneCountryField({
  country,
  onCountryChange,
  phone,
  onPhoneChange,
  disabled,
  id = "reg-phone",
  label = "Numéro WhatsApp",
}: PhoneCountryFieldProps) {
  const placeholder = useMemo(() => getPhonePlaceholder(country), [country]);
  const selected = getPhoneCountryOption(country);
  const dial = selected?.dial ?? "+226";
  const hintId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredCountries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REGISTRATION_PHONE_COUNTRIES;
    return REGISTRATION_PHONE_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  function pickCountry(code: CountryCode) {
    onCountryChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "group/phone relative rounded-2xl border border-neutral-300 bg-neutral-100 px-3 pb-2.5 pt-4 transition-colors",
          open && "border-fs-accent bg-white ring-2 ring-fs-accent/15",
          !open && "focus-within:border-fs-accent focus-within:bg-white focus-within:ring-2 focus-within:ring-fs-accent/15",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute -top-2.5 left-3 px-1.5 text-xs font-semibold text-fs-accent transition-colors",
            open || phone.length > 0 ? "bg-white" : "bg-neutral-100 group-focus-within/phone:bg-white",
          )}
        >
          {label}
        </label>

        <div className="flex items-center gap-0">
          <button
            type="button"
            disabled={disabled}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            onClick={() => setOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border-r border-neutral-300/90 py-1 pr-2.5 transition-colors hover:bg-black/[0.03]"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 text-neutral-500 transition-transform duration-200",
                open && "rotate-180",
              )}
              aria-hidden
              strokeWidth={2}
            />
            <CountryFlag code={country} className="h-5 w-5 text-base" />
            <span className="text-[15px] font-medium tabular-nums text-neutral-800">{dial}</span>
          </button>

          <input
            id={id}
            className="min-w-0 flex-1 bg-transparent py-1 pl-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-500"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={phone}
            disabled={disabled}
            onChange={(e) => onPhoneChange(e.target.value)}
            required
            placeholder={placeholder}
            aria-describedby={hintId}
          />
        </div>
      </div>

      {open ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_16px_40px_-8px_rgba(0,0,0,0.18)]"
          role="presentation"
        >
          <div className="border-b border-neutral-100 p-2">
            <div className="flex items-center gap-2 rounded-lg bg-neutral-100 px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un pays…"
                className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
                aria-label="Rechercher un pays"
              />
            </div>
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-label="Pays"
            className="max-h-[min(16rem,50vh)] overflow-y-auto overscroll-contain py-1"
          >
            {filteredCountries.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-neutral-500">Aucun pays trouvé.</li>
            ) : (
              filteredCountries.map((option) => (
                <CountryOptionRow
                  key={option.code}
                  option={option}
                  selected={option.code === country}
                  onPick={() => pickCountry(option.code)}
                />
              ))
            )}
          </ul>
        </div>
      ) : null}

      <p id={hintId} className="sr-only">
        Numéro mobile valide pour {selected?.name ?? DEFAULT_PHONE_COUNTRY}, exemple {placeholder}
      </p>
    </div>
  );
}
