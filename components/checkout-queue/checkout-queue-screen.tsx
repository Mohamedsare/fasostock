"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdCheckCircle,
  MdClose,
  MdHourglassEmpty,
  MdInbox,
  MdLock,
  MdNotificationsActive,
  MdPayments,
  MdPerson,
  MdPointOfSale,
  MdReceiptLong,
  MdSchedule,
  MdVolumeOff,
  MdVolumeUp,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { ReceiptTicketDialog } from "@/components/pos/receipt-ticket-dialog";
import { HandoffCheckoutDialog } from "./handoff-checkout-dialog";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { ROUTES } from "@/lib/config/routes";
import {
  cancelPosHandoff,
  checkoutPosHandoff,
  claimPosHandoff,
  fetchPosCheckoutHolder,
  isCheckoutAvailable,
  listHandoffHistory,
  listPendingHandoffs,
  releasePosCheckout,
  takePosCheckout,
  type PosCheckoutHolder,
} from "@/lib/features/dual-cashier/api";
import {
  handoffLineTotal,
  handoffUnitCount,
  handoffUrgency,
  waitingLabel,
  type PosHandoff,
} from "@/lib/features/dual-cashier/types";
import { listCustomers } from "@/lib/features/customers/api";
import { listStores } from "@/lib/features/stores/api";
import { getSaleDetail } from "@/lib/features/sales/api";
import { buildReceiptTicketDataFromSale } from "@/lib/features/receipt/build-receipt-ticket-data";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  effectiveQuickPosProviders,
  fetchQuickPosPayments,
  QUICK_POS_PAYMENTS_DEFAULT,
} from "@/lib/features/settings/quick-pos-payments";
import { fetchQuickPosCreditEnabled } from "@/lib/features/settings/quick-pos-credit";
import {
  fetchPrintFormatChoiceEnabled,
  peekPrintFormatChoiceEnabled,
} from "@/lib/features/settings/print-format-choice";
import type { Store } from "@/lib/features/stores/types";
import {
  fetchSaleCustomerPolicy,
  peekSaleCustomerPolicy,
  SALE_CUSTOMER_POLICY_DEFAULT,
} from "@/lib/features/settings/sale-customer-policy";
import {
  allowSaleForCustomer,
  SaleBlockedError,
} from "@/lib/features/credit/customer-debt-guard";
import { playPosAddBeep } from "@/lib/utils/pos-sound";
import { armVoicePriming, primeVoice, speakFr } from "@/lib/utils/pos-voice";
import { amountToFrenchWords } from "@/lib/utils/number-to-french-words";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import type { HandoffCheckoutSubmit } from "./handoff-checkout-dialog";
import {
  awaitPrintJob,
  createPosPrintJob,
} from "@/lib/features/dual-cashier/print-jobs";

/**
 * Rythme de rafraîchissement de la file.
 *
 * Quatre secondes : c'est le temps qu'il faut à un client pour traverser un magasin de
 * quartier. Plus lent, le caissier verrait le client arriver avant son bon et croirait
 * l'outil en panne ; plus rapide, on ferait payer une requête par seconde à des forfaits
 * data que ces boutiques comptent au mégaoctet — pour rien.
 */
const QUEUE_POLL_MS = 4000;
const SOUND_PREF_KEY = "fs_checkout_queue_sound";

/**
 * Délai avant la phrase parlée : les deux bips durent ~360 ms, et une voix qui démarre
 * par-dessus se perd dans le bip.
 */
const SPEAK_DELAY_MS = 420;

/**
 * Ce que dit la caisse à l'arrivée d'un ou plusieurs bons.
 *
 * Le montant est donné **en toutes lettres**, avec la fonction déjà utilisée pour le
 * « montant en lettres » des factures : la synthèse vocale lit correctement « douze mille
 * cinq cents », là où « 12 500 FCFA » lui fait épeler le symbole et hésiter sur les
 * milliers. La devise suit celle de l'entreprise (franc CFA, guinéen, rwandais…).
 *
 * Phrase courte, montant seul : le caissier a déjà la carte sous les yeux pour le reste,
 * et une annonce longue est encore en train de parler quand le bon suivant tombe.
 */
function announceSentence(fresh: PosHandoff[]): string {
  if (fresh.length === 1) {
    return `Vente de ${lowerFirst(amountToFrenchWords(fresh[0]!.total))} à encaisser.`;
  }
  const total = fresh.reduce((sum, x) => sum + x.total, 0);
  return `${fresh.length} ventes à encaisser, ${lowerFirst(amountToFrenchWords(total))}.`;
}

/** Minuscule sur la seule première lettre : `CFA` doit rester en capitales, sans quoi la
 *  voix lit « sfa » au lieu d'épeler le sigle. */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function timeLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Couleurs de l'attente — la file se lit de loin, sans lire les heures. */
