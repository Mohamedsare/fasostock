import { NAV_ITEMS, RESTAURANT_NAV_ITEMS } from "@/lib/config/navigation";

/**
 * Écrans dynamiques ou hors menu, à reconnaître avant les libellés de navigation.
 * Ordre = priorité : le premier motif qui correspond gagne.
 */
const SPECIAL: { test: RegExp; label: string }[] = [
  { test: /^\/stores\/[^/]+\/pos-quick/, label: "Caisse rapide" },
  { test: /^\/stores\/[^/]+\/pos/, label: "Caisse (POS)" },
  { test: /^\/stores\/[^/]+\/vente-engin/, label: "Vente d'engin" },
  { test: /^\/stores\/[^/]+\/facture-tab/, label: "Facture / devis" },
  { test: /^\/admin/, label: "Espace super admin" },
  { test: /^\/verifier\/engin/, label: "Vérification d'engin" },
  { test: /^\/offre-complete/, label: "Page Offre complète" },
  { test: /^\/login/, label: "Connexion" },
  { test: /^\/register/, label: "Inscription" },
  { test: /^\/?$/, label: "Page d'accueil" },
];

/** Libellés du menu, du chemin le plus précis au plus général (`/stores` après `/stores/x`). */
const NAV_LABELS: { href: string; label: string }[] = [
  ...RESTAURANT_NAV_ITEMS,
  ...NAV_ITEMS,
]
  .filter((i) => i.kind !== "section")
  .map((i) => ({ href: i.href, label: i.label }))
  .sort((a, b) => b.href.length - a.href.length);

/**
 * Traduit une URL en activité lisible pour la page Live : le super admin doit lire
 * « Caisse (POS) », pas « /stores/8f3…/pos ».
 */
export function activityLabelFromPathname(pathname: string): string {
  const path = (pathname || "/").split("?")[0]!.replace(/\/+$/, "") || "/";

  for (const s of SPECIAL) {
    if (s.test.test(path)) return s.label;
  }

  for (const n of NAV_LABELS) {
    if (path === n.href || path.startsWith(`${n.href}/`)) return n.label;
  }

  const last = path.split("/").filter(Boolean).pop();
  if (!last) return "Page d'accueil";
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}
