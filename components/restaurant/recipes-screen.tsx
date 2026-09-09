"use client";

/**
 * « Recettes / Fiches techniques » — ce que coûte VRAIMENT un plat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CHIFFRE QUE PERSONNE NE CONNAÎT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le patron sait qu'un poulet braisé se vend 2 500. Il ne sait pas qu'il lui coûte
 * 1 700 depuis que le poulet a augmenté, et qu'à ce prix-là il travaille pour son
 * fournisseur. C'est le seul écran de l'application qui répond à « est-ce que ce
 * plat me rapporte quelque chose ? ».
 *
 * Le coût se calcule en lisant `products.purchase_price` de chaque ingrédient : il
 * SUIT donc les prix d'achat réels, sans ressaisie. Une fiche technique qu'il faut
 * remettre à jour à la main est une fiche technique fausse au bout d'un mois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ÇA NE DÉSTOCKE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il serait tentant de déduire le poulet et l'huile à chaque plat vendu. On ne le
 * fait pas : personne ici ne pèse l'huile, et un stock d'ingrédients faux à 15 %
 * rendrait tout le module inutilisable en trois semaines. Les ingrédients se
 * comptent à l'inventaire ; la fiche technique sert à CHIFFRER et à comparer, pas
 * à prétendre compter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FACTEUR D'ACHAT, LA SUBTILITÉ QU'IL FAUT EXPLIQUER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le riz s'achète au sac de 25 kg et se dose en grammes. Sans facteur, une portion
 * de riz coûterait le prix d'un sac entier. L'écran le demande donc en toutes
 * lettres — « combien de g dans une unité achetée ? » — avec des raccourcis.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdDeleteOutline,
  MdMenuBook,
  MdSearch,
  MdTrendingDown,
  MdTrendingUp,
} from "react-icons/md";

import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import {
  NeedStoreCard,
  NoAccessCard,
  RestaurantEmptyCard,
  RestaurantSheet,
  btnGhost,
  btnOutline,
  btnPrimary,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { P } from "@/lib/constants/permissions";
import {
  addRecipeItem,
  deleteRecipe,
  deleteRecipeItem,
  listMenu,
  listRecipes,
  upsertRecipe,
} from "@/lib/features/restaurant/api-menu";
import {
  recipeCostPerPortion,
  recipeItemCost,
  recipeMarginPercent,
  type MenuItem,
  type Recipe,
} from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

function norm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Raccourcis de conditionnement — les trois cas qui couvrent presque tout. */
const FACTOR_PRESETS: Array<{ label: string; unit: string; factor: number }> = [
  { label: "Sac de 25 kg → g", unit: "g", factor: 25000 },
  { label: "Sac de 50 kg → g", unit: "g", factor: 50000 },
  { label: "Bidon de 20 L → cl", unit: "cl", factor: 2000 },
  { label: "Bidon de 5 L → cl", unit: "cl", factor: 500 },
  { label: "Carton de 12 → pièce", unit: "pce", factor: 12 },
  { label: "À la pièce", unit: "pce", factor: 1 },
];

