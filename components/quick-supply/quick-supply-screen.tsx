"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdAddShoppingCart,
  MdCheckCircle,
  MdClose,
  MdDeleteOutline,
  MdHistory,
  MdInventory2,
  MdLock,
  MdQrCodeScanner,
  MdRemove,
  MdSearch,
  MdStorefront,
  MdTune,
} from "react-icons/md";

import { PosBarcodeScannerDialog } from "@/components/pos/pos-barcode-scanner-dialog";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  FsSectionLabel,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  createQuickSupply,
  fetchSupplyCatalog,
  listQuickSupplies,
} from "@/lib/features/quick-supply/api";
import type {
  QuickSupply,
  SupplyDraftLine,
  SupplyProduct,
} from "@/lib/features/quick-supply/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { playPosAddBeep } from "@/lib/utils/pos-sound";

/**
 * Minuscules sans accent : « Café », « cafe » et « CAFE » se rejoignent. Le
 * réceptionnaire tape vite et mal — c'est la condition de la vitesse, pas un défaut.
 */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Au-delà, la liste devient un mur : on affiche les meilleurs et on laisse préciser. */
const MAX_RESULTS = 8;

/** Clé de rendu d'une ligne — locale à l'écran, jamais envoyée à la base. */
function newKey(): string {
  return `l_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

/**
 * Clé d'idempotence de l'arrivage — envoyée à un paramètre `uuid` de PostgreSQL, qui
 * refuse tout ce qui n'a pas la forme d'un UUID. D'où un vrai repli au format v4 (et
 * non une chaîne libre) : sur un navigateur ancien ou un contexte non sécurisé, où
 * `crypto.randomUUID` n'existe pas, une clé mal formée ferait échouer CHAQUE
 * validation. Même repli que `presence-tracker.tsx`.
 */
function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (Math.floor(Math.random() * 256) & (15 >> (n / 4)))).toString(16);
  });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function QuickSupplyScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const contextStoreId = ctx.data?.storeId ?? null;
  const stores = useMemo(() => ctx.data?.stores ?? [], [ctx.data?.stores]);
  const aliasesOn = ctx.data?.productAliasesEnabled === true;

  const canView = h?.canQuickSupply ?? false;

  /**
   * Vue « toutes boutiques » : il faut bien choisir où la marchandise entre. On
   * propose la première boutique plutôt qu'un écran vide — le cas courant est
   * d'avoir une seule boutique, et poser une question pour rien coûte un geste.
   */
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(null);
  const storeId = contextStoreId ?? pickedStoreId ?? stores[0]?.id ?? null;
  const storeName = stores.find((s) => s.id === storeId)?.name ?? "";

  const [tab, setTab] = useState<"new" | "history">("new");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<SupplyDraftLine[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [paidText, setPaidText] = useState("");
  const [note, setNote] = useState("");
  const [lastSupply, setLastSupply] = useState<{ number: string; units: number } | null>(null);
  /** Ligne dont le prix doit recevoir le curseur (article tout juste créé). */
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);
  /**
   * Clé d'idempotence de l'arrivage EN COURS. Elle vit aussi longtemps que le panier :
   * si la validation part deux fois (réseau qui lâche, double tape), la base reconnaît
   * la même clé et n'entre le stock qu'une fois. Renouvelée après chaque succès.
   */
  const requestIdRef = useRef<string>(newRequestId());

  const enabled = Boolean(companyId && storeId) && canView;

  /**
   * Changer de boutique en cours de saisie : les lignes portent le stock et les prix
   * de l'ANCIENNE boutique, et la validation les ferait entrer dans la nouvelle. On
   * repart donc à zéro — retaper trois lignes coûte dix secondes, faire entrer dix
   * cartons au mauvais endroit ne se découvre qu'à l'inventaire.
   *
   * Un seul appelant : le sélecteur ci-dessous. Quand c'est la boutique ACTIVE de
   * l'application qui change, le shell remonte déjà l'écran entier
   * (`<Fragment key={storeEpoch}>` dans `app-shell.tsx`) — il n'y a rien à faire ici.
   */
  function switchStore(nextStoreId: string | null) {
    if (nextStoreId === storeId) return;
    setPickedStoreId(nextStoreId);
    if (lines.length > 0) {
      setLines([]);
      toast.info("Boutique changée : la saisie en cours a été vidée.");
    }
    // Nouvel arrivage, nouvelle clé : il n'a rien à voir avec celui qu'on abandonne.
    requestIdRef.current = newRequestId();
    setQuery("");
    setFocusKey(null);
  }

  const catalogQ = useQuery({
    queryKey: queryKeys.quickSupplyCatalog(companyId, storeId ?? "__none__"),
    queryFn: () => fetchSupplyCatalog({ companyId, storeId: storeId as string }),
    enabled,
    staleTime: 60_000,
  });

  const historyQ = useQuery({
    queryKey: queryKeys.quickSupplyHistory(companyId, storeId),
    queryFn: () => listQuickSupplies({ companyId, storeId, limit: 30 }),
    enabled: enabled && tab === "history",
    staleTime: 20_000,
  });

  const products = useMemo(() => catalogQ.data ?? [], [catalogQ.data]);

  /**
   * Recherche locale : le catalogue est déjà en mémoire, donc le résultat s'affiche
   * à la frappe, sans aller-retour réseau. C'est ce qui rend la page utilisable avec
   * une main sur le carton et l'autre sur le téléphone.
   */
  const results = useMemo(() => {
    const needle = norm(query);
    if (!needle) return [];
    const scored: { p: SupplyProduct; score: number }[] = [];
    for (const p of products) {
      const name = norm(p.name);
      let score = -1;
      if (p.barcode && p.barcode.toLowerCase() === query.trim().toLowerCase()) score = 100;
      else if (name.startsWith(needle)) score = 50;
      else if (name.includes(needle)) score = 20;
      else if (aliasesOn && p.searchAliases.some((a) => norm(a).includes(needle))) score = 10;
      if (score >= 0) scored.push({ p, score });
    }
    scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, "fr"));
    return scored.slice(0, MAX_RESULTS).map((s) => s.p);
  }, [products, query, aliasesOn]);

  /** Le nom tapé existe-t-il déjà tel quel ? Sinon on propose de créer. */
  const exactExists = useMemo(() => {
    const needle = norm(query);
    if (!needle) return true;
    return products.some((p) => norm(p.name) === needle);
  }, [products, query]);

  const totalCost = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0),
    [lines],
  );
  const totalUnits = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );

  /** Une ligne « nouveau produit » sans prix de vente entrerait un article invendable. */
  const missingSalePrice = useMemo(
    () => lines.some((l) => l.productId == null && (l.unitSalePrice ?? 0) <= 0),
    [lines],
  );

  /**
   * Lignes dont le prix payé est resté vide.
   *
   * Non bloquant, à dessein : une marchandise offerte a réellement coûté zéro, et le
   * commerçant pressé qui ne veut pas saisir doit pouvoir passer. Mais il faut le dire —
   * un coût à zéro fait compter la vente entière comme bénéfice, et ce chiffre-là se
   * relit le soir sans que rien ne rappelle d'où il vient.
   */
  const linesWithoutCost = useMemo(
    () => lines.filter((l) => l.unitCost <= 0).length,
    [lines],
  );

  function focusSearch() {
    // `requestAnimationFrame` : le focus est repris APRÈS le rendu de la nouvelle ligne,
    // sinon le navigateur mobile referme le clavier au moment où on le rouvre.
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function addProduct(p: SupplyProduct) {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.productId === p.id);
      if (at >= 0) {
        // Déjà dans l'arrivage : on incrémente plutôt que d'empiler deux lignes du
        // même article, qui se contrediraient sur le prix.
        const next = [...prev];
        next[at] = { ...next[at]!, quantity: next[at]!.quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key: newKey(),
          productId: p.id,
          label: p.name,
          unit: p.unit,
          quantity: 1,
          /*
           * Champ VIDE, délibérément. Le pré-remplir avec le coût du catalogue serait
           * commode et faux : ce coût pilote désormais la marge du lot, et un chiffre
           * déjà là s'accepte sans qu'on le lise. Le commerçant qui revient du marché
           * sait ce qu'il a payé — c'est cela qu'on lui demande, pas de confirmer une
           * valeur qu'on aurait devinée à sa place. Le prix du catalogue reste affiché
           * sous le champ, comme repère.
           */
          unitCost: 0,
          // `null` = « je ne change pas le prix de vente de cette marchandise ».
          unitSalePrice: null,
          cataloguePurchasePrice: p.cataloguePurchasePrice,
          catalogueSalePrice: p.catalogueSalePrice,
          currentStock: p.stock,
        },
      ];
    });
    playPosAddBeep();
    setQuery("");
    focusSearch();
  }

  function addNewProduct(name: string) {
    const label = name.trim();
    if (!label) return;
    const key = newKey();
    setLines((prev) => [
      ...prev,
      {
        key,
        productId: null,
        label,
        unit: "pce",
        quantity: 1,
        unitCost: 0,
        unitSalePrice: 0,
        cataloguePurchasePrice: null,
        catalogueSalePrice: null,
        currentStock: null,
      },
    ]);
    playPosAddBeep();
    setQuery("");
    /*
     * Un article existant se rajoute d'un geste, et on repart chercher le suivant : le
     * curseur reste dans la recherche. Un article CRÉÉ, lui, arrive sans prix — et un
     * prix de vente manquant bloque la validation. On amène donc le curseur directement
     * sur son prix d'achat, au lieu de laisser le réceptionnaire redescendre le chercher.
     */
    setFocusKey(key);
  }

  function patchLine(key: string, patch: Partial<SupplyDraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  /** Scan (caméra ou douchette USB) : code-barres connu ⇒ la ligne s'ajoute seule. */
  function handleScan(code: string) {
    const c = code.trim();
    if (!c) return;
    const found = products.find((p) => (p.barcode ?? "").trim() === c);
    if (found) {
      addProduct(found);
      return;
    }
    // Inconnu : on garde le code sous les yeux plutôt que de l'avaler en silence — le
    // réceptionnaire tape le nom et crée l'article, le code se saisira plus tard.
    setQuery(c);
    toast.info("Code-barres inconnu. Tapez le nom pour créer l'article.");
    focusSearch();
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Entrée = « prends le premier ». C'est la boucle rapide : taper, Entrée, taper,
    // Entrée — et la douchette USB, qui termine par Entrée, tombe juste sur ce geste.
    if (results.length > 0) {
      addProduct(results[0]!);
      return;
    }
    if (query.trim()) addNewProduct(query);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!companyId || !storeId) throw new Error("Boutique introuvable.");
      if (lines.length === 0) throw new Error("Aucun article à faire entrer.");
      return createQuickSupply({
        companyId,
        storeId,
        items: lines.map((l) => ({
          productId: l.productId,
          label: l.label,
          unit: l.productId == null ? l.unit : null,
          barcode: null,
          quantity: l.quantity,
          unitCost: l.unitCost,
          unitSalePrice: l.unitSalePrice,
        })),
        supplierLabel: supplier.trim() || null,
        // Champ laissé vide = payé comptant : la base retient le coût total.
        amountPaid: paidText.trim() === "" ? null : Math.max(0, toNumber(paidText)),
        note: note.trim() || null,
        clientRequestId: requestIdRef.current,
      });
    },
    onSuccess: async () => {
      setLastSupply({ number: "", units: totalUnits });
      toast.success(
        `${totalUnits} article(s) en stock. Vous pouvez vendre.`,
      );
      setLines([]);
      setSupplier("");
      setPaidText("");
      setNote("");
      setDetailsOpen(false);
      requestIdRef.current = newRequestId();
      // Le stock affiché ici, la caisse, le catalogue : tout ce qui vient de changer.
      await qc.invalidateQueries({ queryKey: ["quick-supply", companyId] });
      await qc.invalidateQueries({ queryKey: ["pos"] });
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      focusSearch();
    },
    onError: (e) => toastMutationError("approvisionnement", e),
  });

  // Le numéro de l'arrivage est attribué en base : on le relit dans l'historique pour
  // pouvoir l'annoncer (« A-17 »), sans le deviner côté application.
  useEffect(() => {
    if (!lastSupply || lastSupply.number) return;
    let cancelled = false;
    void (async () => {
      try {
        const recent = await listQuickSupplies({ companyId, storeId, limit: 1 });
        if (!cancelled && recent[0]) {
          // Repli non vide : sans lui, un numéro absent relancerait l'effet en boucle.
          const number = recent[0]!.supplyNumber || "enregistré";
          setLastSupply((prev) => (prev ? { ...prev, number } : prev));
        }
      } catch {
        /* le numéro est un confort : son absence ne casse rien */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lastSupply, companyId, storeId]);

  if (permLoading || ctx.isLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!canView) {
    return (
      <FsPage>
        <FsScreenHeader
          title="Approvisionnement"
          subtitle="Faire entrer la marchandise achetée, et vendre tout de suite."
        />
        <FsCard className="rounded-[8px] sm:rounded-[8px]" padding="p-6">
          <div className="text-center">
            <MdLock className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">Accès réservé</p>
            <p className="mt-1 text-xs text-neutral-600">
              {h?.quickSupplyOn
                ? "Demandez au propriétaire le droit « Faire un approvisionnement » (page Employés)."
                : "Le propriétaire n'a pas encore activé l'approvisionnement (Paramètres)."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Approvisionnement"
        subtitle="La marchandise entre en stock et se vend dans la minute."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[6px] border border-black/[0.08] bg-fs-card p-1">
          <button
            type="button"
            onClick={() => setTab("new")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-xs font-semibold sm:text-sm",
              tab === "new" ? "bg-fs-accent text-white" : "text-neutral-700",
            )}
          >
            <MdAddShoppingCart className="h-4 w-4" aria-hidden />
            Nouvel arrivage
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-xs font-semibold sm:text-sm",
              tab === "history" ? "bg-fs-accent text-white" : "text-neutral-700",
            )}
          >
            <MdHistory className="h-4 w-4" aria-hidden />
            Historique
          </button>
        </div>

        {/* Où la marchandise entre. Une seule boutique : simple rappel, pas un choix. */}
        {contextStoreId == null && stores.length > 1 ? (
          <select
            className={fsInputClass("rounded-[6px] w-auto min-w-[10rem]")}
            value={storeId ?? ""}
            onChange={(e) => switchStore(e.target.value || null)}
            aria-label="Boutique de réception"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : storeName ? (
          <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-fs-surface-container px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700">
            <MdStorefront className="h-4 w-4" aria-hidden />
            {storeName}
          </span>
        ) : null}
      </div>

      {tab === "history" ? (
        <HistoryTab query={historyQ} />
      ) : (
        <>
          {lastSupply ? (
            <FsCard className="mb-3 border-l-4 border-l-emerald-500 rounded-[8px] sm:rounded-[8px]" padding="p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <MdCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fs-text">
                    Arrivage {lastSupply.number || "enregistré"} — {lastSupply.units} article(s) en
                    stock
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    C&apos;est vendable immédiatement en caisse.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLastSupply(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-neutral-500"
                  aria-label="Fermer"
                >
                  <MdClose className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </FsCard>
          ) : null}

          <FsCard className="rounded-[8px] sm:rounded-[8px]" padding="p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <MdSearch
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  autoFocus
                  className={fsInputClass("rounded-[6px] h-12 pl-11 text-base")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Nom ou code-barres de l'article…"
                  aria-label="Rechercher un article"
                />
              </div>
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] border border-black/[0.08] bg-fs-card text-fs-accent"
                aria-label="Scanner un code-barres"
                title="Scanner"
              >
                <MdQrCodeScanner className="h-6 w-6" aria-hidden />
              </button>
            </div>

            {catalogQ.isError ? (
              <div className="mt-3">
                <FsQueryErrorPanel error={catalogQ.error} onRetry={() => catalogQ.refetch()} />
              </div>
            ) : null}

            {query.trim() ? (
              <div className="mt-2 space-y-1">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center gap-3 rounded-[6px] border border-black/[0.06] bg-fs-card px-3 py-2.5 text-left active:bg-fs-surface-container"
                  >
                    {/*
                      La photo d'abord : on reconnaît l'emballage au premier coup d'œil,
                      là où il faut lire un libellé. `previewOnTap` reste désactivé —
                      ici, toucher la carte doit ajouter l'article, pas agrandir l'image.
                    */}
                    <ProductListThumbnail imageUrl={p.imageUrl} className="h-11 w-11" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fs-text">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-neutral-600">
                        En stock : {p.stock}
                      </span>
                    </span>
                    <MdAdd className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
                  </button>
                ))}
                {!exactExists ? (
                  <button
                    type="button"
                    onClick={() => addNewProduct(query)}
                    className="flex w-full items-center gap-2 rounded-[6px] border border-dashed border-fs-accent/50 bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)] px-3 py-2.5 text-left"
                  >
                    <MdAdd className="h-5 w-5 shrink-0 text-fs-accent" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-fs-accent">
                        Créer « {query.trim()} »
                      </span>
                      <span className="block text-[11px] text-neutral-600">
                        Nouvel article au catalogue — prix de vente à saisir.
                      </span>
                    </span>
                  </button>
                ) : null}
                {results.length === 0 && exactExists ? (
                  <p className="px-1 py-2 text-xs text-neutral-500">Aucun article trouvé.</p>
                ) : null}
              </div>
            ) : null}
          </FsCard>

          {lines.length === 0 ? (
            <FsCard className="mt-3 rounded-[8px] sm:rounded-[8px]" padding="p-6">
              <div className="text-center">
                <MdInventory2 className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-fs-text">
                  Cherchez l&apos;article, il s&apos;ajoute
                </p>
                <p className="mt-1 text-xs text-neutral-600">
                  Tapez le nom (ou scannez), appuyez sur Entrée. Ce qui n&apos;existe pas encore se
                  crée dans le même geste.
                </p>
              </div>
            </FsCard>
          ) : (
            <FsCard className="mt-3 rounded-[8px] sm:rounded-[8px]" padding="p-0">
              <div className="flex items-center justify-between px-3 pt-3 sm:px-4">
                <FsSectionLabel>Ce qui entre ({lines.length})</FsSectionLabel>
                <button
                  type="button"
                  onClick={() => setLines([])}
                  className="text-[11px] font-semibold text-neutral-500 hover:text-red-600"
                >
                  Tout retirer
                </button>
              </div>
              {lines.map((l) => (
                <DraftLineRow
                  key={l.key}
                  line={l}
                  autoFocusPrice={focusKey === l.key}
                  onPriceFocused={() => setFocusKey(null)}
                  onPatch={(patch) => patchLine(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                />
              ))}
            </FsCard>
          )}

          {/* Facultatif, et replié : trois champs de plus entre le commerçant et sa vente
              suffisent à faire abandonner la saisie. Qui en a besoin les déplie. */}
          {lines.length > 0 ? (
            <FsCard className="mt-3 rounded-[8px] sm:rounded-[8px]" padding="p-3 sm:p-4">
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
              >
                <MdTune className="h-5 w-5 text-fs-accent" aria-hidden />
                <span className="flex-1 text-sm font-semibold text-fs-text">
                  Détails de l&apos;arrivage
                </span>
                <span className="text-[11px] font-semibold text-neutral-500">
                  {detailsOpen ? "Masquer" : "Facultatif"}
                </span>
              </button>
              {detailsOpen ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-neutral-600">
                      Chez qui ?
                    </span>
                    <input
                      className={fsInputClass("rounded-[6px]")}
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      placeholder="Ali du marché…"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-neutral-600">
                      Montant payé
                    </span>
                    <input
                      className={fsInputClass("rounded-[6px]")}
                      value={paidText}
                      onChange={(e) => setPaidText(e.target.value)}
                      inputMode="numeric"
                      placeholder={`${Math.round(totalCost)} (comptant)`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-neutral-600">
                      Note
                    </span>
                    <input
                      className={fsInputClass("rounded-[6px]")}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="2 cartons abîmés…"
                    />
                  </label>
                </div>
              ) : null}
            </FsCard>
          ) : null}

          {lines.length > 0 ? (
            <div className="sticky bottom-0 z-10 -mx-2 mt-3 border-t border-black/[0.08] bg-fs-surface/95 px-2 py-3 backdrop-blur-sm sm:-mx-3 sm:px-3 min-[900px]:-mx-4 min-[900px]:px-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Coût total
                  </p>
                  <p className="truncate text-lg font-bold text-fs-text">
                    {formatCurrency(totalCost)}
                  </p>
                  <p className="text-[11px] text-neutral-600">{totalUnits} article(s)</p>
                </div>
                <button
                  type="button"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || missingSalePrice}
                  className={cn(
                    "inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-bold text-white shadow-sm sm:flex-none sm:px-8 sm:text-base",
                    saveMut.isPending || missingSalePrice
                      ? "bg-neutral-400"
                      : "bg-fs-accent active:scale-[0.99]",
                  )}
                >
                  {saveMut.isPending ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <MdInventory2 className="h-5 w-5" aria-hidden />
                  )}
                  Faire entrer en stock
                </button>
              </div>
              {missingSalePrice ? (
                <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Saisissez le prix de vente des nouveaux articles : sans lui, ils entrent en stock
                  sans pouvoir être vendus.
                </p>
              ) : linesWithoutCost > 0 ? (
                <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Prix payé non saisi sur {linesWithoutCost} article
                  {linesWithoutCost > 1 ? "s" : ""} : leur vente sera comptée entièrement comme
                  bénéfice. Vous pouvez valider quand même.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <PosBarcodeScannerDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDecoded={handleScan}
        onError={(m) => toast.error(m)}
      />
    </FsPage>
  );
}

/**
 * Une ligne de l'arrivage.
 *
 * Les quantités et les prix se saisissent en TEXTE et non en `type="number"` : sur
 * Android, le champ numérique refuse la virgule et le rouleau de la molette change la
 * valeur par accident. La conversion se fait à la frappe, la ligne garde ce qui a été
 * tapé.
 */
function DraftLineRow({
  line,
  autoFocusPrice = false,
  onPriceFocused,
  onPatch,
  onRemove,
}: {
  line: SupplyDraftLine;
  autoFocusPrice?: boolean;
  onPriceFocused?: () => void;
  onPatch: (patch: Partial<SupplyDraftLine>) => void;
  onRemove: () => void;
}) {
  const priceRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocusPrice) return;
    priceRef.current?.focus();
    onPriceFocused?.();
    // `onPriceFocused` change à chaque rendu du parent : le garder en dépendance
    // relancerait le focus en boucle et empêcherait toute autre saisie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusPrice]);

  const isNew = line.productId == null;
  const newStock = line.currentStock == null ? line.quantity : line.currentStock + line.quantity;
  const costRose =
    line.cataloguePurchasePrice != null && line.unitCost > line.cataloguePurchasePrice;
  /**
   * Marge de CETTE marchandise. Calculée sur le seul prix que le commerçant a saisi :
   * la déduire du prix habituel reviendrait à le réafficher en creux.
   */
  const lotMargin =
    line.unitSalePrice != null && line.unitSalePrice > 0
      ? line.unitSalePrice - line.unitCost
      : null;

  return (
    <div className="border-t border-black/[0.06] p-3 first:border-t-0 sm:p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {isNew ? (
            <input
              className={fsInputClass("rounded-[6px] h-9 text-sm font-semibold")}
              value={line.label}
              onChange={(e) => onPatch({ label: e.target.value })}
              placeholder="Nom de l'article"
              aria-label="Nom du nouvel article"
            />
          ) : (
            <p className="truncate text-sm font-semibold text-fs-text">{line.label}</p>
          )}
          <p className="mt-0.5 text-[11px] text-neutral-600">
            {isNew ? (
              <span className="font-semibold text-fs-accent">Nouvel article</span>
            ) : (
              <>
                Stock {line.currentStock} → <span className="font-semibold">{newStock}</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-neutral-500 hover:text-red-600"
          aria-label={`Retirer ${line.label}`}
        >
          <MdDeleteOutline className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        {/* Quantité : gros boutons, parce que la saisie se fait debout, une main prise. */}
        <div>
          <span className="mb-1 block text-[11px] font-semibold text-neutral-600">Quantité</span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPatch({ quantity: Math.max(1, line.quantity - 1) })}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-black/[0.08] bg-fs-card text-neutral-800"
              aria-label="Diminuer la quantité"
            >
              <MdRemove className="h-5 w-5" aria-hidden />
            </button>
            <input
              className={fsInputClass("rounded-[6px] h-11 w-16 text-center text-base font-bold")}
              value={String(line.quantity)}
              inputMode="numeric"
              onChange={(e) => {
                const n = Math.floor(toNumber(e.target.value));
                onPatch({ quantity: n > 0 ? n : 1 });
              }}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Quantité reçue"
            />
            <button
              type="button"
              onClick={() => onPatch({ quantity: line.quantity + 1 })}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-black/[0.08] bg-fs-card text-neutral-800"
              aria-label="Augmenter la quantité"
            >
              <MdAdd className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        {/*
          Les deux prix de l'arrivage. Le prix du catalogue s'affiche SOUS le champ, en
          petit — jamais dedans : dans le champ, il se ferait prendre pour la valeur
          saisie, et c'est très exactement la confusion à éviter.
        */}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-neutral-600">
            Payé / unité
          </span>
          <input
            ref={priceRef}
            className={fsInputClass(
              cn(
                "rounded-[6px] h-11 w-28 text-base",
                // Un champ vide qui part à zéro rendrait la marge égale au prix de vente
                // entier. On le signale à l'œil, sans bloquer : c'est un oubli probable,
                // pas une faute — une marchandise offerte a bien coûté zéro.
                line.unitCost <= 0 ? "ring-1 ring-amber-500" : "",
              ),
            )}
            value={line.unitCost === 0 ? "" : String(line.unitCost)}
            inputMode="numeric"
            placeholder="0"
            onChange={(e) => onPatch({ unitCost: Math.max(0, toNumber(e.target.value)) })}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Prix payé par unité pour cet arrivage"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-neutral-600">
            Vendu / unité {isNew ? "*" : ""}
          </span>
          <input
            className={fsInputClass(
              cn(
                "rounded-[6px] h-11 w-28 text-base",
                isNew && (line.unitSalePrice ?? 0) <= 0 ? "ring-1 ring-amber-500" : "",
              ),
            )}
            value={
              line.unitSalePrice == null || line.unitSalePrice === 0
                ? ""
                : String(line.unitSalePrice)
            }
            inputMode="numeric"
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.trim();
              // Champ vidé sur un produit existant = « cette marchandise se vend au prix
              // habituel ». Ce n'est pas « prix zéro », et ce n'est pas non plus une
              // modification du catalogue.
              onPatch({
                unitSalePrice: raw === "" ? (isNew ? 0 : null) : Math.max(0, toNumber(raw)),
              });
            }}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Prix de vente de cette marchandise"
          />
          {/*
            Le sens sans le chiffre : laisser vide veut dire « au prix habituel », et
            c'est une information indispensable. Le montant, lui, n'a rien à faire ici —
            il ancrerait la saisie sur un prix que le commerçant vient justement revoir.
          */}
          {!isNew && line.unitSalePrice == null ? (
            <span className="mt-1 block text-[10px] text-neutral-500">au prix habituel</span>
          ) : null}
        </label>

        <div className="ml-auto text-right">
          <span className="block text-[11px] font-semibold text-neutral-600">Coût</span>
          <p className="text-sm font-bold text-fs-text">
            {formatCurrency(line.quantity * line.unitCost)}
          </p>
          {lotMargin != null ? (
            <p
              className={cn(
                "text-[10px] font-semibold",
                lotMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600",
              )}
            >
              marge {formatCurrency(lotMargin)}/u
            </p>
          ) : null}
        </div>
      </div>

      {costRose ? (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          Payé plus cher que d&apos;habitude. Pensez au prix de vente de cette marchandise.
        </p>
      ) : null}
    </div>
  );
}

/** Historique — l'écran de contrôle : qui a fait entrer quoi, et à quel prix. */
function HistoryTab({
  query,
}: {
  query: ReturnType<typeof useQuery<QuickSupply[], Error>>;
}) {
  if (query.isLoading) {
    return (
      <FsCard className="rounded-[8px] sm:rounded-[8px]" padding="p-6">
        <div className="flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsCard>
    );
  }
  if (query.isError) {
    return (
      <FsCard className="rounded-[8px] sm:rounded-[8px]" padding="p-3 sm:p-4">
        <FsQueryErrorPanel error={query.error} onRetry={() => query.refetch()} />
      </FsCard>
    );
  }
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <FsCard className="rounded-[8px] sm:rounded-[8px]" padding="p-6">
        <div className="text-center">
          <MdHistory className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-fs-text">Aucun arrivage</p>
          <p className="mt-1 text-xs text-neutral-600">
            Les entrées de marchandise apparaîtront ici, avec leur auteur.
          </p>
        </div>
      </FsCard>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((s) => (
        <FsCard key={s.id} className="rounded-[8px] sm:rounded-[8px]" padding="p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-fs-text">
                {s.supplyNumber}
                {s.supplierLabel ? (
                  <span className="font-normal text-neutral-600"> · chez {s.supplierLabel}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-600">
                {timeLabel(s.createdAt)}
                {s.createdByName ? ` · par ${s.createdByName}` : ""}
                {s.storeName ? ` · ${s.storeName}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-fs-text">{formatCurrency(s.totalCost)}</p>
              <p className="text-[11px] text-neutral-600">
                {s.unitCount} article(s)
                {s.amountPaid !== s.totalCost ? ` · payé ${formatCurrency(s.amountPaid)}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-2 space-y-1">
            {s.lines.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-[6px] bg-fs-surface-container px-2.5 py-1.5"
              >
                <span className="min-w-0 text-xs font-semibold text-fs-text">
                  {l.quantity} × {l.label}
                  {l.productCreated ? (
                    <span className="ml-1.5 rounded-[3px] bg-fs-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-fs-accent">
                      créé
                    </span>
                  ) : null}
                  {/*
                    L'état du lot, en un mot : c'est la question que le patron se pose en
                    relisant un arrivage — « est-ce que ce prix s'applique encore ? ».
                  */}
                  {l.remainingQuantity > 0 ? (
                    <span className="ml-1.5 rounded-[3px] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      reste {l.remainingQuantity}
                    </span>
                  ) : (
                    <span className="ml-1.5 rounded-[3px] bg-fs-surface px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
                      écoulé
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-neutral-600">
                  payé {formatCurrency(l.unitCost)}
                  {l.cataloguePurchasePrice != null &&
                  l.cataloguePurchasePrice !== l.unitCost ? (
                    <span className="text-neutral-500">
                      {" "}
                      (catalogue {formatCurrency(l.cataloguePurchasePrice)})
                    </span>
                  ) : null}
                  {l.unitSalePrice != null ? (
                    <span className="font-semibold text-fs-text">
                      {" "}
                      · vendu {formatCurrency(l.unitSalePrice)}
                    </span>
                  ) : (
                    <span className="text-neutral-500"> · au prix habituel</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {s.note ? (
            <p className="mt-2 text-[11px] italic text-neutral-600">« {s.note} »</p>
          ) : null}
        </FsCard>
      ))}
    </div>
  );
}
