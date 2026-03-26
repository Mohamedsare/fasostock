/**
 * Préférences quantité panier POS — aligné sur `PosCartSettingsProvider` (Flutter).
 * Clés SharedPreferences Flutter : `pos_cart_show_quantity_input` / `pos_cart_show_quantity_buttons`.
 */

export const POS_CART_LS = {
  showQuantityInput: "pos_cart_show_quantity_input",
  showQuantityButtons: "pos_cart_show_quantity_buttons",
} as const;

export type PosCartQtyUi = {
  showQuantityInput: boolean;
  showQuantityButtons: boolean;
};

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

export function readPosCartQtyUiFromStorage(): PosCartQtyUi {
  if (typeof window === "undefined") {
    return { showQuantityInput: true, showQuantityButtons: false };
  }
  let ni = parseBool(localStorage.getItem(POS_CART_LS.showQuantityInput), true);
  let nb = parseBool(localStorage.getItem(POS_CART_LS.showQuantityButtons), false);
  const legacyI = localStorage.getItem("fs_pos_qty_input");
  const legacyB = localStorage.getItem("fs_pos_qty_buttons");
  if (localStorage.getItem(POS_CART_LS.showQuantityInput) === null && legacyI !== null) {
    ni = legacyI !== "0";
  }
  if (localStorage.getItem(POS_CART_LS.showQuantityButtons) === null && legacyB !== null) {
    nb = legacyB !== "0";
  }
  return normalizePosCartQtyUi(ni, nb);
}

export function persistPosCartQtyUi(p: PosCartQtyUi): void {
  if (typeof window === "undefined") return;
  const n = normalizePosCartQtyUi(p.showQuantityInput, p.showQuantityButtons);
  localStorage.setItem(POS_CART_LS.showQuantityInput, n.showQuantityInput ? "true" : "false");
  localStorage.setItem(POS_CART_LS.showQuantityButtons, n.showQuantityButtons ? "true" : "false");
}

export function applySetShowQuantityInput(value: boolean): PosCartQtyUi {
  const cur = readPosCartQtyUiFromStorage();
  if (cur.showQuantityInput === value) return cur;
  let showQuantityInput = value;
  let showQuantityButtons = cur.showQuantityButtons;
  if (showQuantityInput) showQuantityButtons = false;
  else if (!showQuantityButtons) showQuantityButtons = true;
  const n = normalizePosCartQtyUi(showQuantityInput, showQuantityButtons);
  persistPosCartQtyUi(n);
  return n;
}

export function applySetShowQuantityButtons(value: boolean): PosCartQtyUi {
  const cur = readPosCartQtyUiFromStorage();
  if (cur.showQuantityButtons === value) return cur;
  let showQuantityInput = cur.showQuantityInput;
  let showQuantityButtons = value;
  if (showQuantityButtons) showQuantityInput = false;
  else if (!showQuantityInput) showQuantityInput = true;
  const n = normalizePosCartQtyUi(showQuantityInput, showQuantityButtons);
  persistPosCartQtyUi(n);
  return n;
}
