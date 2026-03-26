type PlaceholderScreenProps = {
  title: string;
  description?: string;
};

export function PlaceholderScreen({
  title,
  description = "Écran en cours d’implémentation — même logique métier que l’app mobile (TanStack Query + Supabase + outbox).",
}: PlaceholderScreenProps) {
  return (
    <div className="px-4 pt-5 sm:px-6 sm:pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-fs-accent">
        FasoStock Web
      </p>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-fs-text sm:text-2xl">
        {title}
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-neutral-600 sm:text-base">
        {description}
      </p>
    </div>
  );
}
