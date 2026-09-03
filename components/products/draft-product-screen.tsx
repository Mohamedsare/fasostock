"use client";

/**
 * « Ajout produit » — la page où l'équipe saisit l'article qu'elle a dans la main.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PAGE, ALORS QU'UN DIALOGUE EXISTAIT DÉJÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dialogue « Ajouter un article » vivait sur la page Produits, et il n'apparaissait
 * qu'à ceux qui n'ont PAS `products.create` — c'est-à-dire, en pratique, au seul
 * caissier. Le gérant, le responsable de boutique et le magasinier, à qui le
 * propriétaire venait justement de cocher « Ajouter un produit sans prix », tombaient
 * sur le formulaire complet AVEC les prix : la case cochée ne changeait rien pour eux,
 * et le patron cherchait une page qui n'existait pas.
 *
 * Cette page est cette porte-là, et elle ne dépend que de deux choses : le réglage
 * entreprise et le droit. Cocher la case fait apparaître l'entrée de menu, quel que
 * soit le rôle — c'est ce qu'on attend d'une case à cocher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI DÉCIDE DE LA MISE EN PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * On l'utilise DEBOUT, devant un carton ouvert, à une main, avec quarante références à
 * saisir d'affilée. Tout en découle :
 *
 *  1. UN SEUL CHAMP OBLIGATOIRE, EN HAUT, DÉJÀ FOCALISÉ. Le clavier s'ouvre tout seul,
 *     on tape le nom lu sur l'emballage, on valide. Le reste est facultatif.
 *  1 bis. DEUX SOURCES POUR LA PHOTO. « Prendre la photo » ouvre l'appareil,
 *     « Choisir une image » ouvre le téléphone — deux inputs, parce qu'un input qui
 *     porte `capture` n'ouvre QUE l'appareil et ne propose jamais la galerie.
 *  2. LE BOUTON EST SOUS LE POUCE, TOUJOURS. Barre fixe en bas sur mobile, au-dessus de
 *     la barre de navigation — jamais à aller chercher en bas d'un formulaire.
 *  3. LE FORMULAIRE NE SE VIDE PAS ENTIÈREMENT. Unité et catégorie restent d'un article
 *     au suivant : un carton, c'est vingt fois la même famille.
 *  4. CE QUI VIENT D'ÊTRE AJOUTÉ RESTE À L'ÉCRAN. Sans cette liste, on ne sait plus si
 *     on a saisi le douzième article ou si on l'a rêvé, et on le saisit deux fois.
 *  5. LES DOUBLONS SONT SIGNALÉS AVANT LA VALIDATION, sur le code-barres et sur le nom.
 *     Une fiche en double coupe le stock en deux et fausse durablement les ventes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN NE MONTRE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun prix — et pas seulement à l'affichage : la seule lecture du catalogue faite ici
 * est `listPhotoCatalog`, qui ne les DEMANDE pas. Un employé à qui l'on ouvre cette page
 * ne reçoit pas les prix de la maison dans son navigateur.
 *
 * La garantie de fond, elle, n'est pas dans cet écran : `create_draft_product`
 * (migration 00210) écrit les prix, l'activation et l'état d'attente EN DUR, et 00217
 * ferme `products` en écriture directe. Ce qui part d'ici ne peut pas arriver chiffré.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePersistentDraft } from "@/lib/hooks/use-persistent-draft";
import {
  DRAFT_PRODUCT_DRAFT_VERSION,
  draftProductDraftKey,
  isDraftProductDraftEmpty,
  type DraftProductDraft,
} from "@/lib/features/products/draft-product-draft";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAddAPhoto,
  MdCheckCircle,
  MdClose,
  MdHourglassBottom,
  MdInfoOutline,
  MdLock,
  MdPhotoLibrary,
  MdQrCodeScanner,
  MdWarningAmber,
} from "react-icons/md";

import { PosBarcodeScannerDialog } from "@/components/pos/pos-barcode-scanner-dialog";
import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
} from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { addProductImage, listCategories } from "@/lib/features/products/api";
import {
  createDraftProduct,
  listPhotoCatalog,
} from "@/lib/features/products/employee-catalog";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/** Unités proposées en un tap — celles qui couvrent presque tout le commerce de détail. */
const UNITS = ["pce", "kg", "L", "m", "sac", "carton", "paquet", "boîte"] as const;

/** Minuscules sans accent : « Café », « cafe » et « CAFE » se rejoignent. */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Un article saisi pendant cette séance — pour qu'il reste visible à l'écran. */
type JustAdded = {
  id: string;
  name: string;
  unit: string;
  barcode: string;
  hasPhoto: boolean;
};

