import { ROUTES } from "@/lib/config/routes";

/**
 * « Espace métier » — une page d'accueil dédiée par activité (route `/metier`).
 *
 * Objectif : que chaque métier ajouté ne soit pas seulement un libellé, mais un
 * espace qui lui parle — ses chiffres du jour dans SON vocabulaire, ses actions
 * les plus fréquentes en un clic, et sa routine de gestion.
 *
 * Additif : un métier absent de ce registre n'a ni entrée de menu ni page — les
 * activités historiques (pharmacie, supermarché, restaurant, grossiste,
 * matériaux) gardent donc exactement l'application qu'elles connaissent.
 */

/** Cible d'une action rapide. `@pos` = caisse rapide de la boutique active. */
export type TradeQuickActionHref = string;

export type TradeQuickAction = {
  href: TradeQuickActionHref;
  label: string;
  /** Une ligne qui dit à quoi ça sert, dans les mots du métier. */
  hint: string;
};

export type TradeWorkspace = {
  slug: string;
  /** Libellé de l'entrée de menu (ex. « Espace Garage »). */
  navLabel: string;
  /** Phrase d'accroche sous le titre de la page. */
  tagline: string;
  /** Libellés des 4 tuiles chiffrées (données réelles du jour). */
  metrics: {
    /** Montant encaissé/facturé aujourd'hui. */
    revenue: string;
    /** Nombre d'opérations du jour. */
    count: string;
    /** Montant moyen par opération. */
    average: string;
    /** Références sous le seuil d'alerte. */
    lowStock: string;
  };
  quickActions: TradeQuickAction[];
  /** Mémo de gestion propre au métier (titre + points concrets). */
  playbook: { title: string; items: string[] };
};

/** Caisse rapide de la boutique active — résolue à l'affichage. */
export const TRADE_POS_ACTION = "@pos";

