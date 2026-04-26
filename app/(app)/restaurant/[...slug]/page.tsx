"use client";

import { FsCard, FsPage, FsScreenHeader } from "@/components/ui/fs-screen-primitives";

type Params = { slug?: string[] };

function toTitleCase(v: string): string {
  return v
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export default function RestaurantPlaceholderPage({
  params,
}: {
  params: Params;
}) {
  const slug = params.slug ?? [];
  const label = slug.length > 0 ? slug.map(toTitleCase).join(" / ") : "Restaurant";

  return (
    <FsPage>
      <FsScreenHeader
        title={label}
        subtitle="Ecran restaurant en cours de conception (UI/UX et logique metier)."
      />
      <FsCard padding="p-5">
        <p className="text-sm text-neutral-700">
          Cette page sera livree dans les prochaines etapes de l'adaptation restaurant.
        </p>
      </FsCard>
    </FsPage>
  );
}
