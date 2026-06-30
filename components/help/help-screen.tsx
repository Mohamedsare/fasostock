"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MdOndemandVideo, MdPlayCircle } from "react-icons/md";
import { FsCard, FsPage } from "@/components/ui/fs-screen-primitives";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { ModuleIcon } from "@/components/tutorials/module-icon";
import { TutorialPlayerDialog } from "@/components/help/tutorial-player-dialog";
import { listActiveTutorials } from "@/lib/features/tutorials/api";
import { TUTORIAL_MODULES, tutorialModuleLabel } from "@/lib/features/tutorials/modules";
import { parseYouTubeId, youTubeThumbUrl } from "@/lib/features/tutorials/youtube";
import type { Tutorial } from "@/lib/features/tutorials/types";
import { cn } from "@/lib/utils/cn";
import { Mail, Package, Rocket, Settings, ShoppingCart } from "lucide-react";
import Image from "next/image";

/** Support FasoStock — WhatsApp et téléphone (mêmes numéros). */
const FASOSTOCK_EMAIL = "contact@mohamedsare.com";

const FASOSTOCK_PHONES: { display: string; waDigits: string; telHref: string }[] = [
  { display: "+212 771 66 80 79", waDigits: "212771668079", telHref: "tel:+212771668079" },
  { display: "+226 64712044", waDigits: "22664712044", telHref: "tel:+22664712044" },
];

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
      "Produits : créez, modifiez, importez en CSV (modèle Excel ou CSV exportable).",
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

function ContactFasoStockCard() {
  return (
    <FsCard padding="p-4 sm:p-5">
      <h2 className="text-base font-bold text-fs-text sm:text-lg">Contacter FasoStock</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Besoin d&apos;aide ? Écrivez-nous par e-mail ou joignez-nous sur WhatsApp (mêmes numéros pour un appel
        vocal).
      </p>
      <div className="mt-4 space-y-3">
        {FASOSTOCK_PHONES.map((p) => (
          <div
            key={p.waDigits}
            className="flex flex-col gap-2 rounded-xl border border-black/[0.08] bg-fs-surface-container p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <a
              href={`https://wa.me/${p.waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ouvrir WhatsApp — ${p.display}`}
              className="fs-touch-target inline-flex w-fit max-w-full min-w-0 items-center gap-2.5 self-start rounded-lg px-1 py-1 text-sm font-semibold transition-opacity active:opacity-90"
              style={{ color: "#25D366" }}
            >
              <span className="relative block size-6 shrink-0 overflow-hidden" aria-hidden>
                <Image
                  src="/whatsapplogo.svg"
                  alt=""
                  fill
                  sizes="24px"
                  className="object-contain object-center"
                />
              </span>
              <span className="min-w-0">
                WhatsApp <span className="text-neutral-500">·</span> {p.display}
              </span>
            </a>
            <a
              href={p.telHref}
              className="shrink-0 text-sm font-medium text-fs-accent underline-offset-2 hover:underline sm:text-right"
            >
              Appeler
            </a>
          </div>
        ))}
        <a
          href={`mailto:${FASOSTOCK_EMAIL}`}
          className="fs-touch-target flex items-center gap-2.5 rounded-xl border border-black/[0.08] bg-fs-surface-container px-3 py-3 text-sm font-semibold text-fs-accent transition-colors hover:bg-black/[0.02]"
        >
          <Mail className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="min-w-0 break-all">{FASOSTOCK_EMAIL}</span>
        </a>
      </div>
    </FsCard>
  );
}

