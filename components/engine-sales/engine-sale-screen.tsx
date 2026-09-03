"use client";

import { FsCard, FsPage, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { createEngineSale } from "@/lib/features/engine-sales/api";
import type {
  EngineCondition,
  EnginePaymentMethod,
  EngineWheels,
} from "@/lib/features/engine-sales/types";
import { listAvailableEngineUnits } from "@/lib/features/engine-units/api";
import { engineUnitLabel } from "@/lib/features/engine-units/types";
import { listProducts, listStoreInventory } from "@/lib/features/products/api";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import { useStoreCatalog } from "@/lib/features/stores/use-store-catalog";
import { filterByStoreCatalog } from "@/lib/features/stores/store-catalog";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { ensureStringNumberMap } from "@/lib/utils/string-number-map";
import { toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePersistentDraft } from "@/lib/hooks/use-persistent-draft";
import {
  ENGINE_SALE_DRAFT_VERSION,
  engineSaleDraftKey,
  isEngineSaleDraftEmpty,
  type EngineSaleDraft,
} from "@/lib/features/engine-sales/sale-draft";
import { MdArrowBack, MdInventory2, MdSearch, MdTwoWheeler } from "react-icons/md";

const PAYMENT_METHODS: { value: EnginePaymentMethod; label: string }[] = [
  { value: "cash", label: "Espèces" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "transfer", label: "Virement" },
  { value: "card", label: "Carte" },
  { value: "other", label: "Autre" },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 border-l-4 border-fs-accent pl-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-fs-text">{children}</h2>
    </div>
  );
}

