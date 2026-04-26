"use client";

import { FsCard, FsPage, FsScreenHeader } from "@/components/ui/fs-screen-primitives";

export default function RestaurantPlaceholderIndexPage() {
  return (
    <FsPage>
      <FsScreenHeader
        title="Restaurant"
        subtitle="Module en cours d'activation. Utilisez le menu pour ouvrir les ecrans deja disponibles."
      />
      <FsCard padding="p-5">
        <p className="text-sm text-neutral-700">
          Cette section sert de point d'entree pour les sous-modules Restaurant.
        </p>
      </FsCard>
    </FsPage>
  );
}
