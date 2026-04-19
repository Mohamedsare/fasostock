"use client";

import { LogOutButton } from "@/components/auth/log-out-button";
import { PushNotificationsSettingsCard } from "@/components/settings/push-notifications-settings";
import {
  FsCard,
  FsPage,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  updateCompanyLogoUrl,
  uploadCompanyLogo,
} from "@/lib/features/companies/company-logo";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast, toastMutationError } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";
import {
  applySetShowQuantityButtons,
  applySetShowQuantityInput,
  readPosCartQtyUiForMode,
} from "@/lib/utils/pos-cart-settings";
import {
  getStoredFsThemePref,
  persistAndApplyFsTheme,
  type FsThemePref,
} from "@/lib/theme/fs-theme";
import { cn } from "@/lib/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  MdAddPhotoAlternate,
  MdBrightness4,
  MdBrightness7,
  MdBrightnessAuto,
  MdBusiness,
  MdCardMembership,
  MdDeleteSweep,
  MdExpandMore,
  MdErrorOutline,
  MdHistory,
  MdKey,
  MdLock,
  MdMail,
  MdPalette,
  MdPerson,
  MdSave,
  MdSecurity,
  MdShoppingCart,
  MdStore,
  MdWarningAmber,
} from "react-icons/md";

function toNullable(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

function SettingsCardTitle({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-[22px] w-[22px] shrink-0 text-fs-accent" aria-hidden />
      <p className="text-base font-semibold text-fs-text">{title}</p>
    </div>
  );
}

/** Liste déroulante type `DropdownButtonFormField` + fond gris (écran Paramètres Flutter — carte Entreprise). */
function settingsCompanySelectClassName(extra?: string) {
  return cn(
    "w-full cursor-pointer appearance-none rounded-xl border-0 bg-neutral-100 py-3 pl-4 pr-11 text-sm font-medium text-fs-text shadow-none outline-none transition",
    "focus-visible:ring-2 focus-visible:ring-fs-accent/25 dark:bg-neutral-800/90",
    extra,
  );
}

function SettingsGreySelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select className={settingsCompanySelectClassName()} value={value} onChange={onChange}>
        {children}
      </select>
      <MdExpandMore
        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
        aria-hidden
      />
    </div>
  );
}

function formatSubscriptionStatus(status: string): string {
  if (status === "active") return "Actif";
  if (status === "past_due") return "Paiement en attente";
  if (status === "canceled") return "Résilié";
  return status;
}

function formatSubscriptionDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function SettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const ctxQ = useAppContext();
  const { hasPermission, helpers, isLoading: permLoading } = usePermissions();

  const companyId = ctxQ.data?.companyId ?? "";
  const companyName = ctxQ.data?.companyName ?? "";
  const companyLogoUrl = ctxQ.data?.companyLogoUrl ?? null;
  const stores = ctxQ.data?.stores ?? [];
  const ctxStoreId = ctxQ.data?.storeId ?? null;
  const isOwner = ctxQ.data?.roleSlug === "owner";
  const canSettings = hasPermission(P.settingsManage);

  const [themePref, setThemePref] = useState<FsThemePref>(() =>
    typeof window !== "undefined" ? getStoredFsThemePref() : "system",
  );
  const [posQuickUi, setPosQuickUi] = useState(() =>
    typeof window !== "undefined"
      ? readPosCartQtyUiForMode("quick")
      : { showQuantityInput: true, showQuantityButtons: false },
  );
  const [posInvoiceUi, setPosInvoiceUi] = useState(() =>
    typeof window !== "undefined"
      ? readPosCartQtyUiForMode("a4")
      : { showQuantityInput: true, showQuantityButtons: false },
  );

  const [profileName, setProfileName] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [dangerScopeStoreId, setDangerScopeStoreId] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [dangerErr, setDangerErr] = useState<string | null>(null);
  const [twoFaOpen, setTwoFaOpen] = useState(false);

  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCompanyLogo, setUploadingCompanyLogo] = useState(false);
  const [companyLogoImgError, setCompanyLogoImgError] = useState(false);

  const [clearingSales, setClearingSales] = useState(false);
  const [clearingPurchases, setClearingPurchases] = useState(false);
  const [clearingTransfers, setClearingTransfers] = useState(false);
  const [clearingProducts, setClearingProducts] = useState(false);
  const [clearingStock, setClearingStock] = useState(false);
  const [clearingMovements, setClearingMovements] = useState(false);
  const [clearingWarehouseStock, setClearingWarehouseStock] = useState(false);
  const [clearingWarehouseMovements, setClearingWarehouseMovements] = useState(false);

  const [confirmDanger, setConfirmDanger] = useState<{
    title: string;
    body: string;
    actionLabel: string;
    run: () => Promise<void>;
  } | null>(null);

  const themePersistSkip = useRef(true);

  useEffect(() => {
    if (permLoading) return;
    if (helpers?.isCashier) {
      router.replace(ROUTES.sales);
    }
  }, [permLoading, helpers?.isCashier, router]);

  useEffect(() => {
    if (themePersistSkip.current) {
      themePersistSkip.current = false;
      return;
    }
    persistAndApplyFsTheme(themePref);
  }, [themePref]);

  useEffect(() => {
    setPosQuickUi(readPosCartQtyUiForMode("quick"));
    setPosInvoiceUi(readPosCartQtyUiForMode("a4"));
  }, []);

  useEffect(() => {
    setCompanyLogoImgError(false);
  }, [companyLogoUrl]);

  async function handleCompanyLogoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !companyId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image (PNG, JPG…).");
      return;
    }
    setUploadingCompanyLogo(true);
    try {
      const url = await uploadCompanyLogo(companyId, file);
      await updateCompanyLogoUrl(companyId, url);
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
      toast.success("Logo mis à jour");
    } catch (err) {
      toast.error(messageFromUnknownError(err));
    } finally {
      setUploadingCompanyLogo(false);
    }
  }

  async function handleRemoveCompanyLogo() {
    if (!companyId) return;
    setUploadingCompanyLogo(true);
    try {
      await updateCompanyLogoUrl(companyId, null);
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
      toast.success("Logo retiré");
    } catch (err) {
      toast.error(messageFromUnknownError(err));
    } finally {
      setUploadingCompanyLogo(false);
    }
  }

  const meQ = useQuery({
    queryKey: ["me-profile"] as const,
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();
      if (uErr) throw uErr;
      if (!user) return { id: "", email: "", fullName: "" };
      const { data: pRow } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      return {
        id: user.id,
        email: user.email ?? "",
        fullName: ((pRow as { full_name?: string | null } | null)?.full_name ?? "") as string,
      };
    },
    staleTime: 30_000,
  });

  const userId = meQ.data?.id ?? "";

  const companiesQ = useQuery({
    queryKey: ["settings-companies", userId] as const,
    queryFn: async () => {
      const supabase = createClient();
      const { data: roles, error } = await supabase
        .from("user_company_roles")
        .select("company_id")
        .eq("user_id", userId)
        .eq("is_active", true);
      if (error) throw error;
      const ids = [...new Set((roles ?? []).map((r) => (r as { company_id: string }).company_id))];
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", ids);
      if (cErr) throw cErr;
      return (companies ?? []) as { id: string; name: string }[];
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const companies = companiesQ.data ?? [];
  const multiCompany = companies.length > 1;

  useEffect(() => {
    setProfileName(meQ.data?.fullName ?? "");
  }, [meQ.data?.fullName]);

  const subscriptionQ = useQuery({
    queryKey: ["subscription", companyId] as const,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("company_subscriptions")
        .select("status, current_period_end, plan:subscription_plans(slug, name)")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!data) return null;
      const planRaw = (data as { plan?: { slug?: string; name?: string } | { slug?: string; name?: string }[] }).plan;
      const plan = Array.isArray(planRaw) ? planRaw[0] : planRaw;
      return {
        status: String((data as { status?: string }).status ?? "active"),
        currentPeriodEnd: ((data as { current_period_end?: string | null }).current_period_end ?? null) as string | null,
        planName: String(plan?.name ?? "Gratuit"),
      };
    },
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const profileMut = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const id = meQ.data?.id;
      if (!id) throw new Error("Utilisateur introuvable.");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: toNullable(profileName) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Profil mis à jour");
      await qc.invalidateQueries({ queryKey: ["me-profile"] });
      await qc.invalidateQueries({ queryKey: queryKeys.appContext });
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const pwdMut = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mot de passe mis à jour");
    },
    onError: (e) => toastMutationError("settings", e),
  });

  const scopeLabel =
    dangerScopeStoreId == null
      ? "Toute l'entreprise"
      : "Boutique sélectionnée";

  async function invalidateAfterDanger() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.appContext }),
      qc.invalidateQueries({ queryKey: queryKeys.stores(companyId) }),
      qc.invalidateQueries({
        queryKey: queryKeys.dashboard({
          companyId,
          storeId: ctxStoreId,
          period: "month",
          selectedDay: new Date().toISOString().slice(0, 10),
        }),
      }),
      qc.invalidateQueries({
        queryKey: queryKeys.sales({
          companyId,
          storeId: ctxStoreId,
          status: null,
          from: "",
          to: "",
        }),
      }),
      qc.invalidateQueries({
        queryKey: queryKeys.purchases({
          companyId,
          storeId: ctxStoreId,
          supplierId: null,
          status: null,
        }),
      }),
      qc.invalidateQueries({ queryKey: queryKeys.productInventory(ctxStoreId) }),
    ]);
  }

  async function rpcDanger(
    rpc: string,
    params: { p_company_id: string; p_store_id?: string | null },
  ): Promise<number> {
    const supabase = createClient();
    const payload =
      rpc === "owner_clear_products_catalog"
        ? { p_company_id: params.p_company_id }
        : { p_company_id: params.p_company_id, p_store_id: params.p_store_id ?? null };
    const { data, error } = await supabase.rpc(rpc, payload);
    if (error) throw error;
    return typeof data === "number" ? data : Number(data ?? 0);
  }

  function openDanger(opts: { title: string; body: string; actionLabel: string; run: () => Promise<void> }) {
    setConfirmDanger(opts);
  }

  async function runConfirmed() {
    if (!confirmDanger) return;
    const fn = confirmDanger.run;
    setConfirmDanger(null);
    try {
      await fn();
      await invalidateAfterDanger();
    } catch (e) {
      setDangerErr(messageFromUnknownError(e));
    }
  }

  const loadingAnyDanger =
    clearingSales ||
    clearingPurchases ||
    clearingTransfers ||
    clearingProducts ||
    clearingStock ||
    clearingMovements ||
    clearingWarehouseStock ||
    clearingWarehouseMovements;

  if (permLoading || ctxQ.isLoading) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (helpers?.isCashier) {
    return null;
  }

  if (companyId && !canSettings) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <FsScreenHeader title="Paramètres" subtitle="Profil, compte et entreprise" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">Vous n&apos;avez pas accès à cette section.</p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  return (
    <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
      <FsScreenHeader
        title="Paramètres"
        subtitle="Profil, compte et entreprise"
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        subtitleClassName="min-[900px]:text-base"
      />

      {/* Apparence — SegmentedButton 3 modes (Flutter) */}
      <FsCard padding="p-5">
        <SettingsCardTitle icon={MdPalette} title="Apparence" />
        <p className="mt-4 text-xs text-neutral-600 sm:text-sm">Choisir le thème de l&apos;application</p>
        <div className="mt-3 inline-flex w-full max-w-xl overflow-hidden rounded-[10px] border border-black/[0.08] sm:w-auto">
          {(
            [
              { v: "system" as const, Icon: MdBrightnessAuto, label: "Système" },
              { v: "light" as const, Icon: MdBrightness7, label: "Clair" },
              { v: "dark" as const, Icon: MdBrightness4, label: "Sombre" },
            ] as const
          ).map(({ v, Icon, label }, i) => (
            <button
              key={v}
              type="button"
              onClick={() => setThemePref(v)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold sm:gap-2 sm:px-4 sm:text-sm",
                i > 0 && "border-l border-black/[0.08]",
                themePref === v ? "bg-fs-accent text-white" : "bg-fs-card text-neutral-700",
              )}
            >
              <Icon className="h-5 w-5 shrink-0 sm:h-5 sm:w-5" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </FsCard>

      {/* Caisse POS rapide — aligné `SettingsPage._buildPosCartCard(quick)` Flutter */}
      <FsCard className="mt-5" padding="p-5">
        <SettingsCardTitle icon={MdShoppingCart} title="Caisse POS rapide" />
        <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
          Un seul mode à la fois pour la caisse rapide. Le panier se met à jour automatiquement à la saisie.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600 sm:text-sm">
          Toujours un mode actif : si vous désactivez le mode courant, l&apos;autre est activé automatiquement.
        </p>
        <div className="mt-4 space-y-0 divide-y divide-black/[0.06] rounded-[10px] border border-black/[0.08]">
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Champ de saisie pour la quantité</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Saisir le nombre : le total se met à jour automatiquement</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={posQuickUi.showQuantityInput}
              onChange={(e) => {
                const n = applySetShowQuantityInput("quick", e.target.checked);
                setPosQuickUi(n);
                void qc.invalidateQueries({ queryKey: queryKeys.posCartSettings });
              }}
            />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Boutons (-) et (+)</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Incrémenter ou décrémenter la quantité</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={posQuickUi.showQuantityButtons}
              onChange={(e) => {
                const n = applySetShowQuantityButtons("quick", e.target.checked);
                setPosQuickUi(n);
                void qc.invalidateQueries({ queryKey: queryKeys.posCartSettings });
              }}
            />
          </label>
        </div>
      </FsCard>

      {/* Caisse Facture A4 */}
      <FsCard className="mt-5" padding="p-5">
        <SettingsCardTitle icon={MdShoppingCart} title="Caisse Facture A4" />
        <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
          Un seul mode à la fois pour la facture A4. Le panier se met à jour automatiquement à la saisie.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600 sm:text-sm">
          Toujours un mode actif : si vous désactivez le mode courant, l&apos;autre est activé automatiquement.
        </p>
        <div className="mt-4 space-y-0 divide-y divide-black/[0.06] rounded-[10px] border border-black/[0.08]">
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Champ de saisie pour la quantité</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Saisir le nombre : le total se met à jour automatiquement</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={posInvoiceUi.showQuantityInput}
              onChange={(e) => {
                const n = applySetShowQuantityInput("a4", e.target.checked);
                setPosInvoiceUi(n);
                void qc.invalidateQueries({ queryKey: queryKeys.posCartSettings });
              }}
            />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-3 sm:px-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">Boutons (-) et (+)</span>
              <span className="mt-0.5 block text-xs text-neutral-600">Incrémenter ou décrémenter la quantité</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={posInvoiceUi.showQuantityButtons}
              onChange={(e) => {
                const n = applySetShowQuantityButtons("a4", e.target.checked);
                setPosInvoiceUi(n);
                void qc.invalidateQueries({ queryKey: queryKeys.posCartSettings });
              }}
            />
          </label>
        </div>
      </FsCard>

      {/* Profil */}
      <FsCard className="mt-5" padding="p-5">
        <SettingsCardTitle icon={MdPerson} title="Profil" />
        {profileErr ? (
          <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm text-red-700">
            <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0">{profileErr}</span>
          </div>
        ) : null}
        <div className={cn(profileErr ? "mt-3" : "mt-5")}>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Nom affiché</label>
          <input
            className={fsInputClass()}
            value={profileName}
            onChange={(e) => {
              setProfileName(e.target.value);
              setProfileErr(null);
            }}
            placeholder="Votre nom"
            autoComplete="name"
          />
        </div>
        <button
          type="button"
          onClick={async () => {
            setProfileErr(null);
            try {
              await profileMut.mutateAsync();
            } catch (e) {
              setProfileErr(messageFromUnknownError(e));
            }
          }}
          className="mt-4 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
          disabled={profileMut.isPending}
        >
          {profileMut.isPending ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
          ) : (
            <MdSave className="h-4 w-4" aria-hidden />
          )}
          Enregistrer
        </button>
      </FsCard>

      {/* Compte */}
      <FsCard className="mt-5" padding="p-5">
        <SettingsCardTitle icon={MdMail} title="Compte" />
        <p className="mt-5 text-xs font-medium text-neutral-600">Email</p>
        <div className="mt-1 rounded-[10px] border border-black/[0.08] bg-neutral-100/50 px-3.5 py-3 text-sm text-fs-text dark:bg-neutral-800/40">
          {meQ.data?.email || "—"}
        </div>
        <p className="mt-6 text-sm font-semibold text-neutral-700">Changer le mot de passe</p>
        {pwdErr ? (
          <div className="mt-3 flex gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm text-red-700">
            <MdErrorOutline className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>{pwdErr}</span>
          </div>
        ) : null}
        <div className={cn("mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2", pwdErr && "mt-3")}>
          <div>
            <label className="mb-1 block text-xs text-neutral-600">Nouveau mot de passe</label>
            <input
              type="password"
              className={fsInputClass()}
              value={pwd}
              onChange={(e) => {
                setPwd(e.target.value);
                setPwdErr(null);
              }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-600">Confirmer le mot de passe</label>
            <input
              type="password"
              className={fsInputClass()}
              value={pwd2}
              onChange={(e) => {
                setPwd2(e.target.value);
                setPwdErr(null);
              }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            setPwdErr(null);
            if (pwd.length < 6) {
              setPwdErr("Le mot de passe doit contenir au moins 6 caractères");
              return;
            }
            if (pwd !== pwd2) {
              setPwdErr("Les mots de passe ne correspondent pas");
              return;
            }
            try {
              await pwdMut.mutateAsync();
              setPwd("");
              setPwd2("");
            } catch (e) {
              setPwdErr(messageFromUnknownError(e));
            }
          }}
          className="mt-4 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[10px] border border-black/[0.1] bg-fs-card px-4 text-sm font-semibold text-neutral-800 shadow-sm disabled:opacity-60"
          disabled={pwdMut.isPending}
        >
          {pwdMut.isPending ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" aria-hidden />
          ) : (
            <MdSecurity className="h-4 w-4" aria-hidden />
          )}
          Mettre à jour le mot de passe
        </button>
      </FsCard>

      {isOwner ? <PushNotificationsSettingsCard /> : null}

      {/* Entreprise — même carte que Flutter (`_buildCompanyCard`) : fond gris listes, labels gris, lien orange */}
      {companyId ? (
        <FsCard
          className="mt-5 rounded-[12px] border border-neutral-200/90 bg-fs-card shadow-none dark:border-white/10"
          padding="p-5"
        >
          <SettingsCardTitle icon={MdBusiness} title="Entreprise" />
          {isOwner ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-hidden
                onChange={handleCompanyLogoFileChange}
              />
              <button
                type="button"
                disabled={uploadingCompanyLogo}
                onClick={() => logoFileInputRef.current?.click()}
                className={cn(
                  "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-300/60 bg-neutral-100 transition hover:bg-neutral-200/80 disabled:opacity-60 dark:border-white/20 dark:bg-neutral-800",
                )}
                aria-label="Choisir le logo entreprise"
              >
                {uploadingCompanyLogo ? (
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                ) : companyLogoUrl && !companyLogoImgError ? (
                  <img
                    src={companyLogoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setCompanyLogoImgError(true)}
                  />
                ) : (
                  <MdAddPhotoAlternate className="h-9 w-9 text-neutral-400" aria-hidden />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fs-text">Logo entreprise</p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Affiché en haut du menu. Cliquez pour choisir une image (PNG, JPG…).
                </p>
                {companyLogoUrl ? (
                  <button
                    type="button"
                    disabled={uploadingCompanyLogo}
                    onClick={() => void handleRemoveCompanyLogo()}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
                  >
                    Retirer le logo
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {multiCompany ? (
            <div className={cn(isOwner ? "mt-4" : "mt-5")}>
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Entreprise
              </label>
              <SettingsGreySelect
                value={companyId}
                onChange={(e) => {
                  try {
                    localStorage.setItem("fs_active_company_id", e.target.value);
                    localStorage.removeItem("fs_active_store_id");
                  } catch {
                    /* */
                  }
                  void qc.invalidateQueries({ queryKey: queryKeys.appContext });
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SettingsGreySelect>
            </div>
          ) : (
            <div className={cn(isOwner ? "mt-4" : "mt-5")}>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Entreprise</p>
              <p className="mt-1 text-base font-semibold leading-snug text-fs-text">
                {companyName || "—"}
              </p>
            </div>
          )}
          {stores.length > 0 ? (
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Boutique
              </label>
              <SettingsGreySelect
                value={ctxStoreId === null ? "__all__" : ctxStoreId}
                onChange={(e) => {
                  const v = e.target.value;
                  try {
                    localStorage.setItem("fs_active_store_id", v === "__all__" ? "__all__" : v);
                  } catch {
                    /* */
                  }
                  void qc.invalidateQueries({ queryKey: queryKeys.appContext });
                }}
              >
                <option value="__all__">— Toutes —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SettingsGreySelect>
            </div>
          ) : (
            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
              Aucune boutique configurée
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Pour modifier le détail d&apos;une boutique (adresse, facturation…), ouvrez{" "}
            <Link
              href={ROUTES.stores}
              className="font-semibold text-fs-accent hover:underline hover:underline-offset-2"
            >
              Boutiques
            </Link>
            .
          </p>
        </FsCard>
      ) : null}

      {/* Abonnement */}
      {companyId ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdCardMembership} title="Abonnement" />
          {subscriptionQ.isLoading ? (
            <div className="mt-4 flex justify-center py-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
            </div>
          ) : (
            <div className="mt-4 space-y-1 text-sm">
              <p>
                <span className="text-neutral-600">Plan :</span>{" "}
                <span className="font-medium text-fs-text">{subscriptionQ.data?.planName ?? "Gratuit"}</span>
              </p>
              <p className="text-xs text-neutral-600">
                Statut : {formatSubscriptionStatus(subscriptionQ.data?.status ?? "active")}
              </p>
              {subscriptionQ.data?.currentPeriodEnd ? (
                <p className="text-xs text-neutral-600">
                  Renouvellement : {formatSubscriptionDate(subscriptionQ.data.currentPeriodEnd)}
                </p>
              ) : null}
            </div>
          )}
        </FsCard>
      ) : null}

      {/* Intégrations — ListTile Flutter */}
      {isOwner && companyId ? (
        <FsCard className="mt-5 p-0">
          <Link
            href={ROUTES.integrations}
            className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-black/[0.02]"
          >
            <MdKey className="h-[22px] w-[22px] shrink-0 text-fs-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-fs-text">Intégrations API & Webhooks</p>
              <p className="mt-0.5 text-xs text-neutral-600">Clés API et URLs de webhook pour vos intégrations</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
          </Link>
        </FsCard>
      ) : null}

      {/* 2FA */}
      {isOwner ? (
        <FsCard className="mt-5" padding="p-5">
          <SettingsCardTitle icon={MdSecurity} title="Authentification à deux facteurs (2FA)" />
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Renforcez la sécurité de votre compte avec un code à usage unique (application type Google Authenticator).
          </p>
          <button
            type="button"
            onClick={() => setTwoFaOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white"
          >
            <MdSecurity className="h-5 w-5" aria-hidden />
            Activer la 2FA
          </button>
        </FsCard>
      ) : null}

      {/* Zone danger — owner + entreprise */}
      {isOwner && companyId ? (
        <FsCard className="mt-5 border border-red-400/55" padding="p-5">
          <div className="flex items-center gap-2.5 text-red-700">
            <MdWarningAmber className="h-6 w-6 shrink-0" aria-hidden />
            <span className="text-base font-bold">Vider historiques entreprise</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
            Zone danger : action irréversible. Vous pouvez supprimer les historiques pour toute l&apos;entreprise ou seulement une
            boutique.
          </p>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Périmètre de suppression</label>
            <select
              className={fsInputClass()}
              value={dangerScopeStoreId ?? ""}
              onChange={(e) => setDangerScopeStoreId(e.target.value || null)}
            >
              <option value="">Toute l&apos;entreprise</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  Boutique: {s.name}
                </option>
              ))}
            </select>
          </div>
          {dangerErr ? (
            <p className="mt-3 text-sm font-medium text-red-600" role="alert">
              {dangerErr}
            </p>
          ) : null}

          {/* Magasin (dépôt) */}
          <div className="mt-4 rounded-[10px] border border-red-300/40 bg-red-50/30 p-3 dark:bg-red-950/20">
            <div className="flex items-center gap-2 text-red-800">
              <MdStore className="h-4 w-4" aria-hidden />
              <span className="text-sm font-bold">Magasin (dépôt)</span>
            </div>
            <p className="mt-1.5 text-xs text-neutral-600">
              Suppression dédiée au dépôt central de l&apos;entreprise (stock + mouvements du magasin).
            </p>
            {dangerScopeStoreId != null ? (
              <p className="mt-2 text-xs italic text-neutral-600">
                Astuce : repassez le périmètre sur « Toute l&apos;entreprise » pour activer ces actions dépôt.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loadingAnyDanger || dangerScopeStoreId != null}
                onClick={() =>
                  openDanger({
                    title: "Vider le stock du magasin ?",
                    body: "Le stock du dépôt central sera remis à zéro. Les stocks boutiques ne sont pas concernés.",
                    actionLabel: "Vider stock magasin",
                    run: async () => {
                      setClearingWarehouseStock(true);
                      setDangerErr(null);
                      try {
                        const deleted = await rpcDanger("owner_clear_stock", {
                          p_company_id: companyId,
                          p_store_id: null,
                        });
                        toast.success(`Stock magasin vidé (${deleted} ligne(s) supprimée(s)).`);
                      } finally {
                        setClearingWarehouseStock(false);
                      }
                    },
                  })
                }
                className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-neutral-900"
              >
                {clearingWarehouseStock ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                ) : (
                  <MdStore className="h-4 w-4" aria-hidden />
                )}
                Vider stock magasin
              </button>
              <button
                type="button"
                disabled={loadingAnyDanger || dangerScopeStoreId != null}
                onClick={() =>
                  openDanger({
                    title: "Vider l'historique magasin ?",
                    body: "Tous les mouvements du dépôt central seront supprimés définitivement. Les mouvements boutiques ne sont pas concernés.",
                    actionLabel: "Vider mouvements magasin",
                    run: async () => {
                      setClearingWarehouseMovements(true);
                      setDangerErr(null);
                      try {
                        const deleted = await rpcDanger("owner_clear_stock_movements_history", {
                          p_company_id: companyId,
                          p_store_id: null,
                        });
                        toast.success(`Historique magasin vidé (${deleted} mouvement(s) supprimé(s)).`);
                      } finally {
                        setClearingWarehouseMovements(false);
                      }
                    },
                  })
                }
                className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-neutral-900"
              >
                {clearingWarehouseMovements ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                ) : (
                  <MdHistory className="h-4 w-4" aria-hidden />
                )}
                Vider mouvements magasin
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider le catalogue produits ?",
                  body: "Tous les produits de l'entreprise seront supprimés définitivement. Action globale entreprise.",
                  actionLabel: "Vider produits",
                  run: async () => {
                    if (dangerScopeStoreId != null) {
                      throw new Error(
                        'Les produits sont partagés au niveau entreprise. Sélectionnez "Toute l\'entreprise".',
                      );
                    }
                    setClearingProducts(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_products_catalog", { p_company_id: companyId });
                      toast.success(`Catalogue vidé (${deleted} produit(s) supprimé(s)).`);
                    } finally {
                      setClearingProducts(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingProducts ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider produits
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider l'historique des ventes ?",
                  body: "Toutes les ventes (et leurs lignes/paiements/retours) de cette entreprise seront supprimées définitivement.",
                  actionLabel: "Vider ventes",
                  run: async () => {
                    setClearingSales(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_sales_history", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Historique ventes vidé (${deleted} vente(s) supprimée(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingSales(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingSales ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider ventes
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider l'historique des achats ?",
                  body: "Tous les achats (et leurs lignes) de cette entreprise seront supprimés définitivement.",
                  actionLabel: "Vider achats",
                  run: async () => {
                    setClearingPurchases(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_purchases_history", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Historique achats vidé (${deleted} achat(s) supprimé(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingPurchases(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingPurchases ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider achats
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider l'historique des transferts ?",
                  body: "Tous les transferts (et leurs lignes) de cette entreprise seront supprimés définitivement.",
                  actionLabel: "Vider transferts",
                  run: async () => {
                    setClearingTransfers(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_transfers_history", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Historique transferts vidé (${deleted} transfert(s) supprimé(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingTransfers(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingTransfers ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider transferts
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider le stock ?",
                  body: "Le stock sera remis à zéro pour le périmètre sélectionné.",
                  actionLabel: "Vider stock",
                  run: async () => {
                    setClearingStock(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_stock", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Stock vidé (${deleted} ligne(s) supprimée(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingStock(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingStock ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdDeleteSweep className="h-4 w-4" aria-hidden />
              )}
              Vider stock
            </button>
            <button
              type="button"
              disabled={loadingAnyDanger}
              onClick={() =>
                openDanger({
                  title: "Vider l'historique des mouvements ?",
                  body: "Tous les mouvements de stock du périmètre sélectionné seront supprimés définitivement.",
                  actionLabel: "Vider mouvements",
                  run: async () => {
                    setClearingMovements(true);
                    setDangerErr(null);
                    try {
                      const deleted = await rpcDanger("owner_clear_stock_movements_history", {
                        p_company_id: companyId,
                        p_store_id: dangerScopeStoreId,
                      });
                      toast.success(`Historique mouvements vidé (${deleted} mouvement(s) supprimé(s)) — ${scopeLabel}.`);
                    } finally {
                      setClearingMovements(false);
                    }
                  },
                })
              }
              className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-950/30"
            >
              {clearingMovements ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <MdHistory className="h-4 w-4" aria-hidden />
              )}
              Vider mouvements
            </button>
          </div>
        </FsCard>
      ) : null}

      {/* Déconnexion — carte bordure erreur (Flutter) */}
      <FsCard className="mt-5 border border-red-400/50 bg-fs-card" padding="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-fs-text">Déconnexion</p>
            <p className="mt-1 text-xs text-neutral-600">Se déconnecter de FasoStock</p>
          </div>
          <div className="shrink-0">
            <LogOutButton className="border-red-500/60 bg-red-600 text-white shadow-none hover:bg-red-700" />
          </div>
        </div>
      </FsCard>

      {/* Dialog confirmation danger */}
      {confirmDanger ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="danger-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-fs-card p-5 shadow-xl">
            <div className="flex justify-center text-red-600">
              <MdWarningAmber className="h-10 w-10" aria-hidden />
            </div>
            <h2 id="danger-title" className="mt-2 text-center text-lg font-bold text-fs-text">
              {confirmDanger.title}
            </h2>
            <p className="mt-3 text-center text-sm text-neutral-600">
              {confirmDanger.body}
              <br />
              <br />
              Confirmez pour continuer.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-black/[0.04]"
                onClick={() => setConfirmDanger(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                onClick={() => void runConfirmed()}
              >
                Oui, supprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Dialog 2FA */}
      {twoFaOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="twofa-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-fs-card p-5 shadow-xl">
            <h2 id="twofa-title" className="text-lg font-bold text-fs-text">
              2FA
            </h2>
            <p className="mt-3 text-sm text-neutral-600">
              L&apos;activation de la double authentification sera disponible prochainement. En attendant, utilisez un mot de passe
              fort.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-fs-accent hover:bg-fs-accent/10"
                onClick={() => setTwoFaOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FsPage>
  );
}