export function EngineSaleScreen({ storeId }: { storeId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: ctx, helpers, hasPermission } = usePermissions();
  const companyId = ctx?.companyId ?? "";
  /** Motos identifiées : le vendeur choisit l'engin au lieu de retaper son châssis. */
  const engineUnitsOn = helpers?.engineUnitsOn ?? false;
  const store = ctx?.stores.find((s) => s.id === storeId);
  const storeEnabled = store?.engineSalesEnabled === true;
  const canCreate =
    hasPermission(P.salesInvoiceA4) || hasPermission(P.salesCreate) || hasPermission(P.salesUpdate);

  // Produits (engins) + stock de la boutique.
  const productsQ = useQuery({
    queryKey: ["engine-products", companyId] as const,
    queryFn: () => listProducts(companyId),
    enabled: Boolean(companyId),
  });
  const stockQ = useQuery({
    queryKey: ["engine-stock", storeId] as const,
    queryFn: () => listStoreInventory(storeId),
    enabled: Boolean(storeId),
  });
  // Le cache React Query est persisté (JSON) : toujours reconstruire un vrai `Map`.
  const stockByProductId = useMemo(
    () => ensureStringNumberMap(stockQ.data),
    [stockQ.data],
  );
  const { catalog } = useStoreCatalog(storeId);
  const products = useMemo(() => {
    const list = (productsQ.data ?? []).filter((p) => p.is_active);
    return filterByStoreCatalog(list, catalog);
  }, [productsQ.data, catalog]);

  const [step, setStep] = useState<"products" | "details">("products");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return products;
    return products.filter((p) => normalize(p.name).includes(q));
  }, [products, search]);

  // ── État du formulaire ──────────────────────────────────────────────
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const selectedProduct = products.find((p) => p.id === productId);

  // Client
  const [clientName, setClientName] = useState("");
  const [civility, setCivility] = useState("");
  const [profession, setProfession] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Engin
  const [wheels, setWheels] = useState<EngineWheels | "">("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [designation, setDesignation] = useState("");
  const [chassis, setChassis] = useState("");
  const [motor, setMotor] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState<EngineCondition | "">("");

  /**
   * Engin physique choisi (motos identifiées). Vide = saisie manuelle, comme avant.
   * La liste ne contient que les engins encore en cour pour ce modèle.
   */
  const [pickedEngineUnitId, setPickedEngineUnitId] = useState("");
  const engineUnitsQ = useQuery({
    queryKey: queryKeys.engineUnitsAvailable(productId, storeId),
    queryFn: () => listAvailableEngineUnits(productId, storeId),
    enabled: engineUnitsOn && Boolean(productId),
    staleTime: 30_000,
  });
  const availableUnits = useMemo(() => engineUnitsQ.data ?? [], [engineUnitsQ.data]);

  /*
   * Un brouillon peut dormir des heures, et entre-temps un collègue a pu vendre la moto
   * choisie. Le lien est donc DÉRIVÉ de la liste réellement disponible plutôt que gardé
   * tel quel : dès que l'engin n'y est plus, la vente repasse en saisie manuelle, les
   * champs châssis / moteur / couleur redeviennent modifiables et rien ne part sur un
   * châssis déjà sorti du stock.
   *
   * Dérivé et non « corrigé dans un effet » : il n'existe alors aucun rendu, même bref,
   * pendant lequel le formulaire pointerait encore l'engin vendu.
   */
  const engineUnitVanished =
    engineUnitsOn &&
    pickedEngineUnitId !== "" &&
    engineUnitsQ.isSuccess &&
    !availableUnits.some((u) => u.id === pickedEngineUnitId);
  const engineUnitId = engineUnitVanished ? "" : pickedEngineUnitId;

  /** Choisir la moto remplit le châssis, le moteur et la couleur — plus de ressaisie. */
  function pickEngineUnit(id: string) {
    setPickedEngineUnitId(id);
    const unit = availableUnits.find((u) => u.id === id);
    if (!unit) return;
    setChassis(unit.chassisNumber);
    setMotor(unit.engineNumber ?? "");
    setColor(unit.color ?? "");
    // Un engin identifié, c'est UNE moto : la quantité ne peut plus être 2.
    setQuantity(1);
  }

  // Paiement
  const [paymentMethod, setPaymentMethod] = useState<EnginePaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState(0);

  // Garantie
  const [warranty, setWarranty] = useState(false);
  const [warrantyDuration, setWarrantyDuration] = useState("");
  const [warrantyKm, setWarrantyKm] = useState("");
  const [warrantyCovered, setWarrantyCovered] = useState("");
  const [warrantyConditions, setWarrantyConditions] = useState("");

  // Accessoires
  const [accHelmet, setAccHelmet] = useState(false);
  const [accToolkit, setAccToolkit] = useState(false);
  const [accManual, setAccManual] = useState(false);
  const [accKeys, setAccKeys] = useState(false);
  const [accVest, setAccVest] = useState(false);
  const [accOther, setAccOther] = useState("");

  // Divers
  const [observations, setObservations] = useState("");
  const [internalReference, setInternalReference] = useState("");

  /*
   * Le formulaire survit à la navigation.
   *
   * Une vente d'engin, c'est une trentaine de champs — identité de l'acheteur, châssis,
   * moteur, garantie, accessoires. Le routeur démonte la page dès qu'on change d'écran :
   * aller vérifier une disponibilité ou un prix ailleurs effaçait tout, carte d'identité
   * du client encore en main.
   */
  const draftAnchorRef = useRef({ productId, clientName });
  useEffect(() => {
    draftAnchorRef.current = { productId, clientName };
  });

  const draftSnapshot = useMemo<EngineSaleDraft>(
    () => ({
      step,
      productId,
      quantity,
      unitPrice,
      engineUnitId,
      clientName,
      civility,
      profession,
      idType,
      idNumber,
      address,
      phone,
      email,
      wheels,
      brand,
      model,
      designation,
      chassis,
      motor,
      color,
      condition,
      paymentMethod,
      amountPaid,
      warranty,
      warrantyDuration,
      warrantyKm,
      warrantyCovered,
      warrantyConditions,
      accHelmet,
      accToolkit,
      accManual,
      accKeys,
      accVest,
      accOther,
      observations,
      internalReference,
    }),
    [
      step,
      productId,
      quantity,
      unitPrice,
      engineUnitId,
      clientName,
      civility,
      profession,
      idType,
      idNumber,
      address,
      phone,
      email,
      wheels,
      brand,
      model,
      designation,
      chassis,
      motor,
      color,
      condition,
      paymentMethod,
      amountPaid,
      warranty,
      warrantyDuration,
      warrantyKm,
      warrantyCovered,
      warrantyConditions,
      accHelmet,
      accToolkit,
      accManual,
      accKeys,
      accVest,
      accOther,
      observations,
      internalReference,
    ],
  );

  const { discard: discardDraft } = usePersistentDraft<EngineSaleDraft>({
    key: companyId && storeId ? engineSaleDraftKey(companyId, storeId) : null,
    version: ENGINE_SALE_DRAFT_VERSION,
    value: draftSnapshot,
    isEmpty: isEngineSaleDraftEmpty,
    onRestore: (d) => {
      /*
       * La relecture disque est asynchrone. Si le vendeur a déjà choisi un modèle ou
       * commencé à taper pendant ces quelques millisecondes, il sert le client PRÉSENT :
       * le brouillon d'avant est abandonné plutôt que de recouvrir la saisie en cours.
       */
      const cur = draftAnchorRef.current;
      if (cur.productId !== "" || cur.clientName.trim() !== "") return;

      setStep(d.step);
      setProductId(d.productId);
      setQuantity(d.quantity);
      setUnitPrice(d.unitPrice);
      setPickedEngineUnitId(d.engineUnitId);
      setClientName(d.clientName);
      setCivility(d.civility);
      setProfession(d.profession);
      setIdType(d.idType);
      setIdNumber(d.idNumber);
      setAddress(d.address);
      setPhone(d.phone);
      setEmail(d.email);
      setWheels(d.wheels);
      setBrand(d.brand);
      setModel(d.model);
      setDesignation(d.designation);
      setChassis(d.chassis);
      setMotor(d.motor);
      setColor(d.color);
      setCondition(d.condition);
      setPaymentMethod(d.paymentMethod);
      setAmountPaid(d.amountPaid);
      setWarranty(d.warranty);
      setWarrantyDuration(d.warrantyDuration);
      setWarrantyKm(d.warrantyKm);
      setWarrantyCovered(d.warrantyCovered);
      setWarrantyConditions(d.warrantyConditions);
      setAccHelmet(d.accHelmet);
      setAccToolkit(d.accToolkit);
      setAccManual(d.accManual);
      setAccKeys(d.accKeys);
      setAccVest(d.accVest);
      setAccOther(d.accOther);
      setObservations(d.observations);
      setInternalReference(d.internalReference);
      toast.info("Vente en cours restaurée.");
    },
  });


  const total = Math.max(0, Math.trunc(quantity)) * Math.max(0, unitPrice);
  const reste = Math.max(0, total - amountPaid);

  function pickProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setUnitPrice(Number(p.sale_price ?? 0));
      setDesignation(p.name);
    }
    // Changer de modèle invalide l'engin choisi : ses numéros ne sont pas ceux-là.
    setPickedEngineUnitId("");
    setChassis("");
    setMotor("");
    setColor("");
    setStep("details");
  }

  const createMut = useMutation({
    mutationFn: async () =>
      createEngineSale({
        companyId,
        storeId,
        productId,
        engineUnitId: engineUnitId || null,
        quantity: Math.max(1, Math.trunc(quantity)),
        unitPrice,
        payments: amountPaid > 0 ? [{ method: paymentMethod, amount: amountPaid }] : [],
        client: {
          name: clientName,
          civility,
          profession,
          fullIdentity: null,
          idType,
          idNumber,
          address,
          addressExtra: null,
          phone1: phone,
          phone2: null,
          email,
        },
        engine: {
          wheels: wheels === "" ? null : wheels,
          brand,
          model,
          designation,
          chassis,
          motor,
          color,
          condition: condition === "" ? null : condition,
        },
        warranty: {
          enabled: warranty,
          duration: warrantyDuration,
          kmLimit: warrantyKm,
          covered: warrantyCovered,
          conditions: warrantyConditions,
        },
        accessories: {
          helmet: accHelmet,
          toolkit: accToolkit,
          manual: accManual,
          keys: accKeys,
          vest: accVest,
          other: accOther,
        },
        observations,
        internalReference,
      }),
    onSuccess: async (res) => {
      /*
       * En premier, avant tout `router.push` : cet écran ne vide pas son formulaire
       * après enregistrement, il quitte la page. Sans cet oubli explicite, le démontage
       * sauverait la vente qu'on vient de passer et la visite suivante proposerait de la
       * reprendre — c'est-à-dire de la saisir deux fois.
       */
      discardDraft();
      await qc.invalidateQueries({ queryKey: queryKeys.engineSales({ companyId, storeId }) });
      await qc.invalidateQueries({ queryKey: queryKeys.productInventory(storeId) });
      if (engineUnitsOn) {
        await qc.invalidateQueries({ queryKey: ["engine-units"] });
      }
      // La vente est passée mais la moto est restée « en stock » : on le dit tout de
      // suite, sinon l'écart n'apparaîtra qu'à l'inventaire, des semaines plus tard.
      if (res.engineUnitMarked === false) {
        toast.error(
          "Vente enregistrée, mais la moto n'a pas pu être marquée comme vendue. Ouvrez sa fiche pour vérifier.",
        );
      }
      // Vente créée hors ligne (mise en file d'attente) : pas de facture PDF tant que
      // la synchronisation n'a pas eu lieu côté serveur.
      if (res.saleId.startsWith("offline:")) {
        toast.success("Vente enregistrée localement. Synchronisation à la reconnexion.");
        router.push(ROUTES.engines);
        return;
      }
      toast.success(`Vente enregistrée · ${res.saleNumber}`);
      window.open(`/api/pdf/engine-invoice?saleId=${encodeURIComponent(res.saleId)}`, "_blank");
      router.push(ROUTES.engines);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Enregistrement impossible."),
  });

  function submit() {
    if (!productId) {
      toast.error("Sélectionnez l'engin.");
      return;
    }
    if (!clientName.trim()) {
      toast.error("Le nom / structure du client est requis.");
      return;
    }
    if (total <= 0) {
      toast.error("Le montant doit être supérieur à 0.");
      return;
    }
    if (amountPaid > total) {
      toast.error("Le montant payé dépasse le total.");
      return;
    }
    createMut.mutate();
  }

  if (!storeEnabled) {
    return (
      <FsPage className="px-5 pt-4 min-[900px]:px-7 min-[900px]:pt-7">
        <FsCard className="mt-6" padding="p-8">
          <p className="text-center text-base text-neutral-600">
            Le module « Vente Engins » n&apos;est pas activé pour cette boutique.
          </p>
        </FsCard>
      </FsPage>
    );
  }
  if (!canCreate) {
    return (
      <FsPage className="px-5 pt-4 min-[900px]:px-7 min-[900px]:pt-7">
        <FsCard className="mt-6" padding="p-8">
          <p className="text-center text-base text-neutral-600">
            Vous n&apos;avez pas le droit d&apos;enregistrer une vente.
          </p>
        </FsCard>
      </FsPage>
    );
  }

  const input = fsInputClass("rounded-md border border-black/8");
  const busy = createMut.isPending;

  // ── Étape 1 : sélection de l'engin (grille façon POS) ────────────────
  if (step === "products") {
    return (
      <FsPage className="px-5 pt-4 pb-6 min-[900px]:px-7 min-[900px]:pt-7">
        <div className="mb-4 flex items-center gap-3">
          <Link
            href={ROUTES.engines}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/8 text-neutral-700"
            aria-label="Retour"
          >
            <MdArrowBack className="h-5 w-5" aria-hidden />
          </Link>
          <div className="flex items-center gap-2.5">
            <MdTwoWheeler className="h-6 w-6 text-fs-accent" aria-hidden />
            <h1 className="text-lg font-bold text-fs-text">Choisir l&apos;engin</h1>
          </div>
        </div>

        <div className="relative mb-4">
          <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            className={fsInputClass("rounded-md pl-10")}
            placeholder="Rechercher un engin…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {productsQ.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <FsCard padding="px-4 py-12">
            <p className="text-center text-base text-neutral-600">Aucun engin trouvé.</p>
          </FsCard>
        ) : (
          <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 min-[560px]:grid-cols-4 min-[820px]:grid-cols-5 min-[1200px]:grid-cols-6">
            {filtered.map((p) => {
              const stock = stockByProductId.get(p.id) ?? 0;
              const thumb = firstProductImageUrl(p);
              const price = Number(p.sale_price ?? 0);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProduct(p.id)}
                  className={cn(
                    "relative flex aspect-[0.82] w-full flex-col items-center overflow-hidden rounded-xl bg-white px-2 py-1.5 text-center transition active:scale-[0.98]",
                    "border border-fs-accent/35 shadow-[0_1px_6px_rgba(249,115,22,0.08)]",
                  )}
                >
                  <div className="mx-auto flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F8F9FA]">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <MdInventory2 className="h-9 w-9 text-fs-accent/70" aria-hidden />
                    )}
                  </div>
                  <div className="mt-0.5 flex min-h-0 w-full flex-1 flex-col items-center justify-center">
                    <p className="line-clamp-2 w-full text-center text-[11px] font-semibold leading-snug text-[#1F2937]" title={p.name}>
                      {p.name}
                    </p>
                    <p className="mt-0.5 w-full truncate text-center text-[10px] font-bold text-fs-accent">
                      {formatCurrency(price)} · {stock}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </FsPage>
    );
  }

  // ── Étape 2 : détails + facture ──────────────────────────────────────
  return (
    <FsPage className="px-5 pt-4 pb-28 min-[900px]:px-7 min-[900px]:pt-7">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStep("products")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/8 text-neutral-700"
          aria-label="Changer d'engin"
        >
          <MdArrowBack className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex items-center gap-2.5">
          <MdTwoWheeler className="h-6 w-6 text-fs-accent" aria-hidden />
          <h1 className="text-lg font-bold text-fs-text">Nouvelle vente d&apos;engin</h1>
        </div>
      </div>

      {/* Engin sélectionné */}
      <FsCard className="mb-4" padding="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-[#F8F9FA]">
              {selectedProduct && firstProductImageUrl(selectedProduct) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firstProductImageUrl(selectedProduct)!} alt="" className="h-full w-full object-cover" />
              ) : (
                <MdInventory2 className="h-6 w-6 text-fs-accent/70" aria-hidden />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-fs-text">{selectedProduct?.name ?? "Engin"}</p>
              <p className="text-xs text-neutral-500">Engin sélectionné</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep("products")}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-fs-accent"
          >
            Changer
          </button>
        </div>
      </FsCard>

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        {/* Engin */}
        <FsCard padding="p-4">
          <SectionTitle>Informations de l&apos;engin</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type d'engin">
              <select
                className={input}
                value={wheels}
                onChange={(e) =>
                  setWheels(e.target.value === "" ? "" : (Number(e.target.value) as EngineWheels))
                }
              >
                <option value="">—</option>
                <option value="2">2 roues</option>
                <option value="3">3 roues</option>
              </select>
            </Field>
            <Field label="État">
              <select
                className={input}
                value={condition}
                onChange={(e) => setCondition(e.target.value as EngineCondition | "")}
              >
                <option value="">—</option>
                <option value="neuf">Neuf</option>
                <option value="occasion">Occasion</option>
              </select>
            </Field>
            <Field label="Marque">
              <input className={input} value={brand} onChange={(e) => setBrand(e.target.value)} />
            </Field>
            <Field label="Modèle">
              <input className={input} value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Désignation">
                <input
                  className={input}
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                />
              </Field>
            </div>
            {/* Motos identifiées : choisir l'engin plutôt que relever son châssis sur
                le cadre. Une faute de frappe ici bloque la carte grise du client. */}
            {engineUnitsOn ? (
              <div className="sm:col-span-2">
                <Field label="Moto à vendre">
                  <select
                    className={input}
                    value={engineUnitId}
                    onChange={(e) => pickEngineUnit(e.target.value)}
                    disabled={engineUnitsQ.isPending}
                  >
                    <option value="">
                      {engineUnitsQ.isPending
                        ? "Chargement…"
                        : availableUnits.length === 0
                          ? "Aucune moto enregistrée — saisie manuelle"
                          : "Saisie manuelle (aucune moto choisie)"}
                    </option>
                    {availableUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {engineUnitLabel(u)}
                      </option>
                    ))}
                  </select>
                </Field>
                {engineUnitVanished ? (
                  <p className="mt-1 text-[11px] font-medium text-red-600">
                    La moto qui était sélectionnée n&apos;est plus disponible — elle a été
                    vendue entre-temps. Choisissez-en une autre, ou vérifiez les numéros
                    ci-dessous avant d&apos;enregistrer.
                  </p>
                ) : null}
                {engineUnitId ? (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Châssis, moteur et couleur repris de la moto choisie. Elle sortira du
                    stock à l&apos;enregistrement de la vente.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Field label="N° châssis">
              <input
                className={input}
                value={chassis}
                onChange={(e) => setChassis(e.target.value)}
                readOnly={Boolean(engineUnitId)}
              />
            </Field>
            <Field label="N° moteur">
              <input
                className={input}
                value={motor}
                onChange={(e) => setMotor(e.target.value)}
                readOnly={Boolean(engineUnitId)}
              />
            </Field>
            <Field label="Couleur">
              <input
                className={input}
                value={color}
                onChange={(e) => setColor(e.target.value)}
                readOnly={Boolean(engineUnitId)}
              />
            </Field>
            <Field label="Quantité">
              <input
                inputMode="numeric"
                className={input}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                readOnly={Boolean(engineUnitId)}
              />
            </Field>
          </div>
        </FsCard>

        {/* Client */}
        <FsCard padding="p-4">
          <SectionTitle>Informations du client</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nom / Structure" required>
                <input
                  className={input}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Civilité">
              <select className={input} value={civility} onChange={(e) => setCivility(e.target.value)}>
                <option value="">—</option>
                <option value="M.">M. (Monsieur)</option>
                <option value="Mme">Mme (Madame)</option>
                <option value="Mlle">Mlle (Mademoiselle)</option>
              </select>
            </Field>
            <Field label="Profession / Fonction">
              <input
                className={input}
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
              />
            </Field>
            <Field label="Type de pièce">
              <select className={input} value={idType} onChange={(e) => setIdType(e.target.value)}>
                <option value="">—</option>
                <option value="CNIB">CNIB</option>
                <option value="Passeport">Passeport</option>
                <option value="Autre">Autre</option>
              </select>
            </Field>
            <Field label="N° de pièce">
              <input className={input} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
            </Field>
            <Field label="Adresse">
              <input className={input} value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="E-mail">
                <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          </div>
        </FsCard>

        {/* Montant & Paiement */}
        <FsCard padding="p-4">
          <SectionTitle>Montant & paiement</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Prix unitaire (CFA)" required>
              <input
                inputMode="decimal"
                className={input}
                value={unitPrice === 0 ? "" : String(unitPrice)}
                onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value.replace(",", ".")) || 0))}
              />
            </Field>
            <Field label="Mode de paiement">
              <select
                className={input}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as EnginePaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Montant payé (CFA)">
              <input
                inputMode="decimal"
                className={input}
                value={amountPaid === 0 ? "" : String(amountPaid)}
                onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value.replace(",", ".")) || 0))}
              />
            </Field>
            <div className="flex flex-col justify-end">
              <span className="text-xs text-neutral-500">Reste à payer</span>
              <span className="text-sm font-bold text-fs-text">{formatCurrency(reste)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-[10px] bg-fs-accent px-4 py-3">
            <span className="text-sm font-bold text-white">TOTAL À PAYER</span>
            <span className="text-base font-bold text-white">{formatCurrency(total)}</span>
          </div>
        </FsCard>

        {/* Garantie & accessoires */}
        <FsCard padding="p-4">
          <SectionTitle>Garantie & accessoires</SectionTitle>
          <label className="mb-3 flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-fs-accent"
              checked={warranty}
              onChange={(e) => setWarranty(e.target.checked)}
            />
            <span className="text-sm font-medium text-fs-text">Garantie éventuelle</span>
          </label>
          {warranty ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Durée">
                <input
                  className={input}
                  value={warrantyDuration}
                  onChange={(e) => setWarrantyDuration(e.target.value)}
                />
              </Field>
              <Field label="Kilométrage limite">
                <input className={input} value={warrantyKm} onChange={(e) => setWarrantyKm(e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Éléments couverts">
                  <input
                    className={input}
                    value={warrantyCovered}
                    onChange={(e) => setWarrantyCovered(e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Conditions">
                  <input
                    className={input}
                    value={warrantyConditions}
                    onChange={(e) => setWarrantyConditions(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          <p className="mb-2 mt-4 text-xs font-semibold uppercase text-neutral-500">
            Accessoires remis avec la moto
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Casque de protection", accHelmet, setAccHelmet] as const,
              ["Kit d'outils", accToolkit, setAccToolkit] as const,
              ["Manuel d'utilisation", accManual, setAccManual] as const,
              ["Clés de contact", accKeys, setAccKeys] as const,
              ["Gilet de sécurité", accVest, setAccVest] as const,
            ].map(([label, val, set]) => (
              <label key={label} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-fs-accent"
                  checked={val}
                  onChange={(e) => set(e.target.checked)}
                />
                <span className="text-sm text-fs-text">{label}</span>
              </label>
            ))}
          </div>
          <div className="mt-2">
            <Field label="Autre accessoire">
              <input className={input} value={accOther} onChange={(e) => setAccOther(e.target.value)} />
            </Field>
          </div>
        </FsCard>

        {/* Divers */}
        <FsCard className="min-[900px]:col-span-2" padding="p-4">
          <SectionTitle>Observations & référence</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Référence interne">
              <input
                className={input}
                value={internalReference}
                onChange={(e) => setInternalReference(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Observations">
                <textarea
                  className={cn(input, "min-h-[80px]")}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </FsCard>
      </div>

      {/* Barre d'action */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/8 bg-fs-card/95 px-5 py-3 backdrop-blur min-[900px]:px-7">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <span className="text-xs text-neutral-500">Total</span>
            <span className="ml-2 text-base font-bold text-fs-accent">{formatCurrency(total)}</span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="inline-flex min-h-[44px] min-w-[200px] items-center justify-center rounded-[10px] bg-fs-accent px-6 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Enregistrer & générer la facture"
            )}
          </button>
        </div>
      </div>
    </FsPage>
  );
}
