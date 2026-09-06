"use client";

import type { InvoiceA4Data } from "./invoice-a4-types";
import {
  fetchInvoicePdfBlob,
  type InvoicePdfRequestMeta,
} from "@/lib/features/pdf/pdf-api-client";

export async function fetchLogoBytes(
  url: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!url?.trim()) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return null;
  }
}

export async function generateInvoicePdfBlob(
  data: InvoiceA4Data,
  meta?: InvoicePdfRequestMeta,
): Promise<Blob> {
  return fetchInvoicePdfBlob(data, meta);
}

export function downloadInvoicePdf(blob: Blob, saleNumber: string): void {
  const name = `facture_${saleNumber.replace(/[^\w.\-]/g, "_")}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function openInvoicePdfInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/*
 * ── Impression : une seule à la fois ───────────────────────────────────────────────
 *
 * `window.print()` est modal. Tant que la boîte d'impression du navigateur est ouverte,
 * un second appel est ignoré — sans erreur, sans trace. En caisse rapide avec
 * l'impression automatique, deux ventes qui s'enchaînent tombent exactement dans ce cas :
 * le second client repartirait sans ticket et personne ne s'en apercevrait.
 *
 * Les travaux sont donc mis à la file : le suivant part quand la boîte précédente est
 * refermée (`afterprint`), ou au plus tard après `QUEUE_SLOT_MAX_MS` — un poste laissé
 * avec un dialogue ouvert ne doit jamais bloquer la caisse pour de bon.
 */
let printQueueTail: Promise<void> = Promise.resolve();

/** Au-delà, la boîte d'impression est considérée abandonnée : la file repart. */
const QUEUE_SLOT_MAX_MS = 90_000;
/** L'iframe n'a pas chargé le PDF : on bascule sur un onglet. */
const IFRAME_LOAD_TIMEOUT_MS = 2500;
/** Filet de sécurité si `afterprint` n'arrive jamais (URL blob + iframe libérées). */
const PRINT_JOB_MAX_LIFETIME_MS = 10 * 60_000;
/**
 * Délai avant de retirer le document, une fois la boîte d'impression refermée. Le
 * créneau de la file, lui, est rendu tout de suite : c'est le ticket suivant qui
 * attendait. Ces quelques secondes ne servent qu'au spouleur, qui peut encore être en
 * train de lire le PDF au moment où le dialogue disparaît.
 */
const CLEANUP_AFTER_PRINT_MS = 5_000;

/**
 * Envoie un PDF à l'imprimante.
 *
 * Renvoie `true` si la boîte d'impression a bien été ouverte, `false` si le navigateur a
 * tout bloqué : iframe refusée ET pop-up bloquée. Ce second cas n'est pas théorique —
 * c'est celui de toute impression déclenchée hors d'un clic, donc de l'impression
 * automatique de la caisse rapide. L'appelant qui a un client au comptoir doit alors lui
 * proposer autre chose plutôt que de le laisser partir en croyant son ticket parti.
 *
 * Les appels historiques, qui ignorent la valeur de retour, gardent le comportement
 * d'avant — à ceci près qu'ils ne se marchent plus dessus.
 */
export function printInvoicePdf(blob: Blob): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const waitForTurn = printQueueTail;
  let releaseSlot: () => void = () => {};
  const slot = new Promise<void>((resolve) => {
    releaseSlot = resolve;
  });
  // `slot` ne rejette jamais : la file ne peut pas se casser sur un travail raté.
  printQueueTail = waitForTurn.then(() => slot);
  return waitForTurn.then(() => {
    try {
      return startPrintJob(blob, releaseSlot);
    } catch {
      releaseSlot();
      return false;
    }
  });
}

function startPrintJob(blob: Blob, releaseSlot: () => void): Promise<boolean> {
  return new Promise<boolean>((resolveLaunched) => {
    const url = URL.createObjectURL(blob);
    let launchSettled = false;
    let slotReleased = false;
    let urlRevoked = false;

    const launched = (ok: boolean) => {
      if (launchSettled) return;
      launchSettled = true;
      resolveLaunched(ok);
    };
    const revokeUrl = () => {
      if (urlRevoked) return;
      urlRevoked = true;
      URL.revokeObjectURL(url);
    };
    // Quoi qu'il arrive au dialogue, le ticket suivant finit par passer.
    const slotGuard = window.setTimeout(() => {
      slotReleased = true;
      releaseSlot();
    }, QUEUE_SLOT_MAX_MS);
    const releaseTurn = () => {
      if (slotReleased) return;
      slotReleased = true;
      window.clearTimeout(slotGuard);
      releaseSlot();
    };

    const fallbackPrintInNewTab = () => {
      try {
        /*
         * Sans `noopener` — volontairement.
         *
         * Avec, le navigateur renvoie `null` par principe, même quand l'onglet s'est
         * parfaitement ouvert : tout ce repli était alors déclaré « pop-up bloquée », le
         * caissier voyait une erreur, et l'onglet du ticket restait là sans jamais
         * ouvrir la boîte d'impression. Or c'est justement cette poignée qu'il nous faut
         * pour appeler `print()`. Le risque habituel de `window.opener` ne s'applique
         * pas ici : la page ouverte est notre propre PDF, sur une URL `blob:` de cette
         * origine, sans script. `noreferrer` reste inutile pour la même raison.
         */
        const popup = window.open(url, "_blank");
        if (!popup) {
          // Pop-up bloquée : rien ne s'imprimera. L'appelant doit le savoir.
          launched(false);
          releaseTurn();
          window.setTimeout(revokeUrl, 2_000);
          return;
        }
        /*
         * Une seule demande d'impression, quel que soit le déclencheur.
         *
         * `tryPrint` est armé deux fois — au chargement de l'onglet, et à 1,2 s pour le
         * cas où ce chargement ne serait jamais annoncé. Sans ce verrou, les deux
         * partent : `print()` étant modal, le caissier referme la première boîte et une
         * seconde s'ouvre aussitôt sur le même ticket.
         */
        let printAsked = false;
        const tryPrint = () => {
          if (printAsked) return;
          printAsked = true;
          try {
            popup.focus();
            popup.print();
            // Modal : la main revient une fois la boîte refermée. Le ticket suivant
            // n'a plus de raison d'attendre — l'onglet, lui, reste ouvert.
            releaseTurn();
          } catch {
            // L'utilisateur peut imprimer manuellement (Ctrl/Cmd+P) si le navigateur bloque.
            releaseTurn();
          }
        };
        launched(true);
        popup.addEventListener(
          "load",
          () => {
            window.setTimeout(tryPrint, 180);
            // Ne pas fermer automatiquement: on laisse l'utilisateur gérer l'onglet.
            // On nettoie l'URL blob quand l'onglet est fermé.
            popup.addEventListener(
              "beforeunload",
              () => {
                revokeUrl();
                releaseTurn();
              },
              { once: true },
            );
          },
          { once: true },
        );
        window.setTimeout(tryPrint, 1200);
        window.setTimeout(() => {
          revokeUrl();
          releaseTurn();
        }, PRINT_JOB_MAX_LIFETIME_MS);
      } catch {
        launched(false);
        releaseTurn();
        window.setTimeout(revokeUrl, 2_000);
      }
    };

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    const removeIframe = () => {
      try {
        iframe.remove();
      } catch {}
    };
    let iframeLoaded = false;
    const loadGuard = window.setTimeout(() => {
      if (iframeLoaded) return;
      removeIframe();
      fallbackPrintInNewTab();
    }, IFRAME_LOAD_TIMEOUT_MS);
    iframe.onload = () => {
      iframeLoaded = true;
      window.clearTimeout(loadGuard);
      const win = iframe.contentWindow;
      if (!win) {
        removeIframe();
        fallbackPrintInNewTab();
        return;
      }
      const cleanupIframe = () => {
        window.removeEventListener("afterprint", onTopAfterPrint);
        removeIframe();
        revokeUrl();
        releaseTurn();
      };
      /*
       * `afterprint` n'arrive pas toujours — et c'est ce qui immobilisait la caisse.
       *
       * Le document chargé dans l'iframe est un PDF : il est affiché par le lecteur
       * interne de Chrome, qui ne dispatche pas cet événement de façon fiable sur la
       * fenêtre du cadre. Le créneau de la file ne se libérait alors qu'au garde-fou —
       * quatre-vingt-dix secondes. Le premier ticket sortait normalement, le suivant
       * restait bloqué à attendre son tour, sans que rien ne l'explique à l'écran.
       *
       * On écoute donc les deux fenêtres : certains navigateurs remontent l'événement
       * au document de tête plutôt qu'à celui du cadre. Et surtout, on ne compte plus
       * dessus (voir juste en dessous).
       */
      const onTopAfterPrint = () => cleanupIframe();
      win.addEventListener("afterprint", cleanupIframe, { once: true });
      window.addEventListener("afterprint", onTopAfterPrint, { once: true });
      // Filet de sécurité si aucun des deux n'est déclenché.
      window.setTimeout(cleanupIframe, PRINT_JOB_MAX_LIFETIME_MS);
      try {
        win.focus();
        win.print();
        launched(true);
        /*
         * `print()` est modal : quand il rend la main, la boîte de dialogue est déjà
         * refermée et le travail est parti au spouleur. C'est le seul signal certain de
         * fin d'impression, et il n'a besoin d'aucun événement — le ticket suivant peut
         * donc partir immédiatement.
         *
         * Le document, lui, reste en place quelques secondes : le retirer dans la
         * seconde risquerait de couper la lecture d'un travail encore en cours d'envoi.
         */
        releaseTurn();
        window.setTimeout(cleanupIframe, CLEANUP_AFTER_PRINT_MS);
      } catch {
        removeIframe();
        fallbackPrintInNewTab();
      }
    };
    iframe.onerror = () => {
      window.clearTimeout(loadGuard);
      removeIframe();
      fallbackPrintInNewTab();
    };
  });
}
