import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: "Conditions d'utilisation de la plateforme FasoStock.",
  alternates: { canonical: "/conditions-utilisation" },
};

export default function ConditionsUtilisationPage() {
  return (
    <main className="min-h-dvh bg-[#f7f8fb] text-[#17253a]">
      <SiteHeader sectionHrefPrefix="/" />
      <article className="mx-auto mt-6 w-full max-w-4xl rounded-3xl border border-black/10 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] sm:mt-8 sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wide text-fs-accent">Conditions d&apos;utilisation</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          1 — Conditions d&apos;utilisation de la plateforme FasoStock
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          <strong>Dernière mise à jour :</strong> Avril 2026
        </p>
        <p className="mt-4 text-sm leading-relaxed text-neutral-700 sm:text-base">
          Les présentes Conditions d&apos;utilisation régissent l&apos;accès et l&apos;utilisation de la plateforme{" "}
          <strong>FasoStock</strong>, une application de gestion commerciale (stocks, ventes, facturation et suivi
          d&apos;activité) destinée aux commerçants et entreprises.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700 sm:text-base">
          En utilisant la plateforme FasoStock, l&apos;utilisateur accepte pleinement les présentes conditions.
        </p>

        <section className="mt-6 space-y-6">
          <Section
            title="1. Objet"
            paragraphs={[
              "Les présentes Conditions d’utilisation ont pour objet de définir les règles d’accès et d’utilisation de la plateforme FasoStock.",
              "FasoStock est une solution numérique permettant notamment :",
            ]}
            bullets={[
              "la gestion des stocks",
              "l’enregistrement des ventes",
              "la génération de factures",
              "le suivi des performances commerciales",
              "la gestion des produits et clients",
              "la synchronisation des données entre appareils",
            ]}
            footParagraphs={[
              "La plateforme peut être utilisée via :",
            ]}
            footBullets={["application web", "application mobile", "application desktop"]}
          />

          <Section
            title="2. Statut de la plateforme"
            paragraphs={[
              "FasoStock est actuellement un logiciel SaaS (Software as a Service) en phase de développement et d'exploitation.",
              "La plateforme peut être exploitée par une personne physique ou une entité en cours de création, et ne constitue pas nécessairement une entreprise enregistrée au moment de son utilisation.",
              "Toutefois, FasoStock s'engage à respecter :",
            ]}
            bullets={[
              "les lois applicables au Burkina Faso",
              "les principes de protection des données",
              "les règles générales du commerce électronique.",
            ]}
          />

          <Section
            title="3. Accès au service"
            paragraphs={["L'accès à FasoStock nécessite :"]}
            bullets={[
              "la création d’un compte utilisateur",
              "la fourniture d’informations exactes",
              "l’acceptation des présentes conditions",
            ]}
            footParagraphs={[
              "L’utilisateur est responsable :",
            ]}
            footBullets={[
              "de la confidentialité de ses identifiants",
              "de toutes les activités réalisées sur son compte.",
            ]}
            endParagraph="FasoStock peut suspendre ou supprimer un compte en cas d'utilisation frauduleuse, de tentative d'intrusion ou d'utilisation abusive du service."
          />

          <Section
            title="4. Description du service"
            paragraphs={["FasoStock fournit notamment les fonctionnalités suivantes :"]}
            bullets={[
              "gestion des produits et du stock",
              "gestion des ventes et factures",
              "génération de tickets ou factures imprimables",
              "tableaux de bord et statistiques",
              "synchronisation des données",
              "gestion multi-magasins",
              "gestion des utilisateurs et permissions.",
            ]}
            endParagraph="Certaines fonctionnalités peuvent évoluer, être modifiées ou supprimées afin d'améliorer la plateforme."
          />

          <Section
            title="5. Abonnements"
            paragraphs={["FasoStock peut proposer différents types d’abonnements, notamment :"]}
            bullets={["Essai gratuit", "Abonnement mensuel", "Abonnement annuel"]}
            footParagraphs={[
              "Les tarifs sont affichés sur le site officiel de FasoStock.",
              "L’utilisateur peut souscrire, modifier ou annuler son abonnement conformément aux modalités indiquées sur la plateforme.",
            ]}
          />

          <Section
            title="6. Responsabilité de l’utilisateur"
            paragraphs={["L’utilisateur s’engage à :"]}
            bullets={[
              "utiliser FasoStock de manière légale",
              "ne pas utiliser la plateforme pour des activités frauduleuses",
              "respecter les lois fiscales et commerciales de son pays",
              "ne pas tenter de pirater ou perturber le service.",
            ]}
            footParagraphs={["L’utilisateur est seul responsable :"]}
            footBullets={[
              "de l’exactitude des données enregistrées",
              "des factures générées",
              "de l’utilisation commerciale de la plateforme.",
            ]}
          />

          <Section
            title="7. Données et confidentialité"
            paragraphs={[
              "Les données enregistrées sur FasoStock appartiennent à l’utilisateur.",
              "FasoStock peut stocker certaines données nécessaires au fonctionnement du service, notamment :",
            ]}
            bullets={["informations du compte", "produits", "ventes", "statistiques d’utilisation."]}
            footParagraphs={[
              "Ces données sont utilisées uniquement pour :",
            ]}
            footBullets={[
              "le fonctionnement de la plateforme",
              "l’amélioration du service",
              "la sécurité du système.",
            ]}
            endParagraph="La gestion des données est détaillée dans la Politique de confidentialité."
          />

          <Section
            title="8. Disponibilité du service"
            paragraphs={[
              "FasoStock s’efforce de maintenir un service disponible en permanence.",
              "Cependant, la plateforme peut être temporairement indisponible en cas de maintenance, de mise à jour, de problème technique ou de force majeure.",
            ]}
            endParagraph="FasoStock ne peut être tenu responsable des pertes résultant d'une interruption temporaire du service."
          />

          <Section
            title="9. Propriété intellectuelle"
            paragraphs={["Tous les éléments de la plateforme FasoStock sont protégés par le droit de la propriété intellectuelle, notamment :"]}
            bullets={["le logiciel", "l’interface", "les logos", "le design", "la documentation."]}
            endParagraph="Toute reproduction, copie ou distribution sans autorisation est interdite."
          />

          <Section
            title="10. Limitation de responsabilité"
            paragraphs={["FasoStock est un outil de gestion, et ne remplace pas :"]}
            bullets={["un expert-comptable", "un conseil juridique", "une autorité fiscale."]}
            footParagraphs={["L’utilisateur reste responsable de :"]}
            footBullets={[
              "ses déclarations fiscales",
              "la conformité de ses factures",
              "la gestion de son activité commerciale.",
            ]}
            endParagraph="FasoStock ne pourra être tenu responsable des pertes financières ou commerciales résultant de l’utilisation de la plateforme."
          />

          <Section
            title="11. Suspension ou résiliation"
            paragraphs={["FasoStock se réserve le droit de suspendre ou supprimer un compte en cas :"]}
            bullets={["de violation des présentes conditions", "d'utilisation frauduleuse", "de tentative d’attaque informatique."]}
            endParagraph="L’utilisateur peut également supprimer son compte à tout moment."
          />

          <Section
            title="12. Modification des conditions"
            paragraphs={["Les présentes conditions peuvent être modifiées à tout moment afin :"]}
            bullets={["d'améliorer le service", "de se conformer aux évolutions légales."]}
            endParagraph="Les utilisateurs seront informés en cas de modification importante."
          />

          <Section
            title="13. Droit applicable"
            paragraphs={[
              "Les présentes Conditions d’utilisation sont régies par le droit burkinabè.",
              "En cas de litige, une solution amiable sera privilégiée.",
            ]}
            endParagraph="À défaut d’accord amiable, les tribunaux compétents du Burkina Faso seront seuls compétents."
          />

          <section>
            <h2 className="text-xl font-black text-[#1f2937]">14. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
              Pour toute question concernant ces Conditions d’utilisation :
            </p>
            <p className="mt-2 text-sm text-neutral-700 sm:text-base">
              <strong>Email :</strong> <a className="text-fs-accent underline" href="mailto:contact@fasostock.com">contact@fasostock.com</a>
              <br />
              <strong>Site :</strong> <a className="text-fs-accent underline" href="https://fasostock.com" target="_blank" rel="noreferrer">https://fasostock.com</a>
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
