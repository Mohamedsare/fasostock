import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo/site-url";
import {
  MdPointOfSale,
  MdInventory2,
  MdCreditCard,
  MdReceiptLong,
  MdTrendingUp,
  MdGroups,
  MdStorefront,
  MdAccountBalance,
} from "react-icons/md";
import {
  SeoLandingPage,
  type SeoFeature,
  type SeoFaqItem,
  type SeoSection,
} from "@/components/seo/seo-landing-page";

const siteUrl = SITE_URL;
const path = "/logiciel-gestion-commerciale-burkina-faso";
const canonicalUrl = `${siteUrl}${path}`;

export const metadata: Metadata = {
  title: { absolute: "Logiciel de gestion commerciale au Burkina Faso | FasoStock" },
  description:
    "FasoStock est le logiciel de gestion commerciale N°1 au Burkina Faso : ventes, stock, caisse, factures, crédits clients et rapports. Essai gratuit, en français, adapté aux commerces de Ouagadougou et Bobo-Dioulasso.",
  keywords: [
    "logiciel de gestion commerciale Burkina Faso",
    "logiciel gestion commerciale Ouagadougou",
    "logiciel de gestion commerciale",
    "gestion commerciale PME Burkina Faso",
    "logiciel de facturation Burkina Faso",
    "logiciel de caisse Burkina Faso",
    "logiciel de gestion de stock Burkina Faso",
    "FasoStock",
  ],
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: "Logiciel de gestion commerciale au Burkina Faso | FasoStock",
    description:
      "Ventes, stock, caisse, facturation, crédits clients et rapports dans un seul logiciel de gestion commerciale conçu pour les commerces burkinabè.",
    url: canonicalUrl,
    siteName: "FasoStock",
    locale: "fr_BF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Logiciel de gestion commerciale au Burkina Faso | FasoStock",
    description:
      "Le logiciel de gestion commerciale des commerçants et PME du Burkina Faso. Essai gratuit.",
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
    title: "Caisse et ventes en quelques secondes",
    text: "Encaissez au comptoir depuis un téléphone, une tablette ou un PC. Recherche produit par nom ou code-barres, ticket imprimé sur imprimante thermique 58 ou 80 mm, plusieurs modes de paiement (espèces, Orange Money, Moov Money, Wave, carte).",
  },
  {
    icon: MdInventory2,
    title: "Gestion de stock temps réel",
    text: "Chaque vente décrémente automatiquement le stock. Alertes de seuil, entrées fournisseurs, transferts entre boutiques et dépôts, inventaires physiques avec écarts calculés : vous savez toujours ce que vous avez réellement en rayon.",
  },
  {
    icon: MdReceiptLong,
    title: "Facturation et devis professionnels",
    text: "Éditez factures A4, proformas et devis à votre en-tête, avec votre logo, vos mentions légales et votre numéro IFU. Envoi direct au client par WhatsApp ou export PDF.",
  },
  {
    icon: MdCreditCard,
    title: "Crédits et comptes clients",
    text: "Vendez à crédit sans perdre le fil : encours par client, échéances, acomptes, remboursements partiels et relances. Vos rapports distinguent le chiffre facturé du montant réellement encaissé.",
  },
  {
    icon: MdAccountBalance,
    title: "Achats, fournisseurs et dettes",
    text: "Suivez vos commandes fournisseurs, vos dettes (compte 401), vos échéanciers et vos règlements. Votre trésorerie devient lisible, mois après mois.",
  },
  {
    icon: MdTrendingUp,
    title: "Rapports et tableau de bord",
    text: "Chiffre d'affaires, marge, produits les plus vendus, performance par vendeur et par boutique, sur la période de votre choix. Des décisions basées sur des chiffres, plus sur des impressions.",
  },
  {
    icon: MdGroups,
    title: "Employés, rôles et traçabilité",
    text: "Créez un compte par employé avec des droits précis. Chaque vente, remise, annulation ou mouvement de stock est associé à son auteur : vous savez qui a fait quoi, et quand.",
  },
  {
    icon: MdStorefront,
    title: "Multi-boutiques et multi-dépôts",
    text: "Pilotez plusieurs points de vente depuis un seul compte, avec un catalogue partagé ou propre à chaque boutique, et une vue consolidée pour le gérant.",
  },
];

