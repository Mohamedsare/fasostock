"use client";

/**
 * « Enlèvements partenaires » — l'exact opposé de l'Approvisionnement.
 *
 * L'Approvisionnement enregistre ce que le commerçant VA PRENDRE chez un confrère.
 * Cet écran enregistre ce qu'un confrère VIENT PRENDRE chez lui : la marchandise sort,
 * un papier est remis, et il reste presque toujours quelque chose à payer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MOMENT QUE L'ÉCRAN DOIT TENIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Un camion est devant la boutique, le chargement a commencé, le partenaire est pressé.
 * Ce n'est ni une vente au comptoir (pas de ticket, pas de client de passage), ni une
 * facture posée (pas de devis, pas de délai). C'est un chargement qu'il faut écrire
 * pendant qu'il se fait.
 *
 * D'où la forme : une recherche, des lignes qu'on empile, un prix déjà proposé (celui
 * du gros), et un seul champ qui compte à la fin — ce qui est laissé aujourd'hui.
 * Le reste — l'échéance, la note, le téléphone — est facultatif et vient après.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GARDE-FOU QUI JUSTIFIE L'ÉCRAN À LUI SEUL
 * ─────────────────────────────────────────────────────────────────────────────
 * Un prix consenti « pour rendre service » est le plus souvent consenti de tête, au
 * milieu du bruit. L'écran compare chaque ligne au prix d'achat et prévient quand la
 * marge passe sous zéro. C'est l'erreur que le cahier ne rattrape jamais : elle ne se
 * découvre qu'à l'inventaire, des mois plus tard, quand plus personne ne peut dire à
 * quel prix ce carton avait été acheté.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdArrowForward,
  MdCheckCircle,
  MdClose,
  MdDeleteOutline,
  MdHistory,
  MdLocalShipping,
  MdLock,
  MdPayments,
  MdPictureAsPdf,
  MdQrCodeScanner,
  MdRemove,
  MdSearch,
  MdWarningAmber,
  MdWhatsapp,
} from "react-icons/md";

import { PosBarcodeScannerDialog } from "@/components/pos/pos-barcode-scanner-dialog";
import { OfftakePaymentDialog } from "@/components/partner-offtakes/offtake-payment-dialog";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { FsPager } from "@/components/ui/fs-pager";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  FsSectionLabel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import {
  addOfftakePayment,
  cancelPartnerOfftake,
  createPartnerOfftake,
  fetchOfftakeCatalog,
  listPartnerOfftakes,
  offtakeStatus,
  OFFTAKE_AMOUNT_EPS,
} from "@/lib/features/partner-offtakes/api";
import {
  buildOfftakeDeliveryMessage,
  buildOfftakeReminderMessage,
} from "@/lib/features/partner-offtakes/messages";
import {
  OFFTAKE_STATUS_LABELS,
  OFFTAKES_PAGE_SIZE,
  type OfftakeDraftLine,
  type OfftakeProduct,
  type PartnerOfftake,
} from "@/lib/features/partner-offtakes/types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { whatsappUrl } from "@/lib/features/share/share-document";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, getActiveCurrency, toNumber } from "@/lib/utils/currency";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";
import { playPosAddBeep } from "@/lib/utils/pos-sound";

/** Minuscules sans accent : le vendeur tape vite et mal — c'est la condition de la vitesse. */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Au-delà, la liste de résultats devient un mur : on affiche les meilleurs. */
const MAX_RESULTS = 8;

