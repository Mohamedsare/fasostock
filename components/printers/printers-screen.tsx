"use client";

import {
  FsCard,
  FsPage,
  FsScreenHeader,
  fsInputClass,
} from "@/components/ui/fs-screen-primitives";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { useAppContext } from "@/lib/features/common/app-context";
import {
  buildPrinterConfigStorageKey,
  loadPrinterAssociations,
  savePrinterAssociations,
  type PrinterScope,
  type StoredPrinterAssociations,
} from "@/lib/features/printers/printer-config-storage";
import {
  connectQz,
  listPrintersDetailed,
  loadQz,
  printA4Test,
  printThermalTest,
  type PrinterRow,
} from "@/lib/features/printers/qz-browser";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { MdLock } from "react-icons/md";

function statusBadgeClass(ok: boolean) {
  return cn(
    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
    ok
      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
      : "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300",
  );
}

export function PrintersScreen() {
  const router = useRouter();
  const ctxQ = useAppContext();
  const { hasPermission, helpers, isLoading: permLoading } = usePermissions();

  const companyId = ctxQ.data?.companyId ?? "";
  const canSettings = hasPermission(P.settingsManage);

  const [userId, setUserId] = useState<string | null>(null);
  const [scope, setScope] = useState<PrinterScope>("user");
  const [thermal, setThermal] = useState<string>("");
  const [a4, setA4] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  const [qzBusy, setQzBusy] = useState(false);
  const [qzConnected, setQzConnected] = useState(false);
  const [qzVersion, setQzVersion] = useState<string | null>(null);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [qzError, setQzError] = useState<string | null>(null);
  const [signingHint, setSigningHint] = useState<string | null>(null);

  const storageKey = useMemo(() => {
    if (!userId || !companyId) return null;
    return buildPrinterConfigStorageKey(userId, companyId, scope);
  }, [userId, companyId, scope]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFromStorage = useCallback(() => {
    if (!storageKey) return;
    const s = loadPrinterAssociations(storageKey);
    if (s) {
      setThermal(s.thermalPrinterName ?? "");
      setA4(s.a4PrinterName ?? "");
      setScope(s.scope);
      setDirty(false);
    } else {
      setThermal("");
      setA4("");
      setDirty(false);
    }
  }, [storageKey]);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (permLoading) return;
    if (helpers?.isCashier) {
      router.replace(ROUTES.sales);
    }
  }, [permLoading, helpers?.isCashier, router]);

  const refreshPrinters = useCallback(async () => {
    setQzError(null);
    setSigningHint(null);
    setQzBusy(true);
    try {
      const qz = await loadQz();
      await connectQz(qz);
      setQzConnected(true);
      const v = await qz.api.getVersion();
      setQzVersion(String(v));
      let rows: PrinterRow[];
      try {
        rows = await listPrintersDetailed(qz);
      } catch {
        const names = (await qz.printers.find()) as string[];
        rows = Array.isArray(names)
          ? names.map((name) => ({ name }))
          : [{ name: String(names) }];
      }
      setPrinters(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQzConnected(false);
      setQzVersion(null);
      setPrinters([]);
      setQzError(msg);
      if (
        msg.includes("Signature") ||
        msg.includes("503") ||
        msg.includes("QZ_PRIVATE_KEY")
      ) {
        setSigningHint(
          "Côté serveur, ajoutez la variable QZ_PRIVATE_KEY_PEM (clé privée RSA PEM) pour signer les appels QZ. Dans QZ Tray, associez le certificat public correspondant.",
        );
      }
    } finally {
      setQzBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshPrinters();
  }, [refreshPrinters]);

  const persist = useCallback(() => {
    if (!storageKey) {
      toast.error("Session ou entreprise indisponible");
      return;
    }
    savePrinterAssociations(storageKey, {
      thermalPrinterName: thermal.trim() || null,
      a4PrinterName: a4.trim() || null,
      scope,
    });
    setDirty(false);
    toast.success("Configuration enregistrée sur cet appareil");
  }, [storageKey, thermal, a4, scope]);

  const testThermal = useCallback(async () => {
    const name = thermal.trim();
    if (!name) {
      toast.error("Choisissez une imprimante pour le ticket caisse");
      return;
    }
    setQzBusy(true);
    try {
      const qz = await loadQz();
      await connectQz(qz);
      await printThermalTest(qz, name);
      toast.success("Test ticket envoyé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setQzBusy(false);
    }
  }, [thermal]);

  const testA4 = useCallback(async () => {
    const name = a4.trim();
    if (!name) {
      toast.error("Choisissez une imprimante pour la facture A4");
      return;
    }
    setQzBusy(true);
    try {
      const qz = await loadQz();
      await connectQz(qz);
      await printA4Test(qz, name);
      toast.success("Test facture A4 envoyé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setQzBusy(false);
    }
  }, [a4]);

  const exportJson = useCallback(() => {
    if (!userId || !companyId) return;
    const payload: StoredPrinterAssociations & {
      companyId: string;
      userId: string;
      exportLabel: string;
    } = {
      v: 2,
      thermalPrinterName: thermal.trim() || null,
      a4PrinterName: a4.trim() || null,
      scope,
      updatedAt: new Date().toISOString(),
      companyId,
      userId,
      exportLabel: "FasoStock imprimantes QZ",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fasostock-imprimantes-${companyId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Fichier exporté");
  }, [userId, companyId, thermal, a4, scope]);

  const onImportFile = useCallback(
    (ev: ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0];
      ev.target.value = "";
      if (!file || !storageKey) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "");
          const j = JSON.parse(text) as Partial<StoredPrinterAssociations> & {
            thermalPrinterName?: unknown;
            a4PrinterName?: unknown;
          };
          if (j.v !== 2) throw new Error("Version non supportée");
          setThermal(
            typeof j.thermalPrinterName === "string" ? j.thermalPrinterName : "",
          );
          setA4(typeof j.a4PrinterName === "string" ? j.a4PrinterName : "");
          setScope(j.scope === "device" ? "device" : "user");
          setDirty(true);
          toast.success("Fichier lu — enregistrez pour appliquer");
        } catch {
          toast.error("Fichier JSON invalide");
        }
      };
      reader.readAsText(file);
    },
    [storageKey],
  );

  if (permLoading || ctxQ.isLoading) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2
            className="h-9 w-9 animate-spin text-fs-accent"
            aria-hidden
          />
        </div>
      </FsPage>
    );
  }

  if (helpers?.isCashier) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2
            className="h-8 w-8 animate-spin text-fs-accent"
            aria-hidden
          />
        </div>
      </FsPage>
    );
  }

  if (companyId && !canSettings) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <FsScreenHeader title="Imprimantes" subtitle="QZ Tray et associations" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              Vous n&apos;avez pas accès à cette section.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const names = printers.map((p) => p.name);

  return (
    <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
      <FsScreenHeader
        title="Imprimantes"
        subtitle="Détection via QZ Tray : associez le ticket caisse (thermique) et la facture A4 à des imprimantes précises. La configuration est enregistrée dans ce navigateur."
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
        subtitleClassName="min-[900px]:text-base"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
        <Link
          href={ROUTES.settings}
          className="font-medium text-fs-accent underline-offset-2 hover:underline"
        >
          Paramètres
        </Link>
        <span aria-hidden>·</span>
        <span>
          Installez et lancez{" "}
          <a
            href="https://qz.io/download/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-fs-accent underline-offset-2 hover:underline"
          >
            QZ Tray
          </a>{" "}
          sur ce poste.
        </span>
      </div>

      <FsCard padding="p-4 sm:p-5" className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--fs-accent)_14%,transparent)]",
              )}
            >
              <Printer className="h-5 w-5 text-fs-accent" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-fs-text">QZ Tray</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={statusBadgeClass(qzConnected)}>
                  {qzConnected ? (
                    <Wifi className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {qzConnected ? "Connecté" : "Non connecté"}
                </span>
                {qzVersion ? (
                  <span className="text-xs text-neutral-500">
                    Version {qzVersion}
                  </span>
                ) : null}
              </div>
              {qzError ? (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {qzError}
                </p>
              ) : null}
              {signingHint ? (
                <p className="mt-1 text-xs text-neutral-600">{signingHint}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshPrinters()}
            disabled={qzBusy}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-fs-surface-container px-4 py-2.5 text-sm font-semibold text-fs-text",
              "hover:bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)] disabled:opacity-60",
              "dark:border-white/[0.1]",
            )}
          >
            {qzBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Actualiser
          </button>
        </div>
      </FsCard>

      <FsCard padding="p-4 sm:p-5" className="mb-4">
        <h2 className="text-sm font-semibold text-fs-text">
          Imprimantes détectées
        </h2>
        <p className="mt-1 text-xs text-neutral-600">
          Liste fournie par Windows via QZ Tray. Le statut dépend du pilote et
          du spouleur.
        </p>
        {names.length === 0 && !qzBusy ? (
          <p className="mt-4 text-sm text-neutral-500">
            Aucune imprimante listée. Vérifiez QZ Tray et cliquez sur Actualiser.
          </p>
        ) : (
          <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-black/[0.06] bg-fs-surface-container p-2 text-sm dark:border-white/[0.08]">
            {printers.map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                {p.status ? (
                  <span className="shrink-0 text-xs text-neutral-500">
                    {p.status}
                  </span>
                ) : qzConnected ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Vue QZ
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </FsCard>

      <FsCard padding="p-4 sm:p-5" className="mb-4">
        <h2 className="text-sm font-semibold text-fs-text">
          Enregistrement de la configuration
        </h2>
        <p className="mt-1 text-xs text-neutral-600">
          Stockage local du navigateur, lié à votre compte et à l&apos;entreprise.
          L&apos;option « Cet appareil » utilise un identifiant stable pour ce
          profil de navigateur (plusieurs utilisateurs peuvent partager la même
          machine avec des comptes différents).
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="fs-print-scope"
              checked={scope === "user"}
              onChange={() => {
                setScope("user");
                setDirty(true);
              }}
              className="accent-fs-accent"
            />
            Mon compte (recommandé)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="fs-print-scope"
              checked={scope === "device"}
              onChange={() => {
                setScope("device");
                setDirty(true);
              }}
              className="accent-fs-accent"
            />
            Cet appareil (tous les utilisateurs)
          </label>
        </div>
      </FsCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <FsCard padding="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-fs-text">
            Ticket caisse (thermique)
          </h2>
          <p className="mt-1 text-xs text-neutral-600">
            Imprimante pour le reçu rapide / ESC-POS.
          </p>
          <label className="mt-3 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Imprimante
            <select
              className={cn(fsInputClass, "mt-1.5 w-full")}
              value={thermal}
              onChange={(e) => {
                setThermal(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">— Choisir —</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={qzBusy}
            onClick={() => void testThermal()}
            className="mt-4 w-full rounded-xl bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            Tester l&apos;impression
          </button>
        </FsCard>

        <FsCard padding="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-fs-text">Facture A4</h2>
          <p className="mt-1 text-xs text-neutral-600">
            Imprimante pour les documents format page (HTML rendu par QZ).
          </p>
          <label className="mt-3 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Imprimante
            <select
              className={cn(fsInputClass, "mt-1.5 w-full")}
              value={a4}
              onChange={(e) => {
                setA4(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">— Choisir —</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={qzBusy}
            onClick={() => void testA4()}
            className="mt-4 w-full rounded-xl bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            Tester l&apos;impression
          </button>
        </FsCard>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={persist}
          disabled={!dirty || !storageKey}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold",
            "bg-fs-accent text-white shadow-sm hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Save className="h-4 w-4" aria-hidden />
          Enregistrer la configuration
        </button>
        <button
          type="button"
          onClick={exportJson}
          className="inline-flex items-center justify-center rounded-xl border border-black/[0.1] px-4 py-2.5 text-sm font-medium dark:border-white/[0.12]"
        >
          Exporter JSON
        </button>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/[0.1] px-4 py-2.5 text-sm font-medium dark:border-white/[0.12]">
          <Upload className="h-4 w-4" aria-hidden />
          Importer JSON
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={onImportFile}
          />
        </label>
      </div>
    </FsPage>
  );
}