const URGENCY_CARD: Record<ReturnType<typeof handoffUrgency>, string> = {
  fresh: "border-l-emerald-500",
  waiting: "border-l-amber-500",
  late: "border-l-red-500",
};
const URGENCY_CHIP: Record<ReturnType<typeof handoffUrgency>, string> = {
  fresh: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  waiting: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  late: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export function CheckoutQueueScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const canView = h?.canCheckoutQueue ?? false;
  const enabled = Boolean(companyId) && canView;

  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [checkingOut, setCheckingOut] = useState<PosHandoff | null>(null);
  const [cancelling, setCancelling] = useState<PosHandoff | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [receipt, setReceipt] = useState<ReceiptTicketData | null>(null);
  /**
   * Contexte de la vente qui vient d'être encaissée : à QUI renvoyer le ticket, et pour
   * quelle vente. Le dialogue de ticket, lui, ne connaît que le contenu imprimé.
   */
  const [receiptTarget, setReceiptTarget] = useState<{
    saleId: string;
    handoffId: string;
    sellerId: string;
    sellerName: string;
    paperWidthMm: 58 | 80;
  } | null>(null);
  /**
   * De quoi sortir la même vente en facture A4 (réglage « Choisir le format
   * d'impression »). Séparé de `receiptTarget`, qui n'existe que lorsque le ticket peut
   * partir chez le vendeur : la facture, elle, s'imprime ici quoi qu'il arrive.
   */
  const [receiptSale, setReceiptSale] = useState<{
    saleId: string;
    store: Store;
  } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  /** Identité courante : sert à dire « c'est vous » plutôt que d'afficher votre nom. */
  const meQ = useQuery({
    queryKey: ["checkout-queue", "me"] as const,
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
    staleTime: 10 * 60_000,
  });
  const myId = meQ.data ?? null;

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem(SOUND_PREF_KEY) !== "off");
    } catch {
      /* préférence indisponible : le son reste actif */
    }
  }, []);

  // Horloge d'une seconde : c'est elle qui fait vieillir les cartes sous les yeux du
  // caissier. Sans elle, un bon affiché « à l'instant » le resterait dix minutes.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const pendingQ = useQuery({
    queryKey: queryKeys.posHandoffsPending(companyId, storeId),
    queryFn: () => listPendingHandoffs({ companyId, storeId }),
    enabled,
    refetchInterval: enabled ? QUEUE_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const sinceIso = useMemo(() => startOfTodayIso(), []);
  const historyQ = useQuery({
    queryKey: queryKeys.posHandoffsHistory(companyId, storeId, sinceIso),
    queryFn: () => listHandoffHistory({ companyId, storeId, sinceIso }),
    enabled: enabled && tab === "history",
    staleTime: 20_000,
  });

  const customersQ = useQuery({
    queryKey: queryKeys.customers(companyId),
    queryFn: () => listCustomers(companyId),
    enabled,
    staleTime: 60_000,
  });

  const storesQ = useQuery({
    queryKey: queryKeys.stores(companyId),
    queryFn: () => listStores(companyId),
    enabled,
    staleTime: 5 * 60_000,
  });

  /** Réglage propriétaire : le ticket encaissé ici peut aussi sortir en facture A4. */
  const printFormatChoiceQ = useQuery({
    queryKey: queryKeys.printFormatChoiceEnabled(companyId),
    queryFn: () => fetchPrintFormatChoiceEnabled(companyId),
    enabled,
    staleTime: 60_000,
    ...(peekPrintFormatChoiceEnabled(companyId) !== undefined
      ? { initialData: peekPrintFormatChoiceEnabled(companyId) }
      : {}),
  });
  const printFormatChoiceOn = printFormatChoiceQ.data === true;

  /** Réglage propriétaire « Vente au nom d'un client » — client exigé, dette bloquante. */
  const customerPolicyQ = useQuery({
    queryKey: queryKeys.saleCustomerPolicy(companyId),
    queryFn: () => fetchSaleCustomerPolicy(companyId),
    enabled,
    staleTime: 60_000,
    ...(peekSaleCustomerPolicy(companyId) !== undefined
      ? { initialData: peekSaleCustomerPolicy(companyId) }
      : {}),
  });
  const customerPolicy = customerPolicyQ.data ?? SALE_CUSTOMER_POLICY_DEFAULT;

  // Réglages d'encaissement de la caisse rapide : le comptoir doit proposer ICI
  // exactement ce qu'il propose LÀ-BAS, sinon le module créerait deux caisses aux
  // règles différentes dans la même boutique.
  const paymentsSettingsQ = useQuery({
    queryKey: queryKeys.quickPosPayments(companyId),
    queryFn: () => fetchQuickPosPayments(companyId),
    enabled,
    staleTime: 60_000,
  });
  const creditEnabledQ = useQuery({
    queryKey: queryKeys.quickPosCreditEnabled(companyId),
    queryFn: () => fetchQuickPosCreditEnabled(companyId),
    enabled,
    staleTime: 60_000,
  });

  /*
   * ── Tenue de caisse ──────────────────────────────────────────────────────────
   *
   * Un seul caissier à la fois par boutique : dès qu'une personne encaisse, elle tient
   * la caisse, et les collègues restent en vente. Interrogé au même rythme que la file ;
   * quand la caisse est à nous, l'appel sert AUSSI de signe de vie — sans lui, la base
   * la libérerait au bout de trois minutes en nous croyant partis.
   *
   * En vue « toutes boutiques » (propriétaire), il n'y a pas de caisse unique à tenir :
   * on n'interroge rien, et c'est la base qui tranche bon par bon.
   */
  const holderIsMineRef = useRef(false);
  const holderQ = useQuery({
    queryKey: queryKeys.posCheckoutHolder(storeId ?? "__none__"),
    queryFn: async (): Promise<PosCheckoutHolder | null> => {
      if (!storeId) return null;
      if (holderIsMineRef.current) {
        try {
          return await takePosCheckout(storeId, false);
        } catch {
          /* caisse perdue entre-temps : on retombe sur la lecture simple ci-dessous */
        }
      }
      return fetchPosCheckoutHolder(storeId, myId);
    },
    enabled: enabled && Boolean(storeId) && Boolean(myId),
    refetchInterval: enabled && storeId ? QUEUE_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const holder = holderQ.data ?? null;
  // Mémorisé APRÈS le rendu (et non pendant) : le prochain sondage lira cette valeur
  // pour choisir entre un signe de vie et une simple lecture.
  useEffect(() => {
    holderIsMineRef.current = holder?.isMine === true;
  }, [holder]);
  /** Caisse libre, à nous, ou tenue par un collègue absent : on peut encaisser. */
  const canCash = !storeId || isCheckoutAvailable(holder, now);
  const heldByOther = Boolean(holder && !holder.isMine && !canCash);

  const takeMut = useMutation({
    mutationFn: (force: boolean) => takePosCheckout(storeId ?? "", force),
    onSuccess: async (h) => {
      holderIsMineRef.current = h?.isMine === true;
      toast.success("Vous tenez la caisse. Vos collègues restent en vente.");
      await qc.invalidateQueries({ queryKey: ["pos-checkout-holder"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Impossible de prendre la caisse.")),
  });

  const releaseMut = useMutation({
    mutationFn: () => releasePosCheckout(storeId ?? ""),
    onSuccess: async () => {
      holderIsMineRef.current = false;
      toast.success("Caisse rendue. Un collègue peut la prendre.");
      await qc.invalidateQueries({ queryKey: ["pos-checkout-holder"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Impossible de rendre la caisse.")),
  });

  const paySettings = paymentsSettingsQ.data ?? QUICK_POS_PAYMENTS_DEFAULT;
  const providers = useMemo(() => effectiveQuickPosProviders(paySettings), [paySettings]);

  const pending = useMemo(() => pendingQ.data ?? [], [pendingQ.data]);
  const customerOptions = useMemo(
    () => (customersQ.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    [customersQ.data],
  );
  const customerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customerOptions) m.set(c.id, c.name);
    return m;
  }, [customerOptions]);

  /*
   * Vue « toutes boutiques » (propriétaire) : la file mélange alors les comptoirs, et
   * encaisser le bon d'une autre boutique sortirait le stock du mauvais endroit. On
   * nomme donc la boutique sur la carte — uniquement dans ce cas, sinon le nom serait
   * la même information répétée sur chaque ligne.
   */
  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of storesQ.data ?? []) m.set(s.id, s.name);
    return m;
  }, [storesQ.data]);

  /*
   * Annonce sonore d'un nouveau bon.
   *
   * Le caissier ne fixe pas son écran : il rend la monnaie, il range, il parle au client.
   * Sans le son, un bon peut attendre plusieurs minutes à trente centimètres de lui. Deux
   * bips (et non un) pour ne pas confondre avec le bip d'ajout au panier de la caisse.
   *
   * Puis la voix donne le montant. Le bip garde la première place : il perce le bruit
   * d'une boutique bien mieux qu'une parole, et il reste le seul signal sur les appareils
   * sans voix française installée — là, `speakFr` ne fait simplement rien.
   */
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!pendingQ.data) return;
    const ids = new Set(pendingQ.data.map((x) => x.id));
    if (knownIds.current === null) {
      knownIds.current = ids; // premier chargement : on n'annonce pas la file existante
      return;
    }
    const fresh = pendingQ.data.filter((x) => !knownIds.current!.has(x.id));
    knownIds.current = ids;
    if (fresh.length === 0) return;
    const timers: number[] = [];
    if (soundOn) {
      playPosAddBeep();
      timers.push(window.setTimeout(() => playPosAddBeep(), 220));
      const sentence = announceSentence(fresh);
      timers.push(window.setTimeout(() => speakFr(sentence), SPEAK_DELAY_MS));
    }
    const first = fresh[0]!;
    toast.info(
      fresh.length === 1
        ? `Bon ${first.number} · ${formatCurrency(first.total)} — ${first.createdByName ?? "un collègue"}`
        : `${fresh.length} nouveaux bons à encaisser.`,
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [pendingQ.data, soundOn]);

  /* La voix ne s'autorise qu'après un geste sur la page (règle des navigateurs, iPhone en
     tête). Le son étant actif par défaut, on ne peut pas attendre un clic sur le bouton
     « Son » : le premier geste venu, quel qu'il soit, sert d'amorce. */
  useEffect(() => armVoicePriming(), []);

  function invalidateQueue() {
    void qc.invalidateQueries({ queryKey: ["pos-handoffs", companyId] });
  }

  const claimMut = useMutation({
    mutationFn: (vars: { id: string; claim: boolean }) =>
      claimPosHandoff(vars.id, vars.claim),
    onSuccess: () => invalidateQueue(),
    onError: (e) => toast.error(messageFromUnknownError(e, "Action impossible.")),
  });

  const cancelMut = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      cancelPosHandoff(vars.id, vars.reason.trim() || null),
    onSuccess: () => {
      invalidateQueue();
      setCancelling(null);
      setCancelReason("");
      toast.success("Bon annulé. Le vendeur le verra dans sa caisse.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Annulation impossible.")),
  });

  const checkoutMut = useMutation({
    mutationFn: async (vars: { handoff: PosHandoff; payload: HandoffCheckoutSubmit }) => {
      /*
       * Dette en cours : c'est ICI que le client paie, donc c'est ici qu'on refuse.
       * Le contrôle est dans la mutation pour que le bouton reste occupé pendant la
       * lecture — un double appui ne doit pas faire passer le bon.
       */
      const allowed = await allowSaleForCustomer({
        enabled: customerPolicy.blockOnDebt,
        companyId,
        customerId: vars.payload.customerId,
        customers: customersQ.data ?? [],
      });
      if (!allowed) throw new SaleBlockedError();
      const saleId = await checkoutPosHandoff({
        handoffId: vars.handoff.id,
        payments: vars.payload.payments,
        discount: vars.payload.discount,
        customerId: vars.payload.customerId,
        creditDueAt: vars.payload.creditDueAt,
      });
      return { saleId, handoff: vars.handoff };
    },
    onSuccess: async ({ saleId, handoff }) => {
      setCheckingOut(null);
      toast.success(`Bon ${handoff.number} encaissé.`);
      // Encaisser prend la caisse (côté base). L'écran doit le refléter tout de suite,
      // sinon il continuerait à s'annoncer « caisse libre » à celui qui la tient.
      holderIsMineRef.current = true;
      void qc.invalidateQueries({ queryKey: ["pos-checkout-holder"] });
      invalidateQueue();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sales"] }),
        qc.invalidateQueries({ queryKey: queryKeys.productInventory(handoff.storeId) }),
      ]);

      // Le ticket : le client attend son justificatif, il ne doit pas dépendre d'un
      // second geste. Un échec ici n'annule rien — la vente est faite et encaissée.
      try {
        const sale = await getSaleDetail(saleId);
        const store = (storesQ.data ?? []).find((s) => s.id === handoff.storeId) ?? null;
        if (sale && store) {
          const width = store.receipt_paper_width_mm === 58 ? 58 : 80;
          // Le vendeur qui a préparé ce bon est aussi celui qui a le client — et souvent
          // l'imprimante. C'est donc lui, la destination naturelle du ticket.
          setReceiptTarget(
            handoff.createdBy
              ? {
                  saleId,
                  handoffId: handoff.id,
                  sellerId: handoff.createdBy,
                  sellerName: handoff.createdByName ?? "le vendeur",
                  paperWidthMm: width,
                }
              : null,
          );
          setReceiptSale({ saleId, store });
          setReceipt(buildReceiptTicketDataFromSale(store, sale, saleId));
        } else {
          toast.info("Vente enregistrée. Le ticket est réimprimable depuis la page Ventes.");
        }
      } catch {
        toast.info("Vente enregistrée. Le ticket est réimprimable depuis la page Ventes.");
      }
    },
    onError: (e) => {
      /*
       * Dette du client : le refus est déjà expliqué à l'écran, et le bon reste en
       * file — le caissier fait régler l'ardoise puis reprend le même bon, ou
       * l'annule. Un second toast technique par-dessus n'aiderait personne.
       */
      if (e instanceof SaleBlockedError) return;
      toast.error(messageFromUnknownError(e, "L'encaissement n'a pas abouti."));
      /*
       * Rafraîchir la file après un échec, toujours. Les deux refus les plus probables
       * — « déjà encaissé par quelqu'un d'autre », « stock insuffisant » — veulent dire
       * que l'écran ne montre plus la réalité. Laisser la carte en place inviterait le
       * caissier à réessayer sans fin devant le client.
       */
      invalidateQueue();
    },
  });

  /*
   * Envoi du ticket au poste du vendeur.
   *
   * On attend le compte rendu plutôt que de dire « envoyé » et de passer à autre chose :
   * si le poste d'en face est éteint, le caissier doit le savoir MAINTENANT, pendant que
   * le client est encore devant lui et que « Imprimer ici » est à un clic.
   */
  const remotePrintMut = useMutation({
    mutationFn: async () => {
      if (!receiptTarget) throw new Error("Poste du vendeur inconnu.");
      const jobId = await createPosPrintJob({
        saleId: receiptTarget.saleId,
        targetUserId: receiptTarget.sellerId,
        handoffId: receiptTarget.handoffId,
        paperWidthMm: receiptTarget.paperWidthMm,
      });
      return awaitPrintJob(jobId);
    },
    onSuccess: (outcome) => {
      const who = receiptTarget?.sellerName ?? "le vendeur";
      if (outcome === "printed") {
        toast.success(`Ticket imprimé sur le poste de ${who}.`);
      } else if (outcome === "failed") {
        toast.error(
          `Le poste de ${who} n'a pas pu imprimer. Utilisez « Imprimer ici ».`,
        );
      } else {
        toast.error(
          `Pas de réponse du poste de ${who} (éteint ou hors ligne). Utilisez « Imprimer ici ».`,
        );
      }
    },
    onError: (e) =>
      toast.error(messageFromUnknownError(e, "Envoi à l'imprimante du vendeur impossible.")),
  });

  const totals = useMemo(() => {
    const waiting = pending.reduce((s, x) => s + x.total, 0);
    const late = pending.filter((x) => handoffUrgency(x.createdAt, now) === "late").length;
    return { count: pending.length, waiting, late };
  }, [pending, now]);

  const paidToday = useMemo(() => {
    const rows = (historyQ.data ?? []).filter((x) => x.status === "paid");
    return { count: rows.length, amount: rows.reduce((s, x) => s + x.total, 0) };
  }, [historyQ.data]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off");
    } catch {
      /* préférence non persistée : sans conséquence */
    }
    if (next) {
      // Dans le geste : c'est ici que le navigateur accorde le droit de parler.
      primeVoice();
      playPosAddBeep();
      // Test audible : le caissier sait tout de suite si SON appareil sait parler
      // (silence = pas de voix française installée, le bip fera seul le travail).
      window.setTimeout(() => speakFr("Annonce vocale activée."), SPEAK_DELAY_MS);
    }
  }

  if (!permLoading && !canView) {
    return (
      <FsPage>
        <FsScreenHeader title="Encaissement" />
        <FsCard className="rounded-md sm:rounded-md" padding="p-5">
          <div className="flex items-start gap-3">
            <MdLock className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
            <div>
              <p className="text-sm font-bold text-fs-text">Accès réservé</p>
              <p className="mt-1 text-sm text-neutral-600">
                La caisse à deux doit être activée par le propriétaire dans Paramètres, et
                cette page est réservée aux personnes à qui il a accordé le droit
                « Encaisser les paniers envoyés ». Vous pouvez continuer à vendre et à
                envoyer vos paniers à la caisse.
              </p>
            </div>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Encaissement"
          subtitle="Les paniers que vos vendeurs vous envoient. Vous confirmez, vous encaissez, le client repart."
          className="mb-0"
        />
        <button
          type="button"
          onClick={toggleSound}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-semibold",
            soundOn
              ? "border-fs-accent/30 bg-fs-accent/10 text-fs-accent"
              : "border-black/[0.08] bg-fs-card text-neutral-600 dark:border-white/10",
          )}
          aria-pressed={soundOn}
        >
          {soundOn ? (
            <MdVolumeUp className="h-4 w-4" aria-hidden />
          ) : (
            <MdVolumeOff className="h-4 w-4" aria-hidden />
          )}
          {soundOn ? "Son activé" : "Son coupé"}
        </button>
      </div>

      {/* Trois chiffres, et rien de plus : combien attendent, pour combien, depuis
          trop longtemps. */}
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <Tile
          label="En attente"
          value={String(totals.count)}
          icon={MdHourglassEmpty}
          tone={totals.count > 0 ? "accent" : "muted"}
        />
        <Tile label="Montant en file" value={formatCurrency(totals.waiting)} icon={MdPayments} />
        <Tile
          label="Clients qui patientent"
          value={String(totals.late)}
          icon={MdNotificationsActive}
          tone={totals.late > 0 ? "danger" : "muted"}
        />
      </div>

      {/*
        Bandeau de tenue de caisse. Il répond à la seule question qui décide de ce que la
        personne doit faire dans la minute qui suit : « est-ce moi qui encaisse ? »
      */}
      {storeId ? (
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2.5",
            heldByOther
              ? "border-amber-500/40 bg-amber-500/10"
              : holder?.isMine
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-black/[0.08] bg-fs-card dark:border-white/10",
          )}
        >
          <MdPointOfSale
            className={cn(
              "h-5 w-5 shrink-0",
              heldByOther
                ? "text-amber-600"
                : holder?.isMine
                  ? "text-emerald-600"
                  : "text-neutral-400",
            )}
            aria-hidden
          />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-fs-text sm:text-sm">
            {heldByOther ? (
              <>
                <span className="font-bold">
                  {holder?.holderName ?? "Un collègue"} tient la caisse
                </span>{" "}
                depuis {timeLabel(holder?.takenAt ?? null)}. Vous restez en vente : envoyez-lui
                vos paniers depuis la caisse rapide.
              </>
            ) : holder?.isMine ? (
              <>
                <span className="font-bold">Vous tenez la caisse</span> depuis{" "}
                {timeLabel(holder.takenAt)}. Vos collègues ne peuvent pas encaisser tant que
                vous ne l&apos;avez pas rendue.
              </>
            ) : (
              <>
                <span className="font-bold">Caisse libre.</span> La première personne qui
                encaisse la prend — les autres restent alors en vente.
              </>
            )}
          </p>
          {holder?.isMine ? (
            <button
              type="button"
              onClick={() => releaseMut.mutate()}
              disabled={releaseMut.isPending}
              className="shrink-0 rounded-md border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-fs-text disabled:opacity-60 dark:border-white/10"
            >
              Rendre la caisse
            </button>
          ) : heldByOther ? (
            /* Le propriétaire n'attend pas trois minutes qu'un employé parti déjeuner
             * libère sa caisse : c'est son argent et son magasin. */
            h?.isOwner ? (
              <button
                type="button"
                onClick={() => takeMut.mutate(true)}
                disabled={takeMut.isPending}
                className="shrink-0 rounded-md border border-amber-500/50 bg-fs-card px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-60 dark:text-amber-300"
              >
                Reprendre la caisse
              </button>
            ) : null
          ) : (
            <button
              type="button"
              onClick={() => takeMut.mutate(false)}
              disabled={takeMut.isPending}
              className="shrink-0 rounded-md bg-fs-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              Prendre la caisse
            </button>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
          À encaisser
          {totals.count > 0 ? (
            <span className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-sm bg-fs-accent px-1.5 text-[11px] font-extrabold text-white">
              {totals.count}
            </span>
          ) : null}
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          Aujourd&apos;hui
        </TabButton>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-500",
            pendingQ.isFetching && "text-fs-accent",
          )}
          aria-live="polite"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              pendingQ.isError ? "bg-red-500" : "animate-pulse bg-emerald-500",
            )}
          />
          {pendingQ.isError ? "Hors ligne" : "Mise à jour automatique"}
        </span>
      </div>

      {tab === "queue" ? (
        pendingQ.isError ? (
          <FsQueryErrorPanel error={pendingQ.error} onRetry={() => void pendingQ.refetch()} />
        ) : pendingQ.isPending ? (
          <div className="mt-6 flex justify-center py-10" role="status" aria-label="Chargement">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : pending.length === 0 ? (
          <FsCard className="mt-3 rounded-md sm:rounded-md" padding="p-8">
            <div className="flex flex-col items-center text-center">
              <MdInbox className="h-10 w-10 text-neutral-300" aria-hidden />
              <p className="mt-3 text-sm font-bold text-fs-text">Aucun panier en attente</p>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-neutral-600">
                Dès qu&apos;un vendeur envoie un panier depuis la caisse, il apparaît ici —
                avec un son. Laissez cette page ouverte sur le poste de caisse.
              </p>
              <Link
                href={ROUTES.sales}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-fs-text dark:border-white/10"
              >
                <MdPointOfSale className="h-4 w-4" aria-hidden />
                Ouvrir une caisse
              </Link>
            </div>
          </FsCard>
        ) : (
          <div className="mt-3 grid gap-2.5 min-[900px]:grid-cols-2 min-[1400px]:grid-cols-3">
            {pending.map((handoff) => (
              <QueueCard
                key={handoff.id}
                handoff={handoff}
                now={now}
                myId={myId}
                customerName={
                  handoff.customerId ? (customerNameById.get(handoff.customerId) ?? null) : null
                }
                storeName={storeId ? null : (storeNameById.get(handoff.storeId) ?? null)}
                busy={claimMut.isPending}
                canCash={canCash}
                onClaim={(claim) => claimMut.mutate({ id: handoff.id, claim })}
                onCheckout={() => setCheckingOut(handoff)}
                onCancel={() => {
                  setCancelReason("");
                  setCancelling(handoff);
                }}
              />
            ))}
          </div>
        )
      ) : (
        <HistoryList
          query={historyQ}
          paidCount={paidToday.count}
          paidAmount={paidToday.amount}
        />
      )}

      {checkingOut ? (
        <HandoffCheckoutDialog
          handoff={checkingOut}
          customers={customerOptions}
          providers={providers}
          allowCard={!(paySettings.enabled && paySettings.hideCard)}
          allowSplit={paySettings.enabled && paySettings.splitEnabled}
          allowCredit={creditEnabledQ.data === true}
          hideCustomer={paySettings.enabled && paySettings.hideCustomer}
          requireCustomer={customerPolicy.requireCustomer}
          busy={checkoutMut.isPending}
          onClose={() => {
            if (!checkoutMut.isPending) setCheckingOut(null);
          }}
          onSubmit={(payload) => checkoutMut.mutate({ handoff: checkingOut, payload })}
        />
      ) : null}

      {cancelling ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fermer"
            onClick={() => (cancelMut.isPending ? undefined : setCancelling(null))}
          />
          <div className="relative z-10 w-full rounded-t-md border border-black/10 bg-fs-card p-4 shadow-2xl sm:max-w-md sm:rounded-md dark:border-white/10">
            <h2 className="text-base font-bold text-fs-text">
              Annuler le bon {cancelling.number} ?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Le panier ne sera pas encaissé. Rien n&apos;est retiré du stock — il n&apos;y
              avait rien de réservé. Le vendeur verra l&apos;annulation et votre motif.
            </p>
            <input
              className={fsInputClass("mt-3 rounded-md")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motif (ex. le client s'est ravisé)"
              aria-label="Motif de l'annulation"
            />
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setCancelling(null)}
                disabled={cancelMut.isPending}
                className="flex-1 rounded-md border border-black/[0.08] bg-fs-card py-2.5 text-sm font-semibold text-fs-text disabled:opacity-60 dark:border-white/10"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={() =>
                  cancelMut.mutate({ id: cancelling.id, reason: cancelReason })
                }
                disabled={cancelMut.isPending}
                className="flex-1 rounded-md bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {cancelMut.isPending ? "Annulation…" : "Annuler le bon"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <ReceiptTicketDialog
          data={receipt}
          paperWidthMm={receiptTarget?.paperWidthMm ?? 80}
          remotePrint={
            receiptTarget
              ? {
                  label: `Imprimer chez ${receiptTarget.sellerName}`,
                  busy: remotePrintMut.isPending,
                  onPrint: () => remotePrintMut.mutate(),
                }
              : null
          }
          a4Print={printFormatChoiceOn ? receiptSale : null}
          onClose={() => {
            if (remotePrintMut.isPending) return;
            setReceipt(null);
            setReceiptTarget(null);
            setReceiptSale(null);
          }}
        />
      ) : null}
    </FsPage>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-sm border px-3 py-2 text-xs font-semibold sm:text-sm",
        active
          ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)] text-fs-accent"
          : "border-black/[0.08] bg-fs-card text-neutral-700 dark:border-white/10",
      )}
    >
      {children}
    </button>
  );
}

