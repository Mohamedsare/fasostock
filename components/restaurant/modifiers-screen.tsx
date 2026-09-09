"use client";

/**
 * « Suppléments » / « Variantes » — les choix qu'on pose sur un plat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL MÉCANISME POUR LES DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * « Demi ou entier », « frites ou attiéké », « + fromage », « sans piment » : vus
 * de la base, ce sont tous des GROUPES d'options avec un minimum et un maximum de
 * choix (voir 00220).
 *
 *   min = 1, max = 1  →  une VARIANTE   (il faut choisir, une seule)
 *   tout le reste     →  des SUPPLÉMENTS (facultatifs, cumulables)
 *
 * L'écran garde cette distinction dans le VOCABULAIRE — un restaurateur ne pense
 * pas en « min/max » — mais pas dans les données. Deux tables auraient dupliqué
 * l'écran de saisie, l'écran de caisse, le calcul du prix et l'impression du bon,
 * pour une différence qui tient dans deux entiers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SUPPLÉMENT NE PEUT PAS ÊTRE NÉGATIF
 * ─────────────────────────────────────────────────────────────────────────────
 * La base refuse `price_delta < 0`. Une remise se décide sur l'addition, à la vue
 * de tous ; cachée dans une option nommée « - 500 », elle devient une caisse
 * percée que personne ne regarde.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdDeleteOutline,
  MdEdit,
  MdOutlineTune,
  MdRadioButtonChecked,
  MdCheckBox,
} from "react-icons/md";

import {
  FsCard,
  FsPage,
  FsQueryErrorPanel,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import {
  NeedStoreCard,
  NoAccessCard,
  RestaurantEmptyCard,
  RestaurantSheet,
  btnGhost,
  btnPrimary,
} from "@/components/restaurant/restaurant-shared";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { P } from "@/lib/constants/permissions";
import {
  createModifier,
  createModifierGroup,
  deleteModifier,
  deleteModifierGroup,
  listModifierGroups,
  updateModifier,
  updateModifierGroup,
} from "@/lib/features/restaurant/api-menu";
import { isVariantGroup, type ModifierGroup } from "@/lib/features/restaurant/types";
import { queryKeys } from "@/lib/query/query-keys";
import { toast, toastMutationError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

/** La page arrive par « Suppléments » ou par « Variantes » : même écran, filtre différent. */
export type ModifiersView = "all" | "variants" | "extras";

const VIEW_COPY: Record<ModifiersView, { title: string; subtitle: string }> = {
  all: {
    title: "Options",
    subtitle: "Les choix proposés au serveur quand il ajoute un plat.",
  },
  variants: {
    title: "Variantes",
    subtitle:
      "Un choix obligatoire, et un seul : la taille, la cuisson, l'accompagnement.",
  },
  extras: {
    title: "Suppléments",
    subtitle: "Des ajouts facultatifs et cumulables, avec ou sans prix.",
  },
};

