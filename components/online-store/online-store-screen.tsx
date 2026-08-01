"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAddPhotoAlternate,
  MdCheckCircle,
  MdContentCopy,
  MdDeliveryDining,
  MdInventory2,
  MdOpenInNew,
  MdPhone,
  MdPointOfSale,
  MdReceiptLong,
  MdSettings,
  MdShoppingBag,
  MdStorefront,
  MdWhatsapp,
} from "react-icons/md";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { ModuleLockedCard } from "@/components/modules/module-locked-card";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { onlineStorePath } from "@/lib/config/routes";
import {
  convertOnlineOrderToSale,
  fetchOnlineStoreSettings,
  listOnlineOrders,
  saveOnlineStoreSettings,
  setOnlineOrderStatus,
  slugifyStoreName,
  uploadOnlineStoreCover,
} from "@/lib/features/online-store/api";
import {
  ONLINE_DELIVERY_MODE_LABELS,
  ONLINE_ORDER_STATUS_LABELS,
  ONLINE_PAYMENT_LABELS,
  type OnlineOrder,
  type OnlineOrderStatus,
  type OnlineStoreSettingsDraft,
} from "@/lib/features/online-store/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

type Tab = "commandes" | "vitrine" | "partager";

const STATUS_FILTERS: { key: OnlineOrderStatus | "all"; label: string }[] = [
  { key: "pending", label: "À traiter" },
  { key: "confirmed", label: "Confirmées" },
  { key: "ready", label: "Prêtes" },
  { key: "completed", label: "Encaissées" },
  { key: "canceled", label: "Annulées" },
  { key: "all", label: "Toutes" },
];

function fcfa(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

/** Angles resserrés, alignés sur la vitrine publique (4 px). */
const CARD_RADIUS = "rounded-[4px] sm:rounded-[4px]";

function statusTone(status: OnlineOrderStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "confirmed":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "ready":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
  }
}

const EMPTY_DRAFT: OnlineStoreSettingsDraft = {
  slug: "",
  isPublished: false,
  displayName: null,
  tagline: null,
  description: null,
  coverUrl: null,
  logoUrl: null,
  accentColor: "#F97316",
  whatsappPhone: null,
  callPhone: null,
  address: null,
  city: null,
  hoursNote: null,
  deliveryEnabled: true,
  deliveryFee: 0,
  deliveryNote: null,
  pickupEnabled: true,
  payOnDeliveryEnabled: true,
  payMobileMoneyEnabled: false,
  mobileMoneyNumber: null,
  minOrderAmount: 0,
  showOutOfStock: false,
};

/**
 * Boutique en ligne côté commerçant : les commandes web arrivent ici, dans le même
 * écran que le reste de FasoStock. « Encaisser » crée une vente normale — le stock
 * bouge à ce moment-là seulement, pour ne jamais bloquer la caisse physique.
 */