function TutorialCard({
  tutorial,
  onPlay,
}: {
  tutorial: Tutorial;
  onPlay: () => void;
}) {
  const id = parseYouTubeId(tutorial.youtubeUrl);
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-fs-card text-left shadow-sm transition-transform active:scale-[0.99]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-200">
        {id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={youTubeThumbUrl(id)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <MdPlayCircle className="h-12 w-12 text-white drop-shadow-lg" aria-hidden />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-fs-accent/10 px-2 py-0.5 text-[10px] font-semibold text-fs-accent">
          <ModuleIcon moduleKey={tutorial.moduleKey} className="h-3 w-3" />
          {tutorialModuleLabel(tutorial.moduleKey)}
        </span>
        <p className="line-clamp-2 text-sm font-semibold text-fs-text">{tutorial.title}</p>
      </div>
    </button>
  );
}

function TutorialsSection() {
  const q = useQuery({
    queryKey: ["tutorials-active"],
    queryFn: listActiveTutorials,
    staleTime: 5 * 60_000,
  });
  const tutorials = useMemo(() => q.data ?? [], [q.data]);
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [playing, setPlaying] = useState<Tutorial | null>(null);

  const modulesWithTutos = useMemo(
    () => TUTORIAL_MODULES.filter((m) => tutorials.some((t) => t.moduleKey === m.key)),
    [tutorials],
  );

  const visibleModules = useMemo(
    () =>
      moduleFilter === "all"
        ? modulesWithTutos
        : modulesWithTutos.filter((m) => m.key === moduleFilter),
    [modulesWithTutos, moduleFilter],
  );

  return (
    <section className="mb-8">
      <div className="mb-1 flex items-center gap-2">
        <MdOndemandVideo className="h-6 w-6 shrink-0 text-fs-accent" aria-hidden />
        <h2 className="text-lg font-bold text-fs-text">Tutoriels vidéo</h2>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Apprenez chaque module en vidéo, directement ici — sans quitter l&apos;application.
      </p>

      {q.isLoading ? (
        <FsCard padding="p-8">
          <p className="text-center text-sm text-neutral-500">Chargement des tutoriels…</p>
        </FsCard>
      ) : tutorials.length === 0 ? (
        <FsCard padding="py-12 px-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fs-accent/10">
              <MdOndemandVideo className="h-8 w-8 text-fs-accent" aria-hidden />
            </div>
            <p className="text-sm font-medium text-neutral-600">
              Les tutoriels vidéo arrivent bientôt.
            </p>
          </div>
        </FsCard>
      ) : (
        <>
          {/* Filtre par module */}
          <div className="mb-4 flex flex-wrap gap-2">
            <FilterPill
              label="Tous"
              active={moduleFilter === "all"}
              onClick={() => setModuleFilter("all")}
            />
            {modulesWithTutos.map((m) => (
              <FilterPill
                key={m.key}
                label={m.label}
                moduleKey={m.key}
                active={moduleFilter === m.key}
                onClick={() => setModuleFilter(m.key)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {visibleModules.map((m) => {
              const items = tutorials.filter((t) => t.moduleKey === m.key);
              return (
                <div key={m.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <ModuleIcon moduleKey={m.key} className="h-4 w-4 text-neutral-500" />
                    <h3 className="text-sm font-bold text-fs-text">{m.label}</h3>
                    <span className="text-xs text-neutral-400">({items.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 min-[1100px]:grid-cols-3">
                    {items.map((t) => (
                      <TutorialCard key={t.id} tutorial={t} onPlay={() => setPlaying(t)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <TutorialPlayerDialog
        tutorial={playing}
        videoId={playing ? parseYouTubeId(playing.youtubeUrl) : null}
        onClose={() => setPlaying(null)}
      />
    </section>
  );
}

function FilterPill({
  label,
  moduleKey,
  active,
  onClick,
}: {
  label: string;
  moduleKey?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
        active
          ? "border-fs-accent/30 bg-fs-accent/10 font-semibold text-fs-accent"
          : "border-black/[0.08] bg-fs-card text-neutral-700",
      )}
    >
      {moduleKey ? <ModuleIcon moduleKey={moduleKey} className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}

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

  return (
    <FsPage>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight text-fs-text min-[900px]:text-2xl">
          Aide
        </h1>
      </header>

      <TutorialsSection />

      <div className="mb-6 flex flex-col gap-6">
        <ContactFasoStockCard />
      </div>

      {!isOwner ? (
        <p className="max-w-md text-sm leading-relaxed text-neutral-700">
          Le guide détaillé ci-dessous est réservé au propriétaire de l&apos;entreprise. Utilisez les contacts
          ci-dessus pour toute question.
        </p>
      ) : (
        <>
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
        </>
      )}
    </FsPage>
  );
}
