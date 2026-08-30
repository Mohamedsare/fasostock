"use client";

/**
 * « Photos produits » — l'écran qui confie la photo sans confier la fiche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI DÉCIDE DE LA MISE EN PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette page est utilisée DEBOUT, dans un rayon, avec un article dans une main et un
 * téléphone dans l'autre. Trois conséquences, et tout le reste en découle :
 *
 *  1. LE FILTRE PAR DÉFAUT EST « SANS PHOTO ». Personne n'ouvre cette page pour
 *     admirer les articles déjà faits. Le travail restant EST le contenu de l'écran ;
 *     tout le reste est un filtre qu'on va chercher.
 *
 *  2. UNE SEULE FRAPPE PAR ARTICLE. Toute la vignette est un bouton, et ce bouton
 *     ouvre directement l'appareil photo (`capture="environment"`). Pas de dialogue,
 *     pas de champ, pas de « valider » : on vise, on déclenche, la photo monte.
 *
 *  3. L'AVANCEMENT SE VOIT. Une barre en haut dit « 128 sur 340 ». C'est ce qui fait
 *     qu'un vendeur en fait vingt de plus au lieu de s'arrêter à la troisième — et
 *     c'est la seule raison pour laquelle un catalogue finit par être illustré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN NE MONTRE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun prix. Ni d'achat, ni de vente, ni de marge. Ce n'est pas un oubli d'affichage :
 * la lecture elle-même ne les demande pas (`listPhotoCatalog`). Un employé à qui l'on
 * ouvre cette page ne reçoit pas les prix de la maison dans son navigateur — ce qui est
 * précisément la condition pour que le patron ose l'ouvrir.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAddAPhoto,
  MdCheckCircle,
  MdClose,
  MdDeleteOutline,
  MdImage,
  MdImageNotSupported,
  MdLock,
  MdPhotoCamera,
  MdQrCodeScanner,
  MdSearch,
} from "react-icons/md";

import { PosBarcodeScannerDialog } from "@/components/pos/pos-barcode-scanner-dialog";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import {
  FsCard,
  FsFilterChip,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { addProductImage, deleteProductImage } from "@/lib/features/products/api";
import {
  listPhotoCatalog,
  type PhotoCatalogProduct,
} from "@/lib/features/products/employee-catalog";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { productThumbUrl } from "@/lib/utils/product-thumb-url";

/** Minuscules sans accent : « Café », « cafe » et « CAFE » se rejoignent. */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

type PhotoFilter = "todo" | "done" | "all";

/**
 * Au-delà, on cesse de rendre des vignettes : une grille de deux mille images tue
 * l'onglet d'un téléphone d'entrée de gamme, et personne ne fait défiler deux mille
 * cartes. La recherche et le filtre sont là pour ça, et le compteur le dit.
 */
const MAX_CARDS = 240;

