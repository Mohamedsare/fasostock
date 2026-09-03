"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DRAFT_MAX_AGE_MS } from "@/lib/offline/constants";
import { clearDraft, readDraft, writeDraft } from "@/lib/offline/draft-store";

export type UsePersistentDraftOptions<T> = {
  /** Identifiant du brouillon — inclure entreprise / boutique / mode. `null` désactive. */
  key: string | null;
  /** Incrémenter dès que la forme de `T` change : les brouillons d'avant sont jetés. */
  version: number;
  /** Instantané courant du travail en cours. */
  value: T;
  /** « Rien à sauver » — un brouillon vide est supprimé plutôt qu'écrit. */
  isEmpty: (value: T) => boolean;
  /** Appelé une seule fois, avec le brouillon retrouvé. */
  onRestore: (value: T) => void;
  /** À `false` tant que l'écran n'est pas en état d'accueillir un brouillon. */
  enabled?: boolean;
  debounceMs?: number;
  maxAgeMs?: number;
};

export type UsePersistentDraftResult = {
  /**
   * `false` tant que la relecture disque est en cours. Les écrans s'en servent pour ne
   * pas afficher un panier vide une fraction de seconde avant de le remplir.
   */
  hydrated: boolean;
  /** Oublie le brouillon sans toucher à l'état de l'écran. */
  discard: () => void;
};

/**
 * Garde le travail en cours d'un écran quand on le quitte, et le rend au retour.
 *
 * Le routeur de Next démonte la page à chaque changement de route : tout `useState`
 * repart de zéro. Pour un écran de consultation c'est sans conséquence, pour une saisie
 * longue — un panier, un comptage d'inventaire — c'est le travail du commerçant qui
 * disparaît parce qu'il est allé vérifier une info dans un autre écran.
 *
 * Deux points de sûreté :
 *
 *  - **Rien n'est écrit avant la fin de la relecture.** Au montage l'état est vide ;
 *    sauvegarder à ce moment-là écraserait le brouillon qu'on est justement en train de
 *    lire, et le premier retour sur la page perdrait tout.
 *  - **La sortie force l'écriture.** L'écriture est retardée pour ne pas marteler le
 *    disque à chaque frappe ; sans vidage au démontage, ajouter une ligne puis changer
 *    de page immédiatement perdrait cette dernière ligne — précisément le geste que ce
 *    hook doit rattraper.
 */
export function usePersistentDraft<T>({
  key,
  version,
  value,
  isEmpty,
  onRestore,
  enabled = true,
  debounceMs = 500,
  maxAgeMs = DRAFT_MAX_AGE_MS,
}: UsePersistentDraftOptions<T>): UsePersistentDraftResult {
  const serialized = JSON.stringify(value ?? null);
  const active = Boolean(key) && enabled;

  /*
   * L'état retenu est la clé DÉJÀ relue, pas un booléen.
   *
   * Un booléen demanderait de le remettre à `false` à la main dès que la clé change
   * (changement de boutique, de mode), c'est-à-dire un `setState` synchrone dans un
   * effet — un rendu de plus et une fenêtre pendant laquelle le hook se croit prêt
   * alors qu'il pointe déjà sur une autre clé. Comparer les deux clés donne la réponse
   * sans état intermédiaire.
   */
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrated = active ? hydratedKey === key : true;

  /*
   * Callbacks et valeur passent par des refs : l'appelant peut donc les redéfinir à
   * chaque rendu (cas courant : une lambda inline) sans relancer la relecture ni
   * reprogrammer l'écriture.
   */
  const isEmptyRef = useRef(isEmpty);
  const onRestoreRef = useRef(onRestore);
  const latestRef = useRef({ key, version, value, serialized, active, hydrated });

  /*
   * Sans tableau de dépendances, et déclaré AVANT les autres effets : les refs sont donc
   * à jour quand l'écriture différée et le vidage de sortie les relisent, alors que la
   * mise à jour pendant le rendu est proscrite (rendu concurrent).
   */
  useEffect(() => {
    isEmptyRef.current = isEmpty;
    onRestoreRef.current = onRestore;
    latestRef.current = { key, version, value, serialized, active, hydrated };
  });

  /** Dernier contenu réellement posé sur le disque — évite de réécrire à l'identique. */
  const writtenRef = useRef<string | null>(null);

  /** Écrit tout de suite si l'état courant diffère du disque. */
  const flush = useCallback(() => {
    const cur = latestRef.current;
    if (!cur.key || !cur.active || !cur.hydrated) return;
    if (cur.serialized === writtenRef.current) return;
    writtenRef.current = cur.serialized;
    if (isEmptyRef.current(cur.value)) void clearDraft(cur.key);
    else void writeDraft(cur.key, cur.version, cur.value);
  }, []);

  // Relecture — une fois par clé.
  useEffect(() => {
    if (!key || !enabled) return;
    writtenRef.current = null;

    let cancelled = false;
    void (async () => {
      const draft = await readDraft<T>(key, version, maxAgeMs);
      if (cancelled) return;
      if (draft !== null && !isEmptyRef.current(draft)) {
        writtenRef.current = JSON.stringify(draft);
        onRestoreRef.current(draft);
      }
      setHydratedKey(key);
    })();

    return () => {
      cancelled = true;
    };
  }, [key, version, enabled, maxAgeMs]);

  // Écriture différée.
  useEffect(() => {
    if (!hydrated || !active) return;
    const t = setTimeout(flush, debounceMs);
    return () => clearTimeout(t);
  }, [hydrated, active, serialized, debounceMs, flush]);

  /*
   * Sortie de l'écran, onglet masqué, onglet fermé : on ne peut plus compter sur le
   * délai. `visibilitychange` couvre le mobile, où `pagehide` n'est pas garanti quand
   * le système reprend la main sur l'application.
   */
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  const discard = useCallback(() => {
    const cur = latestRef.current;
    writtenRef.current = null;
    if (cur.key) void clearDraft(cur.key);
  }, []);

  return { hydrated, discard };
}