function newKey(): string {
  return `l_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

/**
 * Clé d'idempotence — envoyée à un paramètre `uuid` de PostgreSQL, qui refuse tout ce
 * qui n'a pas la forme d'un UUID. D'où un vrai repli v4 (et non une chaîne libre) : sur
 * un navigateur ancien ou un contexte non sécurisé, `crypto.randomUUID` n'existe pas, et
 * une clé mal formée ferait échouer CHAQUE validation.
 */
function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (Math.floor(Math.random() * 256) & (15 >> (n / 4)))).toString(16);
  });
}

function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    timeZone: getActiveTimeZone(),
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dueLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Ouvre le bon A4 dans un onglet. Le serveur relit tout en base — rien ne part d'ici. */
async function openOfftakePdf(offtakeId: string): Promise<void> {
  const res = await fetch("/api/pdf/partner-offtake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ offtakeId, currencyCode: getActiveCurrency() }),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* texte brut */
    }
    throw new Error(msg || "Le bon n'a pas pu être généré.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function PartnerOfftakesScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const contextStoreId = ctx.data?.storeId ?? null;
  const stores = useMemo(() => ctx.data?.stores ?? [], [ctx.data?.stores]);
  const aliasesOn = ctx.data?.productAliasesEnabled === true;
  const isOwner = h?.isOwner ?? false;
  const canView = h?.canPartnerOfftakes ?? false;

  /**
   * Vue « toutes boutiques » : il faut bien choisir d'où la marchandise sort. On propose
   * la première plutôt qu'un écran vide — le cas courant est d'avoir une seule boutique,
   * et poser une question pour rien coûte un geste.
   */
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const storeId = contextStoreId ?? pickedStoreId ?? stores[0]?.id ?? null;
  const storeName = stores.find((s) => s.id === storeId)?.name ?? "";

  const [tab, setTab] = useState<"new" | "history">("new");

  // ── Saisie ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<OfftakeDraftLine[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [paidText, setPaidText] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [lastOfftake, setLastOfftake] = useState<PartnerOfftake | null>(null);

  // ── Historique ────────────────────────────────────────────────────────────
  const [histFilter, setHistFilter] = useState<"open" | "settled" | "all">("open");
  const [histQuery, setHistQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paying, setPaying] = useState<PartnerOfftake | null>(null);
  const [cancelling, setCancelling] = useState<PartnerOfftake | null>(null);
  const [restoreStock, setRestoreStock] = useState(true);

  /**
   * Clé d'idempotence de l'enlèvement EN COURS. Elle vit aussi longtemps que le panier :
   * si la validation part deux fois (réseau qui lâche, double tape), la base reconnaît
   * la même clé et ne sort le stock qu'une fois. Renouvelée après chaque succès.
   */
  const requestIdRef = useRef<string>(newRequestId());

  const enabled = Boolean(companyId && storeId) && canView;

  /**
   * Changer de boutique en cours de saisie : les lignes portent le stock et les prix de
   * l'ANCIENNE boutique, et la validation les sortirait de la nouvelle. On repart donc à
   * zéro — retaper trois lignes coûte dix secondes, sortir dix cartons du mauvais
   * magasin ne se découvre qu'à l'inventaire.
   */
  const storeRef = useRef<string | null>(storeId);
  useEffect(() => {
    if (storeRef.current === storeId) return;
    storeRef.current = storeId;
    setLines([]);
    requestIdRef.current = newRequestId();
  }, [storeId]);

  const catalogQ = useQuery({
    queryKey: queryKeys.partnerOfftakeCatalog(companyId, storeId ?? ""),
    queryFn: () => fetchOfftakeCatalog({ companyId, storeId: storeId! }),
    enabled: enabled && Boolean(storeId),
    staleTime: 60_000,
  });

  /*
   * L'historique est PAGINÉ CÔTÉ SERVEUR. Une boutique qui tourne fait plusieurs bons
   * par jour : au bout d'un an, tout charger d'un coup, c'est plusieurs milliers de
   * lignes et leurs articles envoyés à un téléphone pour en afficher vingt.
   *
   * `placeholderData` garde la page précédente à l'écran pendant que la suivante
   * arrive : sans lui, chaque changement de page vide la liste et fait sauter la mise en
   * page — sur une connexion lente, l'écran clignote à chaque clic.
   */
  const [page, setPage] = useState(0);
  const historyQ = useQuery({
    queryKey: queryKeys.partnerOfftakesPage(companyId, contextStoreId, page),
    queryFn: () =>
      listPartnerOfftakes({
        companyId,
        storeId: contextStoreId,
        limit: OFFTAKES_PAGE_SIZE,
        offset: page * OFFTAKES_PAGE_SIZE,
      }),
    enabled: Boolean(companyId) && canView,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  /*
   * Changer de boutique remet la pagination à sa première page — sinon on atterrit
   * « page 4 » d'une boutique qui n'a que douze lignes, donc sur un écran vide.
   *
   * Différé d'un tour de boucle : remettre l'état à plat en plein corps d'effet
   * déclenche la cascade de rendus que `react-hooks/set-state-in-effect` interdit.
   */
  useEffect(() => {
    const t = setTimeout(() => setPage(0), 0);
    return () => clearTimeout(t);
  }, [contextStoreId]);

  const catalog = useMemo(() => catalogQ.data ?? [], [catalogQ.data]);
  const offtakes = useMemo(() => historyQ.data?.rows ?? [], [historyQ.data]);
  const historyHasMore = historyQ.data?.hasMore ?? false;

  /** Partenaires déjà venus — proposés à la saisie pour ne pas retaper un nom. */
  const knownPartners = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of offtakes) {
      const key = norm(o.partnerName);
      if (key && !seen.has(key)) seen.set(key, o.partnerName);
    }
    return [...seen.values()].slice(0, 12);
  }, [offtakes]);

  /** Le téléphone déjà connu de ce partenaire — évite de le redemander à chaque fois. */
  useEffect(() => {
    if (partnerPhone.trim() !== "") return;
    const key = norm(partnerName);
    if (!key) return;
    const previous = offtakes.find((o) => norm(o.partnerName) === key && o.partnerPhone);
    if (previous?.partnerPhone) setPartnerPhone(previous.partnerPhone);
    // `partnerPhone` volontairement hors dépendances : on ne veut REMPLIR que le champ
    // resté vide, jamais réécrire ce que l'utilisateur vient de taper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerName, offtakes]);

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    const taken = new Set(lines.map((l) => l.productId));
    const scored: { p: OfftakeProduct; score: number }[] = [];
    for (const p of catalog) {
      if (taken.has(p.id)) continue;
      const name = norm(p.name);
      let score = -1;
      if (name.startsWith(q)) score = 0;
      else if (name.includes(q)) score = 1;
      else if ((p.barcode ?? "").includes(query.trim())) score = 0;
      else if (aliasesOn && p.searchAliases.some((a) => norm(a).includes(q))) score = 2;
      if (score >= 0) scored.push({ p, score });
    }
    scored.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name));
    return scored.slice(0, MAX_RESULTS).map((s) => s.p);
  }, [catalog, query, lines, aliasesOn]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    [lines],
  );
  const paidNow = Math.max(0, Math.min(toNumber(paidText), total));
  const remainingNow = Math.max(0, total - paidNow);

  /** Lignes vendues sous le prix d'achat — le garde-fou central de l'écran. */
  const belowCost = useMemo(
    () => lines.filter((l) => l.cataloguePurchasePrice > 0 && l.unitPrice < l.cataloguePurchasePrice),
    [lines],
  );

  function addProduct(p: OfftakeProduct) {
    if (p.stock <= 0) {
      toast.blocked({
        title: "Plus de stock",
        message: `Il ne reste rien de « ${p.name} » dans ${storeName || "cette boutique"}.`,
        hint: "Faites entrer la marchandise (Approvisionnement ou Achats) avant de la faire sortir.",
      });
      return;
    }
    /*
     * Prix proposé : celui du gros s'il est renseigné, sinon le prix comptoir. Un
     * confrère paie presque toujours le prix de gros — le proposer d'emblée évite
     * vingt saisies, et le champ reste modifiable pour la négociation du jour.
     */
    const suggested =
      p.catalogueWholesalePrice > 0 ? p.catalogueWholesalePrice : p.catalogueSalePrice;
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        productId: p.id,
        label: p.name,
        unit: p.unit,
        quantity: 1,
        unitPrice: suggested,
        catalogueSalePrice: p.catalogueSalePrice,
        cataloguePurchasePrice: p.cataloguePurchasePrice,
        currentStock: p.stock,
      },
    ]);
    setQuery("");
    playPosAddBeep();
  }

  function patchLine(key: string, patch: Partial<OfftakeDraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function onScanned(code: string) {
    setScanOpen(false);
    const trimmed = code.trim();
    if (!trimmed) return;
    const hit = catalog.find((p) => (p.barcode ?? "").trim() === trimmed);
    if (!hit) {
      setQuery(trimmed);
      toast.info("Aucun article ne porte ce code-barres.");
      return;
    }
    const already = lines.find((l) => l.productId === hit.id);
    if (already) {
      patchLine(already.key, { quantity: already.quantity + 1 });
      playPosAddBeep();
      return;
    }
    addProduct(hit);
  }

  const createMut = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Choisissez la boutique d'où sort la marchandise.");
      const id = await createPartnerOfftake({
        companyId,
        storeId,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        partnerName: partnerName.trim(),
        partnerPhone: partnerPhone.trim() || null,
        customerId: null,
        amountPaid: paidNow,
        dueAt: dueAt || null,
        note: note.trim() || null,
        clientRequestId: requestIdRef.current,
      });
      // On relit l'enlèvement plutôt que de le reconstituer : numéro et totaux sont
      // calculés en base, et c'est CE bon-là qu'on va imprimer et envoyer.
      const fresh = await listPartnerOfftakes({ companyId, storeId, limit: 5 });
      return fresh.rows.find((o) => o.id === id) ?? null;
    },
    onSuccess: async (created) => {
      toast.success("Enlèvement enregistré. Le stock est à jour.");
      setLastOfftake(created);
      setLines([]);
      setPaidText("");
      setDueAt("");
      setNote("");
      // Le nom et le téléphone restent : le même partenaire fait souvent deux
      // chargements de suite (un pour lui, un pour son frère).
      requestIdRef.current = newRequestId();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["partner-offtakes", companyId] }),
        qc.invalidateQueries({ queryKey: ["quick-supply", companyId] }),
        qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) }),
        qc.invalidateQueries({ queryKey: queryKeys.products(companyId) }),
      ]);
    },
    onError: (e) => toastMutationError("partner-offtakes", e),
  });

  const payMut = useMutation({
    mutationFn: (v: {
      offtakeId: string;
      amount: number;
      method: string;
      reference: string | null;
      note: string | null;
    }) => addOfftakePayment(v),
    onSuccess: async (remaining) => {
      toast.success(
        remaining <= OFFTAKE_AMOUNT_EPS
          ? "Règlement enregistré. Ce bon est soldé."
          : `Règlement enregistré. Reste ${formatCurrency(remaining)}.`,
      );
      setPaying(null);
      await qc.invalidateQueries({ queryKey: ["partner-offtakes", companyId] });
    },
    onError: (e) => toastMutationError("partner-offtakes", e),
  });

  const cancelMut = useMutation({
    mutationFn: (v: { offtakeId: string; restoreStock: boolean }) =>
      cancelPartnerOfftake({ ...v, reason: null }),
    onSuccess: async (_d, vars) => {
      toast.success(
        vars.restoreStock
          ? "Enlèvement annulé. La marchandise est revenue en stock."
          : "Enlèvement annulé. Le stock n'a pas été modifié.",
      );
      setCancelling(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["partner-offtakes", companyId] }),
        qc.invalidateQueries({ queryKey: queryKeys.productInventory(contextStoreId) }),
      ]);
    },
    onError: (e) => toastMutationError("partner-offtakes", e),
  });

  const pdfMut = useMutation({
    mutationFn: (offtakeId: string) => openOfftakePdf(offtakeId),
    onError: (e) => toastMutationError("partner-offtakes", e),
  });

  function sendWhatsApp(o: PartnerOfftake, kind: "delivery" | "reminder") {
    const message =
      kind === "delivery"
        ? buildOfftakeDeliveryMessage({ offtake: o, storeName: o.storeName ?? storeName })
        : buildOfftakeReminderMessage({ offtake: o, storeName: o.storeName ?? storeName });
    window.open(whatsappUrl(o.partnerPhone, message), "_blank", "noopener,noreferrer");
  }

  const filteredHistory = useMemo(() => {
    const q = norm(histQuery);
    return offtakes.filter((o) => {
      const st = offtakeStatus(o);
      if (histFilter === "open" && (st === "paid" || st === "cancelled")) return false;
      if (histFilter === "settled" && st !== "paid") return false;
      if (!q) return true;
      return norm(o.partnerName).includes(q) || norm(o.offtakeNumber).includes(q);
    });
  }, [offtakes, histFilter, histQuery]);

  /** Ce que le patron vient chercher en ouvrant l'onglet : combien dort dehors. */
  const summary = useMemo(() => {
    let out = 0;
    let cashed = 0;
    let due = 0;
    for (const o of offtakes) {
      if (o.cancelledAt) continue;
      out += o.totalAmount;
      cashed += o.amountPaid;
      due += o.remaining;
    }
    return { out, cashed, due };
  }, [offtakes]);

  if (permLoading) {
    return (
      <FsPage>
        <FsScreenHeader title="Enlèvements" />
        <div className="flex justify-center py-10" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!canView) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Enlèvements"
          subtitle="La marchandise qu'un confrère vient prendre chez vous."
        />
        <FsCard padding="p-6">
          <div className="text-center">
            <MdLock className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">Accès réservé</p>
            <p className="mt-1 text-xs text-neutral-600">
              {h?.partnerOfftakesOn
                ? "Demandez au propriétaire le droit « Gérer les enlèvements partenaires » (page Employés)."
                : "Le propriétaire n'a pas encore activé les enlèvements (Paramètres)."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Enlèvements partenaires"
        subtitle="Ce qu'un confrère emporte, ce qu'il laisse, et ce qu'il reste à payer."
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <FsFilterChip
          icon={MdLocalShipping}
          label="Nouvel enlèvement"
          selected={tab === "new"}
          onClick={() => setTab("new")}
        />
        <FsFilterChip
          icon={MdHistory}
          label={`Suivi${summary.due > 0 ? " · " + formatCurrency(summary.due) : ""}`}
          selected={tab === "history"}
          onClick={() => setTab("history")}
        />
      </div>

      {/* Boutique — seulement en vue « toutes boutiques » : ailleurs la réponse est déjà connue. */}
      {contextStoreId == null && stores.length > 1 ? (
        <FsCard className="mb-3" padding="p-3">
          <FsSectionLabel>Sortie du stock de</FsSectionLabel>
          <select
            value={storeId ?? ""}
            onChange={(e) => setPickedStoreId(e.target.value)}
            className={fsInputClass("mt-1.5")}
            aria-label="Boutique"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FsCard>
      ) : null}

      {tab === "new" ? (
        <NewOfftakeTab
          storeName={storeName}
          catalogPending={catalogQ.isPending}
          catalogError={catalogQ.isError ? catalogQ.error : null}
          onCatalogRetry={() => void catalogQ.refetch()}
          query={query}
          setQuery={setQuery}
          results={results}
          onAdd={addProduct}
          onScan={() => setScanOpen(true)}
          lines={lines}
          patchLine={patchLine}
          removeLine={removeLine}
          belowCost={belowCost}
          total={total}
          partnerName={partnerName}
          setPartnerName={setPartnerName}
          partnerPhone={partnerPhone}
          setPartnerPhone={setPartnerPhone}
          knownPartners={knownPartners}
          paidText={paidText}
          setPaidText={setPaidText}
          paidNow={paidNow}
          remainingNow={remainingNow}
          dueAt={dueAt}
          setDueAt={setDueAt}
          note={note}
          setNote={setNote}
          submitting={createMut.isPending}
          onSubmit={() => void createMut.mutateAsync().catch(() => undefined)}
          lastOfftake={lastOfftake}
          onDismissLast={() => setLastOfftake(null)}
          onPdf={(id) => pdfMut.mutate(id)}
          pdfPending={pdfMut.isPending}
          onWhatsApp={(o) => sendWhatsApp(o, "delivery")}
        />
      ) : (
        <HistoryTab
          summary={summary}
          filter={histFilter}
          setFilter={setHistFilter}
          query={histQuery}
          setQuery={setHistQuery}
          rows={filteredHistory}
          pending={historyQ.isPending}
          error={historyQ.isError ? historyQ.error : null}
          onRetry={() => void historyQ.refetch()}
          expanded={expanded}
          setExpanded={setExpanded}
          isOwner={isOwner}
          onPay={(o) => setPaying(o)}
          onCancel={(o) => {
            setRestoreStock(true);
            setCancelling(o);
          }}
          onPdf={(id) => pdfMut.mutate(id)}
          pdfPending={pdfMut.isPending}
          onWhatsApp={(o) => sendWhatsApp(o, "reminder")}
          page={page}
          hasMore={historyHasMore}
          rowsOnPage={offtakes.length}
          onPageChange={setPage}
          pagerBusy={historyQ.isFetching}
        />
      )}

      <PosBarcodeScannerDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDecoded={onScanned}
      />

      {paying ? (
        <OfftakePaymentDialog
          offtake={paying}
          busy={payMut.isPending}
          onClose={() => setPaying(null)}
          onSubmit={(v) => payMut.mutate({ offtakeId: paying.id, ...v })}
        />
      ) : null}

      <FsConfirmDialog
        open={cancelling != null}
        title="Annuler cet enlèvement ?"
        message={
          cancelling ? (
            <span className="block space-y-2">
              <span className="block">
                Le bon {cancelling.offtakeNumber} de {cancelling.partnerName} sera marqué
                annulé. Il reste lisible dans le suivi — rien n&apos;est effacé.
              </span>
              <label className="flex cursor-pointer items-start gap-2 rounded-[8px] bg-black/[0.03] px-2.5 py-2 text-left">
                <input
                  type="checkbox"
                  checked={restoreStock}
                  onChange={(e) => setRestoreStock(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-xs leading-relaxed">
                  <span className="font-semibold">Remettre la marchandise en stock</span>
                  <span className="mt-0.5 block text-neutral-600">
                    À décocher seulement si le partenaire a bien emporté les articles et
                    ne les a pas rapportés : les remettre en stock créerait alors un
                    manquant.
                  </span>
                </span>
              </label>
            </span>
          ) : undefined
        }
        confirmLabel="Annuler le bon"
        tone="danger"
        busy={cancelMut.isPending}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          if (cancelling) {
            cancelMut.mutate({ offtakeId: cancelling.id, restoreStock });
          }
        }}
      />
    </FsPage>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Onglet « Nouvel enlèvement »
 * ────────────────────────────────────────────────────────────────────────── */

function NewOfftakeTab(props: {
  storeName: string;
  catalogPending: boolean;
  catalogError: unknown;
  onCatalogRetry: () => void;
  query: string;
  setQuery: (v: string) => void;
  results: OfftakeProduct[];
  onAdd: (p: OfftakeProduct) => void;
  onScan: () => void;
  lines: OfftakeDraftLine[];
  patchLine: (key: string, patch: Partial<OfftakeDraftLine>) => void;
  removeLine: (key: string) => void;
  belowCost: OfftakeDraftLine[];
  total: number;
  partnerName: string;
  setPartnerName: (v: string) => void;
  partnerPhone: string;
  setPartnerPhone: (v: string) => void;
  knownPartners: string[];
  paidText: string;
  setPaidText: (v: string) => void;
  paidNow: number;
  remainingNow: number;
  dueAt: string;
  setDueAt: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  lastOfftake: PartnerOfftake | null;
  onDismissLast: () => void;
  onPdf: (id: string) => void;
  pdfPending: boolean;
  onWhatsApp: (o: PartnerOfftake) => void;
}) {
  /*
   * La ref du champ de recherche est LOCALE a cet ecran, et n'arrive pas par `props` :
   * un objet de props qui porte une ref rend suspecte, pour le compilateur React,
   * chaque lecture faite pendant le rendu (regle `react-hooks/refs`). Elle n'est de
   * toute facon utile qu'ici — rendre la main au champ apres l'ajout d'un article,
   * pour enchainer le panier sans quitter le clavier.
   */
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const canSubmit =
    props.lines.length > 0 && props.partnerName.trim().length > 0 && !props.submitting;

  return (
    <>
      {/* Le bon qui vient d'être établi — actions immédiates, puis on passe au suivant. */}
      {props.lastOfftake ? (
        <FsCard className="mb-3 border-emerald-500/40 bg-emerald-500/[0.06]" padding="p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <MdCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fs-text">
                Bon {props.lastOfftake.offtakeNumber} — {props.lastOfftake.partnerName}
              </p>
              <p className="mt-0.5 text-xs text-neutral-600">
                {props.lastOfftake.unitCount} article
                {props.lastOfftake.unitCount > 1 ? "s" : ""} sortis ·{" "}
                {formatCurrency(props.lastOfftake.totalAmount)}
                {props.lastOfftake.remaining > 0
                  ? ` · reste ${formatCurrency(props.lastOfftake.remaining)}`
                  : " · soldé"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => props.onWhatsApp(props.lastOfftake!)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#25D366] px-3 py-2 text-xs font-semibold text-white"
                >
                  <MdWhatsapp className="h-4 w-4" aria-hidden />
                  Envoyer le détail
                </button>
                <button
                  type="button"
                  disabled={props.pdfPending}
                  onClick={() => props.onPdf(props.lastOfftake!.id)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-black/[0.1] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-60"
                >
                  <MdPictureAsPdf className="h-4 w-4" aria-hidden />
                  Bon A4
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={props.onDismissLast}
              className="shrink-0 rounded-md p-1 text-neutral-500"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </FsCard>
      ) : null}

      {/* Qui vient prendre — en premier, parce que c'est ce qu'on demande en premier. */}
      <FsCard padding="p-3 sm:p-4">
        <FsSectionLabel>Qui vient prendre</FsSectionLabel>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            value={props.partnerName}
            onChange={(e) => props.setPartnerName(e.target.value)}
            placeholder="Nom du partenaire (ex. Ali du marché)"
            className={fsInputClass("min-w-0 flex-1")}
            aria-label="Nom du partenaire"
          />
          <input
            value={props.partnerPhone}
            onChange={(e) => props.setPartnerPhone(e.target.value)}
            placeholder="Téléphone (pour le bon WhatsApp)"
            inputMode="tel"
            className={fsInputClass("min-w-0 sm:w-56")}
            aria-label="Téléphone du partenaire"
          />
        </div>
        {props.knownPartners.length > 0 && props.partnerName.trim() === "" ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {props.knownPartners.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => props.setPartnerName(p)}
                className="rounded-full border border-black/[0.1] bg-fs-card px-2.5 py-1 text-[11px] font-medium text-neutral-700"
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}
      </FsCard>

      {/* Recherche d'articles */}
      <FsCard className="mt-3" padding="p-3 sm:p-4">
        <FsSectionLabel>Ce qu&apos;il emporte</FsSectionLabel>
        <div className="mt-1.5 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <MdSearch
              className="pointer-events-none absolute left-2.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              value={props.query}
              onChange={(e) => props.setQuery(e.target.value)}
              placeholder="Chercher un article…"
              className={fsInputClass("w-full pl-9")}
              aria-label="Chercher un article"
            />
          </div>
          <button
            type="button"
            onClick={props.onScan}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800"
            aria-label="Scanner un code-barres"
          >
            <MdQrCodeScanner className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        {props.catalogError ? (
          <div className="mt-2">
            <FsQueryErrorPanel error={props.catalogError} onRetry={props.onCatalogRetry} />
          </div>
        ) : null}

        {props.catalogPending ? (
          <p className="mt-2 text-xs text-neutral-500">Chargement du catalogue…</p>
        ) : null}

        {props.results.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {props.results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    props.onAdd(p);
                    searchInputRef.current?.focus();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-black/[0.06] bg-fs-card px-2.5 py-2 text-left"
                >
                  <ProductListThumbnail imageUrl={p.imageUrl} className="h-10 w-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fs-text">
                      {p.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                      Stock : <span className="tabular-nums">{p.stock}</span> {p.unit} ·
                      comptoir {formatCurrency(p.catalogueSalePrice)}
                      {p.catalogueWholesalePrice > 0
                        ? ` · gros ${formatCurrency(p.catalogueWholesalePrice)}`
                        : ""}
                    </span>
                  </span>
                  <MdAdd className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {props.lines.length === 0 ? (
          <p className="mt-3 rounded-[10px] bg-black/[0.03] px-3 py-3 text-center text-xs text-neutral-600">
            Cherchez un article ou scannez son code-barres pour commencer le chargement.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.lines.map((l) => {
              const lineTotal = l.quantity * l.unitPrice;
              const underCost =
                l.cataloguePurchasePrice > 0 && l.unitPrice < l.cataloguePurchasePrice;
              const overStock = l.quantity > l.currentStock;
              return (
                <li
                  key={l.key}
                  className={cn(
                    "rounded-[10px] border bg-fs-card p-2.5",
                    underCost || overStock ? "border-red-500/40" : "border-black/[0.06]",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fs-text">{l.label}</p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        Stock : <span className="tabular-nums">{l.currentStock}</span> {l.unit} ·
                        comptoir {formatCurrency(l.catalogueSalePrice)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => props.removeLine(l.key)}
                      className="shrink-0 rounded-md p-1 text-neutral-400"
                      aria-label={`Retirer ${l.label}`}
                    >
                      <MdDeleteOutline className="h-5 w-5" aria-hidden />
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1 rounded-[8px] border border-black/[0.1]">
                      <button
                        type="button"
                        onClick={() =>
                          props.patchLine(l.key, { quantity: Math.max(1, l.quantity - 1) })
                        }
                        className="px-2.5 py-1.5 text-neutral-600"
                        aria-label="Moins un"
                      >
                        <MdRemove className="h-4 w-4" aria-hidden />
                      </button>
                      <input
                        value={String(l.quantity)}
                        onChange={(e) =>
                          props.patchLine(l.key, {
                            quantity: Math.max(1, Math.floor(toNumber(e.target.value))),
                          })
                        }
                        inputMode="numeric"
                        className="w-14 border-x border-black/[0.1] bg-transparent px-1 py-1.5 text-center text-sm font-bold tabular-nums text-fs-text outline-none"
                        aria-label={`Quantité de ${l.label}`}
                      />
                      <button
                        type="button"
                        onClick={() => props.patchLine(l.key, { quantity: l.quantity + 1 })}
                        className="px-2.5 py-1.5 text-neutral-600"
                        aria-label="Plus un"
                      >
                        <MdAdd className="h-4 w-4" aria-hidden />
                      </button>
                    </div>

                    <label className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="shrink-0 text-[11px] font-medium text-neutral-500">
                        P.U.
                      </span>
                      <input
                        value={String(l.unitPrice)}
                        onChange={(e) =>
                          props.patchLine(l.key, {
                            unitPrice: Math.max(0, toNumber(e.target.value)),
                          })
                        }
                        inputMode="numeric"
                        className={fsInputClass("min-w-0 flex-1 text-right tabular-nums")}
                        aria-label={`Prix unitaire de ${l.label}`}
                      />
                    </label>

                    <span className="shrink-0 text-sm font-bold tabular-nums text-fs-text">
                      {formatCurrency(lineTotal)}
                    </span>
                  </div>

                  {overStock ? (
                    <p className="mt-1.5 text-[11px] font-semibold text-red-600">
                      Vous n&apos;avez que {l.currentStock} {l.unit} en stock.
                    </p>
                  ) : null}
                  {underCost ? (
                    <p className="mt-1.5 flex items-start gap-1 text-[11px] font-semibold text-red-600">
                      <MdWarningAmber className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      Sous votre prix d&apos;achat ({formatCurrency(l.cataloguePurchasePrice)})
                      : vous perdez {formatCurrency(l.cataloguePurchasePrice - l.unitPrice)} par{" "}
                      {l.unit}.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </FsCard>

      {/* Règlement */}
      {props.lines.length > 0 ? (
        <FsCard className="mt-3" padding="p-3 sm:p-4">
          <div className="flex items-baseline justify-between">
            <FsSectionLabel>Règlement</FsSectionLabel>
            <span className="text-lg font-bold tabular-nums text-fs-text">
              {formatCurrency(props.total)}
            </span>
          </div>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-neutral-600">
                Versé maintenant
              </span>
              <input
                value={props.paidText}
                onChange={(e) => props.setPaidText(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={fsInputClass("mt-1 w-full text-right tabular-nums")}
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-neutral-600">
                Solde promis pour le
              </span>
              <input
                type="date"
                value={props.dueAt}
                onChange={(e) => props.setDueAt(e.target.value)}
                className={fsInputClass("mt-1 w-full")}
              />
            </label>
          </div>

          <div className="mt-2 flex items-center justify-between rounded-[10px] bg-fs-accent/10 px-3 py-2.5">
            <span className="text-sm font-semibold text-fs-text">Reste à payer</span>
            <span className="text-xl font-black tabular-nums text-fs-accent">
              {formatCurrency(props.remainingNow)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {[0.25, 0.5, 1].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => props.setPaidText(String(Math.round(props.total * r)))}
                className="rounded-full border border-black/[0.1] bg-fs-card px-2.5 py-1 text-[11px] font-semibold text-neutral-700"
              >
                {r === 1 ? "Tout payé" : `${Math.round(r * 100)} %`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => props.setPaidText("")}
              className="rounded-full border border-black/[0.1] bg-fs-card px-2.5 py-1 text-[11px] font-semibold text-neutral-700"
            >
              Rien versé
            </button>
          </div>

          <textarea
            value={props.note}
            onChange={(e) => props.setNote(e.target.value)}
            placeholder="Note (ex. camion de Bobo, 2 cartons abîmés déduits)"
            rows={2}
            className={fsInputClass("mt-2 w-full")}
          />

          {props.belowCost.length > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-[10px] bg-red-500/10 px-3 py-2 text-xs font-semibold leading-relaxed text-red-700 dark:text-red-300">
              <MdWarningAmber className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {props.belowCost.length} ligne{props.belowCost.length > 1 ? "s" : ""} sous
                votre prix d&apos;achat. Vérifiez avant de valider — la marchandise sera
                sortie du stock.
              </span>
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={props.onSubmit}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-fs-accent text-sm font-bold text-white disabled:opacity-50"
          >
            {props.submitting ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <MdArrowForward className="h-5 w-5" aria-hidden />
            )}
            {props.partnerName.trim()
              ? `Valider l'enlèvement de ${props.partnerName.trim()}`
              : "Indiquez d'abord qui vient prendre"}
          </button>
        </FsCard>
      ) : null}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Onglet « Suivi »
 * ────────────────────────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  unpaid: "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-neutral-400/20 text-neutral-500",
};