export function DraftProductScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const canView = h?.canDraftProducts ?? false;

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>("pce");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<JustAdded[]>([]);

  /*
   * La fiche en cours survit à la navigation.
   *
   * L'employé saisit debout dans un dépôt et va régulièrement vérifier ailleurs dans
   * l'app si l'article existe déjà. Le routeur démontait la page : le nom tapé, le
   * code-barres scanné et la note repartaient à zéro.
   *
   * La photo n'est pas gardée — voir `DraftProductDraft` pour la raison. La liste des
   * articles déjà ajoutés non plus : elle se relit dans le catalogue, ce n'est pas de la
   * saisie en attente.
   */
  const draftAnchorRef = useRef({ name, barcode, description });
  useEffect(() => {
    draftAnchorRef.current = { name, barcode, description };
  });

  const draftSnapshot = useMemo<DraftProductDraft>(
    () => ({ name, unit, barcode, categoryId, description, noteOpen }),
    [name, unit, barcode, categoryId, description, noteOpen],
  );

  usePersistentDraft<DraftProductDraft>({
    key: companyId ? draftProductDraftKey(companyId) : null,
    version: DRAFT_PRODUCT_DRAFT_VERSION,
    value: draftSnapshot,
    isEmpty: isDraftProductDraftEmpty,
    onRestore: (d) => {
      /*
       * La relecture disque est asynchrone. Si l'employé a déjà commencé à taper pendant
       * ces quelques millisecondes, c'est l'article qu'il a EN MAIN : le brouillon
       * d'avant est abandonné plutôt que de recouvrir la saisie en cours.
       */
      const cur = draftAnchorRef.current;
      if (cur.name.trim() || cur.barcode.trim() || cur.description.trim()) return;

      setName(d.name);
      setUnit(d.unit);
      setBarcode(d.barcode);
      setCategoryId(d.categoryId);
      setDescription(d.description);
      /* Une note restaurée doit être visible : le volet s'ouvre dès qu'elle n'est pas vide. */
      setNoteOpen(d.noteOpen || d.description.trim() !== "");
      toast.info("Fiche en cours restaurée. Reprenez la photo si vous en aviez une.");
    },
  });

  const nameRef = useRef<HTMLInputElement | null>(null);
  /* L'appareil photo et les images du téléphone : deux inputs, cf. l'en-tête (1 bis). */
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  const categoriesQ = useQuery({
    queryKey: queryKeys.categories(companyId),
    queryFn: () => listCategories(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 5 * 60_000,
  });

  /*
   * Le catalogue SANS les prix — la même lecture que la page Photos, donc le même
   * cache : ouvrir les deux pages à la suite ne le charge qu'une fois. Il sert à deux
   * choses et à rien d'autre : dire « cet article existe déjà » avant qu'on le crée en
   * double, et compter ce qui attend un prix. La saisie ne l'attend jamais — tant qu'il
   * n'est pas là, on ajoute quand même.
   */
  const catalogQ = useQuery({
    queryKey: queryKeys.photoCatalog(companyId),
    queryFn: () => listPhotoCatalog(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 60_000,
  });

  const categories = categoriesQ.data ?? [];
  const catalog = useMemo(() => catalogQ.data ?? [], [catalogQ.data]);
  const awaitingCount = useMemo(
    () => catalog.filter((p) => p.awaitingPricing).length,
    [catalog],
  );

  const trimmedName = name.trim();
  const trimmedBarcode = barcode.trim();

  /** Doublon exact sur le code-barres : c'est le même article, sans discussion. */
  const barcodeTwin = useMemo(() => {
    if (trimmedBarcode.length < 4) return null;
    const b = trimmedBarcode.toLowerCase();
    return catalog.find((p) => (p.barcode ?? "").trim().toLowerCase() === b) ?? null;
  }, [catalog, trimmedBarcode]);

  /** Même nom, à l'accent et à la casse près : très probablement le même article. */
  const nameTwin = useMemo(() => {
    if (trimmedName.length < 3) return null;
    const n = norm(trimmedName);
    return catalog.find((p) => norm(p.name) === n) ?? null;
  }, [catalog, trimmedName]);

  const canSubmit = trimmedName.length > 0;

  // L'aperçu de la photo est une URL d'objet : sans révocation, chaque article saisi
  // laisse son image en mémoire, et on en saisit quarante à la suite.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  function openPicker(source: "camera" | "gallery") {
    const input = source === "camera" ? cameraRef.current : galleryRef.current;
    if (!input) return;
    // Sans cette remise à zéro, reprendre DEUX FOIS la même photo ne déclenche pas
    // `onChange` la seconde fois (même nom de fichier).
    input.value = "";
    input.click();
  }

  function resetPickers() {
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  function pickPhoto(file: File | null) {
    setPhoto(file);
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  const mut = useMutation({
    mutationFn: async () => {
      const productId = await createDraftProduct({
        companyId,
        name: trimmedName,
        unit,
        barcode: trimmedBarcode,
        description,
        categoryId: categoryId || null,
        storeId,
      });
      /*
       * La photo part APRÈS, et son échec n'annule pas la fiche : la fiche est le
       * travail utile, la photo un bonus. Perdre le nom saisi debout dans un dépôt
       * parce qu'une image de 6 Mo n'est pas montée serait le pire des deux mondes.
       */
      let photoOk = false;
      if (photo) {
        try {
          await addProductImage(productId, photo);
          photoOk = true;
        } catch {
          toast.info("Article enregistré, mais la photo n'est pas partie. Reprenez-la depuis Photos produits.");
        }
      }
      return { productId, photoOk };
    },
    onSuccess: ({ productId, photoOk }) => {
      toast.success(`« ${trimmedName} » ajouté. Le patron y mettra le prix.`);
      setJustAdded((prev) => [
        { id: productId, name: trimmedName, unit, barcode: trimmedBarcode, hasPhoto: photoOk },
        ...prev,
      ]);
      /*
       * On vide le nom, le code-barres, la note et la photo ; on GARDE l'unité et la
       * catégorie : celui qui déballe un carton saisit vingt articles de la même
       * famille à la suite. Tout remettre à zéro lui ferait recocher la même catégorie
       * vingt fois.
       */
      setName("");
      setBarcode("");
      setDescription("");
      setNoteOpen(false);
      pickPhoto(null);
      resetPickers();
      // Le clavier reste ouvert et le curseur est au bon endroit : l'article suivant
      // se tape sans toucher l'écran.
      nameRef.current?.focus();
      void qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
      void qc.invalidateQueries({ queryKey: queryKeys.photoCatalog(companyId) });
    },
    onError: (e) => toastMutationError("products", e),
  });

  function submit() {
    if (!canSubmit || mut.isPending) return;
    mut.mutate();
  }

  if (permLoading) {
    return (
      <FsPage>
        <FsScreenHeader title="Ajout produit" />
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
          title="Ajout produit"
          subtitle="Saisir un article du catalogue, sans les prix."
        />
        <FsCard padding="p-6">
          <div className="text-center">
            <MdLock className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">Accès réservé</p>
            <p className="mt-1 text-xs text-neutral-600">
              {h?.employeeDraftProductsOn
                ? "Demandez au propriétaire le droit « Ajouter un produit sans prix » (page Employés)."
                : "Le propriétaire n'a pas encore ouvert « Ajouter un article, sans le prix » (Paramètres › Vos employés et le catalogue)."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const labelClass =
    "text-[11px] font-semibold uppercase tracking-wide text-neutral-500 sm:text-xs";
  const fieldClass =
    "w-full rounded-[10px] border border-black/10 bg-fs-surface-container px-3 text-base text-fs-text outline-none placeholder:text-neutral-400 focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20 sm:text-sm";

  return (
    <FsPage>
      {/* La barre d'action est FIXE en bas sur mobile : la page doit lui laisser la place. */}
      <div className="pb-[calc(5.5rem+var(--fs-safe-bottom))] min-[900px]:pb-0">
        <FsScreenHeader
          title="Ajout produit"
          subtitle="Saisissez l'article que vous avez en main. Le prix, c'est le propriétaire qui le pose."
        />

        {/*
          Dit une fois, clairement, ce que l'employé va produire. Sans cette phrase il
          croit avoir mal fait son travail en ne trouvant pas les champs de prix.
        */}
        <p className="flex items-start gap-2 rounded-[10px] bg-sky-500/10 px-3 py-2.5 text-xs leading-relaxed text-sky-900 dark:text-sky-200">
          <MdInfoOutline className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            L&apos;article est enregistré <strong>sans prix</strong> : il n&apos;est pas
            vendable tout de suite. Le propriétaire le retrouve dans sa liste
            «&nbsp;à chiffrer&nbsp;», et il part en caisse dès qu&apos;il a son prix.
          </span>
        </p>

        {/* Ce qui vient d'être fait — la seule chose qui fait qu'on en saisit vingt de plus. */}
        {justAdded.length > 0 ? (
          <FsCard
            padding="p-3"
            className="mt-2 border-emerald-500/30 bg-emerald-500/[0.06]"
          >
            <div className="flex items-center gap-2">
              <MdCheckCircle className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                {justAdded.length} article{justAdded.length > 1 ? "s" : ""} ajouté
                {justAdded.length > 1 ? "s" : ""}
              </p>
            </div>
            <ul className="mt-2 space-y-1">
              {justAdded.slice(0, 6).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-md bg-fs-surface/70 px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fs-text">
                    {a.name}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-neutral-500">
                    {a.unit}
                  </span>
                  {a.hasPhoto ? (
                    <MdAddAPhoto
                      className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                      aria-label="avec photo"
                    />
                  ) : null}
                </li>
              ))}
              {justAdded.length > 6 ? (
                <li className="px-2 text-[11px] text-neutral-600">
                  et {justAdded.length - 6} de plus…
                </li>
              ) : null}
            </ul>
          </FsCard>
        ) : null}

        {catalogQ.isError ? (
          <FsQueryErrorPanel
            error={catalogQ.error}
            onRetry={() => void catalogQ.refetch()}
          />
        ) : null}

        <FsCard padding="p-3 sm:p-4" className="mt-2">
          <div className="space-y-4">
            {/* ── Nom : le seul champ obligatoire, en tête, déjà focalisé ── */}
            <div>
              <label className={labelClass} htmlFor="draft-name">
                Nom de l&apos;article *
              </label>
              <input
                id="draft-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ex. Savon Omo 400 g"
                maxLength={160}
                autoFocus
                enterKeyHint="done"
                autoComplete="off"
                className={cn(fieldClass, "mt-1.5 min-h-[52px] font-semibold sm:min-h-11")}
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Recopiez le nom tel qu&apos;il est écrit sur l&apos;emballage.
              </p>
            </div>

            {/* Doublons : dits AVANT la validation, jamais bloquants. */}
            {barcodeTwin || nameTwin ? (
              <p className="flex items-start gap-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                <MdWarningAmber className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {barcodeTwin ? (
                    <>
                      Ce code-barres est déjà celui de{" "}
                      <strong>{barcodeTwin.name}</strong>. C&apos;est probablement le même
                      article : inutile de le créer une deuxième fois.
                    </>
                  ) : (
                    <>
                      <strong>{nameTwin?.name}</strong> existe déjà au catalogue. Vérifiez
                      avant d&apos;ajouter : deux fiches pour un même article coupent le
                      stock en deux.
                    </>
                  )}
                </span>
              </p>
            ) : null}

            {/* ── Photo : une frappe, l'appareil s'ouvre directement ── */}
            <div>
              <span className={labelClass}>Photo (facultatif)</span>
              {/*
                DEUX inputs, et il en faut deux : celui qui porte `capture` n'ouvre que
                l'appareil photo sur téléphone — jamais la galerie, quoi qu'on mette à
                côté. Le second, sans `capture`, ouvre les images déjà enregistrées :
                celle prise hier, celle reçue du fournisseur, le visuel officiel.
              */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              />
              {photoUrl ? (
                <div className="mt-1.5 flex items-center gap-3 rounded-[10px] border border-black/10 bg-fs-surface-container p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="Aperçu de la photo"
                    className="h-16 w-16 shrink-0 rounded-md object-cover"
                  />
                  <p className="min-w-0 flex-1 text-xs text-neutral-600">
                    Elle partira avec l&apos;article.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      pickPhoto(null);
                      resetPickers();
                    }}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-black/5"
                    aria-label="Retirer la photo"
                  >
                    <MdClose className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openPicker("camera")}
                    className="flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-black/15 bg-fs-surface-container px-2 text-center text-xs font-semibold leading-tight text-neutral-700 active:scale-[0.99]"
                  >
                    <MdAddAPhoto className="h-6 w-6 text-fs-accent" aria-hidden />
                    Prendre la photo
                  </button>
                  <button
                    type="button"
                    onClick={() => openPicker("gallery")}
                    className="flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-black/15 bg-fs-surface-container px-2 text-center text-xs font-semibold leading-tight text-neutral-700 active:scale-[0.99]"
                  >
                    <MdPhotoLibrary className="h-6 w-6 text-fs-accent" aria-hidden />
                    Choisir une image
                  </button>
                </div>
              )}
            </div>

            {/* ── Code-barres : le scanner d'abord, le clavier ensuite ── */}
            <div>
              <label className={labelClass} htmlFor="draft-barcode">
                Code-barres (facultatif)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="draft-barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scannez ou saisissez"
                  inputMode="numeric"
                  maxLength={64}
                  autoComplete="off"
                  className={cn(fieldClass, "min-h-[52px] min-w-0 flex-1 sm:min-h-11")}
                />
                <button
                  type="button"
                  onClick={() => setScanOpen(true)}
                  className="inline-flex min-h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] border border-fs-accent/30 bg-fs-accent/10 text-fs-accent sm:min-h-11 sm:w-11"
                  aria-label="Scanner le code-barres"
                >
                  <MdQrCodeScanner className="h-6 w-6" aria-hidden />
                </button>
              </div>
            </div>

            {/* ── Unité : des puces, jamais une liste déroulante ── */}
            <div>
              <span className={labelClass}>Unité</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={cn(
                      "min-h-10 rounded-lg border px-3.5 text-sm font-semibold transition-colors",
                      unit === u
                        ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                        : "border-black/10 bg-fs-card text-neutral-700",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Catégorie : puces aussi, dans une zone qui défile si le magasin en a trente ── */}
            {categories.length > 0 ? (
              <div>
                <span className={labelClass}>Catégorie (facultatif)</span>
                <div
                  className={cn(
                    "mt-1.5 flex flex-wrap gap-2",
                    categories.length > 10 && "max-h-32 overflow-y-auto pr-1",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setCategoryId("")}
                    className={cn(
                      "min-h-10 rounded-lg border px-3.5 text-sm font-semibold transition-colors",
                      categoryId === ""
                        ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                        : "border-black/10 bg-fs-card text-neutral-700",
                    )}
                  >
                    Aucune
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        "min-h-10 max-w-full truncate rounded-lg border px-3.5 text-sm font-semibold transition-colors",
                        categoryId === c.id
                          ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                          : "border-black/10 bg-fs-card text-neutral-700",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* ── Note : repliée, parce que dans quatre-vingt-dix cas sur cent on ne l'écrit pas ── */}
            {noteOpen ? (
              <div>
                <label className={labelClass} htmlFor="draft-note">
                  Précision pour le propriétaire
                </label>
                <textarea
                  id="draft-note"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex. reçu du fournisseur Kaboré, 12 cartons"
                  rows={2}
                  maxLength={400}
                  autoFocus
                  className={cn(fieldClass, "mt-1.5 py-2.5")}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="text-xs font-semibold text-fs-accent underline underline-offset-2"
              >
                + Ajouter une précision pour le propriétaire
              </button>
            )}

            {/* Bouton de validation en flux — bureau uniquement : sur mobile il est fixe en bas. */}
            <button
              type="button"
              disabled={!canSubmit || mut.isPending}
              onClick={submit}
              className="hidden min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-fs-accent text-sm font-bold text-white disabled:opacity-50 min-[900px]:inline-flex"
            >
              {mut.isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <MdCheckCircle className="h-5 w-5" aria-hidden />
              )}
              Ajouter l&apos;article
            </button>
          </div>
        </FsCard>

        {/* Combien attendent un prix — l'employé voit que son travail arrive quelque part. */}
        {awaitingCount > 0 ? (
          <p className="mt-2 flex items-center gap-2 px-1 text-[11px] text-neutral-600">
            <MdHourglassBottom className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            {awaitingCount} article{awaitingCount > 1 ? "s" : ""} attend
            {awaitingCount > 1 ? "ent" : ""} son prix chez le propriétaire.
          </p>
        ) : null}
      </div>

      {/*
        LA BARRE DU POUCE. Fixée juste au-dessus de la barre de navigation (même calcul
        que `FsFab`), elle ne quitte jamais l'écran : on saisit quarante articles sans
        jamais faire défiler la page pour trouver « Ajouter ».
      */}
      <div
        className="fixed inset-x-0 bottom-[calc(4.75rem+var(--fs-safe-bottom))] z-30 border-t border-black/[0.06] bg-fs-surface/95 px-3 py-2.5 backdrop-blur-sm min-[900px]:hidden"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          disabled={!canSubmit || mut.isPending}
          onClick={submit}
          className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-fs-accent text-base font-bold text-white shadow-lg shadow-black/10 transition-transform active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
        >
          {mut.isPending ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <MdCheckCircle className="h-6 w-6" aria-hidden />
          )}
          {mut.isPending ? "Enregistrement…" : "Ajouter l'article"}
        </button>
      </div>

      <PosBarcodeScannerDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDecoded={(code) => {
          setBarcode(code.trim());
          setScanOpen(false);
        }}
      />
    </FsPage>
  );
}
