import type { Metadata } from "next";
import {
  MdPointOfSale,
  MdDescription,
  MdWallet,
  MdInventory2,
  MdTrendingUp,
  MdGroups,
} from "react-icons/md";
import { SeoLandingPage, type SeoFeature, type SeoFaqItem } from "@/components/seo/seo-landing-page";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fasostock.com";
const canonicalUrl = `${siteUrl}/logiciel-caisse-ouagadougou`;

export const metadata: Metadata = {
  title: "Logiciel de Caisse pour Commerces à Ouagadougou | FasoStock",
  description:
    "Logiciel de caisse pour boutiques, pharmacies et épiceries à Ouagadougou. Encaissez, gérez votre stock et suivez vos ventes depuis mobile ou PC.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: "Logiciel de Caisse pour Commerces à Ouagadougou | FasoStock",
    description:
      "Logiciel de caisse enregistreuse pour boutiques et commerces à Ouagadougou. Mobile Money, impression de tickets, gestion de stock intégrée.",
    url: canonicalUrl,
    siteName: "FasoStock",
    locale: "fr_BF",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const features: SeoFeature[] = [
  {
    icon: MdPointOfSale,
    title: "Caisse rapide sur mobile",
    text: "Enregistrez une vente en quelques secondes depuis votre smartphone. Cherchez un produit par nom, référence ou code-barres et encaissez instantanément.",
  },
  {
    icon: MdDescription,
    title: "Impression de tickets et factures",
    text: "Imprimez des reçus professionnels via imprimante thermique Bluetooth ou USB, ou envoyez-les directement par WhatsApp à vos clients.",
  },
  {
    icon: MdWallet,
    title: "Paiements variés acceptés",
    text: "Espèces, Mobile Money (Orange Money, Moov Money), chèques — enregistrez tous vos modes de paiement et suivez vos encaissements par type.",
  },
  {
    icon: MdInventory2,
    title: "Stock connecté à la caisse",
    text: "Chaque vente met automatiquement à jour votre inventaire. Votre stock reflète toujours la réalité en temps réel, sans saisie manuelle.",
  },
  {
    icon: MdTrendingUp,
    title: "Rapport journalier automatique",
    text: "Consultez votre chiffre d'affaires de la journée en un clic. Clôturez votre caisse en fin de journée et comparez vos performances d'un jour à l'autre.",
  },
  {
    icon: MdGroups,
    title: "Accès caissiers sécurisé",
    text: "Chaque caissier a son propre accès et son propre code. Vous contrôlez qui encaisse quoi et quand, avec un historique complet par employé.",
  },
];

const benefits: string[] = [
  "Adapté aux commerces des quartiers de Ouagadougou : Pissy, Gounghin, Tampouy, Dassasgho, Zone du Bois...",
  "Mobile Money intégré : Orange Money et Moov Money gérés nativement",
  "Interface en français, facile à prendre en main en moins de 5 minutes",
  "Ticket de caisse imprimable ou envoyable sur WhatsApp sans imprimante",
  "Clôture de caisse automatique en fin de journée avec rapport complet",
  "Multi-caissiers avec droits et permissions différenciés par rôle",
  "Fonctionne même sans internet — pas de panne, pas d'interruption de ventes",
  "Visible depuis votre téléphone partout où vous êtes, même en déplacement",
];

const faqs: SeoFaqItem[] = [
  {
    q: "Est-ce que FasoStock fonctionne comme une caisse enregistreuse classique ?",
    a: "Oui, mais en beaucoup plus complet. FasoStock remplace la caisse enregistreuse traditionnelle tout en ajoutant la gestion de stock, les crédits clients, les rapports et bien plus — depuis votre smartphone à Ouagadougou.",
  },
  {
    q: "Puis-je imprimer des tickets de caisse à Ouagadougou ?",
    a: "Oui. FasoStock prend en charge l'impression de tickets via imprimantes thermiques Bluetooth ou USB, très courantes dans les commerces à Ouagadougou. Vous pouvez aussi envoyer les reçus par WhatsApp directement depuis l'application.",
  },
  {
    q: "Est-ce que FasoStock prend en charge le Mobile Money ?",
    a: "Oui. Vous pouvez enregistrer les paiements en espèces, par Orange Money, Moov Money et autres moyens. Chaque mode de paiement est tracé dans votre rapport de caisse quotidien.",
  },
  {
    q: "Est-ce adapté pour une pharmacie ou une quincaillerie à Ouagadougou ?",
    a: "Oui. FasoStock est utilisé par des pharmacies, quincailleries, épiceries, boutiques de vêtements, restaurants, salons et bien d'autres types de commerces à Ouagadougou et dans tout le Burkina Faso.",
  },
  {
    q: "Combien de caissiers puis-je avoir sur FasoStock ?",
    a: "Autant que vous en avez besoin. Chaque caissier a son propre accès sécurisé avec ses propres droits. Vous pouvez voir exactement qui a encaissé quoi et quand, depuis votre tableau de bord.",
  },
  {
    q: "Est-ce que je peux voir les ventes de ma boutique à distance ?",
    a: "Oui. Depuis votre téléphone, où que vous soyez à Ouagadougou ou hors de la ville, vous consultez les ventes de votre boutique en temps réel et recevez des résumés journaliers.",
  },
  {
    q: "FasoStock fonctionne-t-il sans internet à Ouagadougou ?",
    a: "Oui. En cas de coupure de réseau, FasoStock continue à fonctionner en mode offline. Vos ventes et mouvements de stock se synchronisent automatiquement dès le retour de la connexion.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "FasoStock",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS, Windows, macOS",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "XOF",
        availability: "https://schema.org/InStock",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "127",
        bestRating: "5",
      },
      url: siteUrl,
      description:
        "Logiciel de caisse enregistreuse pour commerces à Ouagadougou. Ventes, stock, Mobile Money, crédits clients — tout en une application.",
    },
    {
      "@type": "WebPage",
      name: "Logiciel de Caisse pour Commerces à Ouagadougou",
      description:
        "FasoStock — logiciel de caisse pour boutiques et commerces à Ouagadougou. Mobile Money, impression tickets, gestion stock intégrée.",
      url: canonicalUrl,
      inLanguage: "fr",
      isPartOf: { "@type": "WebSite", url: siteUrl, name: "FasoStock" },
    },
    {
      "@type": "LocalBusiness",
      name: "FasoStock",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Ouagadougou",
        addressCountry: "BF",
      },
      url: siteUrl,
      telephone: "+22664712044",
      description: "Logiciel de gestion de stock et de caisse pour commerces au Burkina Faso.",
    },
  ],
};

export default function LogicielCaisseOuagadougou() {
  return (
    <SeoLandingPage
      badge="Logiciel de Caisse · Ouagadougou"
      h1="Le logiciel de caisse préféré des commerçants à Ouagadougou"
      heroSubtitle="Encaissez vos ventes, gérez votre stock et suivez vos crédits clients depuis votre mobile ou PC. FasoStock est la solution idéale pour tous les types de commerces à Ouagadougou — boutiques, pharmacies, épiceries, restaurants et bien plus."
      features={features}
      benefits={benefits}
      faqs={faqs}
      ctaTitle="Modernisez votre caisse dès aujourd'hui"
      ctaSubtitle="Des centaines de commerçants à Ouagadougou ont déjà adopté FasoStock. Rejoignez-les et simplifiez la gestion de votre commerce."
      jsonLd={jsonLd}
    />
  );
}
