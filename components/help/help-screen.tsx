"use client";

import { FsCard, FsPage } from "@/components/ui/fs-screen-primitives";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { Package, Rocket, Settings, ShoppingCart } from "lucide-react";

const SECTIONS: {
  title: string;
  icon: typeof Rocket;
  items: string[];
}[] = [
  {
    title: "Démarrage",
    icon: Rocket,
    items: [
      "Sélectionnez votre entreprise et la boutique dans la barre du haut.",
      "Le tableau de bord affiche les indicateurs (ventes, stock).",
      "Utilisez le menu pour accéder aux Produits, Ventes, Stock, Clients.",
    ],
  },
  {
    title: "Ventes",
    icon: ShoppingCart,
    items: [
      "Caisse rapide : ventes rapides avec ticket thermique.",
      "Facture A4 : ventes détaillées avec facture PDF personnalisable.",
      "Historique des ventes : consultez, réimprimez ou téléchargez les factures.",
    ],
  },
  {
    title: "Produits et stock",
    icon: Package,
    items: [
      "Produits : créez, modifiez, importez en CSV (modèle exportable).",
      "Stock : ajustez les quantités, transférez entre boutiques.",
      "Alertes : consultez les ruptures (menu Stock alertes pour les caissiers).",
    ],
  },
  {
    title: "Paramètres",
    icon: Settings,
    items: [
      "Paramétrage facture A4 : logo, slogan, signataire (par boutique).",
      "Caisse rapide : impression automatique, type de quantité (+/- ou champ).",
      "Abonnement : consultez votre plan dans Paramètres.",
    ],
  },
];

export function HelpScreen() {
  const { helpers, isLoading } = usePermissions();
  const isOwner = helpers?.isOwner ?? false;

  if (isLoading) {
    return (
      <FsPage>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
        </div>
      </FsPage>
    );
  }

  if (!isOwner) {
    return (
      <FsPage>
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
          <p className="max-w-md text-sm leading-relaxed text-neutral-700">
            Cette section est réservée au propriétaire de l&apos;entreprise.
          </p>
        </div>
      </FsPage>
    );
  }

  return (
    <FsPage>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight text-fs-text min-[900px]:text-2xl">
          Aide
        </h1>
      </header>

      <p className="mb-6 text-base font-semibold leading-snug text-fs-accent">
        Bienvenue dans FasoStock. Voici l&apos;essentiel pour bien démarrer.
      </p>

      <div className="flex flex-col gap-6">
        {SECTIONS.map((section) => (
          <FsCard key={section.title} padding="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <section.icon
                className="h-6 w-6 shrink-0 text-fs-accent"
                strokeWidth={2}
                aria-hidden
              />
              <h2 className="text-base font-bold text-fs-text sm:text-lg">{section.title}</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {section.items.map((line) => (
                <li key={line} className="flex gap-2 text-sm leading-relaxed text-neutral-800">
                  <span className="shrink-0 font-semibold text-fs-accent" aria-hidden>
                    •
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </FsCard>
        ))}
      </div>
    </FsPage>
  );
}
