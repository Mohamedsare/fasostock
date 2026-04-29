import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales de la plateforme FasoStock.",
  alternates: { canonical: "/mentions-legales" },
};

export default function MentionsLegalesPage() {
  return (
    <main className="min-h-dvh bg-[#f7f8fb] text-[#17253a]">
      <SiteHeader sectionHrefPrefix="/" />
      <article className="mx-auto mt-6 w-full max-w-4xl rounded-3xl border border-black/10 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] sm:mt-8 sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wide text-fs-accent">Mentions légales</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Mentions légales — FasoStock</h1>
        <p className="mt-2 text-sm text-neutral-600">
          <strong>Dernière mise à jour :</strong> Avril 2026
        </p>
        <p className="mt-4 text-sm leading-relaxed text-neutral-700 sm:text-base">
          Les présentes Mentions légales ont pour objet d’informer les utilisateurs du site et de la plateforme{" "}
          <strong>FasoStock</strong> sur l’identité de l’éditeur, les conditions d’hébergement et les informations
          légales relatives à l’utilisation du service.
        </p>

        <section className="mt-6 space-y-6">
          <section>
            <h2 className="text-xl font-black text-[#1f2937]">1. Éditeur de la plateforme</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              La plateforme <strong>FasoStock</strong> est un logiciel de gestion commerciale permettant aux
              commerçants et entreprises de gérer :
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-700 sm:text-base">
              <li>leurs stocks</li>
              <li>leurs ventes</li>
              <li>leurs factures</li>
              <li>leurs produits</li>
              <li>leurs statistiques commerciales.</li>
            </ul>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              FasoStock est actuellement exploité par <strong>une personne physique ou une entité en cours de création</strong>,
              en phase de développement et de déploiement.
            </p>
            <p className="mt-2 text-sm text-neutral-700 sm:text-base">
              <strong>Responsable de la plateforme :</strong>
              <br />
              Mohamed SARE
            </p>
            <p className="mt-2 text-sm text-neutral-700 sm:text-base">
              <strong>Email :</strong>{" "}
              <a className="text-fs-accent underline" href="mailto:contact@fasostock.com">
                contact@fasostock.com
              </a>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Le responsable de la plateforme assure la conception, le développement et la gestion technique du service
              FasoStock.
            </p>
          </section>

          <Section
            title="2. Statut du service"
            paragraphs={["FasoStock est une solution SaaS (Software as a Service) accessible en ligne via :"]}
            bullets={["application web", "application mobile", "application desktop."]}
            footParagraphs={[
              "La plateforme peut être exploitée à titre individuel ou dans le cadre d’une future structure juridique.",
              "L’utilisation du service implique l’acceptation :",
            ]}
            footBullets={[
              "des Conditions d’utilisation",
              "de la Politique de confidentialité",
              "des autres documents légaux publiés sur le site.",
            ]}
          />

          <Section
            title="3. Hébergement"
            paragraphs={[
              "Le site et l’application FasoStock sont hébergés par des prestataires d’hébergement cloud.",
              "Les infrastructures peuvent inclure des services fournis par :",
            ]}
            bullets={[
              "Vercel Inc. (hébergement d’applications web)",
              "Supabase (base de données et infrastructure backend)",
              "d'autres services cloud nécessaires au fonctionnement de la plateforme.",
            ]}
            footParagraphs={["Ces prestataires assurent :"]}
            footBullets={[
              "la disponibilité de l’infrastructure",
              "la sécurité des données",
              "la gestion des serveurs.",
            ]}
          />

          <Section
            title="4. Propriété intellectuelle"
            paragraphs={["L’ensemble des éléments présents sur la plateforme FasoStock est protégé par les lois relatives à la propriété intellectuelle, notamment :"]}
            bullets={[
              "le logiciel",
              "le code source",
              "l’interface utilisateur",
              "les logos",
              "le design",
              "les textes",
              "la documentation.",
            ]}
            endParagraph="Toute reproduction, distribution, modification ou exploitation non autorisée de ces éléments est strictement interdite."
          />

          <Section
            title="5. Responsabilité"
            paragraphs={["FasoStock met tout en œuvre pour assurer la fiabilité et la disponibilité de la plateforme.", "Toutefois, FasoStock ne peut garantir :"]}
            bullets={[
              "l’absence totale d’erreurs",
              "l’absence d’interruption du service",
              "la disponibilité permanente du système.",
            ]}
            footParagraphs={["L’utilisateur reconnaît utiliser la plateforme sous sa propre responsabilité.", "FasoStock ne pourra être tenu responsable des dommages résultant :"]}
            footBullets={[
              "d’une mauvaise utilisation du service",
              "d’une interruption temporaire du système",
              "d’un problème technique indépendant de sa volonté.",
            ]}
          />

          <Section
            title="6. Données des utilisateurs"
            paragraphs={["Les données enregistrées par les utilisateurs dans FasoStock restent leur propriété.", "FasoStock s’engage à :"]}
            bullets={["protéger ces données", "ne pas les vendre", "ne pas les utiliser à des fins commerciales sans autorisation."]}
            endParagraph="Les modalités de traitement des données sont détaillées dans la Politique de confidentialité."
          />

          <Section
            title="7. Liens externes"
            paragraphs={["La plateforme FasoStock peut contenir des liens vers des sites externes.", "FasoStock ne peut être tenu responsable :"]}
            bullets={[
              "du contenu de ces sites",
              "de leurs pratiques en matière de confidentialité",
              "de leurs conditions d’utilisation.",
            ]}
          />

          <Section
            title="8. Droit applicable"
            paragraphs={[
              "Les présentes Mentions légales sont régies par le droit du Burkina Faso.",
              "En cas de litige relatif à l’utilisation de la plateforme FasoStock, une solution amiable sera recherchée avant toute action judiciaire.",
            ]}
            endParagraph="À défaut d’accord amiable, les juridictions compétentes du Burkina Faso seront seules compétentes."
          />

          <section>
            <h2 className="text-xl font-black text-[#1f2937]">9. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Pour toute question concernant les présentes Mentions légales :
            </p>
            <p className="mt-2 text-sm text-neutral-700 sm:text-base">
              <strong>Email :</strong>{" "}
              <a className="text-fs-accent underline" href="mailto:contact@fasostock.com">
                contact@fasostock.com
              </a>
              <br />
              <strong>Site web :</strong>{" "}
              <a className="text-fs-accent underline" href="https://fasostock.com" target="_blank" rel="noreferrer">
                https://fasostock.com
              </a>
            </p>
          </section>
        </section>
      </article>
    </main>
  );
}

function Section({
  title,
  paragraphs = [],
  bullets = [],
  footParagraphs = [],
  footBullets = [],
  endParagraph,
}: {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  footParagraphs?: string[];
  footBullets?: string[];
  endParagraph?: string;
}) {
  return (
    <section>
      <h2 className="text-xl font-black text-[#1f2937]">{title}</h2>
      {paragraphs.map((p) => (
        <p key={p} className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
          {p}
        </p>
      ))}
      {bullets.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-700 sm:text-base">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {footParagraphs.map((p) => (
        <p key={p} className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
          {p}
        </p>
      ))}
      {footBullets.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-700 sm:text-base">
          {footBullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {endParagraph ? (
        <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
          {endParagraph}
        </p>
      ) : null}
    </section>
  );
}
