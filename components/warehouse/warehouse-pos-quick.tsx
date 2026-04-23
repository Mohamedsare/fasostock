"use client";

import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";
import { MdClose, MdSearch, MdStore } from "react-icons/md";

/** Aligné `PosQuickColors` (Flutter `pos_quick_constants.dart`). */
export const POS_Q = {
  orange: "#F97316",
  orangeLight: "#FDBA74",
  bg: "#FFFFFF",
  bg2: "#F8F9FA",
  text: "#1F2937",
  border: "#E5E7EB",
} as const;

export function WarehousePosQuickHeader({
  title,
  subtitle,
  onClose,
  closeDisabled,
  titleId,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  /** Accessibilité — `aria-labelledby` du dialogue. */
  titleId?: string;
}) {
  return (
    <div
      className="flex h-[48px] shrink-0 items-center px-0.5 min-[900px]:h-[60px] min-[900px]:px-1"
      style={{ backgroundColor: POS_Q.orange }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 px-0.5 min-[900px]:gap-2 min-[900px]:px-1">
        <MdStore className="h-5 w-5 shrink-0 text-white min-[900px]:h-7 min-[900px]:w-7" aria-hidden />
        <div className="min-w-0 flex-1 py-0.5">
          <h2
            id={titleId}
            className="truncate text-[15px] font-bold leading-tight text-white min-[900px]:text-[18px]"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="truncate text-[10px] leading-snug text-white/95 min-[900px]:text-[13px]">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={closeDisabled}
        className="min-h-[40px] min-w-[40px] shrink-0 rounded-lg p-1 text-white min-[900px]:min-h-[44px] min-[900px]:min-w-[44px] min-[900px]:rounded-xl min-[900px]:p-2 disabled:opacity-40"
        aria-label="Fermer"
      >
        <MdClose className="mx-auto h-[18px] w-[18px] min-[900px]:h-6 min-[900px]:w-6" />
      </button>
    </div>
  );
}

/** `warehousePosQuickSearchDecoration` — préfixe loupe orange, bords 12px. */
export function WarehousePosQuickSearchInput({
  value,
  onChange,
  hintText,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  hintText: string;
  suffix?: ReactNode;
}) {
  return (
    <div className="relative h-[44px] min-[900px]:h-[55px]">
      <MdSearch
        className="pointer-events-none absolute left-2 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#F97316] min-[900px]:left-3 min-[900px]:h-6 min-[900px]:w-6"
        aria-hidden
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-full w-full rounded-[10px] border border-[#E5E7EB] bg-white pl-10 pr-2 text-[13px] text-[#1F2937] placeholder:text-[#1F2937]/50",
          "min-[900px]:rounded-[12px] min-[900px]:pl-12 min-[900px]:pr-3 min-[900px]:text-[15px]",
          "outline-none focus:border-2 focus:border-[#F97316]",
        )}
        placeholder={hintText}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 min-[900px]:right-3">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function WhCategoryChipsRow({
  categories,
  selectedId,
  onSelect,
}: {
  categories: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="h-9 shrink-0 overflow-x-auto overflow-y-hidden min-[900px]:h-11 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-1 px-2.5 pb-0.5 min-[900px]:gap-2 min-[900px]:px-4 min-[900px]:pb-1">
        <WhCategoryChip label="Tous" selected={selectedId === null} onClick={() => onSelect(null)} />
        {categories.map((c) => (
          <WhCategoryChip key={c.id} label={c.name} selected={selectedId === c.id} onClick={() => onSelect(c.id)} />
        ))}
      </div>
    </div>
  );
}

function WhCategoryChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border-2 px-2.5 py-1.5 text-[12px] font-semibold transition-colors min-[900px]:px-3.5 min-[900px]:py-2.5 min-[900px]:text-sm",
        selected ? "border-[#F97316] bg-[#F97316] text-white" : "border-[#E5E7EB] bg-[#F8F9FA] text-[#1F2937]",
      )}
    >
      {label}
    </button>
  );
}

/** Champs sur fond gris — fond blanc, rayon 12 (Flutter `warehousePosFormFieldDecoration`). Mobile-first plus compact. */
export const whPosFormFieldClass =
  "w-full rounded-[10px] border border-[#E5E7EB] bg-white px-2 py-1.5 text-[13px] text-[#1F2937] outline-none focus:border-2 focus:border-[#F97316] min-[900px]:rounded-[12px] min-[900px]:px-3 min-[900px]:py-2.5 min-[900px]:text-[15px]";

export const whPosLabelClass =
  "block text-[11px] font-medium leading-snug text-[#1F2937] min-[900px]:text-sm";

/** `_DispatchStepCard` — fond `#F8F9FA`, bordure `#E5E7EB`, rayon 16. */
export function DispatchStepCard({
  step,
  title,
  subtitle,
  icon,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-2.5 min-[900px]:rounded-2xl min-[900px]:p-3.5"
      style={{ borderColor: POS_Q.border, backgroundColor: POS_Q.bg2 }}
    >
      <div className="flex gap-2 min-[900px]:gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#F97316] min-[900px]:h-10 min-[900px]:w-10 min-[900px]:rounded-xl"
          style={{ backgroundColor: "rgba(249, 115, 22, 0.14)" }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1 min-[900px]:gap-2">
            <StepNumberChip label={String(step)} />
            <span className="text-[14px] font-extrabold leading-snug text-[#1F2937] min-[900px]:text-base">
              {title}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-[1.35] text-[#1F2937]/65 min-[900px]:mt-1 min-[900px]:text-[13px]">
            {subtitle}
          </p>
        </div>
      </div>
      <div className="mt-2.5 min-[900px]:mt-3.5">{children}</div>
    </div>
  );
}

export function StepNumberChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex rounded-md px-1 py-0.5 text-[11px] font-extrabold text-[#F97316] min-[900px]:rounded-lg min-[900px]:px-2 min-[900px]:text-[13px]"
      style={{ backgroundColor: "rgba(249, 115, 22, 0.14)" }}
    >
      {label}
    </span>
  );
}