export function ProductPhotosScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { helpers: h, isLoading: permLoading } = usePermissions();

  const companyId = ctx.data?.companyId ?? "";
  const canView = h?.canProductPhotos ?? false;

  const [filter, setFilter] = useState<PhotoFilter>("todo");
  const [query, setQuery] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  /** Produits dont une photo part en ce moment — l'état est par carte, pas global. */
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  /** Photo que l'utilisateur s'apprête à retirer. */
  const [removing, setRemoving] = useState<{
    imageId: string;
    productName: string;
  } | null>(null);
  /** Photo agrandie (on vérifie qu'elle est nette avant de passer au suivant). */
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  /**
   * Un `<input type="file">` par produit serait 340 nœuds cachés dans le DOM. Un seul,
   * dont on change la cible juste avant de l'ouvrir, suffit — et reste instantané.
   */
  const fileRef = useRef<HTMLInputElement | null>(null);
  const targetRef = useRef<string | null>(null);

  const listQ = useQuery({
    queryKey: queryKeys.photoCatalog(companyId),
    queryFn: () => listPhotoCatalog(companyId),
    enabled: Boolean(companyId) && canView,
    staleTime: 60_000,
  });

  const products = useMemo(() => listQ.data ?? [], [listQ.data]);

  const withPhoto = useMemo(
    () => products.filter((p) => p.images.length > 0).length,
    [products],
  );
  const total = products.length;
  const percent = total > 0 ? Math.round((withPhoto / total) * 100) : 0;

  const filtered = useMemo(() => {
    const q = norm(query);
    return products.filter((p) => {
      if (filter === "todo" && p.images.length > 0) return false;
      if (filter === "done" && p.images.length === 0) return false;
      if (!q) return true;
      return (
        norm(p.name).includes(q) ||
        norm(p.sku ?? "").includes(q) ||
        norm(p.barcode ?? "").includes(q) ||
        norm(p.categoryName ?? "").includes(q)
      );
    });
  }, [products, filter, query]);

  const shown = filtered.slice(0, MAX_CARDS);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const uploadMut = useMutation({
    mutationFn: async ({ productId, files }: { productId: string; files: File[] }) => {
      // En série, et non en parallèle : `addProductImage` calcule la position de la
      // photo à partir de la dernière enregistrée. Deux envois simultanés liraient la
      // même valeur et se retrouveraient à égalité — l'ordre des photos deviendrait
      // alors imprévisible, et la miniature de la liste avec lui.
      for (const file of files) {
        await addProductImage(productId, file);
      }
      return files.length;
    },
    onSuccess: async (count) => {
      toast.success(count > 1 ? `${count} photos ajoutées.` : "Photo ajoutée.");
      await qc.invalidateQueries({ queryKey: queryKeys.photoCatalog(companyId) });
      // La liste Produits affiche la même miniature : sans cette invalidation, le
      // vendeur voit sa photo ici et l'ancienne vignette ailleurs.
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
    },
    onError: (e) => toastMutationError("products", e),
    onSettled: (_d, _e, vars) => {
      setUploading((prev) => {
        const next = { ...prev };
        delete next[vars.productId];
        return next;
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (imageId: string) => deleteProductImage(imageId),
    onSuccess: async () => {
      toast.success("Photo retirée.");
      await qc.invalidateQueries({ queryKey: queryKeys.photoCatalog(companyId) });
      await qc.invalidateQueries({ queryKey: queryKeys.products(companyId) });
    },
    onError: (e) => toastMutationError("products", e),
    onSettled: () => setRemoving(null),
  });

  function pickPhotoFor(productId: string) {
    targetRef.current = productId;
    const input = fileRef.current;
    if (!input) return;
    // Sans cette remise à zéro, reprendre DEUX FOIS le même article ne déclenche pas
    // `onChange` la seconde fois (même nom de fichier) : le vendeur croit avoir
    // photographié, et rien n'est monté.
    input.value = "";
    input.click();
  }

  function onFilesPicked(files: FileList | null) {
    const productId = targetRef.current;
    targetRef.current = null;
    if (!productId || !files || files.length === 0) return;
    setUploading((prev) => ({ ...prev, [productId]: true }));
    uploadMut.mutate({ productId, files: Array.from(files) });
  }

  /** Code-barres scanné : on filtre dessus plutôt que d'ouvrir l'appareil photo tout
   *  seul — c'est au vendeur de confirmer qu'il s'agit bien du bon article. */
  function onScanned(code: string) {
    setScanOpen(false);
    const trimmed = code.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setFilter("all");
    const hit = products.find(
      (p) => (p.barcode ?? "").trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (!hit) {
      toast.info("Aucun produit ne porte ce code-barres.");
    }
  }

  if (permLoading) {
    return (
      <FsPage>
        <FsScreenHeader title="Photos produits" />
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
          title="Photos produits"
          subtitle="Illustrer le catalogue, article par article."
        />
        <FsCard padding="p-6">
          <div className="text-center">
            <MdLock className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">Accès réservé</p>
            <p className="mt-1 text-xs text-neutral-600">
              {h?.employeePhotosOn
                ? "Demandez au propriétaire le droit « Ajouter des photos aux produits » (page Employés)."
                : "Le propriétaire n'a pas encore ouvert la page Photos produits (Paramètres)."}
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <FsScreenHeader
        title="Photos produits"
        subtitle="Prenez l'article en photo : elle apparaît aussitôt en caisse et dans le catalogue."
      />

      {/* Avancement — la raison pour laquelle on en fait vingt de plus. */}
      <FsCard padding="p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-fs-text">
            {listQ.isPending ? (
              "Chargement du catalogue…"
            ) : (
              <>
                <span className="tabular-nums">{withPhoto}</span> produits sur{" "}
                <span className="tabular-nums">{total}</span> ont une photo
              </>
            )}
          </p>
          <p className="text-xs font-semibold tabular-nums text-fs-accent">{percent} %</p>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/[0.07]"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Catalogue illustré"
        >
          <div
            className="h-full rounded-full bg-fs-accent transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        {total > 0 && withPhoto < total ? (
          <p className="mt-2 text-xs leading-relaxed text-neutral-600">
            Il reste{" "}
            <span className="font-semibold tabular-nums">{total - withPhoto}</span>{" "}
            article{total - withPhoto > 1 ? "s" : ""} à photographier. Un produit en
            photo se retrouve deux fois plus vite au comptoir.
          </p>
        ) : null}
        {total > 0 && withPhoto === total ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <MdCheckCircle className="h-4 w-4" aria-hidden />
            Tout le catalogue est illustré. Beau travail.
          </p>
        ) : null}
      </FsCard>

      {/* Recherche + scan */}
      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <MdSearch
            className="pointer-events-none absolute left-2.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un article, une catégorie…"
            className={fsInputClass("w-full pl-9")}
            aria-label="Chercher un produit"
          />
        </div>
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-black/[0.08] bg-fs-card px-3 py-2 text-xs font-semibold text-neutral-800"
          aria-label="Scanner un code-barres"
        >
          <MdQrCodeScanner className="h-[18px] w-[18px]" aria-hidden />
          <span className="hidden sm:inline">Scanner</span>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <FsFilterChip
          icon={MdImageNotSupported}
          label={`Sans photo${total > 0 ? ` (${total - withPhoto})` : ""}`}
          selected={filter === "todo"}
          onClick={() => setFilter("todo")}
        />
        <FsFilterChip
          icon={MdImage}
          label={`Avec photo${total > 0 ? ` (${withPhoto})` : ""}`}
          selected={filter === "done"}
          onClick={() => setFilter("done")}
        />
        <FsFilterChip
          icon={MdPhotoCamera}
          label="Tous"
          selected={filter === "all"}
          onClick={() => setFilter("all")}
        />
      </div>

      {listQ.isError ? (
        <div className="mt-3">
          <FsQueryErrorPanel error={listQ.error} onRetry={() => void listQ.refetch()} />
        </div>
      ) : null}

      {listQ.isPending ? (
        <div className="flex justify-center py-10" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : null}

      {!listQ.isPending && !listQ.isError && filtered.length === 0 ? (
        <FsCard className="mt-3" padding="p-6">
          <div className="text-center">
            <MdCheckCircle className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">
              {filter === "todo" ? "Rien à photographier ici" : "Aucun article trouvé"}
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              {filter === "todo"
                ? query
                  ? "Tous les articles qui correspondent à votre recherche ont déjà une photo."
                  : "Tous vos produits ont une photo."
                : "Essayez un autre mot, ou changez de filtre."}
            </p>
          </div>
        </FsCard>
      ) : null}

      {shown.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 min-[900px]:grid-cols-4 min-[1280px]:grid-cols-5">
          {shown.map((p) => (
            <PhotoCard
              key={p.id}
              product={p}
              busy={uploading[p.id] === true}
              onAdd={() => pickPhotoFor(p.id)}
              onPreview={(url) => setPreview({ url, name: p.name })}
              onRemove={(imageId) => setRemoving({ imageId, productName: p.name })}
            />
          ))}
        </div>
      ) : null}

      {filtered.length > shown.length ? (
        <p className="mt-3 text-center text-xs text-neutral-600">
          {filtered.length - shown.length} autres articles ne sont pas affichés. Affinez
          votre recherche pour les atteindre.
        </p>
      ) : null}

      {/*
        Un seul input pour toute la grille. `capture="environment"` demande la caméra
        arrière : sur téléphone, la frappe ouvre l'appareil photo, pas la galerie.
        `multiple` reste possible pour qui préfère choisir dans ses images.
      */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => onFilesPicked(e.target.files)}
      />

      <PosBarcodeScannerDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDecoded={onScanned}
      />

      <FsConfirmDialog
        open={removing != null}
        title="Retirer cette photo ?"
        message={
          removing
            ? `La photo de « ${removing.productName} » sera supprimée du catalogue. Vous pourrez en reprendre une autre.`
            : undefined
        }
        confirmLabel="Retirer"
        tone="danger"
        busy={deleteMut.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) deleteMut.mutate(removing.imageId);
        }}
      />

      {preview ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={() => setPreview(null)}
        >
          <div className="max-h-full w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 pb-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {preview.name}
              </p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-full bg-white/15 p-1.5 text-white"
                aria-label="Fermer l'aperçu"
              >
                <MdClose className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[75vh] w-full rounded-xl object-contain"
            />
          </div>
        </div>
      ) : null}
    </FsPage>
  );
}