function HistoryTab(props: {
  summary: { out: number; cashed: number; due: number };
  filter: "open" | "settled" | "all";
  setFilter: (v: "open" | "settled" | "all") => void;
  query: string;
  setQuery: (v: string) => void;
  rows: PartnerOfftake[];
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  isOwner: boolean;
  onPay: (o: PartnerOfftake) => void;
  onCancel: (o: PartnerOfftake) => void;
  onPdf: (id: string) => void;
  pdfPending: boolean;
  onWhatsApp: (o: PartnerOfftake) => void;
  page: number;
  hasMore: boolean;
  rowsOnPage: number;
  onPageChange: (p: number) => void;
  pagerBusy: boolean;
}) {
  return (
    <>
      <FsCard padding="p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[11px] font-medium text-neutral-500">Marchandise sortie</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-fs-text">
              {formatCurrency(props.summary.out)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-neutral-500">Encaissé</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">
              {formatCurrency(props.summary.cashed)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-neutral-500">Reste dû</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-fs-accent">
              {formatCurrency(props.summary.due)}
            </p>
          </div>
        </div>
      </FsCard>

      <div className="mt-3 flex flex-wrap gap-2">
        <FsFilterChip
          icon={MdPayments}
          label="À encaisser"
          selected={props.filter === "open"}
          onClick={() => props.setFilter("open")}
        />
        <FsFilterChip
          icon={MdCheckCircle}
          label="Soldés"
          selected={props.filter === "settled"}
          onClick={() => props.setFilter("settled")}
        />
        <FsFilterChip
          icon={MdHistory}
          label="Tous"
          selected={props.filter === "all"}
          onClick={() => props.setFilter("all")}
        />
      </div>

      <div className="relative mt-2">
        <MdSearch
          className="pointer-events-none absolute left-2.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          value={props.query}
          onChange={(e) => props.setQuery(e.target.value)}
          placeholder="Chercher un partenaire, un numéro de bon…"
          className={fsInputClass("w-full pl-9")}
          aria-label="Chercher dans le suivi"
        />
      </div>

      {props.error ? (
        <div className="mt-3">
          <FsQueryErrorPanel error={props.error} onRetry={props.onRetry} />
        </div>
      ) : null}

      {props.pending ? (
        <div className="flex justify-center py-10" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : null}

      {!props.pending && !props.error && props.rows.length === 0 ? (
        <FsCard className="mt-3" padding="p-6">
          <p className="text-center text-sm text-neutral-600">
            {props.filter === "open"
              ? "Personne ne vous doit rien sur les enlèvements. "
              : "Aucun enlèvement ici. "}
            {props.filter !== "open"
              ? "Essayez un autre filtre."
              : "Les bons soldés restent consultables dans « Tous »."}
          </p>
        </FsCard>
      ) : null}

      <div className="mt-3 space-y-2">
        {props.rows.map((o) => {
          const st = offtakeStatus(o);
          const open = props.expanded === o.id;
          return (
            <FsCard key={o.id} padding="p-3">
              <button
                type="button"
                onClick={() => props.setExpanded(open ? null : o.id)}
                className="flex w-full items-start gap-2 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-fs-text">{o.partnerName}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        STATUS_STYLES[st],
                      )}
                    >
                      {OFFTAKE_STATUS_LABELS[st]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {o.offtakeNumber} · {dateTimeLabel(o.createdAt)}
                    {o.storeName ? ` · ${o.storeName}` : ""}
                    {o.createdByName ? ` · ${o.createdByName}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {o.unitCount} article{o.unitCount > 1 ? "s" : ""} ·{" "}
                    {formatCurrency(o.totalAmount)}
                    {o.dueAt && o.remaining > 0
                      ? ` · échéance ${dueLabel(o.dueAt)}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-medium text-neutral-500">Reste</p>
                  <p
                    className={cn(
                      "text-base font-black tabular-nums",
                      o.remaining > 0 ? "text-fs-accent" : "text-emerald-700",
                    )}
                  >
                    {formatCurrency(o.remaining)}
                  </p>
                </div>
              </button>

              {open ? (
                <div className="mt-2.5 border-t border-black/[0.06] pt-2.5">
                  <ul className="space-y-1">
                    {o.lines.map((l) => (
                      <li key={l.id} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-neutral-700">
                          {l.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-neutral-500">
                          {l.quantity}
                          {l.unit ? ` ${l.unit}` : ""} × {formatCurrency(l.unitPrice)}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-fs-text">
                          {formatCurrency(l.quantity * l.unitPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {o.note ? (
                    <p className="mt-2 rounded-[8px] bg-black/[0.03] px-2.5 py-1.5 text-xs text-neutral-600">
                      {o.note}
                    </p>
                  ) : null}

                  {o.cancelledAt ? (
                    <p className="mt-2 text-xs font-semibold text-red-600">
                      Bon annulé le {dateTimeLabel(o.cancelledAt)}
                      {o.cancelReason ? ` — ${o.cancelReason}` : ""}
                    </p>
                  ) : null}

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {!o.cancelledAt && o.remaining > OFFTAKE_AMOUNT_EPS ? (
                      <button
                        type="button"
                        onClick={() => props.onPay(o)}
                        className="inline-flex items-center gap-1.5 rounded-[8px] bg-fs-accent px-3 py-2 text-xs font-semibold text-white"
                      >
                        <MdPayments className="h-4 w-4" aria-hidden />
                        Encaisser
                      </button>
                    ) : null}
                    {!o.cancelledAt && o.remaining > OFFTAKE_AMOUNT_EPS ? (
                      <button
                        type="button"
                        onClick={() => props.onWhatsApp(o)}
                        className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#25D366] px-3 py-2 text-xs font-semibold text-white"
                      >
                        <MdWhatsapp className="h-4 w-4" aria-hidden />
                        Relancer
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={props.pdfPending}
                      onClick={() => props.onPdf(o.id)}
                      className="inline-flex items-center gap-1.5 rounded-[8px] border border-black/[0.1] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-60"
                    >
                      <MdPictureAsPdf className="h-4 w-4" aria-hidden />
                      Bon A4
                    </button>
                    {props.isOwner && !o.cancelledAt ? (
                      <button
                        type="button"
                        onClick={() => props.onCancel(o)}
                        className="inline-flex items-center gap-1.5 rounded-[8px] border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-600"
                      >
                        <MdDeleteOutline className="h-4 w-4" aria-hidden />
                        Annuler
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </FsCard>
          );
        })}
      </div>

      {/*
        Le pager porte sur la PAGE SERVEUR, pas sur le filtre local : « Bons 21 – 40 »
        compte ce que la base a renvoyé. Les puces (En cours / Soldés / Tous) et la
        recherche affinent ensuite CETTE page. C'est la convention de l'historique des
        mouvements de stock, et elle évite la promesse intenable d'un filtre qui
        chercherait dans un an d'archives sans les charger.
      */}
      <FsPager
        page={props.page}
        hasMore={props.hasMore}
        pageSize={OFFTAKES_PAGE_SIZE}
        rowsOnPage={props.rowsOnPage}
        busy={props.pagerBusy}
        onPageChange={props.onPageChange}
        itemLabel="Bons"
      />
    </>
  );
}
