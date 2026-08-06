/**
 * FAQ de la page d'accueil.
 *
 * Extraite du composant client pour être partagée avec le balisage
 * `FAQPage` (JSON-LD) rendu côté serveur : les mêmes questions/réponses
 * alimentent l'accordéon visible et les rich results Google.
 *
 * Les réponses sont volontairement rédigées (et non « Oui. ») : Google évalue
 * la profondeur du contenu, et une réponse d'un mot n'apporte rien.
 */
export type HomeFaqItem = {
  id: number;
  q: string;
  a: string;
};

export const HOME_FAQS: HomeFaqItem[] = [
  {
    id: 1,
    q: "FasoStock fonctionne-t-il avec une connexion internet faible ?",
    a: "Oui. FasoStock est optimisé pour les faibles débits : vous continuez à travailler même avec une connexion internet faible ou instable, puis les données se synchronisent dès que le débit s'améliore.",
  },
  {
    id: 2,
    q: "FasoStock est-il un vrai logiciel de gestion commerciale ?",
    a: "Oui. FasoStock couvre toute la gestion commerciale d'un commerce au Burkina Faso : achats et fournisseurs, stock, caisse et ventes, facturation et devis, crédits clients, employés et rapports. Tout est relié : une vente met à jour le stock, la caisse, le compte du client et vos chiffres du jour.",
  },
  {
    id: 3,
    q: "Est-ce que je peux gérer plusieurs boutiques ?",
    a: "Oui. Vous pilotez plusieurs boutiques et dépôts depuis un seul compte, avec des transferts de stock entre points de vente, un catalogue partagé ou propre à chaque boutique, et une vue consolidée du chiffre d'affaires.",
  },
  {
    id: 4,
    q: "Est-ce que mes employés peuvent avoir leurs propres accès ?",
    a: "Oui. Chaque employé a son compte avec des rôles et des permissions précises. Les ventes, remises, annulations et mouvements de stock sont tracés avec leur auteur, ce qui vous permet de savoir qui a fait quoi.",
  },
  {
    id: 5,
    q: "Est-ce que je peux imprimer des tickets ou des factures ?",
    a: "Oui. Tickets thermiques 58 et 80 mm, factures A4 à votre en-tête avec logo, IFU et RCCM, devis et proformas. Les documents s'impriment ou s'envoient directement au client par WhatsApp en PDF.",
  },
  {
    id: 6,
    q: "Est-ce que mes données sont sécurisées ?",
    a: "Oui. Vos données sont chiffrées, sauvegardées automatiquement dans le cloud et protégées par des droits d'accès par utilisateur. Vous les retrouvez depuis n'importe quel appareil après reconnexion.",
  },
  {
    id: 7,
    q: "Combien coûte FasoStock ?",
    a: "Vous commencez par un essai gratuit sans carte bancaire, puis vous choisissez un abonnement en francs CFA adapté à la taille de votre commerce, sans engagement et mises à jour comprises.",
  },
  {
    id: 8,
    q: "Puis-je le tester avant de payer ?",
    a: "Oui. L'essai est gratuit et donne accès aux fonctions de gestion commerciale. Vous ne payez qu'une fois convaincu, et vous pouvez arrêter à tout moment.",
  },
  {
    id: 9,
    q: "Est-ce adapté aux petits commerces ?",
    a: "Oui. FasoStock est conçu aussi bien pour une boutique tenue par une seule personne que pour une entreprise à plusieurs points de vente. Vous n'activez que les modules dont vous avez besoin.",
  },
  {
    id: 10,
    q: "Sur quels appareils puis-je utiliser FasoStock ?",
    a: "Sur smartphone Android, iPhone, tablette et ordinateur Windows ou Mac, directement dans le navigateur. L'application peut aussi s'installer sur votre téléphone (PWA), sans passer par le Play Store.",
  },
  {
    id: 11,
    q: "Que se passe-t-il si mon appareil est endommagé ou que je le change ?",
    a: "Vos données restent liées à votre compte, pas à l'appareil. Vous vous reconnectez depuis un nouveau téléphone ou un ordinateur et vous retrouvez immédiatement votre stock, vos ventes et vos clients.",
  },
  {
    id: 12,
    q: "FasoStock fonctionne-t-il à Ouagadougou et à Bobo-Dioulasso ?",
    a: "Oui, et partout au Burkina Faso : Koudougou, Banfora, Ouahigouya, Kaya, Fada N'Gourma, Dédougou. Aucune installation sur place n'est nécessaire, et l'accompagnement au démarrage se fait par WhatsApp au +226 64 71 20 44.",
  },
];
