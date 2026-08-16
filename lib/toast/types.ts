export type ToastType = "success" | "error" | "info";

export type ToastPayload = {
  type: ToastType;
  message: string;
  /** Durée d’affichage (ms). Défaut 3200 — aligné sur `AppToast` Flutter. */
  duration?: number;
  /**
   * Titre en gras au-dessus du message. Réservé aux refus qu'il faut EXPLIQUER —
   * une vente bloquée, par exemple : le caissier a le client en face de lui et doit
   * comprendre en une seconde. Absent, le toast reste la ligne unique habituelle.
   */
  title?: string;
  /** Ligne d'action sous le message : ce qu'il faut faire maintenant. */
  hint?: string;
};