/** Une carte = un article. Toute la vignette est le bouton « photographier ». */
function PhotoCard({
  product,
  busy,
  onAdd,
  onPreview,
  onRemove,
}: {
  product: PhotoCatalogProduct;
  busy: boolean;
  onAdd: () => void;
  onPreview: (url: string) => void;
  onRemove: (imageId: string) => void;
}) {
  const first = product.images[0] ?? null;
  const thumb = first ? productThumbUrl(first.url) : null;

  return (
    <FsCard padding="p-0" className="overflow-hidden">
      <div className="relative">
        <button
          type="button"
          onClick={first ? () => onPreview(first.url) : onAdd}
          disabled={busy}
          className={cn(
            "flex aspect-square w-full items-center justify-center bg-fs-surface-container transition-opacity",
            busy && "opacity-60",
          )}
          aria-label={
            first ? `Voir la photo de ${product.name}` : `Photographier ${product.name}`
          }
        >
          {first && thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="flex flex-col items-center gap-1 text-neutral-400">
              <MdAddAPhoto className="h-8 w-8" aria-hidden />
              <span className="text-[11px] font-medium">Prendre la photo</span>
            </span>
          )}
        </button>

        {busy ? (
          <span
            className="absolute inset-0 flex items-center justify-center bg-black/25"
            role="status"
            aria-label="Envoi en cours"
          >
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </span>
        ) : null}

        {product.images.length > 1 ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
            {product.images.length} photos
          </span>
        ) : null}

        {product.awaitingPricing ? (
          /*
            Le badge vaut un mot d'explication : l'article vient d'être ajouté par
            l'équipe et n'a pas encore de prix. Le photographier maintenant, c'est
            gagner le geste — la fiche sera complète le jour où le patron la chiffre.
          */
          <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Sans prix
          </span>
        ) : null}
      </div>

      <div className="p-2">
        <p className="truncate text-xs font-semibold text-fs-text" title={product.name}>
          {product.name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-neutral-500">
          {product.categoryName ?? product.sku ?? product.barcode ?? product.unit}
        </p>

        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAdd}
            disabled={busy}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[8px] bg-fs-accent px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
          >
            <MdPhotoCamera className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{first ? "Ajouter" : "Photographier"}</span>
          </button>
          {first ? (
            <button
              type="button"
              onClick={() => onRemove(first.id)}
              disabled={busy}
              className="shrink-0 rounded-[8px] border border-black/[0.08] p-1.5 text-neutral-500 disabled:opacity-60"
              aria-label={`Retirer la photo de ${product.name}`}
            >
              <MdDeleteOutline className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </FsCard>
  );
}