function Tile({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "accent" | "danger" | "muted";
}) {
  return (
    <FsCard className="rounded-md sm:rounded-md" padding="p-3">
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            tone === "danger"
              ? "text-red-500"
              : tone === "accent"
                ? "text-fs-accent"
                : "text-neutral-400",
          )}
          aria-hidden
        />
        <span className="truncate text-[11px] font-medium text-neutral-500">{label}</span>
      </div>
      <p
        className={cn(
          "mt-1 truncate text-lg font-extrabold tracking-tight sm:text-xl",
          tone === "danger"
            ? "text-red-600"
            : tone === "accent"
              ? "text-fs-accent"
              : tone === "muted"
                ? "text-neutral-500"
                : "text-fs-text",
        )}
      >
        {value}
      </p>
    </FsCard>
  );
}

/** Une carte de la file. Conçue pour être lue en une seconde, à un mètre de distance. */
function QueueCard({
  handoff,
  now,
  myId,
  customerName,
  storeName,
  busy,
  canCash,
  onClaim,
  onCheckout,
  onCancel,
}: {
  handoff: PosHandoff;
  now: number;
  myId: string | null;
  customerName: string | null;
  /** Renseigne uniquement en vue « toutes boutiques » — sinon inutile et bruyant. */
  storeName: string | null;
  busy: boolean;
  /** Faux quand un collègue tient la caisse : encaisser est alors interdit. */
  canCash: boolean;
  onClaim: (claim: boolean) => void;
  onCheckout: () => void;
  onCancel: () => void;
}) {
  const urgency = handoffUrgency(handoff.createdAt, now);
  const units = handoffUnitCount(handoff);
  const shown = handoff.items.slice(0, 3);
  const hidden = handoff.items.length - shown.length;
  const claimedByMe = handoff.claimedBy != null && handoff.claimedBy === myId;
  const claimedByOther = handoff.claimedBy != null && handoff.claimedBy !== myId;

  return (
    <FsCard className={cn("border-l-4 rounded-md sm:rounded-md", URGENCY_CARD[urgency])} padding="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-sm bg-fs-accent px-2.5 py-1 text-sm font-extrabold tracking-tight text-white">
            {handoff.number}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-bold",
              URGENCY_CHIP[urgency],
            )}
          >
            <MdSchedule className="h-3 w-3" aria-hidden />
            {waitingLabel(handoff.createdAt, now)}
          </span>
        </div>
        <span className="text-right text-lg font-extrabold leading-none tracking-tight text-fs-text sm:text-xl">
          {formatCurrency(handoff.total)}
        </span>
      </div>

      <p className="mt-2 flex items-center gap-1 text-xs text-neutral-600">
        <MdPerson className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
        <span className="truncate">
          {handoff.createdByName ?? "Collègue"} · {units} article{units > 1 ? "s" : ""}
          {storeName ? ` · ${storeName}` : ""}
        </span>
      </p>

      <ul className="mt-2 space-y-0.5">
        {shown.map((it) => (
          <li key={it.id} className="flex items-baseline gap-2 text-[13px]">
            <span className="shrink-0 font-bold tabular-nums text-fs-accent">{it.quantity}×</span>
            <span className="min-w-0 flex-1 truncate text-fs-text">{it.label}</span>
            <span className="shrink-0 tabular-nums text-neutral-600">
              {formatCurrency(handoffLineTotal(it))}
            </span>
          </li>
        ))}
        {hidden > 0 ? (
          <li className="text-[11px] font-medium text-neutral-500">
            + {hidden} autre{hidden > 1 ? "s" : ""} article{hidden > 1 ? "s" : ""}
          </li>
        ) : null}
      </ul>

      {customerName ? (
        <p className="mt-2 truncate text-xs text-neutral-600">Client : {customerName}</p>
      ) : null}
      {handoff.note ? (
        <p className="mt-1.5 rounded-sm bg-amber-500/10 px-2 py-1.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          « {handoff.note} »
        </p>
      ) : null}

      {claimedByOther ? (
        <p className="mt-2 rounded-sm bg-sky-500/10 px-2 py-1.5 text-xs font-medium text-sky-800 dark:text-sky-300">
          {handoff.claimedByName ?? "Un collègue"} s&apos;en occupe — vous pouvez quand même
          reprendre.
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-black/[0.08] bg-fs-card px-3 py-2.5 text-xs font-semibold text-neutral-600 dark:border-white/10"
        >
          <MdClose className="h-4 w-4" aria-hidden />
          <span className="sr-only">Annuler le bon {handoff.number}</span>
        </button>
        <button
          type="button"
          onClick={() => onClaim(!claimedByMe)}
          disabled={busy}
          className={cn(
            "rounded-md border px-3 py-2.5 text-xs font-semibold disabled:opacity-60",
            claimedByMe
              ? "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300"
              : "border-black/[0.08] bg-fs-card text-neutral-700 dark:border-white/10",
          )}
        >
          {claimedByMe ? "C'est moi" : "Je le prends"}
        </button>
        <button
          type="button"
          onClick={onCheckout}
          disabled={!canCash}
          title={canCash ? undefined : "Un collègue tient la caisse"}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-fs-accent py-2.5 text-sm font-extrabold tracking-tight text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MdPayments className="h-4 w-4" aria-hidden />
          ENCAISSER
        </button>
      </div>
    </FsCard>
  );
}