export function RestaurantRecipesScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { hasPermission } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const canConfigure =
    ctx.data?.roleSlug === "owner" ||
    ctx.data?.roleSlug === "manager" ||
    hasPermission(P.settingsManage);

  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [addIngredientTo, setAddIngredientTo] = useState<Recipe | null>(null);

  const recipesQ = useQuery({
    queryKey: queryKeys.restaurantRecipes(companyId),
    queryFn: () => listRecipes(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const menuQ = useQuery({
    queryKey: queryKeys.restaurantMenu(companyId, storeId),
    queryFn: () => listMenu({ companyId, storeId }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["restaurant", companyId] });

  const createMut = useMutation({
    mutationFn: (p: { productId: string; yieldPortions: number }) =>
      upsertRecipe({
        companyId,
        productId: p.productId,
        yieldPortions: p.yieldPortions,
        wastePercent: 0,
      }),
    onSuccess: async (_r, p) => {
      setNewOpen(false);
      setOpenId(p.productId);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-recipe-create", e),
  });

  const updateMut = useMutation({
    mutationFn: (p: {
      productId: string;
      yieldPortions: number;
      wastePercent: number;
      instructions: string | null;
    }) => upsertRecipe({ companyId, ...p }),
    onSuccess: invalidate,
    onError: (e) => toastMutationError("restaurant-recipe-update", e),
  });

  const deleteMut = useMutation({
    mutationFn: (productId: string) => deleteRecipe(productId),
    onSuccess: async () => {
      setOpenId(null);
      toast.success("Fiche supprimée.");
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-recipe-delete", e),
  });

  const addItemMut = useMutation({
    mutationFn: (p: {
      recipeProductId: string;
      ingredientId: string;
      quantity: number;
      unit: string;
      unitsPerPurchase: number;
    }) => addRecipeItem({ companyId, ...p }),
    onSuccess: async () => {
      setAddIngredientTo(null);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-recipe-item-add", e),
  });

  const deleteItemMut = useMutation({
    mutationFn: (id: string) => deleteRecipeItem(id),
    onSuccess: invalidate,
    onError: (e) => toastMutationError("restaurant-recipe-item-delete", e),
  });

  const recipes = useMemo(() => recipesQ.data ?? [], [recipesQ.data]);
  const menu = useMemo(() => menuQ.data ?? [], [menuQ.data]);
  const withoutRecipe = useMemo(() => {
    const have = new Set(recipes.map((r) => r.productId));
    return menu.filter((m) => !have.has(m.productId));
  }, [menu, recipes]);

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title="Fiches techniques" subtitle="Ce que coûte vraiment un plat." />
        <NeedStoreCard />
      </FsPage>
    );
  }
  if (!canConfigure) {
    return (
      <FsPage>
        <FsScreenHeader title="Fiches techniques" subtitle="Ce que coûte vraiment un plat." />
        <NoAccessCard what="Les coûts de revient sont réservés au propriétaire et au gérant." />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title="Fiches techniques"
          subtitle="Ce que coûte chaque plat, ingrédient par ingrédient. Le coût suit vos prix d'achat tout seul."
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className={cn(btnPrimary, "min-h-11 shrink-0")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Nouvelle fiche
        </button>
      </div>

      {recipesQ.isError ? (
        <FsQueryErrorPanel
          error={recipesQ.error}
          onRetry={() => void recipesQ.refetch()}
          className="mt-3"
        />
      ) : recipesQ.isPending ? (
        <div className="mt-10 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdMenuBook}
            title="Aucune fiche technique"
            message="Commencez par vos trois plats les plus vendus : ce sont eux qui décident si la maison gagne de l'argent."
            action={
              <button type="button" onClick={() => setNewOpen(true)} className={btnPrimary}>
                <MdAdd className="h-5 w-5" aria-hidden />
                Créer une fiche
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {recipes.map((r) => (
            <RecipeCard
              key={r.productId}
              recipe={r}
              open={openId === r.productId}
              busy={updateMut.isPending || deleteItemMut.isPending}
              onToggle={() => setOpenId(openId === r.productId ? null : r.productId)}
              onAddIngredient={() => setAddIngredientTo(r)}
              onDeleteItem={(id) => deleteItemMut.mutate(id)}
              onSaveHeader={(p) => updateMut.mutate({ productId: r.productId, ...p })}
              onDelete={() => deleteMut.mutate(r.productId)}
            />
          ))}
        </div>
      )}

      {newOpen ? (
        <PickProductSheet
          title="Pour quel plat ?"
          subtitle="Choisissez l'article de la carte dont vous voulez connaître le coût."
          items={withoutRecipe}
          loading={menuQ.isPending}
          busy={createMut.isPending}
          onClose={() => setNewOpen(false)}
          onPick={(m) => createMut.mutate({ productId: m.productId, yieldPortions: 1 })}
        />
      ) : null}

      {addIngredientTo ? (
        <AddIngredientSheet
          recipe={addIngredientTo}
          items={menu}
          loading={menuQ.isPending}
          busy={addItemMut.isPending}
          onClose={() => setAddIngredientTo(null)}
          onSubmit={(p) =>
            addItemMut.mutate({ recipeProductId: addIngredientTo.productId, ...p })
          }
        />
      ) : null}
    </FsPage>
  );
}

/**
 * Une fiche. Repliée, elle ne montre que ce qui décide : coût de la portion, prix
 * de vente, marge. Dépliée, le détail des ingrédients.
 */
function RecipeCard({
  recipe,
  open,
  busy,
  onToggle,
  onAddIngredient,
  onDeleteItem,
  onSaveHeader,
  onDelete,
}: {
  recipe: Recipe;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onAddIngredient: () => void;
  onDeleteItem: (id: string) => void;
  onSaveHeader: (p: {
    yieldPortions: number;
    wastePercent: number;
    instructions: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const [portions, setPortions] = useState(String(recipe.yieldPortions));
  const [waste, setWaste] = useState(String(recipe.wastePercent));
  const [instructions, setInstructions] = useState(recipe.instructions ?? "");

  const cost = recipeCostPerPortion(recipe);
  const margin = recipeMarginPercent(recipe);
  const profit = recipe.salePrice - cost;

  /*
   * Le seuil de 60 % n'est pas arbitraire : en restauration, un « food cost » au-delà
   * de 40 % du prix de vente (donc une marge sous 60 %) laisse rarement de quoi payer
   * le loyer, le personnel et le gaz. C'est le repère que tout le métier utilise.
   */
  const healthy = margin !== null && margin >= 60;
  const critical = margin !== null && margin < 35;

  return (
    <FsCard padding="p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left sm:px-4"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-fs-text">{recipe.productName}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
            <span>
              Coût portion{" "}
              <span className="font-bold tabular-nums text-fs-text">
                {formatCurrency(cost)}
              </span>
            </span>
            <span>
              Vendu{" "}
              <span className="font-bold tabular-nums text-fs-text">
                {formatCurrency(recipe.salePrice)}
              </span>
            </span>
            <span>
              {recipe.items.length} ingrédient{recipe.items.length > 1 ? "s" : ""}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          {margin === null ? (
            <span className="text-[11px] text-neutral-500">Prix non fixé</span>
          ) : (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-extrabold tabular-nums",
                  critical
                    ? "bg-rose-500/12 text-rose-700 dark:text-rose-400"
                    : healthy
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/14 text-amber-700 dark:text-amber-400",
                )}
              >
                {critical ? (
                  <MdTrendingDown className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <MdTrendingUp className="h-3.5 w-3.5" aria-hidden />
                )}
                {margin.toFixed(0)} %
              </span>
              <p className="mt-0.5 text-[11px] tabular-nums text-neutral-500">
                {profit >= 0 ? "+" : ""}
                {formatCurrency(profit)}
              </p>
            </>
          )}
        </div>
      </button>

      {critical ? (
        <p className="border-t border-black/[0.06] bg-rose-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-rose-800 sm:px-4 dark:text-rose-300">
          Marge sous 35 % : à ce niveau, le plat couvre à peine ses ingrédients. Il ne
          paie ni le gaz, ni le personnel, ni le loyer.
        </p>
      ) : null}

      {open ? (
        <div className="border-t border-black/[0.06] px-3 py-3 sm:px-4">
          {recipe.items.length === 0 ? (
            <p className="py-3 text-center text-xs text-neutral-600">
              Aucun ingrédient. Le coût affiché est donc nul — ajoutez-les pour obtenir
              un chiffre utile.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {recipe.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fs-text">
                      {it.ingredientName}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {it.quantity} {it.unit}
                      {it.unitsPerPurchase !== 1
                        ? ` · ${it.unitsPerPurchase} ${it.unit}/unité achetée`
                        : ""}
                      {" · achat "}
                      {formatCurrency(it.purchasePrice)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-fs-text">
                    {formatCurrency(recipeItemCost(it))}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDeleteItem(it.id)}
                    className={cn(btnGhost, "min-h-8 min-w-8 text-rose-600")}
                    aria-label={`Retirer ${it.ingredientName}`}
                  >
                    <MdDeleteOutline className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onAddIngredient}
            className={cn(btnOutline, "mt-3 w-full min-h-11")}
          >
            <MdAdd className="h-5 w-5" aria-hidden />
            Ajouter un ingrédient
          </button>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-700">
                Portions produites
              </span>
              <input
                type="number"
                min={0.1}
                step="0.1"
                inputMode="decimal"
                value={portions}
                onChange={(e) => setPortions(e.target.value)}
                className={fsInputClass()}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-700">
                Perte de préparation (%)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={waste}
                onChange={(e) => setWaste(e.target.value)}
                className={fsInputClass()}
              />
            </label>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            « Portions produites » : si la recette écrite fait une marmite de 8 parts,
            mettez 8. « Perte » : épluchures, évaporation, gras — ce qui part sans être
            servi.
          </p>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Mode opératoire
            </span>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Le tour de main, pour qu'un nouveau cuisinier le refasse à l'identique."
              className={fsInputClass("resize-y")}
            />
          </label>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onSaveHeader({
                  yieldPortions: Math.max(0.1, Number(portions) || 1),
                  wastePercent: Math.min(100, Math.max(0, Number(waste) || 0)),
                  instructions: instructions.trim() || null,
                })
              }
              className={cn(btnPrimary, "flex-1")}
            >
              Enregistrer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className={cn(btnGhost, "min-h-11 min-w-11 text-rose-600")}
              aria-label="Supprimer la fiche"
            >
              <MdDeleteOutline className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </FsCard>
  );
}

function PickProductSheet({
  title,
  subtitle,
  items,
  loading,
  busy,
  onClose,
  onPick,
}: {
  title: string;
  subtitle: string;
  items: MenuItem[];
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onPick: (m: MenuItem) => void;
}) {
  const [search, setSearch] = useState("");
  const results = useMemo(() => {
    const q = norm(search);
    return (q ? items.filter((m) => norm(m.name).includes(q)) : items).slice(0, 40);
  }, [items, search]);

  return (
    <RestaurantSheet open title={title} subtitle={subtitle} onClose={onClose}>
      <div className="relative">
        <MdSearch
          className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          inputMode="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Chercher…"
          className={fsInputClass("pl-10")}
          autoFocus
        />
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-neutral-600">Chargement…</p>
      ) : results.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-600">
          Tous vos articles ont déjà une fiche, ou aucun ne correspond.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-black/[0.06]">
          {results.map((m) => (
            <li key={m.productId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(m)}
                className="fs-touch-target flex w-full items-center justify-between gap-2 py-2.5 text-left disabled:opacity-40"
              >
                <span className="min-w-0 truncate text-sm font-medium text-fs-text">
                  {m.name}
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-fs-accent">
                  {formatCurrency(m.salePrice)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </RestaurantSheet>
  );
}

function AddIngredientSheet({
  recipe,
  items,
  loading,
  busy,
  onClose,
  onSubmit,
}: {
  recipe: Recipe;
  items: MenuItem[];
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    ingredientId: string;
    quantity: number;
    unit: string;
    unitsPerPurchase: number;
  }) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<MenuItem | null>(null);
  const [qty, setQty] = useState("100");
  const [unit, setUnit] = useState("g");
  const [factor, setFactor] = useState("1000");

  const already = new Set(recipe.items.map((i) => i.ingredientId));
  const results = useMemo(() => {
    const q = norm(search);
    return items
      .filter((m) => !already.has(m.productId) && m.productId !== recipe.productId)
      .filter((m) => (q ? norm(m.name).includes(q) : true))
      .slice(0, 40);
    // `already` dérive de `recipe`, déjà dans les dépendances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, recipe]);

  const unitCost =
    picked && Number(factor) > 0
      ? ((Number(qty) || 0) / Number(factor)) * picked.purchasePrice
      : 0;

  return (
    <RestaurantSheet
      open
      title={picked ? picked.name : "Ajouter un ingrédient"}
      subtitle={picked ? `Dans « ${recipe.productName} »` : recipe.productName}
      onClose={onClose}
      footer={
        picked ? (
          <button
            type="button"
            disabled={busy || (Number(qty) || 0) <= 0}
            onClick={() =>
              onSubmit({
                ingredientId: picked.productId,
                quantity: Math.max(0.0001, Number(qty) || 0),
                unit: unit.trim() || "pce",
                unitsPerPurchase: Math.max(0.0001, Number(factor) || 1),
              })
            }
            className={cn(btnPrimary, "w-full min-h-12")}
          >
            Ajouter · {formatCurrency(unitCost)}
          </button>
        ) : undefined
      }
    >
      {picked ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_8%,transparent)] px-3 py-2.5 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-fs-accent">
                {picked.name}
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-600">
                Prix d&apos;achat {formatCurrency(picked.purchasePrice)} par unité achetée
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-fs-accent">changer</span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-700">
                Quantité
              </span>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={fsInputClass()}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-700">
                Unité
              </span>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="g, cl, pièce…"
                className={fsInputClass()}
              />
            </label>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-neutral-700">
              Combien de « {unit || "unités"} » dans UNE unité achetée ?
            </p>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              className={fsInputClass()}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
              Le riz s&apos;achète au sac et se dose en grammes : un sac de 25 kg,
              c&apos;est 25 000 g. Sans ce chiffre, une portion coûterait un sac entier.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FACTOR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setUnit(p.unit);
                    setFactor(String(p.factor));
                  }}
                  className="fs-touch-target rounded-full border border-black/10 px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 active:bg-neutral-100"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <p className="rounded-[10px] bg-fs-surface-container px-3 py-2 text-xs leading-relaxed text-neutral-700">
            Coût de cet ingrédient dans la recette :{" "}
            <span className="font-bold text-fs-text">{formatCurrency(unitCost)}</span>
          </p>
        </div>
      ) : (
        <>
          <div className="relative">
            <MdSearch
              className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              type="search"
              inputMode="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Poulet, riz, huile…"
              className={fsInputClass("pl-10")}
              autoFocus
            />
          </div>
          {loading ? (
            <p className="py-6 text-center text-sm text-neutral-600">Chargement…</p>
          ) : (
            <ul className="mt-3 divide-y divide-black/[0.06]">
              {results.map((m) => (
                <li key={m.productId}>
                  <button
                    type="button"
                    onClick={() => setPicked(m)}
                    className="fs-touch-target flex w-full items-center justify-between gap-2 py-2.5 text-left"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-fs-text">
                      {m.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-neutral-500">
                      achat {formatCurrency(m.purchasePrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </RestaurantSheet>
  );
}
