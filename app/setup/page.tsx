import Link from "next/link";

export default function SetupPage() {
  return (
    <div className="flex min-h-dvh flex-col justify-center bg-fs-surface px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-black/[0.08] bg-fs-card p-6 shadow-sm">
        <h1 className="text-lg font-bold text-fs-text">Configuration Supabase</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Créez un fichier{" "}
          <code className="rounded bg-fs-surface-container px-1.5 py-0.5 text-xs">
            .env.local
          </code>{" "}
          à la racine de{" "}
          <code className="rounded bg-fs-surface-container px-1.5 py-0.5 text-xs">
            appweb
          </code>{" "}
          avec&nbsp;:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-neutral-900 p-4 text-xs text-neutral-100">
          {`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
        </pre>
        <p className="mt-4 text-sm text-neutral-600">
          Redémarrez le serveur de dev après modification.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex fs-touch-target items-center justify-center rounded-xl bg-fs-accent px-5 text-sm font-semibold text-white"
        >
          Réessayer la connexion
        </Link>
      </div>
    </div>
  );
}
