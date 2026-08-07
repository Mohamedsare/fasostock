/** Ligne `notifications` — historique consultable dans l'app (≠ alertes calculées de la cloche). */
export type AppNotification = {
  id: string;
  companyId: string | null;
  /** Catégorie métier (`admin_message`, `app_message`, `sale`…). */
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export function isUnread(n: AppNotification): boolean {
  return n.readAt === null;
}