const benefits: string[] = [
  "Un seul logiciel pour toute la gestion commerciale : achats, stock, ventes, caisse, facturation, clients et rapports",
  "Conçu au Burkina Faso pour les réalités burkinabè : franc CFA, IFU, vente à crédit, paiement mobile money",
  "Interface 100 % en français, prise en main en moins de 30 minutes, même sans formation informatique",
  "Fonctionne sur smartphone Android, iPhone, tablette et ordinateur — rien à installer, tout passe par le navigateur",
  "Optimisé pour les faibles débits : votre activité continue même quand la connexion internet est faible",
  "Vos données sont chiffrées, sauvegardées automatiquement et accessibles depuis n'importe quel appareil",
  "Tarifs en FCFA adaptés aux commerces et PME, sans engagement et sans frais cachés",
  "Support en français par WhatsApp et par téléphone, avec une équipe joignable localement",
];

const sections: SeoSection[] = [
  {
    h2: "Qu'est-ce qu'un logiciel de gestion commerciale ?",
    paragraphs: [
      "Un logiciel de gestion commerciale regroupe dans un seul outil tout ce qui fait tourner un commerce : les achats auprès des fournisseurs, le stock, les ventes au comptoir, la facturation, le suivi des clients et des crédits, l'encaissement et les rapports de gestion. À la place de plusieurs cahiers et de fichiers Excel qui ne se parlent pas, chaque opération met à jour l'ensemble automatiquement.",
      "Concrètement, quand vous vendez un article dans FasoStock, la quantité en stock diminue, le ticket ou la facture est généré, la recette est enregistrée en caisse, le crédit du client est mis à jour s'il n'a pas tout payé, et le chiffre d'affaires du jour est recalculé. Une seule saisie, tout le reste suit.",
    ],
  },
  {
    h2: "Pourquoi les commerçants burkinabè choisissent FasoStock",
    paragraphs: [
      "La plupart des logiciels de gestion commerciale vendus au Burkina Faso ont été conçus pour l'Europe : licences chères en euros, installation lourde sur un serveur, aucune gestion réelle de la vente à crédit ni du mobile money, et un support à distance sur un autre fuseau horaire.",
      "FasoStock est développé localement, à partir du quotidien des boutiques, quincailleries, pharmacies, grossistes, magasins de pièces détachées et concessionnaires du pays. Le vocabulaire, les documents, les moyens de paiement et les habitudes de vente correspondent à ce que vous pratiquez déjà.",
    ],
    bullets: [
      "Facturation conforme aux usages burkinabè (IFU, RCCM, mentions légales, franc CFA)",
      "Encaissement Orange Money, Moov Money, Wave, espèces et carte bancaire",
      "Vente à crédit et carnet de dettes clients intégrés, pas en option",
      "Support en français, joignable sur WhatsApp au +226 64 71 20 44",
    ],
  },
  {
    h2: "Pour quels commerces et quels secteurs ?",
    paragraphs: [
      "FasoStock s'adapte au métier plutôt que l'inverse. Le logiciel s'active par activité : boutique et supérette, quincaillerie et matériaux, pharmacie et parapharmacie, magasin de pièces détachées, prêt-à-porter, grossiste et demi-grossiste, restaurant et bar, vente de motos et engins, location.",
      "Selon l'activité choisie, les modules utiles s'affichent et les autres restent masqués : dates de péremption pour la pharmacie, compatibilités par modèle pour les pièces détachées, conditionnements en paquet et carton pour le grossiste, immatriculation et carte grise pour la vente d'engins.",
    ],
  },
  {
    h2: "Disponible à Ouagadougou, Bobo-Dioulasso et dans tout le pays",
    paragraphs: [
      "FasoStock est utilisé par des commerces à Ouagadougou, Bobo-Dioulasso, Koudougou, Banfora, Ouahigouya, Kaya, Fada N'Gourma et Dédougou. Comme le logiciel fonctionne dans un navigateur, aucun déplacement n'est nécessaire pour l'installer : vous créez votre compte et vous démarrez le jour même.",
      "L'accompagnement au démarrage (import du catalogue produits, configuration de la boutique, formation des vendeurs) se fait à distance par WhatsApp ou par téléphone, et sur place à Ouagadougou.",
    ],
  },
  {
    h2: "Combien coûte un logiciel de gestion commerciale au Burkina Faso ?",
    paragraphs: [
      "Les solutions installées localement demandent souvent plusieurs centaines de milliers de francs CFA de licence, puis des frais de maintenance annuels. FasoStock fonctionne par abonnement en FCFA, sans engagement, avec les mises à jour incluses et aucun serveur à acheter.",
      "Vous commencez par un essai gratuit, sans carte bancaire, avec toutes les fonctions de gestion commerciale. Vous ne payez qu'une fois convaincu, et vous pouvez arrêter à tout moment. Une offre complète comprenant le matériel (imprimante ticket, douchette code-barres) et le logiciel est également disponible.",
    ],
  },
  {
    h2: "Passer du cahier au logiciel, sans casser votre organisation",
    paragraphs: [
      "La migration se fait progressivement. Vous commencez par saisir votre catalogue produits et vos stocks actuels, puis vous encaissez vos premières ventes dans le logiciel tout en gardant votre cahier quelques jours, le temps de prendre confiance.",
      "En pratique, les commerçants abandonnent le cahier au bout d'une à deux semaines, parce que le logiciel donne en une seconde des réponses qu'ils mettaient une heure à retrouver : ce qu'il reste en stock, qui doit combien, et combien la boutique a réellement gagné hier.",
    ],
  },
];

