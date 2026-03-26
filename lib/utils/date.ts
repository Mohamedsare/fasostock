import { format } from "date-fns";
import { fr } from "date-fns/locale";

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "dd/MM/yyyy HH:mm", { locale: fr });
}

export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}