const WORKSPACES: TradeWorkspace[] = [
  // ── Commerce & distribution ───────────────────────────────────────────────
  {
    slug: "alimentation-generale",
    navLabel: "Espace Boutique",
    tagline: "Vos ventes du jour, vos ruptures et vos dates limites en un coup d'œil.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Panier moyen",
      lowStock: "Articles à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Ouvrir la caisse", hint: "Encaisser un client tout de suite" },
      { href: ROUTES.products, label: "Ajouter un article", hint: "Nouveau produit, prix et seuil d'alerte" },
      { href: ROUTES.purchases, label: "Enregistrer un achat", hint: "Ce que vous venez de vous approvisionner" },
      { href: ROUTES.expiry, label: "Dates limites", hint: "Écouler ce qui approche de la DLC" },
      { href: ROUTES.credit, label: "Clients à crédit", hint: "Qui doit quoi, et depuis quand" },
    ],
    playbook: {
      title: "Votre routine de boutique",
      items: [
        "Le matin : vérifier les articles en rupture avant l'arrivée des clients.",
        "Mettre en avant les produits dont la date limite approche plutôt que de les jeter.",
        "Noter chaque crédit au moment où vous le donnez — jamais de mémoire le soir.",
        "Le soir : comparer la caisse physique et la recette du jour affichée ici.",
      ],
    },
  },
  {
    slug: "depot-boissons",
    navLabel: "Espace Dépôt",
    tagline: "Casiers sortis, consignes à récupérer et revendeurs à relancer.",
    metrics: {
      revenue: "Recette du jour",
      count: "Sorties du jour",
      average: "Montant moyen",
      lowStock: "Références à recharger",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Vendre au dépôt", hint: "Sortie de casiers ou de bouteilles" },
      { href: ROUTES.purchases, label: "Réception brasserie", hint: "Enregistrer une livraison reçue" },
      { href: ROUTES.credit, label: "Crédits revendeurs", hint: "Encours des maquis et revendeurs" },
      { href: ROUTES.customers, label: "Mes revendeurs", hint: "Fiches clients et historique" },
      { href: ROUTES.inventory, label: "Stock casiers", hint: "Ce qu'il reste réellement au dépôt" },
    ],
    playbook: {
      title: "Votre routine de dépôt",
      items: [
        "Compter les casiers vides à rendre à la brasserie en même temps que les pleins.",
        "Marquer chaque emballage consigné sur la fiche produit pour ne rien perdre.",
        "Relancer les revendeurs dès 7 jours d'encours — au-delà, le recouvrement se complique.",
        "Anticiper les week-ends et fêtes : commander avant la rupture, pas pendant.",
      ],
    },
  },

  // ── Restauration & hôtellerie ─────────────────────────────────────────────
  {
    slug: "boulangerie-patisserie",
    navLabel: "Espace Boulangerie",
    tagline: "Fournées vendues, matières premières et invendus à surveiller.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Panier moyen",
      lowStock: "Matières à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Vendre au comptoir", hint: "Encaisser un client" },
      { href: ROUTES.products, label: "Pains & pâtisseries", hint: "Poids, conservation et prix" },
      { href: ROUTES.purchases, label: "Approvisionnement", hint: "Farine, levure, sucre, emballages" },
      { href: ROUTES.inventory, label: "Stock matières", hint: "Ce qu'il reste pour produire demain" },
      { href: ROUTES.customers, label: "Clients & revendeurs", hint: "Livraisons régulières et commandes" },
    ],
    playbook: {
      title: "Votre routine de production",
      items: [
        "Comparer chaque soir la production du jour et les ventes : l'écart, ce sont vos invendus.",
        "Renseigner le poids et la durée de conservation de chaque produit — utile pour vos prix.",
        "Contrôler le stock de farine avant chaque commande fournisseur, pas après la rupture.",
        "Suivre séparément les commandes sur mesure (gâteaux) : elles se règlent souvent en deux fois.",
      ],
    },
  },
  {
    slug: "bar-maquis",
    navLabel: "Espace Maquis",
    tagline: "Additions du jour, ardoises ouvertes et stock du bar.",
    metrics: {
      revenue: "Recette du jour",
      count: "Additions du jour",
      average: "Addition moyenne",
      lowStock: "Boissons à recharger",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Prendre une commande", hint: "Ouvrir une addition" },
      { href: ROUTES.credit, label: "Ardoises en cours", hint: "Les habitués qui n'ont pas encore réglé" },
      { href: ROUTES.products, label: "Carte & boissons", hint: "Prix, contenances et suppléments" },
      { href: ROUTES.purchases, label: "Approvisionnement", hint: "Casiers, glace, ingrédients" },
      { href: ROUTES.inventory, label: "Stock bar", hint: "Ce qui reste au frigo et en réserve" },
    ],
    playbook: {
      title: "Votre routine de maquis",
      items: [
        "Ouvrir une addition dès la première commande : c'est ce qui évite les oublis en fin de soirée.",
        "Compter les casiers en début et en fin de service — l'écart doit correspondre aux ventes.",
        "Fixer un plafond d'ardoise par habitué et s'y tenir.",
        "Regarder les jours les plus forts dans les rapports pour caler vos commandes.",
      ],
    },
  },
  {
    slug: "boucherie-poissonnerie",
    navLabel: "Espace Boucherie",
    tagline: "Ventes du jour, fraîcheur des stocks et arrivages.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Panier moyen",
      lowStock: "Produits à réapprovisionner",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Vendre au comptoir", hint: "Encaisser au poids ou à la pièce" },
      { href: ROUTES.purchases, label: "Nouvel arrivage", hint: "Bête, carcasse ou livraison reçue" },
      { href: ROUTES.expiry, label: "Fraîcheur & dates", hint: "Ce qui doit partir en priorité" },
      { href: ROUTES.products, label: "Découpes & produits", hint: "Espèces, découpes et conservation" },
      { href: ROUTES.customers, label: "Clients & restaurants", hint: "Commandes régulières et crédits" },
    ],
    playbook: {
      title: "Votre routine de comptoir",
      items: [
        "Enregistrer chaque arrivage avec son coût réel : c'est lui qui donne votre vraie marge au kilo.",
        "Sortir en priorité les produits les plus anciens (premier entré, premier sorti).",
        "Surveiller la chaîne du froid : notez les produits congelés séparément des frais.",
        "Suivre les restaurants et maquis clients à part — ce sont eux qui font le volume.",
      ],
    },
  },
  {
    slug: "hotel-auberge",
    navLabel: "Espace Hôtel",
    tagline: "Notes du jour, consommations et stock de l'établissement.",
    metrics: {
      revenue: "Recette du jour",
      count: "Notes encaissées",
      average: "Note moyenne",
      lowStock: "Fournitures à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Encaisser une note", hint: "Chambre, restauration et extras" },
      { href: ROUTES.products, label: "Chambres & prestations", hint: "Tarifs, capacités et équipements" },
      { href: ROUTES.credit, label: "Notes non réglées", hint: "Séjours et sociétés à facturer" },
      { href: ROUTES.customers, label: "Clients & sociétés", hint: "Agences, entreprises, habitués" },
      { href: ROUTES.expenses, label: "Charges", hint: "Eau, électricité, blanchisserie, personnel" },
    ],
    playbook: {
      title: "Votre routine d'exploitation",
      items: [
        "Ouvrir la note dès l'arrivée du client et y ajouter chaque consommation au fil du séjour.",
        "Suivre les comptes sociétés séparément : ils règlent souvent en fin de mois.",
        "Contrôler chaque semaine le stock de linge, produits d'entretien et petit-déjeuner.",
        "Comparer recette et charges chaque mois — l'hôtellerie se joue sur les charges fixes.",
      ],
    },
  },

  // ── Mode & beauté ─────────────────────────────────────────────────────────
  {
    slug: "chaussures-maroquinerie",
    navLabel: "Espace Boutique",
    tagline: "Ventes du jour, pointures manquantes et modèles qui tournent.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Panier moyen",
      lowStock: "Modèles à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Ouvrir la caisse", hint: "Encaisser une vente" },
      { href: ROUTES.products, label: "Modèles & pointures", hint: "Tailles disponibles et matières" },
      { href: ROUTES.purchases, label: "Nouvel arrivage", hint: "Enregistrer un lot reçu" },
      { href: ROUTES.reports, label: "Ce qui se vend", hint: "Modèles à recommander en priorité" },
      { href: ROUTES.promotions, label: "Soldes & remises", hint: "Écouler les fins de séries" },
    ],
    playbook: {
      title: "Votre routine de boutique",
      items: [
        "Noter les pointures disponibles sur chaque modèle : c'est la première question du client.",
        "Repérer chaque mois les modèles qui ne tournent pas et les solder avant la saison suivante.",
        "Enregistrer le coût réel d'arrivage (transport et douane compris) pour connaître votre marge.",
        "Garder trace des demandes non satisfaites : c'est votre prochaine commande.",
      ],
    },
  },
  {
    slug: "tissus-pagnes",
    navLabel: "Espace Tissus",
    tagline: "Ventes au mètre, rouleaux restants et clientes fidèles.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Références à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Vendre au mètre", hint: "Encaisser une coupe ou un pagne complet" },
      { href: ROUTES.products, label: "Tissus & pagnes", hint: "Matières, motifs, laizes et longueurs" },
      { href: ROUTES.purchases, label: "Nouvel arrivage", hint: "Balles et rouleaux reçus" },
      { href: ROUTES.credit, label: "Clientes à crédit", hint: "Couturiers et revendeuses" },
      { href: ROUTES.customers, label: "Clientèle", hint: "Habituées, couturiers, revendeuses" },
    ],
    playbook: {
      title: "Votre routine de vente",
      items: [
        "Renseigner la laize et la longueur du pagne : le prix au mètre s'en déduit sans erreur.",
        "Séparer les ventes au détail des ventes aux couturiers et revendeuses.",
        "Suivre les motifs qui partent vite — les rééditions se commandent longtemps à l'avance.",
        "Fixer une limite de crédit par revendeuse et la respecter.",
      ],
    },
  },
  {
    slug: "bijouterie-horlogerie",
    navLabel: "Espace Bijouterie",
    tagline: "Ventes du jour, stock du coffre et pièces de valeur.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Pièces à réapprovisionner",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Enregistrer une vente", hint: "Encaisser un bijou ou une montre" },
      { href: ROUTES.products, label: "Bijoux & montres", hint: "Matière, titre, poids et garantie" },
      { href: ROUTES.inventorySessions, label: "Inventaire du coffre", hint: "Comptage pièce par pièce" },
      { href: ROUTES.customers, label: "Clientèle", hint: "Commandes spéciales et fidèles" },
      { href: ROUTES.credit, label: "Ventes à crédit", hint: "Soldes et acomptes en cours" },
    ],
    playbook: {
      title: "Votre routine de bijouterie",
      items: [
        "Peser et noter le titre de chaque pièce à l'entrée en stock : c'est votre preuve de valeur.",
        "Faire un inventaire du coffre à intervalle régulier, pas seulement en fin d'année.",
        "Consigner les garanties remises au client pour éviter toute contestation.",
        "Suivre les acomptes sur commandes spéciales : ils financent votre achat de matière.",
      ],
    },
  },
  {
    slug: "salon-beaute",
    navLabel: "Espace Salon",
    tagline: "Prestations du jour, produits consommés et fidélité clientèle.",
    metrics: {
      revenue: "Recette du jour",
      count: "Prestations du jour",
      average: "Prestation moyenne",
      lowStock: "Produits à racheter",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Encaisser une prestation", hint: "Coiffure, soin ou forfait" },
      { href: ROUTES.products, label: "Prestations & produits", hint: "Tarifs, durées et produits revendus" },
      { href: ROUTES.customers, label: "Clientèle", hint: "Historique et habitudes de chaque cliente" },
      { href: ROUTES.inventory, label: "Stock salon", hint: "Mèches, produits capillaires, consommables" },
      { href: ROUTES.users, label: "Équipe du salon", hint: "Qui a réalisé quelles prestations" },
    ],
    playbook: {
      title: "Votre routine de salon",
      items: [
        "Renseigner la durée de chaque prestation : c'est la base d'un planning réaliste.",
        "Séparer les prestations des produits revendus — les marges n'ont rien à voir.",
        "Suivre la consommation de produits par prestation pour ajuster vos tarifs.",
        "Regarder chaque semaine qui réalise le plus de prestations dans l'équipe.",
      ],
    },
  },

  // ── Santé & bien-être ─────────────────────────────────────────────────────
  {
    slug: "optique-lunetterie",
    navLabel: "Espace Optique",
    tagline: "Ventes du jour, équipements en commande et suivi patients.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Références à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Enregistrer une vente", hint: "Monture, verres ou accessoire" },
      { href: ROUTES.products, label: "Montures & verres", hint: "Types, traitements et garanties" },
      { href: ROUTES.customers, label: "Patients", hint: "Équipements posés et renouvellements" },
      { href: ROUTES.credit, label: "Équipements à régler", hint: "Acomptes et soldes en attente" },
      { href: ROUTES.purchases, label: "Commande verrier", hint: "Enregistrer une commande de verres" },
    ],
    playbook: {
      title: "Votre routine d'optique",
      items: [
        "Noter l'indice et le traitement des verres commandés : indispensable au renouvellement.",
        "Encaisser un acompte à la commande des verres — ils ne sont pas revendables.",
        "Suivre les garanties par patient pour traiter les réclamations sans discussion.",
        "Relancer les patients au bout de deux ans : c'est le rythme naturel de renouvellement.",
      ],
    },
  },
  {
    slug: "clinique-cabinet",
    navLabel: "Espace Soins",
    tagline: "Actes du jour, consommables et prises en charge.",
    metrics: {
      revenue: "Recette du jour",
      count: "Actes facturés",
      average: "Montant moyen",
      lowStock: "Consommables à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Encaisser un acte", hint: "Consultation, soin ou examen" },
      { href: ROUTES.customers, label: "Patients", hint: "Dossiers et organismes de prise en charge" },
      { href: ROUTES.expiry, label: "Péremptions", hint: "Médicaments et réactifs à contrôler" },
      { href: ROUTES.inventory, label: "Stock médical", hint: "Consommables, réactifs, médicaments" },
      { href: ROUTES.credit, label: "Soins à régler", hint: "Prises en charge et soldes patients" },
    ],
    playbook: {
      title: "Votre routine de cabinet",
      items: [
        "Contrôler les péremptions des médicaments et réactifs chaque début de mois.",
        "Suivre les prises en charge (assurances, employeurs) séparément des paiements directs.",
        "Enregistrer les consommables utilisés par acte pour ajuster vos tarifs.",
        "Garder un stock tampon sur les consommables critiques : la rupture bloque les soins.",
      ],
    },
  },

  // ── Technologie & maison ──────────────────────────────────────────────────
  {
    slug: "informatique-bureautique",
    navLabel: "Espace Informatique",
    tagline: "Ventes du jour, garanties en cours et matériel en stock.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Références à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Ouvrir la caisse", hint: "Encaisser une vente" },
      { href: ROUTES.products, label: "Matériel & consommables", hint: "Caractéristiques, séries, garanties" },
      { href: ROUTES.customers, label: "Clients & sociétés", hint: "Entreprises, écoles, particuliers" },
      { href: ROUTES.credit, label: "Factures en attente", hint: "Sociétés qui règlent à 30 jours" },
      { href: ROUTES.purchases, label: "Enregistrer un achat", hint: "Arrivage matériel ou consommables" },
    ],
    playbook: {
      title: "Votre routine de magasin",
      items: [
        "Noter le numéro de série et la durée de garantie à chaque vente de matériel.",
        "Distinguer le neuf du reconditionné dans la fiche produit : les prix et garanties diffèrent.",
        "Suivre les consommables (cartouches, câbles) : c'est le chiffre d'affaires régulier.",
        "Facturer les sociétés avec échéance et relancer avant la date, pas après.",
      ],
    },
  },
  {
    slug: "electromenager",
    navLabel: "Espace Magasin",
    tagline: "Ventes et livraisons du jour, garanties et stock showroom.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Appareils à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Enregistrer une vente", hint: "Encaisser ou ouvrir un crédit" },
      { href: ROUTES.products, label: "Appareils", hint: "Puissances, garanties et numéros de série" },
      { href: ROUTES.credit, label: "Ventes à crédit", hint: "Échéances et acomptes en cours" },
      { href: ROUTES.customers, label: "Clients", hint: "Livraisons et suivi après-vente" },
      { href: ROUTES.purchases, label: "Nouvel arrivage", hint: "Conteneur ou livraison reçue" },
    ],
    playbook: {
      title: "Votre routine de magasin",
      items: [
        "Noter le numéro de série vendu : c'est la pièce maîtresse de tout litige de garantie.",
        "Préciser si la livraison est incluse dans le prix pour éviter les malentendus.",
        "Suivre les ventes à crédit de près : les montants sont élevés, les retards coûtent cher.",
        "Contrôler le coût réel d'arrivage (transport, douane) avant de fixer vos prix.",
      ],
    },
  },
  {
    slug: "papeterie-librairie",
    navLabel: "Espace Librairie",
    tagline: "Ventes du jour, fournitures scolaires et pics de rentrée.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Panier moyen",
      lowStock: "Fournitures à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Ouvrir la caisse", hint: "Encaisser un client" },
      { href: ROUTES.products, label: "Fournitures & livres", hint: "Niveaux scolaires et références" },
      { href: ROUTES.purchases, label: "Commande fournisseur", hint: "Préparer la rentrée" },
      { href: ROUTES.customers, label: "Écoles & clients", hint: "Établissements et commandes groupées" },
      { href: ROUTES.reports, label: "Ce qui se vend", hint: "Anticiper les besoins par niveau" },
    ],
    playbook: {
      title: "Votre routine de librairie",
      items: [
        "Renseigner le niveau scolaire sur chaque fourniture : les parents cherchent par classe.",
        "Commander la rentrée dès le mois qui précède — la rupture d'août ne se rattrape pas.",
        "Suivre les commandes des écoles séparément : gros volumes, règlement différé.",
        "Écouler les fins de série de l'année précédente avant la nouvelle rentrée.",
      ],
    },
  },
  {
    slug: "energie-solaire-gaz",
    navLabel: "Espace Énergie",
    tagline: "Ventes et installations du jour, équipements et garanties.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Équipements à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Enregistrer une vente", hint: "Équipement ou kit complet" },
      { href: ROUTES.products, label: "Équipements", hint: "Puissances, capacités et garanties" },
      { href: ROUTES.credit, label: "Installations à crédit", hint: "Échéances et acomptes" },
      { href: ROUTES.customers, label: "Clients", hint: "Installations posées et entretien" },
      { href: ROUTES.purchases, label: "Nouvel arrivage", hint: "Panneaux, batteries, bouteilles" },
    ],
    playbook: {
      title: "Votre routine d'énergie",
      items: [
        "Noter puissance et capacité sur chaque équipement : le client compare ces chiffres.",
        "Préciser si l'installation est incluse — c'est la principale source de litige.",
        "Suivre les garanties batteries : ce sont elles qui reviennent en réclamation.",
        "Encaisser un acompte avant toute commande d'équipement spécifique.",
      ],
    },
  },

  // ── Auto, moto & engins ───────────────────────────────────────────────────
  {
    slug: "garage-mecanique",
    navLabel: "Espace Garage",
    tagline: "Réparations facturées, pièces consommées et factures impayées.",
    metrics: {
      revenue: "Recette du jour",
      count: "Réparations facturées",
      average: "Facture moyenne",
      lowStock: "Pièces à recommander",
    },
    quickActions: [
      { href: ROUTES.repairs, label: "Ordres de réparation", hint: "Les véhicules à l'atelier et leur avancement" },
      { href: ROUTES.products, label: "Pièces & prestations", hint: "Forfaits, temps facturé, pièces" },
      { href: ROUTES.customers, label: "Clients & véhicules", hint: "Historique des interventions" },
      { href: ROUTES.credit, label: "Factures impayées", hint: "Véhicules livrés non réglés" },
      { href: ROUTES.inventory, label: "Stock atelier", hint: "Pièces, huiles et consommables" },
      { href: TRADE_POS_ACTION, label: "Vente au comptoir", hint: "Pièce vendue sans passage à l'atelier" },
    ],
    playbook: {
      title: "Votre routine d'atelier",
      items: [
        "Ouvrir un ordre de réparation dès l'entrée du véhicule : la panne notée à chaud évite les discussions à la livraison.",
        "Facturer la main-d'œuvre comme une ligne à part entière, avec son temps : c'est votre marge.",
        "Ne jamais rendre un véhicule sans facturer l'ordre — même quand le client paie plus tard.",
        "Suivre les pièces à rotation rapide (filtres, plaquettes) pour ne jamais bloquer un chantier.",
      ],
    },
  },
  {
    slug: "station-service",
    navLabel: "Espace Station",
    tagline: "Ventes pompe et boutique, niveaux de cuve et comptes sociétés.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Produits à recharger",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Encaisser", hint: "Carburant, lubrifiant ou boutique" },
      { href: ROUTES.purchases, label: "Livraison carburant", hint: "Enregistrer un dépotage" },
      { href: ROUTES.inventory, label: "Stock cuves", hint: "Litres restants par produit" },
      { href: ROUTES.credit, label: "Comptes sociétés", hint: "Bons et crédits à recouvrer" },
      { href: ROUTES.users, label: "Pompistes", hint: "Qui a encaissé quoi" },
    ],
    playbook: {
      title: "Votre routine de station",
      items: [
        "Relever les compteurs et rapprocher avec les ventes enregistrées à chaque changement d'équipe.",
        "Enregistrer chaque dépotage le jour même : c'est la base du contrôle des cuves.",
        "Suivre les comptes sociétés (bons) séparément des ventes comptant.",
        "Surveiller les écarts de caisse par pompiste — un écart régulier n'est jamais un hasard.",
      ],
    },
  },

  // ── Construction & habitat ────────────────────────────────────────────────
  {
    slug: "electricite-plomberie",
    navLabel: "Espace Magasin",
    tagline: "Ventes du jour, matériel en rupture et comptes installateurs.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Panier moyen",
      lowStock: "Références à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Ouvrir la caisse", hint: "Encaisser un client ou un artisan" },
      { href: ROUTES.products, label: "Matériel", hint: "Calibres, diamètres, normes" },
      { href: ROUTES.credit, label: "Comptes installateurs", hint: "Électriciens et plombiers à crédit" },
      { href: ROUTES.customers, label: "Clients & artisans", hint: "Habitués et entreprises" },
      { href: ROUTES.purchases, label: "Enregistrer un achat", hint: "Arrivage fournisseur" },
    ],
    playbook: {
      title: "Votre routine de magasin",
      items: [
        "Renseigner calibres et diamètres : c'est ce que l'artisan demande, pas le nom commercial.",
        "Tenir un compte par installateur régulier plutôt que des crédits au coup par coup.",
        "Surveiller les références de base (câble, PVC) : leur rupture fait perdre tout le panier.",
        "Comparer vos prix d'achat à chaque arrivage — ce marché bouge vite.",
      ],
    },
  },
  {
    slug: "peinture-decoration",
    navLabel: "Espace Magasin",
    tagline: "Ventes du jour, teintes disponibles et chantiers en cours.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Panier moyen",
      lowStock: "Références à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Ouvrir la caisse", hint: "Encaisser un client ou un peintre" },
      { href: ROUTES.products, label: "Peintures & finitions", hint: "Teintes, contenances, rendements" },
      { href: ROUTES.credit, label: "Comptes peintres", hint: "Chantiers à crédit en cours" },
      { href: ROUTES.customers, label: "Clients & peintres", hint: "Entreprises et artisans" },
      { href: ROUTES.purchases, label: "Enregistrer un achat", hint: "Arrivage fournisseur" },
    ],
    playbook: {
      title: "Votre routine de magasin",
      items: [
        "Noter le rendement au m² : il permet de conseiller la bonne quantité, donc de vendre juste.",
        "Enregistrer le code couleur exact — un client qui revient veut la même teinte.",
        "Suivre les chantiers à crédit par entreprise, avec une date d'échéance.",
        "Écouler les teintes préparées non retirées avant qu'elles ne soient perdues.",
      ],
    },
  },
  {
    slug: "meubles-ameublement",
    navLabel: "Espace Showroom",
    tagline: "Ventes et livraisons du jour, commandes et crédits en cours.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Modèles à réapprovisionner",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Enregistrer une vente", hint: "Encaisser ou ouvrir un crédit" },
      { href: ROUTES.products, label: "Mobilier", hint: "Dimensions, matières, livraison" },
      { href: ROUTES.credit, label: "Ventes à crédit", hint: "Échéances et acomptes en cours" },
      { href: ROUTES.customers, label: "Clients", hint: "Livraisons à programmer" },
      { href: ROUTES.purchases, label: "Nouvel arrivage", hint: "Conteneur ou fabrication reçue" },
    ],
    playbook: {
      title: "Votre routine de showroom",
      items: [
        "Indiquer les dimensions exactes : c'est la première question et la première cause de retour.",
        "Préciser si la livraison est incluse, et facturer le transport quand il ne l'est pas.",
        "Encaisser un acompte sur toute commande sur mesure avant de lancer la fabrication.",
        "Suivre les crédits de près : les montants sont élevés et les échéances longues.",
      ],
    },
  },
  {
    slug: "menuiserie-metallerie",
    navLabel: "Espace Atelier",
    tagline: "Commandes facturées, matières et soldes clients.",
    metrics: {
      revenue: "Recette du jour",
      count: "Commandes facturées",
      average: "Commande moyenne",
      lowStock: "Matières à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Facturer une commande", hint: "Ouvrage livré ou acompte" },
      { href: ROUTES.products, label: "Ouvrages & fournitures", hint: "Types, dimensions, délais" },
      { href: ROUTES.credit, label: "Soldes à encaisser", hint: "Commandes livrées non réglées" },
      { href: ROUTES.customers, label: "Clients", hint: "Commandes en cours et historique" },
      { href: ROUTES.purchases, label: "Achat matières", hint: "Bois, aluminium, fer, vitrage" },
    ],
    playbook: {
      title: "Votre routine d'atelier",
      items: [
        "Prendre un acompte à la commande : la matière s'achète avant d'être payée par le client.",
        "Noter dimensions et délai sur chaque ouvrage — c'est votre engagement écrit.",
        "Facturer le sur-mesure au coût réel de matière, pas à un prix de catalogue.",
        "Relancer les soldes dès la livraison : passé quelques semaines, ils s'oublient.",
      ],
    },
  },

  // ── Agriculture & élevage ─────────────────────────────────────────────────
  {
    slug: "produits-agricoles",
    navLabel: "Espace Magasin",
    tagline: "Collectes, stocks en sacs et ventes de la campagne.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Produits à réapprovisionner",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Enregistrer une vente", hint: "Sacs ou tonnage vendu" },
      { href: ROUTES.purchases, label: "Nouvelle collecte", hint: "Achat auprès d'un producteur" },
      { href: ROUTES.suppliers, label: "Producteurs", hint: "Groupements et collecteurs" },
      { href: ROUTES.inventory, label: "Stock magasin", hint: "Sacs disponibles par produit" },
      { href: ROUTES.credit, label: "Livraisons à régler", hint: "Acheteurs et avances" },
    ],
    playbook: {
      title: "Votre routine de campagne",
      items: [
        "Enregistrer chaque collecte avec le poids et le prix réel payé au producteur.",
        "Noter le taux d'humidité : il détermine la conservation et le prix de revente.",
        "Suivre les avances versées aux producteurs — elles se déduisent à la livraison.",
        "Comparer prix d'achat et prix de vente par campagne pour savoir où vous gagnez.",
      ],
    },
  },
  {
    slug: "intrants-elevage",
    navLabel: "Espace Intrants",
    tagline: "Ventes du jour, péremptions et crédits de campagne.",
    metrics: {
      revenue: "Recette du jour",
      count: "Ventes du jour",
      average: "Vente moyenne",
      lowStock: "Intrants à recommander",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Enregistrer une vente", hint: "Engrais, semences, aliments" },
      { href: ROUTES.products, label: "Intrants & aliments", hint: "Dosages et cultures ciblées" },
      { href: ROUTES.expiry, label: "Péremptions", hint: "Phytosanitaires et vétérinaires" },
      { href: ROUTES.credit, label: "Crédits producteurs", hint: "À rembourser après récolte" },
      { href: ROUTES.customers, label: "Producteurs", hint: "Éleveurs, groupements, coopératives" },
    ],
    playbook: {
      title: "Votre routine d'intrants",
      items: [
        "Contrôler les dates de péremption des phytosanitaires et produits vétérinaires chaque mois.",
        "Caler les échéances de crédit sur la récolte, pas sur un délai fixe de 30 jours.",
        "Noter la culture ou l'espèce ciblée : c'est ce qui évite les erreurs de conseil.",
        "Constituer le stock avant la saison des pluies — après, tout arrive en retard.",
      ],
    },
  },

  // ── Services ──────────────────────────────────────────────────────────────
  {
    slug: "imprimerie-serigraphie",
    navLabel: "Espace Imprimerie",
    tagline: "Travaux facturés, consommables et commandes à livrer.",
    metrics: {
      revenue: "Recette du jour",
      count: "Travaux facturés",
      average: "Commande moyenne",
      lowStock: "Consommables à racheter",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Facturer un travail", hint: "Impression, sérigraphie, flocage" },
      { href: ROUTES.products, label: "Travaux & supports", hint: "Prestations, formats et délais" },
      { href: ROUTES.credit, label: "Factures impayées", hint: "Travaux livrés non réglés" },
      { href: ROUTES.customers, label: "Clients & annonceurs", hint: "Institutions et entreprises" },
      { href: ROUTES.inventory, label: "Stock consommables", hint: "Encres, papiers, bâches" },
    ],
    playbook: {
      title: "Votre routine d'imprimerie",
      items: [
        "Prendre un acompte avant tout tirage personnalisé : il n'est revendable à personne.",
        "Noter le support et le format sur chaque travail — c'est ce qui fait le prix.",
        "Annoncer un délai et le tenir : dans ce métier, la réputation vient de là.",
        "Surveiller les consommables (encre, bâche) : une rupture arrête toute la production.",
      ],
    },
  },
  {
    slug: "transport-logistique",
    navLabel: "Espace Transport",
    tagline: "Expéditions facturées, comptes clients et charges d'exploitation.",
    metrics: {
      revenue: "Recette du jour",
      count: "Expéditions du jour",
      average: "Expédition moyenne",
      lowStock: "Fournitures à racheter",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Enregistrer une expédition", hint: "Colis, fret ou course" },
      { href: ROUTES.products, label: "Services & tarifs", hint: "Unités de facturation et destinations" },
      { href: ROUTES.credit, label: "Comptes clients", hint: "Sociétés qui règlent en fin de mois" },
      { href: ROUTES.expenses, label: "Charges", hint: "Carburant, entretien, péages" },
      { href: ROUTES.customers, label: "Expéditeurs", hint: "Clients réguliers et sociétés" },
    ],
    playbook: {
      title: "Votre routine d'exploitation",
      items: [
        "Facturer selon une unité claire (kilo, trajet, volume) et l'écrire sur le service.",
        "Suivre le carburant comme une charge à part : c'est le poste qui décide de votre marge.",
        "Tenir un compte par société cliente plutôt que des expéditions isolées.",
        "Rapprocher chaque mois recettes et charges par véhicule si vous en avez plusieurs.",
      ],
    },
  },
  {
    slug: "immobilier-location",
    navLabel: "Espace Gérance",
    tagline: "Encaissements du jour, loyers en retard et biens gérés.",
    metrics: {
      revenue: "Encaissé aujourd'hui",
      count: "Encaissements du jour",
      average: "Montant moyen",
      lowStock: "Fournitures à racheter",
    },
    quickActions: [
      { href: ROUTES.rental, label: "Gestion locative", hint: "Biens, baux, loyers et quittances" },
      { href: TRADE_POS_ACTION, label: "Encaisser", hint: "Loyer, caution ou frais d'agence" },
      { href: ROUTES.credit, label: "Loyers impayés", hint: "Retards et échéanciers" },
      { href: ROUTES.customers, label: "Locataires & propriétaires", hint: "Contacts et historique" },
      { href: ROUTES.expenses, label: "Charges & travaux", hint: "Entretien des biens gérés" },
    ],
    playbook: {
      title: "Votre routine de gérance",
      items: [
        "Remettre une quittance à chaque encaissement — c'est la preuve qui évite les litiges.",
        "Relancer dès le 5 du mois : un loyer en retard d'un mois en entraîne souvent un deuxième.",
        "Suivre les cautions séparément des loyers : elles devront être restituées.",
        "Enregistrer les travaux par bien pour savoir lesquels vous coûtent le plus.",
      ],
    },
  },
  {
    slug: "mobile-money-transfert",
    navLabel: "Espace Kiosque",
    tagline: "Opérations du jour, commissions et flotte disponible.",
    metrics: {
      revenue: "Volume encaissé",
      count: "Opérations du jour",
      average: "Opération moyenne",
      lowStock: "Services à réapprovisionner",
    },
    quickActions: [
      { href: TRADE_POS_ACTION, label: "Nouvelle opération", hint: "Dépôt, retrait ou transfert" },
      { href: ROUTES.products, label: "Opérations & services", hint: "Opérateurs et commissions" },
      { href: ROUTES.purchases, label: "Approvisionner la flotte", hint: "Recharge d'unités ou d'espèces" },
      { href: ROUTES.reports, label: "Commissions", hint: "Ce que rapporte chaque opérateur" },
      { href: ROUTES.expenses, label: "Charges", hint: "Loyer du kiosque, connexion, personnel" },
    ],
    playbook: {
      title: "Votre routine de kiosque",
      items: [
        "Compter l'espèce en caisse et la flotte électronique en début et fin de journée.",
        "Enregistrer chaque opération immédiatement : la mémoire ne tient pas sur 80 transactions.",
        "Suivre la commission par opérateur — elle n'est pas la même partout.",
        "Ne jamais avancer d'argent sans le noter : les avances non tracées ne reviennent pas.",
      ],
    },
  },
];

const WORKSPACES_BY_SLUG: Record<string, TradeWorkspace> = Object.fromEntries(
  WORKSPACES.map((w) => [w.slug, w] as const),
);

/** Espace métier d'une activité, ou `undefined` si elle n'en a pas. */
export function tradeWorkspace(
  businessTypeSlug: string | null | undefined,
): TradeWorkspace | undefined {
  if (!businessTypeSlug) return undefined;
  return WORKSPACES_BY_SLUG[businessTypeSlug];
}

/** Ce métier dispose-t-il d'un espace dédié (entrée de menu + page `/metier`) ? */
export function hasTradeWorkspace(
  businessTypeSlug: string | null | undefined,
): boolean {
  return tradeWorkspace(businessTypeSlug) !== undefined;
}
