import type { Metadata } from "next";
import {
  MdInventory2,
  MdPointOfSale,
  MdCreditCard,
  MdTrendingUp,
  MdWifiOff,
  MdStorefront,
} from "react-icons/md";
import { SeoLandingPage, type SeoFeature, type SeoFaqItem } from "@/components/seo/seo-landing-page";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fasostock.com";
const canonicalUrl = `${siteUrl}/logiciel-gestion-stock-burkina-faso`;

export const metadata: Metadata = {
  title: "Logiciel de Gestion de Stock au Burkina Faso | FasoStock",
  description:
    "Gérez stock, ventes et caisse avec FasoStock, le logiciel de gestion de stock N°1 au Burkina Faso. Simple, rapide et adapté aux commerçants.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: "Logiciel de Gestion de Stock au Burkina Faso | FasoStock",
    description:
      "Gérez votre stock, vos ventes et votre caisse avec FasoStock — le logiciel de gestion de stock N°1 au Burkina Faso.",
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
    icon: MdInventory2,
    title: "Gestion de stock en temps réel",
    text: "Suivez chaque entrée et sortie de marchandise. Recevez des alertes automatiques quand un produit est sur le point de manquer. Fini les ruptures de stock surprises.",
  },
  {
    icon: MdPointOfSale,
    title: "Caisse enregistreuse sur mobile",
    text: "Encaissez vos ventes rapidement depuis votre smartphone ou ordinateur. Interface intuitive, pensée pour aller vite même aux heures de pointe.",
  },
  {
    icon: MdCreditCard,
    title: "Suivi des crédits clients",
    text: "Gérez les dettes de vos clients, envoyez des rappels et encaissez les remboursements facilement. Ne perdez plus un seul franc CFA de crédit.",
  },
  {
    icon: MdTrendingUp,
    title: "Rapports de ventes détaillés",
    text: "Consultez vos chiffres journaliers, hebdomadaires et mensuels en un clic. Identifiez vos produits les plus vendus et prenez de meilleures décisions commerciales.",
  },
  {
    icon: MdWifiOff,
    title: "Mode hors ligne intégré",
    text: "Continuez à vendre et gérer votre stock même sans connexion internet. Vos données se synchronisent automatiquement dès que le réseau revient.",
  },
  {
    icon: MdStorefront,
    title: "Gestion multi-boutiques",
    text: "Pilotez toutes vos boutiques depuis un seul compte. Idéal pour les commerçants qui ont plusieurs points de vente à Ouagadougou, Bobo-Dioulasso ou ailleurs.",
  },
];

const benefits: string[] = [
  "Conçu spécialement pour les commerçants du Burkina Faso et d'Afrique de l'Ouest",
  "Interface entièrement en français, simple et intuitive, même pour les non-techniciens",
  "Fonctionne sur téléphone Android, iPhone, tablette et ordinateur Windows ou Mac",
  "Mode offline intégré : pas de connexion internet ne signifie pas d'interruption d'activité",
  "Données 100 % sécurisées et sauvegardées automatiquement dans le cloud",
  "Prix accessibles et adaptés aux réalités économiques des petits et moyens commerces",
  "Support client disponible sur WhatsApp en français, réponse rapide garantie",
  "Mis à jour régulièrement sans frais supplémentaires, toujours la meilleure version",
];

const faqs: SeoFaqItem[] = [
  {
    q: "Est-ce que FasoStock fonctionne sans internet au Burkina Faso ?",
    a: "Oui. FasoStock dispose d'un mode hors ligne complet. Vous pouvez encaisser vos ventes, enregistrer des entrées de stock et gérer vos clients même sans connexion. Tout se synchronise automatiquement dès que vous retrouvez internet.",
  },
  {
    q: "En combien de temps puis-je démarrer avec FasoStock ?",
    a: "En moins de 5 minutes. Il suffit de créer votre compte, d'ajouter vos produits et vous êtes prêt à vendre. Aucune installation complexe n'est requise — tout fonctionne depuis votre navigateur.",
  },
  {
    q: "FasoStock est-il adapté aux petits commerces burkinabè ?",
    a: "Absolument. FasoStock a été pensé pour les boutiques, épiceries, quincailleries, pharmacies, grossistes et tous types de commerces. L'interface est simple même si vous n'êtes pas habitué aux logiciels informatiques.",
  },
  {
    q: "Combien coûte FasoStock au Burkina Faso ?",
    a: "Vous commencez avec un essai gratuit sans carte bancaire. Ensuite, des abonnements abordables sont disponibles, adaptés à la taille de votre commerce. Pas de frais cachés, résiliation à tout moment.",
  },
  {
    q: "Puis-je gérer plusieurs boutiques avec un seul compte ?",
    a: "Oui. Vous pouvez gérer plusieurs boutiques ou points de vente depuis un seul tableau de bord, idéal pour les commerçants qui ont plusieurs emplacements à Ouagadougou, Bobo-Dioulasso, Koudougou ou ailleurs.",
  },
  {
    q: "Est-ce que mes données commerciales sont protégées ?",
    a: "Oui. Toutes vos données sont chiffrées et sauvegardées dans le cloud. En cas de perte ou de changement de téléphone, vos données restent accessibles depuis n'importe quel appareil.",
  },
  {
    q: "Comment contacter le support de FasoStock ?",
    a: "Vous pouvez nous contacter directement sur WhatsApp au +226 64 71 20 44. Notre équipe répond rapidement en français, du lundi au samedi.",
  },
  {
    q: "FasoStock fonctionne-t-il sur Android et iPhone ?",
    a: "Oui. FasoStock fonctionne sur Android, iOS, tablette et ordinateur via un navigateur web. Vous pouvez aussi l'installer comme une application (PWA) sur votre téléphone, sans passer par le Play Store.",
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
        "Logiciel de gestion de stock N°1 au Burkina Faso. Gérez ventes, inventaire, crédits clients et caisse depuis mobile ou PC.",
    },
    {
      "@type": "WebPage",
      name: "Logiciel de Gestion de Stock au Burkina Faso",
      description:
        "FasoStock — logiciel de gestion de stock pour commerces au Burkina Faso. Simple, rapide, fonctionne hors ligne.",
      url: canonicalUrl,
      inLanguage: "fr",
      isPartOf: { "@type": "WebSite", url: siteUrl, name: "FasoStock" },
    },
  ],
};

export default function LogicielGestionStockBurkinaFaso() {
  return (
    <SeoLandingPage
      badge="Logiciel N°1 · Burkina Faso"
      h1="Le logiciel de gestion de stock N°1 au Burkina Faso"
      heroSubtitle="FasoStock aide les commerçants burkinabè à gérer leur stock, leurs ventes, leurs crédits clients et leur caisse depuis un téléphone ou un ordinateur. Simple, rapide, disponible même sans internet."
      features={features}
      benefits={benefits}
      faqs={faqs}
      ctaTitle="Commencez à gérer votre stock dès aujourd'hui"
      ctaSubtitle="Rejoignez des centaines de commerçants burkinabè qui font confiance à FasoStock pour gérer leur activité au quotidien."
      jsonLd={jsonLd}
    />
  );
}