export function OnlineStoreScreen() {
  const { data: ctx } = useAppContext();
  const { helpers } = usePermissions();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("commandes");
  const [statusFilter, setStatusFilter] = useState<OnlineOrderStatus | "all">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cashOrder, setCashOrder] = useState<OnlineOrder | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OnlineOrder | null>(null);

  const companyId = ctx?.companyId ?? "";
  const storeId = ctx?.storeId ?? null;
  const storeName = ctx?.stores.find((s) => s.id === storeId)?.name ?? ctx?.companyName ?? "";

  const settingsQ = useQuery({
    queryKey: ["online-store-settings", storeId] as const,
    queryFn: () => fetchOnlineStoreSettings(storeId!),
    enabled: !!storeId,
  });

  const ordersQ = useQuery({
    queryKey: ["online-orders", companyId, storeId, statusFilter] as const,
    queryFn: () =>
      listOnlineOrders({ companyId, storeId, status: statusFilter }),
    enabled: !!companyId,
    refetchInterval: 60_000,
  });

  const [draft, setDraft] = useState<OnlineStoreSettingsDraft>(EMPTY_DRAFT);

  /**
   * Le formulaire se recharge quand la boutique change (ou à l'arrivée des réglages),
   * jamais à chaque refetch : une saisie en cours ne doit pas être écrasée. Ajustement
   * d'état pendant le rendu — le motif React pour « dériver d'une prop qui change ».
   */
  const settingsKey = settingsQ.isFetched
    ? `${storeId ?? ""}:${settingsQ.data ? "loaded" : "new"}`
    : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (settingsKey && settingsKey !== loadedKey) {
    setLoadedKey(settingsKey);
    if (settingsQ.data) {
      const { storeId: _s, companyId: _c, ...rest } = settingsQ.data;
      setDraft(rest);
    } else {
      setDraft({ ...EMPTY_DRAFT, slug: storeName ? slugifyStoreName(storeName) : "" });
    }
  }

  const saveMut = useMutation({
    mutationFn: () => saveOnlineStoreSettings(storeId!, draft),
    onSuccess: (slug) => {
      setDraft((d) => ({ ...d, slug }));
      void qc.invalidateQueries({ queryKey: ["online-store-settings", storeId] });
      toast.success(
        draft.isPublished
          ? "Vitrine enregistrée et en ligne."
          : "Vitrine enregistrée (encore en brouillon).",
      );
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  /**
   * La photo part dès qu'elle est choisie (aperçu immédiat), mais la vitrine n'est
   * modifiée qu'à l'enregistrement : le commerçant peut encore changer d'avis.
   */
  const coverMut = useMutation({
    mutationFn: (file: File) => uploadOnlineStoreCover(storeId!, file),
    onSuccess: (url) => {
      setDraft((d) => ({ ...d, coverUrl: url }));
      toast.success("Photo ajoutée. Enregistrez pour la publier.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const coverUploading = coverMut.isPending;

  const statusMut = useMutation({
    mutationFn: (p: { orderId: string; status: Exclude<OnlineOrderStatus, "completed">; reason?: string }) =>
      setOnlineOrderStatus(p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["online-orders"] });
      toast.success("Commande mise à jour.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const cashMut = useMutation({
    mutationFn: (p: { orderId: string; paymentMethod: "cash" | "mobile_money" }) =>
      convertOnlineOrderToSale(p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["online-orders"] });
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      setCashOrder(null);
      toast.success("Commande encaissée : la vente est enregistrée et le stock à jour.");
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const publicUrl = useMemo(() => {
    const slug = settingsQ.data?.slug;
    if (!slug || typeof window === "undefined") return null;
    return `${window.location.origin}${onlineStorePath(slug)}`;
  }, [settingsQ.data?.slug]);

  const pendingCount = useMemo(
    () => (ordersQ.data ?? []).filter((o) => o.status === "pending").length,
    [ordersQ.data],
  );

  if (helpers && !helpers.onlineStoreOn) {
    return (
      <ModuleLockedCard
        title="Boutique en ligne"
        heading="Module non activé"
        message="La boutique en ligne n'est pas ouverte pour votre compte. Contactez FasoStock pour l'activer sur votre entreprise ou sur une boutique précise."
      />
    );
  }
  if (helpers && !helpers.canOnlineStore) {
    return (
      <ModuleLockedCard
        title="Boutique en ligne"
        heading="Accès réservé"
        message="Seul le propriétaire (ou un employé disposant du droit « Gérer la boutique en ligne ») peut gérer la vitrine et les commandes web."
      />
    );
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copié.`);
    } catch {
      toast.error("Copie impossible — sélectionnez le texte manuellement.");
    }
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Boutique en ligne"
        subtitle="Votre boutique qui ne ferme jamais : le même stock, les mêmes prix, ouverts 24h/24 sur un simple lien à partager."
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <TabChip
          icon={MdShoppingBag}
          label={pendingCount > 0 ? `Commandes (${pendingCount})` : "Commandes"}
          selected={tab === "commandes"}
          onClick={() => setTab("commandes")}
        />
        <TabChip
          icon={MdSettings}
          label="Ma vitrine"
          selected={tab === "vitrine"}
          onClick={() => setTab("vitrine")}
        />
        <TabChip
          icon={MdStorefront}
          label="Partager"
          selected={tab === "partager"}
          onClick={() => setTab("partager")}
        />
      </div>

      {tab === "commandes" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "rounded-[4px] border px-3 py-1.5 text-xs font-semibold transition-colors",
                  statusFilter === f.key
                    ? "border-fs-accent bg-fs-accent text-white"
                    : "border-black/[0.08] bg-fs-card text-neutral-600",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {ordersQ.isError ? (
            <FsQueryErrorPanel error={ordersQ.error} onRetry={() => void ordersQ.refetch()} />
          ) : ordersQ.isLoading ? (
            <FsCard className={CARD_RADIUS}>
              <p className="p-4 text-center text-sm text-neutral-500">Chargement des commandes…</p>
            </FsCard>
          ) : (ordersQ.data ?? []).length === 0 ? (
            <FsCard className={CARD_RADIUS}>
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <MdShoppingBag className="h-12 w-12 text-neutral-300" aria-hidden />
                <p className="mt-3 text-sm font-bold text-fs-text">Aucune commande ici</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
                  Partagez votre lien catalogue sur WhatsApp ou Facebook : les commandes de
                  vos clients arriveront directement dans cet écran.
                </p>
                <button
                  type="button"
                  onClick={() => setTab("partager")}
                  className="mt-4 rounded-[4px] bg-fs-accent px-4 py-2 text-sm font-semibold text-white"
                >
                  Obtenir mon lien
                </button>
              </div>
            </FsCard>
          ) : (
            <ul className="space-y-2">
              {(ordersQ.data ?? []).map((o) => {
                const open = expanded === o.id;
                return (
                  <li key={o.id}>
                    <FsCard className={cn(CARD_RADIUS, "overflow-hidden")} padding="p-0">
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : o.id)}
                        className="flex w-full items-start justify-between gap-3 p-3 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-fs-text">{o.customerName}</span>
                            <span
                              className={cn(
                                "rounded-[3px] border px-2 py-0.5 text-[11px] font-bold",
                                statusTone(o.status),
                              )}
                            >
                              {ONLINE_ORDER_STATUS_LABELS[o.status]}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-neutral-500">
                            {o.orderNumber} · {o.itemsCount} article{o.itemsCount > 1 ? "s" : ""} ·{" "}
                            {ONLINE_DELIVERY_MODE_LABELS[o.deliveryMode]}
                            {o.storeName && !storeId ? ` · ${o.storeName}` : ""}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-neutral-500">
                            {new Date(o.createdAt).toLocaleString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" · "}
                            {ONLINE_PAYMENT_LABELS[o.paymentMethod]}
                          </p>
                        </div>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-black text-fs-text">
                            {fcfa(o.total)}
                          </span>
                          <span className="text-[11px] text-neutral-500">
                            {open ? "Réduire" : "Détails"}
                          </span>
                        </span>
                      </button>

                      {open ? (
                        <div className="border-t border-black/[0.06] p-3">
                          <ul className="space-y-1.5">
                            {o.items.map((i) => (
                              <li key={i.id} className="flex items-baseline justify-between gap-3 text-xs">
                                <span className="min-w-0 truncate text-neutral-700">
                                  <span className="font-semibold text-fs-text">{i.quantity}×</span>{" "}
                                  {i.productName}
                                </span>
                                <span className="shrink-0 font-semibold text-fs-text">
                                  {fcfa(i.total)}
                                </span>
                              </li>
                            ))}
                          </ul>

                          <dl className="mt-3 space-y-1 border-t border-dashed border-black/[0.08] pt-2 text-xs">
                            <Row label="Sous-total" value={fcfa(o.subtotal)} />
                            {o.deliveryFee > 0 ? (
                              <Row label="Livraison" value={fcfa(o.deliveryFee)} />
                            ) : null}
                            <Row label="Total" value={fcfa(o.total)} strong />
                          </dl>

                          <div className="mt-3 space-y-1 text-xs text-neutral-600">
                            <p className="flex items-center gap-1.5">
                              <MdPhone className="h-4 w-4 text-neutral-400" aria-hidden />
                              <a className="font-semibold text-fs-text" href={`tel:${o.customerPhone}`}>
                                {o.customerPhone}
                              </a>
                              <a
                                className="ml-1 inline-flex items-center gap-1 rounded-[4px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                                href={`https://wa.me/${o.customerPhone.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MdWhatsapp className="h-3.5 w-3.5" aria-hidden />
                                WhatsApp
                              </a>
                            </p>
                            {o.customerAddress ? (
                              <p className="flex items-start gap-1.5">
                                <MdDeliveryDining className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                                <span>{o.customerAddress}</span>
                              </p>
                            ) : null}
                            {o.note ? (
                              <p className="rounded-[4px] bg-neutral-50 p-2 italic">« {o.note} »</p>
                            ) : null}
                            {o.cancelReason ? (
                              <p className="text-red-600">Annulée : {o.cancelReason}</p>
                            ) : null}
                          </div>

                          {o.saleId ? (
                            <p className="mt-3 flex items-center gap-1.5 rounded-[4px] bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">
                              <MdCheckCircle className="h-4 w-4" aria-hidden />
                              Encaissée — vente enregistrée, stock à jour.
                            </p>
                          ) : (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {o.status === "pending" ? (
                                <ActionButton
                                  onClick={() =>
                                    statusMut.mutate({ orderId: o.id, status: "confirmed" })
                                  }
                                  disabled={statusMut.isPending}
                                >
                                  Confirmer
                                </ActionButton>
                              ) : null}
                              {o.status === "confirmed" ? (
                                <ActionButton
                                  onClick={() => statusMut.mutate({ orderId: o.id, status: "ready" })}
                                  disabled={statusMut.isPending}
                                >
                                  Prête
                                </ActionButton>
                              ) : null}
                              {o.status !== "canceled" ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setCashOrder(o)}
                                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-fs-accent px-3 py-2 text-xs font-bold text-white"
                                  >
                                    <MdPointOfSale className="h-4 w-4" aria-hidden />
                                    Encaisser
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCancelOrder(o)}
                                    className="rounded-[4px] border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                                  >
                                    Annuler
                                  </button>
                                </>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </FsCard>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}

      {tab === "vitrine" ? (
        <div className="space-y-3">
          {!storeId ? (
            <FsCard className={CARD_RADIUS}>
              <p className="p-3 text-sm text-neutral-600">
                Choisissez une boutique dans l&apos;en-tête pour configurer sa vitrine :
                chaque boutique a son propre lien et son propre stock.
              </p>
            </FsCard>
          ) : (
            <>
              <FsCard className={CARD_RADIUS}>
                <h2 className="text-sm font-bold text-fs-text">Le lien de votre boutique</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  C&apos;est l&apos;adresse que vous partagerez. Lettres, chiffres et tirets.
                </p>
                <div className="mt-2 flex items-center gap-2 rounded-[4px] border border-black/[0.06] bg-fs-surface-container px-3 py-2">
                  <span className="shrink-0 text-xs text-neutral-500">/boutique/</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-fs-text outline-none"
                    value={draft.slug}
                    onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                    placeholder="ma-boutique"
                  />
                </div>

                <label className="mt-3 flex items-start gap-2 rounded-[4px] bg-emerald-50 p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-emerald-600"
                    checked={draft.isPublished}
                    onChange={(e) => setDraft((d) => ({ ...d, isPublished: e.target.checked }))}
                  />
                  <span className="text-xs text-emerald-900">
                    <span className="block font-bold">Mettre ma boutique en ligne</span>
                    Tant que cette case est décochée, le lien ne montre rien : vous pouvez
                    tout préparer tranquillement.
                  </span>
                </label>
              </FsCard>

              <FsCard className={CARD_RADIUS}>
                <h2 className="text-sm font-bold text-fs-text">Présentation</h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Nom affiché">
                    <input
                      className={fsInputClass()}
                      value={draft.displayName ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value || null }))}
                      placeholder={storeName}
                    />
                  </Field>
                  <Field label="Phrase d'accroche">
                    <input
                      className={fsInputClass()}
                      value={draft.tagline ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value || null }))}
                      placeholder="Livraison rapide dans toute la ville"
                    />
                  </Field>
                  <Field label="Photo de couverture" full>
                    <CoverPicker
                      url={draft.coverUrl}
                      uploading={coverUploading}
                      onPick={(file) => coverMut.mutate(file)}
                      onRemove={() => setDraft((d) => ({ ...d, coverUrl: null }))}
                    />
                  </Field>
                  <Field label="Description" full>
                    <textarea
                      className={fsInputClass("min-h-[72px]")}
                      value={draft.description ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value || null }))}
                      placeholder="Ce que vous vendez, vos horaires, vos points forts…"
                    />
                  </Field>
                  <Field label="Numéro WhatsApp">
                    <input
                      className={fsInputClass()}
                      value={draft.whatsappPhone ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, whatsappPhone: e.target.value || null }))}
                      placeholder="70 00 00 00"
                    />
                  </Field>
                  <Field label="Téléphone">
                    <input
                      className={fsInputClass()}
                      value={draft.callPhone ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, callPhone: e.target.value || null }))}
                    />
                  </Field>
                  <Field label="Adresse">
                    <input
                      className={fsInputClass()}
                      value={draft.address ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value || null }))}
                    />
                  </Field>
                  <Field label="Ville">
                    <input
                      className={fsInputClass()}
                      value={draft.city ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value || null }))}
                    />
                  </Field>
                  <Field label="Horaires (texte libre)" full>
                    <input
                      className={fsInputClass()}
                      value={draft.hoursNote ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, hoursNote: e.target.value || null }))}
                      placeholder="Lun–Sam 8h–19h"
                    />
                  </Field>
                </div>
              </FsCard>

              <FsCard className={CARD_RADIUS}>
                <h2 className="text-sm font-bold text-fs-text">Réception et paiement</h2>
                <div className="mt-2 space-y-2">
                  <Toggle
                    checked={draft.deliveryEnabled}
                    onChange={(v) => setDraft((d) => ({ ...d, deliveryEnabled: v }))}
                    label="Je livre"
                    hint="Le client saisit son adresse à la commande."
                  />
                  {draft.deliveryEnabled ? (
                    <div className="grid gap-2 pl-6 sm:grid-cols-2">
                      <Field label="Frais de livraison (FCFA)">
                        <input
                          type="number"
                          min={0}
                          className={fsInputClass()}
                          value={String(draft.deliveryFee)}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, deliveryFee: Math.max(0, Number(e.target.value) || 0) }))
                          }
                        />
                      </Field>
                      <Field label="Précision livraison">
                        <input
                          className={fsInputClass()}
                          value={draft.deliveryNote ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, deliveryNote: e.target.value || null }))}
                          placeholder="Livraison en ville sous 24h"
                        />
                      </Field>
                    </div>
                  ) : null}
                  <Toggle
                    checked={draft.pickupEnabled}
                    onChange={(v) => setDraft((d) => ({ ...d, pickupEnabled: v }))}
                    label="Retrait en boutique"
                    hint="Le client vient chercher sa commande."
                  />
                  <Toggle
                    checked={draft.payOnDeliveryEnabled}
                    onChange={(v) => setDraft((d) => ({ ...d, payOnDeliveryEnabled: v }))}
                    label="Paiement à la livraison / sur place"
                  />
                  <Toggle
                    checked={draft.payMobileMoneyEnabled}
                    onChange={(v) => setDraft((d) => ({ ...d, payMobileMoneyEnabled: v }))}
                    label="Mobile Money"
                  />
                  {draft.payMobileMoneyEnabled ? (
                    <div className="pl-6">
                      <Field label="Numéro Mobile Money affiché au client">
                        <input
                          className={fsInputClass()}
                          value={draft.mobileMoneyNumber ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, mobileMoneyNumber: e.target.value || null }))
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Commande minimum (FCFA)">
                      <input
                        type="number"
                        min={0}
                        className={fsInputClass()}
                        value={String(draft.minOrderAmount)}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            minOrderAmount: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <Toggle
                    checked={draft.showOutOfStock}
                    onChange={(v) => setDraft((d) => ({ ...d, showOutOfStock: v }))}
                    label="Afficher aussi les articles en rupture"
                    hint="Ils apparaissent grisés, sans bouton d'ajout."
                  />
                </div>
              </FsCard>

              {/*
                Barre d'action collée en bas : elle a son propre fond opaque et un
                filet, sinon le contenu défile DERRIÈRE le bouton et donne
                l'impression qu'il flotte au milieu de la page (cf. la photo de
                couverture qui passait dessous). Même traitement que la barre de
                validation des sessions d'inventaire.
              */}
              <div className="sticky bottom-0 z-10 -mx-2 border-t border-black/[0.06] bg-fs-surface/95 px-2 py-3 backdrop-blur sm:-mx-3 sm:px-3">
                <button
                  type="button"
                  disabled={saveMut.isPending || draft.slug.trim().length < 3}
                  onClick={() => saveMut.mutate()}
                  className="w-full rounded-[5px] bg-fs-accent py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
                >
                  {saveMut.isPending ? "Enregistrement…" : "Enregistrer ma vitrine"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === "partager" ? (
        <div className="space-y-3">
          <FsCard className={CARD_RADIUS}>
            <h2 className="text-sm font-bold text-fs-text">Votre lien catalogue</h2>
            {publicUrl && settingsQ.data?.isPublished ? (
              <>
                <p className="mt-1 text-xs text-neutral-500">
                  Collez-le dans votre statut WhatsApp, votre page Facebook, vos cartes de visite.
                </p>
                <div className="mt-2 flex items-center gap-2 rounded-[4px] border border-black/[0.06] bg-fs-surface-container p-3">
                  <code className="min-w-0 flex-1 truncate text-xs text-fs-text">{publicUrl}</code>
                  <button
                    type="button"
                    onClick={() => void copy(publicUrl, "Lien")}
                    className="rounded-[4px] border border-black/[0.08] p-1.5 text-neutral-500"
                    aria-label="Copier"
                  >
                    <MdContentCopy className="h-4 w-4" aria-hidden />
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[4px] border border-black/[0.08] p-1.5 text-neutral-500"
                    aria-label="Ouvrir"
                  >
                    <MdOpenInNew className="h-4 w-4" aria-hidden />
                  </a>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Bonjour 👋 Voici notre boutique en ligne ${settingsQ.data?.displayName ?? storeName} : ${publicUrl}`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    <MdWhatsapp className="h-4 w-4" aria-hidden />
                    Partager sur WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      void copy(
                        `Commandez en ligne chez ${settingsQ.data?.displayName ?? storeName} : ${publicUrl}`,
                        "Message",
                      )
                    }
                    className="rounded-[4px] border border-black/[0.08] px-4 py-2.5 text-sm font-semibold text-neutral-700"
                  >
                    Copier un message tout prêt
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2 rounded-[4px] bg-amber-50 p-3 text-xs text-amber-900">
                Votre vitrine n&apos;est pas encore en ligne. Allez dans{" "}
                <button
                  type="button"
                  className="font-bold underline"
                  onClick={() => setTab("vitrine")}
                >
                  Ma vitrine
                </button>{" "}
                pour choisir votre lien et cocher « Mettre ma boutique en ligne ».
              </p>
            )}
          </FsCard>

          <FsCard className={CARD_RADIUS}>
            <h2 className="text-sm font-bold text-fs-text">Ce que voit votre client</h2>
            <ul className="mt-2 space-y-2 text-xs text-neutral-600">
              <li className="flex gap-2">
                <MdInventory2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
                Vos articles réellement en stock dans cette boutique, avec leurs prix
                réels et les promotions en cours.
              </li>
              <li className="flex gap-2">
                <MdShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
                Un panier simple, sans compte à créer : nom, téléphone, adresse, c&apos;est tout.
              </li>
              <li className="flex gap-2">
                <MdReceiptLong className="mt-0.5 h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
                Un numéro de commande et un lien de suivi qu&apos;il peut vous renvoyer sur
                WhatsApp.
              </li>
            </ul>
            <p className="mt-3 rounded-[4px] bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
              Vos prix d&apos;achat, vos marges et vos autres boutiques ne sont jamais visibles.
              Le stock n&apos;est décrémenté qu&apos;au moment où vous encaissez la commande :
              une commande non honorée ne bloque jamais votre caisse.
            </p>
          </FsCard>
        </div>
      ) : null}

      <FsConfirmDialog
        open={cashOrder != null}
        title="Encaisser la commande"
        message={
          cashOrder
            ? `${cashOrder.orderNumber} · ${cashOrder.customerName} · ${fcfa(cashOrder.total)}. Une vente sera créée et le stock décrémenté.`
            : ""
        }
        confirmLabel="Encaisser en espèces"
        onConfirm={() => {
          if (cashOrder) cashMut.mutate({ orderId: cashOrder.id, paymentMethod: "cash" });
        }}
        onCancel={() => setCashOrder(null)}
        busy={cashMut.isPending}
      />

      <FsConfirmDialog
        open={cancelOrder != null}
        title="Annuler la commande"
        message={
          cancelOrder
            ? `${cancelOrder.orderNumber} · ${cancelOrder.customerName}. Le client gardera son lien de suivi, qui indiquera « annulée ».`
            : ""
        }
        confirmLabel="Annuler la commande"
        cancelLabel="Revenir"
        tone="danger"
        onConfirm={() => {
          if (cancelOrder) {
            statusMut.mutate({ orderId: cancelOrder.id, status: "canceled" });
            setCancelOrder(null);
          }
        }}
        onCancel={() => setCancelOrder(null)}
        busy={statusMut.isPending}
      />
    </FsPage>
  );
}

/**
 * Photo de couverture : aperçu au format réel de la bannière (16/6, comme la
 * vitrine publique) plutôt qu'un champ URL — le commerçant voit ce que verra son
 * client. Prise de vue directe possible sur mobile (`capture`).
 */
function CoverPicker({
  url,
  uploading,
  onPick,
  onRemove,
}: {
  url: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  /*
    Le champ fichier est piloté par `ref.click()` et rendu avec `hidden`, plutôt
    qu'un `<label htmlFor>` sur un input en `sr-only` : ce dernier est
    positionné en absolu hors flux, et le navigateur le fait défiler dans la vue
    à l'ouverture du sélecteur — la page sautait alors sur une zone vide.
  */
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/6] w-full overflow-hidden rounded-[4px] border border-black/[0.06] bg-fs-surface-container">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Couverture de la boutique" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <MdAddPhotoAlternate className="h-7 w-7 text-neutral-400" aria-hidden />
            <p className="text-xs font-semibold text-neutral-600">Aucune photo</p>
            <p className="px-4 text-[11px] text-neutral-500">
              Une belle photo de votre boutique ou de vos produits donne confiance.
            </p>
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-bold text-white">
            Envoi de la photo…
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="rounded-[4px] border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-50"
        >
          {url ? "Changer la photo" : "Choisir une photo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Réinitialisé pour pouvoir re-choisir le même fichier après un retrait.
            e.target.value = "";
            if (file) onPick(file);
          }}
        />
        {url ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-[4px] border border-black/[0.08] px-3 py-2 text-xs font-semibold text-neutral-600"
          >
            Retirer
          </button>
        ) : null}
      </div>
      <p className="text-[11px] text-neutral-500">
        Format paysage conseillé. La photo est automatiquement allégée avant l&apos;envoi.
      </p>
    </div>
  );
}

/** Onglet : même style que `FsFilterChip`, angles resserrés. */
function TabChip({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-2 text-xs font-medium transition-colors sm:py-1.5 sm:text-sm",
        selected
          ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)] font-semibold text-fs-accent"
          : "border-black/[0.08] bg-fs-card text-neutral-800",
      )}
    >
      <Icon
        className={cn("h-[18px] w-[18px] shrink-0", selected ? "text-fs-accent" : "text-neutral-500")}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-neutral-500", strong && "font-bold text-fs-text")}>{label}</dt>
      <dd className={cn("font-semibold text-fs-text", strong && "text-sm font-black")}>{value}</dd>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[4px] border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={cn("block", full && "sm:col-span-2")}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-[var(--fs-accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-xs">
        <span className="block font-semibold text-fs-text">{label}</span>
        {hint ? <span className="text-neutral-500">{hint}</span> : null}
      </span>
    </label>
  );
}