const faqs: SeoFaqItem[] = [
  {
    q: "Quel est le meilleur logiciel de gestion commerciale au Burkina Faso ?",
    a: "FasoStock est le logiciel de gestion commerciale le plus utilisé par les commerçants et PME du Burkina Faso. Il réunit ventes, stock, caisse, facturation, crédits clients, fournisseurs et rapports dans une seule application en français, accessible depuis un téléphone ou un ordinateur, avec un support local joignable sur WhatsApp.",
  },
  {
    q: "Qu'est-ce qu'un logiciel de gestion commerciale exactement ?",
    a: "C'est un outil qui centralise toute la gestion d'un commerce : achats fournisseurs, stock, ventes, encaissement, facturation, suivi des clients et des crédits, et rapports de gestion. Chaque opération met à jour automatiquement l'ensemble, ce qui supprime les doubles saisies et les erreurs de cahier.",
  },
  {
    q: "FasoStock convient-il à une petite boutique ou seulement aux grandes entreprises ?",
    a: "Il convient aux deux. Une boutique avec un seul vendeur utilise la caisse rapide et le suivi de stock ; une entreprise à plusieurs points de vente active le multi-boutiques, les rôles employés, la comptabilité et les rapports consolidés. Vous n'activez que les modules dont vous avez besoin.",
  },
  {
    q: "Combien coûte FasoStock au Burkina Faso ?",
    a: "Vous démarrez avec un essai gratuit, sans carte bancaire. Ensuite, l'abonnement est facturé en francs CFA selon la taille de votre commerce, sans engagement, mises à jour comprises. Une offre complète matériel + logiciel est aussi proposée pour équiper une boutique de A à Z.",
  },
  {
    q: "Faut-il une connexion internet permanente pour utiliser le logiciel ?",
    a: "FasoStock est optimisé pour les faibles débits. Vous continuez à encaisser et à gérer votre stock même avec une connexion internet faible ou instable, et les données se synchronisent dès que le débit s'améliore.",
  },
  {
    q: "Puis-je éditer des factures conformes avec mon IFU et mon logo ?",
    a: "Oui. Vous configurez l'en-tête de vos documents avec votre logo, votre raison sociale, votre IFU, votre RCCM et vos coordonnées. Vous éditez ensuite factures A4, proformas, devis et tickets thermiques, à imprimer ou à envoyer au client par WhatsApp.",
  },
  {
    q: "Le logiciel gère-t-il les ventes à crédit et les dettes clients ?",
    a: "Oui, c'est une fonction centrale. Chaque client a un encours, un historique d'acomptes et de remboursements, et une échéance. Les rapports distinguent le chiffre d'affaires facturé du montant réellement encaissé, pour que le crédit non remboursé ne soit pas compté comme un bénéfice.",
  },
  {
    q: "Puis-je gérer plusieurs boutiques avec un seul compte ?",
    a: "Oui. Vous pilotez plusieurs boutiques et dépôts depuis un seul tableau de bord, avec un catalogue partagé ou propre à chaque boutique, des transferts de stock entre points de vente et une vue consolidée du chiffre d'affaires.",
  },
  {
    q: "Sur quels appareils FasoStock fonctionne-t-il ?",
    a: "Sur smartphone Android, iPhone, tablette et ordinateur Windows ou Mac, directement dans le navigateur. Vous pouvez aussi l'installer comme application (PWA) sur votre téléphone, sans passer par le Play Store.",
  },
  {
    q: "Mes données commerciales sont-elles en sécurité ?",
    a: "Oui. Les données sont chiffrées, sauvegardées automatiquement dans le cloud et protégées par des droits d'accès par utilisateur. Si votre téléphone est perdu, volé ou remplacé, vous retrouvez tout en vous reconnectant depuis un autre appareil.",
  },
  {
    q: "Comment démarrer et être accompagné ?",
    a: "Créez votre compte en ligne, ajoutez vos produits et vous encaissez le jour même. Notre équipe vous accompagne pour l'import du catalogue et la formation de vos vendeurs, à distance sur WhatsApp au +226 64 71 20 44 ou sur place à Ouagadougou.",
  },
  {
    q: "FasoStock remplace-t-il un logiciel de comptabilité ?",
    a: "FasoStock intègre un module de comptabilité au plan SYSCOHADA (journaux, grand livre, balance) alimenté automatiquement par vos ventes et vos achats. Pour une liasse fiscale complète, vos écritures s'exportent et se transmettent à votre comptable.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "FasoStock",
      alternateName: "FasoStock — logiciel de gestion commerciale",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Logiciel de gestion commerciale",
      operatingSystem: "Web, Android, iOS, Windows, macOS",
      url: canonicalUrl,
      inLanguage: "fr-BF",
      description:
        "Logiciel de gestion commerciale au Burkina Faso : ventes, stock, caisse, facturation, crédits clients, fournisseurs et rapports, sur mobile et PC.",
      featureList: [
        "Caisse et encaissement",
        "Gestion de stock temps réel",
        "Facturation et devis",
        "Crédits et comptes clients",
        "Achats et dettes fournisseurs",
        "Rapports et tableau de bord",
        "Multi-boutiques et multi-dépôts",
        "Gestion des employés et des droits",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "XOF",
        availability: "https://schema.org/InStock",
        description: "Essai gratuit sans carte bancaire",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "127",
        bestRating: "5",
      },
      areaServed: { "@type": "Country", name: "Burkina Faso" },
      publisher: { "@type": "Organization", name: "FasoStock", url: siteUrl },
    },
    {
      "@type": "WebPage",
      name: "Logiciel de gestion commerciale au Burkina Faso",
      description:
        "FasoStock, le logiciel de gestion commerciale des commerçants et PME du Burkina Faso : ventes, stock, caisse, factures, crédits clients et rapports.",
      url: canonicalUrl,
      inLanguage: "fr-BF",
      isPartOf: { "@type": "WebSite", url: siteUrl, name: "FasoStock" },
      about: { "@type": "Thing", name: "Logiciel de gestion commerciale" },
    },
  ],
};

export default function LogicielGestionCommercialeBurkinaFaso() {
  return (
    <SeoLandingPage
      path={path}
      breadcrumbLabel="Logiciel de gestion commerciale"
      badge="Gestion commerciale · Burkina Faso"
      h1="Logiciel de gestion commerciale au Burkina Faso"
      heroSubtitle="FasoStock réunit vos ventes, votre stock, votre caisse, vos factures, vos crédits clients et vos rapports dans un seul logiciel de gestion commerciale, conçu au Burkina Faso pour les commerçants et les PME. Sur téléphone comme sur ordinateur, même avec une faible connexion internet."
      features={features}
      benefits={benefits}
      sections={sections}
      faqs={faqs}
      ctaTitle="Testez le logiciel de gestion commerciale N°1 au Burkina Faso"
      ctaSubtitle="Essai gratuit, sans carte bancaire. Créez votre compte et encaissez votre première vente aujourd'hui."
      jsonLd={jsonLd}
    />
  );
}
