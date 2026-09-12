"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MdAdd,
  MdCheckCircle,
  MdContentCopy,
  MdDelete,
  MdKey,
  MdLock,
  MdRefresh,
  MdWarning,
} from "react-icons/md";
import { FsCard, FsPage, FsScreenHeader, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { FsConfirmDialog } from "@/components/ui/fs-confirm-dialog";
import { useAppContext } from "@/lib/features/common/app-context";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRow,
} from "@/lib/features/integrations/api-keys";
import { toFriendlyError } from "@/lib/utils/friendly-error";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

const subscribeNoop = () => () => {};

/** Origine du site, sans décalage d'hydratation (vide au rendu serveur). */
function useOrigin(): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copié.`);
  } catch {
    toast.error("Copie impossible — sélectionnez le texte manuellement.");
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Jamais utilisée";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-sm bg-neutral-900 p-3 pr-12 text-xs leading-relaxed text-neutral-100">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => void copyText(code, label)}
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-sm bg-white/10 text-white hover:bg-white/20"
        aria-label={`Copier ${label}`}
      >
        <MdContentCopy className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

const SAMPLE_RESPONSE = `{
  "company": { "id": "…", "name": "Ma société" },
  "store": { "id": "…", "name": "Boutique centre", "code": "B1", "address": "…" },
  "currency": "XOF",
  "total": 248, "count": 100, "limit": 100, "offset": 0,
  "has_more": true, "next_offset": 100,
  "products": [
    {
      "id": "…",
      "name": "Savon Lux 125 g",
      "sku": "LUX-125", "barcode": "6001087357210", "unit": "pce",
      "description": null,
      "category": { "id": "…", "name": "Hygiène" },
      "brand": { "id": "…", "name": "Lux" },
      "sale_price": 350,
      "price": 315,
      "promotion": { "discount_percent": 10, "price": 315 },
      "stock": 142, "in_stock": true,
      "images": ["https://…/savon.jpg"],
      "packagings": [
        { "id": "…", "label": "Paquet", "barcode": "…", "quantity": 12,
          "price": 4000, "unit_price": 334 },
        { "id": "…", "label": "Carton", "barcode": "…", "quantity": 72,
          "price": 22000, "unit_price": 306 }
      ],
      "updated_at": "2026-09-12T08:30:00Z"
    }
  ]
}`;

export function IntegrationsScreen() {
  const qc = useQueryClient();
  const ctx = useAppContext();
  const { isLoading: permLoading, helpers: h } = usePermissions();
  const origin = useOrigin();

  const companyId = ctx.data?.companyId ?? "";
  const stores = useMemo(
    () => (ctx.data?.stores ?? []).map((s) => ({ id: s.id, name: s.name })),
    [ctx.data?.stores],
  );
  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  const isOwner = h?.isOwner ?? false;

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopeStoreId, setScopeStoreId] = useState("");
  const [revealed, setRevealed] = useState<{ name: string; key: string; storeId: string | null } | null>(
    null,
  );
  const [toRevoke, setToRevoke] = useState<ApiKeyRow | null>(null);
  const [docStoreId, setDocStoreId] = useState("");

  const keysQ = useQuery({
    queryKey: ["api-keys", companyId],
    queryFn: () => listApiKeys(companyId),
    enabled: !!companyId && isOwner,
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createApiKey({ companyId, name: name.trim(), storeId: scopeStoreId || null }),
    onSuccess: (res) => {
      setRevealed({ name: name.trim(), key: res.keyRaw, storeId: scopeStoreId || null });
      setFormOpen(false);
      setName("");
      setScopeStoreId("");
      void qc.invalidateQueries({ queryKey: ["api-keys", companyId] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Création de la clé impossible.")),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      toast.success("Clé révoquée : elle ne fonctionne plus.");
      setToRevoke(null);
      void qc.invalidateQueries({ queryKey: ["api-keys", companyId] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Révocation impossible.")),
  });

  if (permLoading || ctx.isLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (!isOwner) {
    return (
      <FsPage>
        <FsScreenHeader title="Intégrations API" subtitle="Connecter FasoStock à un autre logiciel" />
        <FsCard className="rounded-sm sm:rounded-sm" padding="p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <MdLock className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">
              Réservé à la personne propriétaire de l&apos;entreprise.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const keys = keysQ.data ?? [];
  const docStore = docStoreId || revealed?.storeId || stores[0]?.id || "{storeId}";
  const base = `${origin}/api/v1`;
  const keyForDoc = revealed?.key ?? "fs_VOTRE_CLE_API";
  const curlStores = `curl -H "Authorization: Bearer ${keyForDoc}" \\\n  "${base}/stores"`;
  const curlProducts = `curl -H "Authorization: Bearer ${keyForDoc}" \\\n  "${base}/stores/${docStore}/products?limit=100&offset=0"`;
  const jsSample = `const res = await fetch("${base}/stores/${docStore}/products?in_stock=true", {
  headers: { Authorization: "Bearer ${keyForDoc}" },
});
const { products, has_more, next_offset } = await res.json();`;
  const keysError = keysQ.error ? toFriendlyError(keysQ.error, "Clés API indisponibles") : null;

  return (
    <FsPage>
      <FsScreenHeader
        title="Intégrations API"
        subtitle="Exposez le catalogue de vos boutiques (noms, prix, conditionnements, stock) à un site web ou un logiciel tiers"
        titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
      />

      {revealed ? (
        <FsCard className="mb-4 rounded-sm border-2 border-emerald-500/50 sm:rounded-sm" padding="p-5">
          <div className="flex items-start gap-3">
            <MdCheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-fs-text">Clé « {revealed.name} » créée</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <MdWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Copiez-la maintenant : elle ne sera plus jamais affichée.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded-sm bg-fs-surface-container px-3 py-2 text-xs font-mono text-fs-text">
                  {revealed.key}
                </code>
                <button
                  type="button"
                  onClick={() => void copyText(revealed.key, "Clé API")}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-sm bg-fs-accent px-4 text-sm font-bold text-white"
                >
                  <MdContentCopy className="h-4 w-4" aria-hidden />
                  Copier la clé
                </button>
              </div>
              <button
                type="button"
                onClick={() => setRevealed(null)}
                className="mt-3 text-xs font-semibold text-neutral-500 underline"
              >
                J&apos;ai copié la clé, masquer
              </button>
            </div>
          </div>
        </FsCard>
      ) : null}

      <FsCard className="mb-4 rounded-sm sm:rounded-sm" padding="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MdKey className="h-5 w-5 text-fs-accent" aria-hidden />
            <h2 className="text-base font-bold text-fs-text">Clés API</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void keysQ.refetch()}
              className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-black/10 bg-fs-surface-container px-3 text-sm font-semibold dark:border-white/10"
            >
              <MdRefresh className={cn("h-4 w-4", keysQ.isFetching && "animate-spin")} aria-hidden />
              Actualiser
            </button>
            {!formOpen ? (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-fs-accent px-4 text-sm font-bold text-white"
              >
                <MdAdd className="h-5 w-5" aria-hidden />
                Nouvelle clé
              </button>
            ) : null}
          </div>
        </div>

        {formOpen ? (
          <form
            className="mb-4 grid gap-3 rounded-sm border border-black/10 p-4 dark:border-white/10 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length === 0) {
                toast.error("Donnez un nom à la clé (ex. « Site web »).");
                return;
              }
              createMut.mutate();
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-semibold text-fs-text">
              Nom de la clé
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Ex. Site web, Application livraison"
                className={fsInputClass()}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-fs-text">
              Boutiques accessibles
              <select
                value={scopeStoreId}
                onChange={(e) => setScopeStoreId(e.target.value)}
                className={fsInputClass()}
              >
                <option value="">Toutes les boutiques</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    Uniquement : {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="inline-flex h-10 items-center rounded-sm border border-black/10 px-4 text-sm font-semibold dark:border-white/10"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={createMut.isPending}
                className="inline-flex h-10 items-center rounded-sm bg-fs-accent px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {createMut.isPending ? "Création…" : "Créer la clé"}
              </button>
            </div>
          </form>
        ) : null}

        {keysError ? (
          <div className="rounded-sm bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200">
            <p className="font-semibold">{keysError.title}</p>
            {keysError.hint ? <p className="mt-1">{keysError.hint}</p> : null}
          </div>
        ) : keysQ.isLoading ? (
          <p className="text-sm text-neutral-500">Chargement…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Aucune clé pour l&apos;instant. Créez-en une par logiciel ou prestataire à connecter.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-fs-text">{k.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    <code className="font-mono">{k.keyPrefix}…</code>
                    {" · "}
                    {k.storeId ? `Uniquement : ${storeName.get(k.storeId) ?? "boutique"}` : "Toutes les boutiques"}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Dernier appel : {formatDateTime(k.lastUsedAt)} · {k.requestCount.toLocaleString("fr-FR")} appel
                    {k.requestCount > 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setToRevoke(k)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-red-500/40 px-3 text-sm font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-300"
                >
                  <MdDelete className="h-4 w-4" aria-hidden />
                  Révoquer
                </button>
              </li>
            ))}
          </ul>
        )}
      </FsCard>

      <FsCard className="mb-4 rounded-sm sm:rounded-sm" padding="p-5">
        <h2 className="text-base font-bold text-fs-text">Documentation de l&apos;API produits</h2>
        <p className="mt-1 text-sm text-neutral-600">
          À transmettre à votre développeur. Lecture seule : l&apos;API ne peut rien modifier et
          n&apos;expose jamais vos prix d&apos;achat ni vos marges.
        </p>

        <h3 className="mt-5 text-sm font-bold text-fs-text">1. Authentification</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Chaque requête envoie la clé dans l&apos;en-tête <code className="font-mono">Authorization: Bearer fs_…</code>{" "}
          (ou <code className="font-mono">X-API-Key</code>). Limite : 120 requêtes par minute.
        </p>

        <h3 className="mt-5 text-sm font-bold text-fs-text">2. Lister les boutiques</h3>
        <p className="mb-2 mt-1 text-sm text-neutral-600">
          <code className="font-mono">GET /api/v1/stores</code> — renvoie l&apos;identifiant de chaque boutique accessible.
        </p>
        <CodeBlock code={curlStores} label="Exemple" />

        <h3 className="mt-5 text-sm font-bold text-fs-text">3. Produits d&apos;une boutique</h3>
        <p className="mt-1 text-sm text-neutral-600">
          <code className="font-mono">GET /api/v1/stores/{"{storeId}"}/products</code>
        </p>
        {stores.length > 0 ? (
          <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-neutral-600 sm:max-w-sm">
            Boutique des exemples
            <select value={docStore} onChange={(e) => setDocStoreId(e.target.value)} className={fsInputClass()}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-2 space-y-2">
          <CodeBlock code={curlProducts} label="Exemple" />
          <CodeBlock code={jsSample} label="Exemple JavaScript" />
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase text-neutral-500 dark:border-white/10">
                <th className="py-2 pr-3">Paramètre</th>
                <th className="py-2">Rôle</th>
              </tr>
            </thead>
            <tbody className="text-neutral-700 dark:text-neutral-300">
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-3 font-mono">limit</td>
                <td className="py-2">Produits par page, de 1 à 500 (100 par défaut).</td>
              </tr>
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-3 font-mono">offset</td>
                <td className="py-2">Position de départ. Reprendre avec <code className="font-mono">next_offset</code> tant que <code className="font-mono">has_more</code> vaut true.</td>
              </tr>
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-3 font-mono">search</td>
                <td className="py-2">Recherche dans le nom, le SKU, le code-barres et les autres noms.</td>
              </tr>
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-3 font-mono">barcode</td>
                <td className="py-2">Code-barres exact du produit ou d&apos;un de ses conditionnements.</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono">in_stock</td>
                <td className="py-2"><code className="font-mono">true</code> : uniquement les produits en stock dans la boutique.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="mt-5 text-sm font-bold text-fs-text">4. Lire les prix</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-600">
          <li><code className="font-mono">sale_price</code> : prix de vente catalogue d&apos;une pièce (FCFA).</li>
          <li><code className="font-mono">price</code> : prix facturé aujourd&apos;hui dans cette boutique (promotion en cours déduite, détail dans <code className="font-mono">promotion</code>).</li>
          <li><code className="font-mono">packagings[].price</code> : prix du lot entier (paquet, carton…) contenant <code className="font-mono">quantity</code> pièces.</li>
          <li><code className="font-mono">packagings[].unit_price</code> : ce même lot ramené à la pièce.</li>
          <li><code className="font-mono">stock</code> : quantité disponible en pièces dans la boutique.</li>
        </ul>

        <h3 className="mt-5 text-sm font-bold text-fs-text">Exemple de réponse</h3>
        <div className="mt-2">
          <CodeBlock code={SAMPLE_RESPONSE} label="Exemple de réponse" />
        </div>

        <h3 className="mt-5 text-sm font-bold text-fs-text">Codes d&apos;erreur</h3>
        <p className="mt-1 text-sm text-neutral-600">
          401 clé absente ou révoquée · 403 boutique non autorisée pour cette clé · 404 boutique introuvable ·
          429 trop de requêtes · 503 service indisponible. Le corps contient{" "}
          <code className="font-mono">{"{ error: { code, message } }"}</code>.
        </p>
      </FsCard>

      <FsConfirmDialog
        open={toRevoke != null}
        title="Révoquer cette clé ?"
        message={
          toRevoke
            ? `« ${toRevoke.name} » cessera immédiatement de fonctionner. Le logiciel qui l'utilise ne pourra plus lire vos produits. Action irréversible.`
            : undefined
        }
        confirmLabel="Révoquer"
        tone="danger"
        busy={revokeMut.isPending}
        onCancel={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revokeMut.mutate(toRevoke.id)}
      />
    </FsPage>
  );
}
