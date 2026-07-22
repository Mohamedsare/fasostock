"use client";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdCheck, MdExpandMore, MdSearch } from "react-icons/md";

type Option = { id: string; name: string };

/**
 * Liste déroulante avec recherche intégrée (combobox). Remplace un `<select>`
 * quand les options sont nombreuses. Le popover est rendu via un portail
 * (jamais coupé par le scroll d'un dialogue) et s'ouvre vers le haut s'il n'y a
 * pas assez de place en dessous.
 */
export function FsSearchSelect({
  value,
  options,
  onChange,
  placeholder = "—",
  searchPlaceholder = "Rechercher…",
  className,
  ariaLabel,
}: {
  value: string;
  options: Option[];
  onChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < 300 && r.top > spaceBelow;
      setPos({
        left: r.left,
        width: r.width,
        top: openUp ? undefined : r.bottom + 4,
        bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      });
    }
    setQuery("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          fsInputClass(),
          "flex items-center justify-between gap-2 text-left font-normal",
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={cn("truncate", !selected && "text-neutral-400")}>
          {selected ? selected.name : placeholder}
        </span>
        <MdExpandMore className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popRef}
              style={{
                position: "fixed",
                left: pos.left,
                width: pos.width,
                top: pos.top,
                bottom: pos.bottom,
                zIndex: 2147483647,
              }}
              className="overflow-hidden rounded-xl border border-black/10 bg-fs-card shadow-xl"
              role="listbox"
            >
              <div className="relative border-b border-black/[0.06] p-2">
                <MdSearch
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-lg border border-black/10 bg-white pl-9 pr-2 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
                  autoComplete="off"
                />
              </div>
              <ul className="max-h-52 overflow-y-auto py-1">
                <li>
                  <button
                    type="button"
                    onClick={() => pick("")}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
                  >
                    <span className="text-neutral-500">{placeholder}</span>
                    {value === "" ? <MdCheck className="h-4 w-4 shrink-0 text-fs-accent" aria-hidden /> : null}
                  </button>
                </li>
                {filtered.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => pick(o.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03]",
                        o.id === value && "bg-fs-accent/[0.06]",
                      )}
                    >
                      <span className="truncate text-fs-text">{o.name}</span>
                      {o.id === value ? (
                        <MdCheck className="h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                ))}
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-center text-sm text-neutral-400">Aucun résultat</li>
                ) : null}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
