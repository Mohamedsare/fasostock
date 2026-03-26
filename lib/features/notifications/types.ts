/** Notification in-app — table `notifications` (aligné Flutter `AppNotification`). */
export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  company_id: string | null;
};
