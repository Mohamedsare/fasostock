import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité de la plateforme FasoStock.",
  alternates: { canonical: "/politique-confidentialite" },
};

export default function PolitiqueConfidentialitePage() {
  return (
    <main className="min-h-dvh bg-[#f7f8fb] text-[#17253a]">
      <SiteHeader sectionHrefPrefix="/" />
      <article className="mx-auto mt-6 w-full max-w-4xl rounded-3xl border border-black/10 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] sm:mt-8 sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wide text-fs-accent">Politique de confidentialité</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          Politique de confidentialité — FasoStock
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          <strong>Dernière mise à jour :</strong> Avril 2026
        </p>
        <p className="mt-4 text-sm leading-relaxed text-neutral-700 sm:text-base">
          La présente Politique de confidentialité explique comment <strong>FasoStock</strong> collecte, utilise,
          stocke et protège les données des utilisateurs qui utilisent la plateforme.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700 sm:text-base">
          FasoStock accorde une grande importance à la protection des données personnelles et s&apos;engage à
          respecter les principes de confidentialité conformément aux lois applicables, notamment les dispositions
          relatives à la <strong>protection des données personnelles au Burkina Faso</strong> et les bonnes pratiques
          internationales en matière de sécurité des données.
        </p>

        <section className="mt-6 space-y-6">
          <Section
            title="1. Objet de la politique"
            paragraphs={[
              "Cette Politique de confidentialité a pour objectif d’informer les utilisateurs sur :",
            ]}
            bullets={[
              "les données collectées par FasoStock",
              "la manière dont ces données sont utilisées",
              "les mesures de sécurité mises en place",
              "les droits des utilisateurs concernant leurs données.",
            ]}
            endParagraph="En utilisant la plateforme FasoStock, l’utilisateur accepte les pratiques décrites dans cette politique."
          />

          <section>
            <h2 className="text-xl font-black text-[#1f2937]">2. Données collectées</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              FasoStock peut collecter plusieurs types de données afin d’assurer le bon fonctionnement du service.
            </p>

            <h3 className="mt-4 text-base font-extrabold text-[#1f2937] sm:text-lg">2.1 Informations du compte</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Lors de la création d’un compte, les informations suivantes peuvent être collectées :
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-700 sm:text-base">
              <li>nom et prénom</li>
              <li>adresse email</li>
              <li>numéro de téléphone</li>
              <li>mot de passe (chiffré)</li>
              <li>nom de l’entreprise ou du commerce</li>
              <li>pays et ville.</li>
            </ul>

            <h3 className="mt-4 text-base font-extrabold text-[#1f2937] sm:text-lg">
              2.2 Données liées à l’activité commerciale
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Dans le cadre de l’utilisation du service, FasoStock peut stocker :
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-700 sm:text-base">
              <li>produits</li>
              <li>catégories</li>
              <li>stocks</li>
              <li>ventes</li>
              <li>factures</li>
              <li>clients</li>
              <li>fournisseurs</li>
              <li>statistiques commerciales.</li>
            </ul>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Ces données sont fournies directement par l’utilisateur.
            </p>

            <h3 className="mt-4 text-base font-extrabold text-[#1f2937] sm:text-lg">2.3 Données techniques</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Afin d&apos;assurer la sécurité et l’amélioration de la plateforme, certaines informations techniques
              peuvent être collectées :
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-700 sm:text-base">
              <li>adresse IP</li>
              <li>type d’appareil</li>
              <li>navigateur utilisé</li>
              <li>système d’exploitation</li>
              <li>journaux d’utilisation de la plateforme.</li>
            </ul>
          </section>

          <Section
            title="3. Utilisation des données"
            paragraphs={["Les données collectées sont utilisées uniquement pour les finalités suivantes :"]}
            bullets={[
              "création et gestion du compte utilisateur",
              "fonctionnement de la plateforme",
              "gestion des stocks et ventes",
              "synchronisation des données entre appareils",
              "amélioration de l’expérience utilisateur",
              "sécurité du système",
              "assistance technique.",
            ]}
            endParagraph="FasoStock ne vend pas les données personnelles des utilisateurs."
          />

          <Section
            title="4. Conservation des données"
            paragraphs={["Les données des utilisateurs sont conservées pendant toute la durée d’utilisation du service.", "En cas de suppression du compte :"]}
            bullets={[
              "les données peuvent être supprimées définitivement",
              "certaines données peuvent être conservées temporairement pour des raisons légales ou de sécurité.",
            ]}
          />

          <Section
            title="5. Partage des données"
            paragraphs={["FasoStock ne partage pas les données personnelles avec des tiers sauf dans les cas suivants :"]}
            bullets={[
              "obligation légale",
              "demande d’une autorité compétente",
              "protection contre la fraude ou les activités illégales",
              "services techniques nécessaires au fonctionnement de la plateforme.",
            ]}
            footParagraphs={["Les prestataires techniques peuvent inclure :"]}
            footBullets={["services d’hébergement", "services de stockage", "services d’analyse technique."]}
            endParagraph="Ces prestataires sont soumis à des obligations de confidentialité."
          />

          <Section
            title="6. Sécurité des données"
            paragraphs={["FasoStock met en œuvre des mesures techniques et organisationnelles pour protéger les données, notamment :"]}
            bullets={[
              "chiffrement des communications (HTTPS)",
              "sécurisation des bases de données",
              "contrôle des accès",
              "protection contre les intrusions",
              "surveillance des activités suspectes.",
            ]}
            endParagraph="Malgré ces mesures, aucun système informatique ne peut garantir une sécurité absolue."
          />

          <Section
            title="7. Cookies et technologies similaires"
            paragraphs={["La plateforme FasoStock peut utiliser des cookies afin de :"]}
            bullets={[
              "maintenir la session utilisateur",
              "améliorer les performances du site",
              "analyser l’utilisation de la plateforme.",
            ]}
            footParagraphs={[
              "L’utilisateur peut configurer son navigateur pour refuser certains cookies.",
            ]}
            endParagraph="Cependant, certaines fonctionnalités pourraient ne pas fonctionner correctement."
          />

          <Section
            title="8. Droits des utilisateurs"
            paragraphs={["Les utilisateurs disposent de plusieurs droits concernant leurs données :"]}
            bullets={[
              "droit d’accès aux données",
              "droit de rectification",
              "droit de suppression",
              "droit de limitation du traitement.",
            ]}
            endParagraph="Toute demande peut être adressée à FasoStock via les coordonnées de contact."
          />

          <Section
            title="9. Protection des données commerciales"
            paragraphs={[
              "Les données commerciales enregistrées dans FasoStock (stocks, ventes, factures) restent la propriété exclusive de l’utilisateur.",
            ]}
            endParagraph="FasoStock n’utilise pas ces données à des fins commerciales sans l’autorisation de l’utilisateur."
          />

          <Section
            title="10. Modification de la politique"
            paragraphs={["FasoStock peut modifier cette Politique de confidentialité à tout moment afin de :"]}
            bullets={[
              "améliorer la transparence",
              "s’adapter aux évolutions techniques",
              "se conformer aux obligations légales.",
            ]}
            endParagraph="La date de mise à jour sera indiquée en haut du document."
          />

          <section>
            <h2 className="text-xl font-black text-[#1f2937]">11. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Pour toute question concernant cette Politique de confidentialité, les utilisateurs peuvent contacter
              FasoStock à l’adresse suivante :
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
