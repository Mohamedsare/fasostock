export default function AppLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-fs-surface-container border-t-fs-accent"
        aria-hidden
      />
      <p className="text-sm text-neutral-600">Chargement…</p>
    </div>
  );
}
