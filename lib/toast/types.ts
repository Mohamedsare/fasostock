export type ToastType = "success" | "error" | "info";

export type ToastPayload = {
  type: ToastType;
  message: string;
  /** Durée d’affichage (ms). Défaut 3200 — aligné sur `AppToast` Flutter. */
  duration?: number;
};
