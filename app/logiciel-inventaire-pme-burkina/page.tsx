import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site-url";
import {
  MdInventory2,
  MdNotifications,
  MdGroups,
  MdSync,
  MdTrendingUp,
  MdDescription,
} from "react-icons/md";
import { SeoLandingPage, type SeoFeature, type SeoFaqItem } from "@/components/seo/seo-landing-page";

const siteUrl = SITE_URL;
const path = "/logiciel-inventaire-pme-burkina";
const canonicalUrl = `${siteUrl}${path}`;

export const metadata: Metadata = {
  title: { absolute: "Logiciel d'Inventaire pour PME au Burkina Faso | FasoStock" },
  description:
    "Gérez l'inventaire de votre PME au Burkina Faso : alertes de rupture, valorisation de stock et rapports. Pensé pour artisans et commerçants burkinabè.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: "Logiciel d'Inventaire pour PME au Burkina Faso | FasoStock",
    description:
      "FasoStock remplace Excel et les carnets pour les PME du Burkina Faso. Inventaire en temps réel, alertes de rupture, gestion fournisseurs.",
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
    title: "Inventaire en temps réel",
    text: "Connaissez exactement vos niveaux de stock à tout moment. Chaque entrée et sortie de marchandise est enregistrée et tracée — fini les écarts entre votre carnet et la réalité.",
  },
  {
    icon: MdNotifications,
    title: "Alertes de rupture de stock",
    text: "Définissez un seuil minimum pour chaque produit. FasoStock vous alerte automatiquement quand le stock descend trop bas, pour que vous commandiez à temps.",
  },
  {
    icon: MdGroups,
    title: "Gestion des fournisseurs",
    text: "Enregistrez vos fournisseurs, suivez vos commandes, les livraisons reçues et gérez vos dettes fournisseurs. Toute la chaîne d'approvisionnement dans une seule application.",
  },
  {
    icon: MdSync,
    title: "Entrées et sorties tracées",
    text: "Chaque mouvement de stock est enregistré avec la date, le responsable et le motif. Historique complet pour audits, réclamations ou vérifications comptables.",
  },
  {
    icon: MdTrendingUp,
    title: "Valorisation d'inventaire",
    text: "Connaissez la valeur totale de votre stock à n'importe quel moment. Utile pour vos bilans comptables, déclarations fiscales et évaluations d'entreprise.",
  },
  {
    icon: MdDescription,
    title: "Rapports de performance produits",
    text: "Identifiez vos produits les plus vendus, ceux qui stagnent et les tendances saisonnières. Optimisez vos achats et réduisez les coûts de stockage inutiles.",
  },
];

const benefits: string[] = [
  "Remplacement simple des carnets et fichiers Excel : tout centralisé dans une seule application",
  "Adapté aux PME burkinabè de tous secteurs : commerce, artisanat, distribution, services",
  "Inventaire physique facilité avec scan de codes-barres depuis la caméra du téléphone",
  "Historique complet et traçable de tous les mouvements de stock",
  "Accessible depuis plusieurs postes en simultané — idéal pour les équipes",
  "Rapports d'inventaire exportables pour votre comptable ou fisc",
  "Alertes automatiques pour éviter les ruptures et les surstocks coûteux",
  "Prix abordables pour les PME burkinabè, sans frais d'installation ni de maintenance",
];

const faqs: SeoFaqItem[] = [
  {
    q: "FasoStock peut-il remplacer mes tableurs Excel pour l'inventaire de ma PME ?",
    a: "Oui, et bien mieux. FasoStock automatise le suivi des entrées/sorties, calcule la valorisation du stock en temps réel et génère des rapports détaillés que vous exportez en un clic. Fini les formules cassées et les fichiers perdus.",
  },
  {
    q: "Puis-je scanner des codes-barres avec FasoStock pour faire l'inventaire ?",
    a: "Oui. FasoStock supporte la lecture de codes-barres via la caméra de votre téléphone ou un lecteur externe Bluetooth. Idéal pour les inventaires rapides de grandes quantités de produits.",
  },
  {
    q: "Est-ce adapté à une PME avec plusieurs centaines de références ?",
    a: "Oui. FasoStock gère des catalogues de produits importants sans limitation de nombre. Organisez vos produits par catégories, sous-catégories et variantes (taille, couleur, conditionnement).",
  },
  {
    q: "Comment FasoStock aide-t-il ma PME à éviter les ruptures de stock ?",
    a: "Des alertes automatiques vous préviennent dès qu'un produit descend sous un seuil minimum que vous définissez vous-même. Vous commandez à temps et ne perdez plus de ventes faute de stock.",
  },
  {
    q: "Puis-je suivre mes achats auprès des fournisseurs avec FasoStock ?",
    a: "Oui. FasoStock vous permet d'enregistrer vos fournisseurs, de suivre vos commandes en cours, les livraisons reçues et de gérer vos dettes fournisseurs. Toute la chaîne d'approvisionnement est couverte.",
  },
  {
    q: "FasoStock peut-il aider ma PME à préparer un bilan d'inventaire ?",
    a: "Oui. Vous générez un rapport complet de la valeur de votre stock à une date donnée, utile pour vos déclarations fiscales, bilans comptables ou demandes de financement auprès des banques.",
  },
  {
    q: "Combien d'employés peuvent utiliser FasoStock simultanément ?",
    a: "Autant que vous en avez besoin. Chaque employé a son propre accès avec les droits que vous définissez. Vous contrôlez qui peut faire quoi : voir le stock, faire des ventes, modifier des prix, etc.",
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
        "Logiciel d'inventaire pour PME au Burkina Faso. Gestion de stock, alertes de rupture, valorisation d'inventaire, fournisseurs.",
    },
    {
      "@type": "WebPage",
      name: "Logiciel d'Inventaire pour PME au Burkina Faso",
      description:
        "FasoStock — logiciel d'inventaire pour PME burkinabè. Remplace Excel, gère les fournisseurs, alerte sur les ruptures de stock.",
      url: canonicalUrl,
      inLanguage: "fr",
      isPartOf: { "@type": "WebSite", url: siteUrl, name: "FasoStock" },
    },
  ],
};

export default function LogicielInventairePmeBurkina() {
  return (
    <SeoLandingPage
      path={path}
      breadcrumbLabel="Logiciel d'inventaire pour PME"
      badge="PME & Artisans · Burkina Faso"
      h1="Le logiciel d'inventaire idéal pour les PME du Burkina Faso"
      heroSubtitle="Gérez l'inventaire de votre PME au Burkina Faso avec FasoStock. Remplacez vos carnets et fichiers Excel par une solution digitale simple : alertes de rupture, valorisation de stock, suivi des fournisseurs et rapports automatisés."
      features={features}
      benefits={benefits}
      faqs={faqs}
      ctaTitle="Digitalisez l'inventaire de votre PME"
      ctaSubtitle="Rejoignez les PME burkinabè qui ont modernisé leur gestion de stock avec FasoStock. Commencez gratuitement dès aujourd'hui."
      jsonLd={jsonLd}
    />
  );
}