/** Ce que sont devenus les bons du jour : la lecture du soir. */
function HistoryList({
  query,
  paidCount,
  paidAmount,
}: {
  query: {
    data?: PosHandoff[];
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => void;
  };
  paidCount: number;
  paidAmount: number;
}) {
  if (query.isError) {
    return <FsQueryErrorPanel error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.isPending) {
    return (
      <div className="mt-6 flex justify-center py-10" role="status" aria-label="Chargement">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
      </div>
    );
  }
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <FsCard className="mt-3 rounded-md sm:rounded-md" padding="p-8">
        <p className="text-center text-sm text-neutral-600">
          Aucun bon terminé aujourd&apos;hui.
        </p>
      </FsCard>
    );
  }

  return (
    <>
      <FsCard className="mt-3 rounded-md sm:rounded-md" padding="p-3">
        <p className="text-xs text-neutral-600">
          <span className="font-bold text-fs-text">{paidCount}</span> bon
          {paidCount > 1 ? "s" : ""} encaissé{paidCount > 1 ? "s" : ""} aujourd&apos;hui, pour{" "}
          <span className="font-bold text-fs-text">{formatCurrency(paidAmount)}</span>.
        </p>
      </FsCard>
      <div className="mt-2.5 space-y-2">
        {rows.map((x) => {
          const paid = x.status === "paid";
          return (
            <FsCard key={x.id} className="rounded-md sm:rounded-md" padding="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-bold",
                      paid
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300",
                    )}
                  >
                    {paid ? (
                      <MdCheckCircle className="h-3 w-3" aria-hidden />
                    ) : (
                      <MdClose className="h-3 w-3" aria-hidden />
                    )}
                    {paid ? "Encaissé" : "Annulé"}
                  </span>
                  <span className="text-sm font-bold text-fs-text">{x.number}</span>
                </div>
                <span
                  className={cn(
                    "text-sm font-extrabold tabular-nums",
                    paid ? "text-fs-text" : "text-neutral-400 line-through",
                  )}
                >
                  {formatCurrency(x.total)}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                Préparé par{" "}
                <span className="font-semibold text-fs-text">
                  {x.createdByName ?? "un collègue"}
                </span>{" "}
                à {timeLabel(x.createdAt)}
                {paid ? (
                  <>
                    {" · encaissé par "}
                    <span className="font-semibold text-fs-text">
                      {x.paidByName ?? "un collègue"}
                    </span>{" "}
                    à {timeLabel(x.paidAt)}
                  </>
                ) : (
                  <>
                    {" · annulé par "}
                    <span className="font-semibold text-fs-text">
                      {x.cancelledByName ?? "un collègue"}
                    </span>{" "}
                    à {timeLabel(x.cancelledAt)}
                  </>
                )}
              </p>
              {!paid && x.cancelReason ? (
                <p className="mt-1 text-xs italic text-neutral-500">« {x.cancelReason} »</p>
              ) : null}
              {paid && x.saleId ? (
                <Link
                  href={`${ROUTES.sales}?store=${encodeURIComponent(x.storeId)}`}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-fs-accent"
                >
                  <MdReceiptLong className="h-3.5 w-3.5" aria-hidden />
                  Voir dans les ventes
                </Link>
              ) : null}
            </FsCard>
          );
        })}
      </div>
    </>
  );
}
