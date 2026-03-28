/**
 * Préférences quantité panier POS — aligné sur `PosCartSettingsProvider` (Flutter).
 * Clés : `pos_quick_*`, `pos_invoice_a4_*` ; migration depuis `pos_cart_*` puis `fs_pos_qty_*`.
 */

export const POS_CART_LEGACY_LS = {
  showQuantityInput: "pos_cart_show_quantity_input",
  showQuantityButtons: "pos_cart_show_quantity_buttons",
} as const;

export const POS_QUICK_LS = {
  showQuantityInput: "pos_quick_show_quantity_input",
  showQuantityButtons: "pos_quick_show_quantity_buttons",
} as const;

export const POS_INVOICE_A4_LS = {
  showQuantityInput: "pos_invoice_a4_show_quantity_input",
  showQuantityButtons: "pos_invoice_a4_show_quantity_buttons",
} as const;

export type PosCartQtyUi = {
  showQuantityInput: boolean;
  showQuantityButtons: boolean;
};

export type PosCartQtyMode = "quick" | "a4";

function keysForMode(mode: PosCartQtyMode) {
  return mode === "quick" ? POS_QUICK_LS : POS_INVOICE_A4_LS;
}

function parseBool(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  return v === "true" || v === "1";
}

/** Un seul mode actif à la fois ; au moins un actif (même invariant que Flutter). */
export function normalizePosCartQtyUi(
  input: boolean,
  buttons: boolean,
): PosCartQtyUi {
  let showQuantityInput = input;
  let showQuantityButtons = buttons;
  if (showQuantityInput && showQuantityButtons) {
    showQuantityButtons = false;
  }
  if (!showQuantityInput && !showQuantityButtons) {
    showQuantityInput = true;
  }
  return { showQuantityInput, showQuantityButtons };
}

function hasAnyKey(keys: { showQuantityInput: string; showQuantityButtons: string }): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem(keys.showQuantityInput) !== null ||
    localStorage.getItem(keys.showQuantityButtons) !== null
  );
}

export function readPosCartQtyUiForMode(mode: PosCartQtyMode): PosCartQtyUi {
  if (typeof window === "undefined") {
    return { showQuantityInput: true, showQuantityButtons: false };
  }

  const k = keysForMode(mode);
  const legacyI = localStorage.getItem(POS_CART_LEGACY_LS.showQuantityInput);
  const legacyB = localStorage.getItem(POS_CART_LEGACY_LS.showQuantityButtons);

  let ni: boolean;
  let nb: boolean;

  if (hasAnyKey(k)) {
    ni = parseBool(localStorage.getItem(k.showQuantityInput), true);
    nb = parseBool(localStorage.getItem(k.showQuantityButtons), false);
  } else if (legacyI !== null || legacyB !== null) {
    ni = legacyI !== "false" && legacyI !== "0";
    nb = legacyB !== "false" && legacyB !== "0";
  } else {
    const fsI = localStorage.getItem("fs_pos_qty_input");
    const fsB = localStorage.getItem("fs_pos_qty_buttons");
    ni = parseBool(fsI, true);
    nb = parseBool(fsB, false);
  }

  return normalizePosCartQtyUi(ni, nb);
}

/** @deprecated Préférer `readPosCartQtyUiForMode('quick')`. */
export function readPosCartQtyUiFromStorage(): PosCartQtyUi {
  return readPosCartQtyUiForMode("quick");
}

export function persistPosCartQtyUiForMode(
  mode: PosCartQtyMode,
  p: PosCartQtyUi,
): void {
  if (typeof window === "undefined") return;
  const n = normalizePosCartQtyUi(p.showQuantityInput, p.showQuantityButtons);
  const k = keysForMode(mode);
  localStorage.setItem(
    k.showQuantityInput,
    n.showQuantityInput ? "true" : "false",
  );
  localStorage.setItem(
    k.showQuantityButtons,
    n.showQuantityButtons ? "true" : "false",
  );
}

export function applySetShowQuantityInput(
  mode: PosCartQtyMode,
  value: boolean,
): PosCartQtyUi {
  const cur = readPosCartQtyUiForMode(mode);
  if (cur.showQuantityInput === value) return cur;
  let showQuantityInput = value;
  let showQuantityButtons = cur.showQuantityButtons;
  if (showQuantityInput) showQuantityButtons = false;
  else if (!showQuantityButtons) showQuantityButtons = true;
  const n = normalizePosCartQtyUi(showQuantityInput, showQuantityButtons);
  persistPosCartQtyUiForMode(mode, n);
  return n;
}

export function applySetShowQuantityButtons(
  mode: PosCartQtyMode,
  value: boolean,
): PosCartQtyUi {
  const cur = readPosCartQtyUiForMode(mode);
  if (cur.showQuantityButtons === value) return cur;
  let showQuantityInput = cur.showQuantityInput;
  let showQuantityButtons = value;
  if (showQuantityButtons) showQuantityInput = false;
  else if (!showQuantityInput) showQuantityInput = true;
  const n = normalizePosCartQtyUi(showQuantityInput, showQuantityButtons);
  persistPosCartQtyUiForMode(mode, n);
  return n;
}
