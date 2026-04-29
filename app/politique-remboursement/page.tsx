import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "Politique de remboursement",
  description: "Politique de remboursement de la plateforme FasoStock.",
  alternates: { canonical: "/politique-remboursement" },
};

export default function PolitiqueRemboursementPage() {
  return (
    <main className="min-h-dvh bg-[#f7f8fb] text-[#17253a]">
      <SiteHeader sectionHrefPrefix="/" />
      <article className="mx-auto mt-6 w-full max-w-4xl rounded-3xl border border-black/10 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] sm:mt-8 sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wide text-fs-accent">Politique de remboursement</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          Politique de remboursement — FasoStock
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          <strong>Dernière mise à jour :</strong> Avril 2026
        </p>
        <p className="mt-4 text-sm leading-relaxed text-neutral-700 sm:text-base">
          La présente Politique de remboursement définit les conditions dans lesquelles les utilisateurs peuvent
          demander un remboursement des abonnements ou paiements effectués pour l’utilisation de la plateforme{" "}
          <strong>FasoStock</strong>.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700 sm:text-base">
          En utilisant FasoStock et en souscrivant à un abonnement payant, l’utilisateur accepte les conditions
          décrites dans cette politique.
        </p>

        <section className="mt-6 space-y-6">
          <Section
            title="1. Nature du service"
            paragraphs={[
              "FasoStock est une solution SaaS (Software as a Service) accessible en ligne permettant aux commerçants et entreprises de gérer notamment :",
            ]}
            bullets={[
              "leurs stocks",
              "leurs ventes",
              "leurs factures",
              "leurs produits",
              "leurs statistiques commerciales.",
            ]}
            endParagraph="L’accès au service est fourni sous forme d’abonnement, ce qui donne accès aux fonctionnalités de la plateforme pendant une période déterminée."
          />

          <Section
            title="2. Période d’essai gratuite"
            paragraphs={[
              "FasoStock peut proposer une période d’essai gratuite permettant aux utilisateurs de tester les fonctionnalités de la plateforme avant toute souscription payante.",
              "Pendant cette période :",
            ]}
            bullets={[
              "aucun paiement n’est exigé",
              "l’utilisateur peut tester librement la plateforme",
              "l’utilisateur peut décider de ne pas poursuivre l’utilisation du service.",
            ]}
            endParagraph="La période d’essai vise à permettre aux utilisateurs d’évaluer si la solution correspond à leurs besoins avant de payer."
          />

          <Section
            title="3. Conditions générales de remboursement"
            paragraphs={[
              "En raison de la nature numérique et immédiatement accessible du service, les paiements effectués pour un abonnement FasoStock sont en principe non remboursables.",
              "Toutefois, un remboursement peut être envisagé dans les cas suivants :",
            ]}
            bullets={[
              "paiement effectué par erreur",
              "double paiement",
              "dysfonctionnement majeur empêchant l’utilisation du service",
              "problème technique grave non résolu dans un délai raisonnable.",
            ]}
            endParagraph="Chaque demande de remboursement est étudiée au cas par cas."
          />

          <Section
            title="4. Délai de demande de remboursement"
            paragraphs={["Toute demande de remboursement doit être adressée dans un délai maximum de :"]}
            endParagraph="7 jours après le paiement."
            extraParagraph="Au-delà de ce délai, aucune demande de remboursement ne pourra être acceptée sauf situation exceptionnelle."
          />

          <Section
            title="5. Procédure de demande"
            paragraphs={[
              "Pour demander un remboursement, l’utilisateur doit contacter FasoStock en fournissant les informations suivantes :",
            ]}
            bullets={[
              "nom du compte utilisateur",
              "adresse email utilisée sur la plateforme",
              "date du paiement",
              "montant du paiement",
              "description du problème rencontré.",
            ]}
            endParagraph="La demande doit être envoyée à l’adresse suivante :"
            extraParagraph="Email : contact@fasostock.com"
          />

          <Section
            title="6. Traitement des demandes"
            paragraphs={["Après réception de la demande :"]}
            bullets={[
              "FasoStock analysera la situation",
              "des informations supplémentaires peuvent être demandées",
              "une réponse sera fournie dans un délai raisonnable.",
            ]}
            endParagraph="Si le remboursement est accepté, celui-ci sera effectué via le même moyen de paiement utilisé lors de la transaction, lorsque cela est possible."
          />

          <Section
            title="7. Résiliation de l’abonnement"
            paragraphs={["L’utilisateur peut résilier son abonnement à tout moment.", "La résiliation :"]}
            bullets={[
              "empêche le renouvellement automatique de l’abonnement",
              "n’entraîne pas de remboursement pour la période déjà payée.",
            ]}
            endParagraph="L’utilisateur conserve l’accès au service jusqu’à la fin de la période d’abonnement en cours."
          />

          <Section
            title="8. Cas de fraude ou d’abus"
            paragraphs={["FasoStock se réserve le droit de refuser un remboursement en cas :"]}
            bullets={[
              "de tentative de fraude",
              "d’utilisation abusive du système",
              "de violation des Conditions d’utilisation.",
            ]}
          />

          <Section
            title="9. Modification de la politique"
            paragraphs={["FasoStock peut modifier cette Politique de remboursement à tout moment afin de :"]}
            bullets={[
              "améliorer la transparence",
              "adapter les conditions aux évolutions du service",
              "se conformer aux obligations légales.",
            ]}
            endParagraph="La version la plus récente sera toujours disponible sur le site FasoStock."
          />

          <section>
            <h2 className="text-xl font-black text-[#1f2937]">10. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Pour toute question concernant la Politique de remboursement :
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
  endParagraph,
  extraParagraph,
}: {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  endParagraph?: string;
  extraParagraph?: string;
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
      {endParagraph ? (
        <p className="mt-2 text-sm leading-relaxed font-semibold text-neutral-800 sm:text-base">{endParagraph}</p>
      ) : null}
      {extraParagraph ? (
        <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">{extraParagraph}</p>
      ) : null}
    </section>
  );
}
