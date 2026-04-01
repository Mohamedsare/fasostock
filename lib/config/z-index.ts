/**
 * Calques d’empilement — alignés sur l’intention Flutter (toasts = `Overlay` racine, au-dessus des dialogues).
 * Les modales plein écran utilisent typiquement `Z.modal`–`Z.posOverlay` ; les toasts restent au-dessus.
 */
export const Z = {
  /** Barres / chrome secondaire */
  pullToRefresh: 30,
  /** Backdrop dialogues standards (magasin, clients, etc.) */
  modal: 60,
  /** Feuilles « Plus », sous-dialogues */
  modalRaised: 70,
  /** Prévisualisations facture / PDF */
  modalHigh: 80,
  /** Ticket / reçu */
  modalReceipt: 90,
  /** Paramètres / admin — modales larges */
  modalTop: 100,
  /** POS plein écran, scanner code-barres */
  posOverlay: 200,
  /** Toasts — toujours au-dessus de tout (équivalent dernier `Overlay.insert` Flutter) */
  toast: 9999,
} as const;
