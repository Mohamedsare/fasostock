import type { LocationNode } from "./types";

/** Nœud d'arbre prêt pour l'affichage (enfants triés). */
export type LocationTreeNode = LocationNode & { children: LocationTreeNode[] };

function compareNodes(a: LocationNode, b: LocationNode): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" });
}

/**
 * Reconstruit l'arbre à partir de la liste plate renvoyée par `store_locations_tree`.
 * Un nœud dont le parent a disparu (course entre deux onglets) est remonté à la
 * racine plutôt que perdu : mieux vaut un emplacement mal placé qu'invisible.
 */
export function buildLocationTree(nodes: LocationNode[]): LocationTreeNode[] {
  const byId = new Map<string, LocationTreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: LocationTreeNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }

  const sortRec = (list: LocationTreeNode[]) => {
    list.sort(compareNodes);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** Liste plate dans l'ordre d'affichage de l'arbre (pour les sélecteurs). */
export function flattenLocationTree(roots: LocationTreeNode[]): LocationTreeNode[] {
  const out: LocationTreeNode[] = [];
  const walk = (list: LocationTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}