export function RestaurantModifiersScreen({ view = "all" }: { view?: ModifiersView }) {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { hasPermission } = usePermissions();
  const companyId = ctx.data?.companyId ?? "";
  const storeId = ctx.data?.storeId ?? null;
  const canConfigure =
    ctx.data?.roleSlug === "owner" ||
    ctx.data?.roleSlug === "manager" ||
    hasPermission(P.settingsManage);
  const copy = VIEW_COPY[view];

  const [groupSheet, setGroupSheet] = useState<ModifierGroup | "new" | null>(null);
  const [addTo, setAddTo] = useState<ModifierGroup | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<ModifierGroup | null>(null);

  const groupsQ = useQuery({
    queryKey: queryKeys.restaurantModifierGroups(companyId),
    queryFn: () => listModifierGroups(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["restaurant", companyId] });

  const saveGroupMut = useMutation({
    mutationFn: async (p: {
      id?: string;
      name: string;
      prompt: string | null;
      variant: boolean;
      maxSelect: number;
    }) => {
      /* Le vocabulaire de l'écran se traduit ici, et nulle part ailleurs. */
      const minSelect = p.variant ? 1 : 0;
      const maxSelect = p.variant ? 1 : Math.max(1, p.maxSelect);
      if (p.id) {
        return updateModifierGroup({
          id: p.id,
          name: p.name,
          prompt: p.prompt,
          minSelect,
          maxSelect,
        });
      }
      await createModifierGroup({
        companyId,
        name: p.name,
        prompt: p.prompt,
        minSelect,
        maxSelect,
      });
    },
    onSuccess: async () => {
      setGroupSheet(null);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-modifier-group", e),
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id: string) => deleteModifierGroup(id),
    onSuccess: async () => {
      setConfirmGroup(null);
      toast.success("Groupe supprimé.");
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-modifier-group-delete", e),
  });

  const addModifierMut = useMutation({
    mutationFn: (p: { groupId: string; name: string; priceDelta: number }) =>
      createModifier({
        companyId,
        groupId: p.groupId,
        name: p.name,
        priceDelta: p.priceDelta,
      }),
    onSuccess: async () => {
      setAddTo(null);
      await invalidate();
    },
    onError: (e) => toastMutationError("restaurant-modifier-add", e),
  });

  const toggleModifierMut = useMutation({
    mutationFn: (p: { id: string; isAvailable: boolean }) => updateModifier(p),
    onSuccess: invalidate,
    onError: (e) => toastMutationError("restaurant-modifier-toggle", e),
  });

  const deleteModifierMut = useMutation({
    mutationFn: (id: string) => deleteModifier(id),
    onSuccess: invalidate,
    onError: (e) => toastMutationError("restaurant-modifier-delete", e),
  });

  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);
  const visible = useMemo(() => {
    if (view === "variants") return groups.filter(isVariantGroup);
    if (view === "extras") return groups.filter((g) => !isVariantGroup(g));
    return groups;
  }, [groups, view]);

  if (!companyId) return null;
  if (!storeId) {
    return (
      <FsPage>
        <FsScreenHeader title={copy.title} subtitle={copy.subtitle} />
        <NeedStoreCard />
      </FsPage>
    );
  }
  if (!canConfigure) {
    return (
      <FsPage>
        <FsScreenHeader title={copy.title} subtitle={copy.subtitle} />
        <NoAccessCard what="Seul le propriétaire ou le gérant construit la carte." />
      </FsPage>
    );
  }

  return (
    <FsPage>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FsScreenHeader
          title={copy.title}
          subtitle={copy.subtitle}
          className="mb-0 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setGroupSheet("new")}
          className={cn(btnPrimary, "min-h-11 shrink-0")}
        >
          <MdAdd className="h-5 w-5" aria-hidden />
          Nouveau groupe
        </button>
      </div>

      {groupsQ.isError ? (
        <FsQueryErrorPanel
          error={groupsQ.error}
          onRetry={() => void groupsQ.refetch()}
          className="mt-3"
        />
      ) : groupsQ.isPending ? (
        <div className="mt-10 flex justify-center" role="status" aria-label="Chargement">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-3">
          <RestaurantEmptyCard
            icon={MdOutlineTune}
            title="Aucun groupe d'options"
            message={
              view === "variants"
                ? "Une variante est un choix obligatoire : « Demi ou entier », « frites ou attiéké »."
                : "Un supplément est un ajout facultatif : « + fromage », « + œuf », « sans piment »."
            }
            action={
              <button
                type="button"
                onClick={() => setGroupSheet("new")}
                className={btnPrimary}
              >
                <MdAdd className="h-5 w-5" aria-hidden />
                Créer un groupe
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
          {visible.map((g) => {
            const variant = isVariantGroup(g);
            return (
              <FsCard key={g.id} padding="p-0">
                <header className="flex items-start justify-between gap-2 border-b border-black/[0.06] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-fs-text">
                      {variant ? (
                        <MdRadioButtonChecked
                          className="h-4 w-4 shrink-0 text-fs-accent"
                          aria-hidden
                        />
                      ) : (
                        <MdCheckBox className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                      )}
                      {g.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                      {variant
                        ? "Choix obligatoire, un seul"
                        : `Facultatif · jusqu'à ${g.maxSelect}`}
                      {g.prompt ? ` · « ${g.prompt} »` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      onClick={() => setGroupSheet(g)}
                      className={cn(btnGhost, "min-h-9 min-w-9")}
                      aria-label={`Modifier ${g.name}`}
                    >
                      <MdEdit className="h-[18px] w-[18px]" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmGroup(g)}
                      className={cn(btnGhost, "min-h-9 min-w-9 text-rose-600")}
                      aria-label={`Supprimer ${g.name}`}
                    >
                      <MdDeleteOutline className="h-[18px] w-[18px]" aria-hidden />
                    </button>
                  </div>
                </header>

                {g.modifiers.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-neutral-500">
                    Aucun choix dans ce groupe.
                  </p>
                ) : (
                  <ul className="divide-y divide-black/[0.05]">
                    {g.modifiers.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-2 px-3 py-2"
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            m.isAvailable
                              ? "font-medium text-fs-text"
                              : "text-neutral-400 line-through",
                          )}
                        >
                          {m.name}
                        </span>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-fs-accent">
                          {m.priceDelta > 0 ? `+${formatCurrency(m.priceDelta)}` : "—"}
                        </span>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`${m.name} disponible`}
                          checked={m.isAvailable}
                          disabled={toggleModifierMut.isPending}
                          onChange={(e) =>
                            toggleModifierMut.mutate({
                              id: m.id,
                              isAvailable: e.target.checked,
                            })
                          }
                          className="h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                        />
                        <button
                          type="button"
                          disabled={deleteModifierMut.isPending}
                          onClick={() => deleteModifierMut.mutate(m.id)}
                          className={cn(btnGhost, "min-h-8 min-w-8 text-rose-600")}
                          aria-label={`Supprimer ${m.name}`}
                        >
                          <MdDeleteOutline className="h-4 w-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => setAddTo(g)}
                  className="fs-touch-target w-full border-t border-black/[0.06] py-2.5 text-xs font-bold text-fs-accent active:bg-fs-accent/[0.06]"
                >
                  + Ajouter un choix
                </button>
              </FsCard>
            );
          })}
        </div>
      )}

      {groupSheet !== null ? (
        <GroupSheet
          key={groupSheet === "new" ? "new" : groupSheet.id}
          initial={groupSheet === "new" ? null : groupSheet}
          defaultVariant={view === "variants"}
          busy={saveGroupMut.isPending}
          onClose={() => setGroupSheet(null)}
          onSubmit={(p) => saveGroupMut.mutate(p)}
        />
      ) : null}

      {addTo ? (
        <AddModifierSheet
          key={addTo.id}
          group={addTo}
          busy={addModifierMut.isPending}
          onClose={() => setAddTo(null)}
          onSubmit={(p) => addModifierMut.mutate({ groupId: addTo.id, ...p })}
        />
      ) : null}

      <FsConfirmDialog
        open={confirmGroup !== null}
        title={`Supprimer « ${confirmGroup?.name ?? ""} » ?`}
        message="Le groupe et tous ses choix disparaissent de la caisse. Les commandes déjà passées gardent leurs options : leur libellé et leur montant y sont figés."
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleteGroupMut.isPending}
        onCancel={() => setConfirmGroup(null)}
        onConfirm={() => confirmGroup && deleteGroupMut.mutate(confirmGroup.id)}
      />
    </FsPage>
  );
}

function GroupSheet({
  initial,
  defaultVariant,
  busy,
  onClose,
  onSubmit,
}: {
  initial: ModifierGroup | null;
  defaultVariant: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    id?: string;
    name: string;
    prompt: string | null;
    variant: boolean;
    maxSelect: number;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [variant, setVariant] = useState(
    initial ? isVariantGroup(initial) : defaultVariant,
  );
  const [maxSelect, setMaxSelect] = useState(String(initial?.maxSelect ?? 3));

  return (
    <RestaurantSheet
      open
      title={initial ? "Modifier le groupe" : "Nouveau groupe d'options"}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || name.trim().length === 0}
          onClick={() =>
            onSubmit({
              id: initial?.id,
              name: name.trim(),
              prompt: prompt.trim() || null,
              variant,
              maxSelect: Math.max(1, Number(maxSelect) || 1),
            })
          }
          className={cn(btnPrimary, "w-full")}
        >
          Enregistrer
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Nom du groupe
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Taille, Accompagnement, Suppléments…"
            className={fsInputClass()}
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Question posée au serveur
          </span>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Quelle taille ?"
            className={fsInputClass()}
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            Facultatif. C&apos;est ce qui s&apos;affiche en caisse au-dessus des choix.
          </span>
        </label>

        {/*
          Le choix structurant, posé en deux cartes plutôt qu'en cases à cocher : un
          restaurateur reconnaît son cas d'usage dans la phrase d'exemple, pas dans
          « min = 1, max = 1 ».
        */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-700">Type de groupe</p>
          <div className="grid gap-2">
            <TypeCard
              selected={variant}
              onClick={() => setVariant(true)}
              icon={MdRadioButtonChecked}
              title="Variante — un choix obligatoire"
              example="« Demi ou entier ? », « Frites ou attiéké ? ». Le serveur DOIT choisir, et une seule réponse."
            />
            <TypeCard
              selected={!variant}
              onClick={() => setVariant(false)}
              icon={MdCheckBox}
              title="Suppléments — facultatifs, cumulables"
              example="« + fromage », « + œuf », « sans piment ». Le serveur peut n'en choisir aucun, ou plusieurs."
            />
          </div>
        </div>

        {!variant ? (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Nombre maximum de choix
            </span>
            <input
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              value={maxSelect}
              onChange={(e) => setMaxSelect(e.target.value)}
              className={fsInputClass()}
            />
          </label>
        ) : null}
      </div>
    </RestaurantSheet>
  );
}

function TypeCard({
  selected,
  onClick,
  icon: Icon,
  title,
  example,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  example: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-[12px] border p-3 text-left transition-colors",
        selected
          ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)]"
          : "border-black/[0.08] bg-fs-card active:bg-neutral-50",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          selected ? "text-fs-accent" : "text-neutral-400",
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-bold",
            selected ? "text-fs-accent" : "text-fs-text",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
          {example}
        </span>
      </span>
    </button>
  );
}

function AddModifierSheet({
  group,
  busy,
  onClose,
  onSubmit,
}: {
  group: ModifierGroup;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: { name: string; priceDelta: number }) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");

  return (
    <RestaurantSheet
      open
      title={`Ajouter à « ${group.name} »`}
      subtitle={
        isVariantGroup(group)
          ? "Un des choix possibles."
          : "Un supplément, avec ou sans prix."
      }
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || name.trim().length === 0}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              priceDelta: Math.max(0, Number(price) || 0),
            })
          }
          className={cn(btnPrimary, "w-full")}
        >
          Ajouter
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">Nom</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grande, Fromage, Sans piment…"
            className={fsInputClass()}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            Prix ajouté
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={fsInputClass()}
          />
          <span className="mt-1 block text-[11px] leading-relaxed text-neutral-500">
            0 pour un choix sans supplément de prix. Un montant négatif est refusé :
            une remise se décide sur l&apos;addition, pas dans une option.
          </span>
        </label>
      </div>
    </RestaurantSheet>
  );
}
