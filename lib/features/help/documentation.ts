/**
 * Documentation intégrée de FasoStock — un article par module, de A à Z.
 *
 * Cette documentation est la source unique du guide affiché sur la page Aide.
 * Règle d'écriture : on décrit ce que le commerçant fait et ce que l'application
 * répond, jamais le détail technique. Chaque module dit : à quoi il sert, comment
 * on l'ouvre, ce qu'on y fait pas à pas, ce qu'il faut savoir, et les pièges.
 */

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "bullets"; title?: string; items: string[] }
  | { kind: "steps"; title?: string; items: string[] }
  | { kind: "table"; title?: string; head: [string, string]; rows: [string, string][] }
  | { kind: "note"; tone: "info" | "tip" | "warn"; title: string; text: string };

export type DocArticle = {
  /** Identifiant stable — sert d'ancre et de clé d'ouverture. */
  id: string;
  /** Titre du module tel qu'il apparaît dans le menu. */
  title: string;
  /** Chemin de la page dans l'application, si le module a une page dédiée. */
  route?: string;
  /** Phrase unique : à quoi ça sert. */
  tagline: string;
  /** Qui peut ouvrir la page. */
  access: string;
  /** Comment le module s'active, s'il n'est pas ouvert par défaut. */
  activation?: string;
  blocks: DocBlock[];
  /** Mots que le commerçant taperait dans la recherche pour tomber ici. */
  keywords: string[];
};

export type DocGroup = {
  id: string;
  title: string;
  /** Ce que regroupe la famille, en une ligne. */
  summary: string;
  articles: DocArticle[];
};

export const DOC_GROUPS: DocGroup[] = [
  /* ------------------------------------------------------------------ */
  /* 1. PRISE EN MAIN                                                    */
  /* ------------------------------------------------------------------ */
  {
    id: "prise-en-main",
    title: "1 · Prise en main",
    summary: "Le compte, la barre du haut, le tableau de bord et les tout premiers réglages.",
    articles: [
      {
        id: "premiers-pas",
        title: "Premiers pas",
        tagline: "De la création du compte à la première vente, dans l'ordre.",
        access: "Tout le monde.",
        blocks: [
          {
            kind: "p",
            text: "FasoStock s'utilise dans le navigateur (ordinateur, tablette, téléphone) et fonctionne même avec une faible connexion internet. Rien à installer : vous pouvez toutefois ajouter l'application à l'écran d'accueil de votre téléphone pour l'ouvrir comme une application classique.",
          },
          {
            kind: "steps",
            title: "L'ordre à respecter la première semaine",
            items: [
              "Créez votre compte et choisissez votre type d'activité (boutique, pharmacie, quincaillerie, vente d'engins, restaurant…). Ce choix adapte les libellés et les modules proposés — il n'est pas anodin.",
              "Complétez la fiche entreprise dans Paramètres : nom, logo, téléphone. Le logo apparaît sur les factures et les tickets.",
              "Créez vos boutiques (page Boutiques). Une boutique = un point de vente physique avec son stock et sa caisse.",
              "Saisissez ou importez vos produits (page Produits, import CSV possible). Prix d'achat ET prix de vente : sans prix d'achat, aucune marge ne sera calculable.",
              "Mettez le stock de départ : soit article par article, soit par une session d'inventaire (page Inventaire), soit par un achat fournisseur (page Achats).",
              "Créez vos employés et donnez-leur un rôle (page Employés). Ne partagez jamais votre compte propriétaire.",
              "Réglez la caisse et la facture (Paramètres + page Boutiques) : format du ticket, logo de la facture, impression automatique.",
              "Faites une vente d'essai en caisse rapide, imprimez le ticket, puis annulez-la. Vous saurez que la chaîne complète fonctionne.",
            ],
          },
          {
            kind: "bullets",
            title: "La barre du haut, à connaître par cœur",
            items: [
              "Sélecteur d'entreprise : si vous gérez plusieurs entreprises, tout ce que vous voyez dépend de ce choix.",
              "Sélecteur de boutique : la plupart des pages (stock, ventes, caisse) affichent la boutique sélectionnée. « Toutes les boutiques » consolide les chiffres mais interdit certaines actions qui doivent viser une boutique précise.",
              "Cloche de notifications (propriétaire) : ruptures, échéances, alertes.",
              "Menu latéral : la liste complète des modules ouverts pour vous. Sur téléphone, les trois raccourcis du bas (Tableau de bord, Produits, Ventes) et le bouton « Plus ».",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Le piège numéro un",
            text: "Une action faite dans la mauvaise boutique. Avant d'ajuster un stock, d'encaisser ou de valider un inventaire, vérifiez le nom de la boutique affiché en haut.",
          },
        ],
        keywords: ["démarrer", "commencer", "débuter", "installation", "première vente", "configuration"],
      },
      {
        id: "compte-securite",
        title: "Compte et sécurité",
        route: "/settings",
        tagline: "Votre identifiant, votre mot de passe, la double authentification.",
        access: "Chaque utilisateur pour son propre compte ; le propriétaire pour les comptes de ses employés.",
        blocks: [
          {
            kind: "bullets",
            title: "Ce que vous gérez vous-même (Paramètres)",
            items: [
              "Nom affiché : c'est celui qui apparaît sur les ventes que vous enregistrez et dans le journal d'audit.",
              "Adresse e-mail : elle sert d'identifiant de connexion.",
              "Mot de passe : six caractères minimum. Changez-le si un employé l'a vu.",
              "Authentification à deux facteurs (2FA) : un code supplémentaire à la connexion. Fortement conseillé pour le compte propriétaire.",
              "Apparence : thème clair, sombre ou automatique selon le téléphone.",
            ],
          },
          {
            kind: "bullets",
            title: "Mot de passe oublié",
            items: [
              "Employé : le propriétaire peut réinitialiser son mot de passe directement depuis la page Employés (bouton en forme de clé). Immédiat, sans e-mail.",
              "Propriétaire : utilisez « Mot de passe oublié » sur l'écran de connexion, un lien vous est envoyé par e-mail.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Un compte par personne",
            text: "Si trois caissiers partagent un compte, les rapports « qui a vendu combien » et le journal d'audit n'ont plus aucune valeur, et vous ne pouvez plus retrouver qui a fait quoi en cas de manquant en caisse.",
          },
        ],
        keywords: ["mot de passe", "connexion", "2fa", "sécurité", "profil", "email"],
      },
      {
        id: "dashboard",
        title: "Tableau de bord",
        route: "/dashboard",
        tagline: "La photo du jour : ce qui est entré, ce qui est sorti, ce qui manque.",
        access: "Selon le rôle. Le propriétaire voit l'ensemble ; un caissier voit une version réduite.",
        blocks: [
          {
            kind: "p",
            text: "C'est la page d'accueil. Elle répond en un coup d'œil à trois questions : combien j'ai vendu, combien ça m'a rapporté, et qu'est-ce qui va me manquer.",
          },
          {
            kind: "bullets",
            title: "Ce qu'on y trouve",
            items: [
              "Chiffre d'affaires et nombre de ventes sur la période choisie.",
              "Marge estimée : différence entre le prix de vente et le prix d'achat des articles vendus. Elle n'existe que si vos prix d'achat sont saisis.",
              "Courbes d'évolution des ventes, pour voir la tendance plutôt qu'un chiffre isolé.",
              "Produits en rupture ou sous le seuil d'alerte.",
              "Pour les métiers concernés : carte des produits dont la date de péremption approche.",
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Crédit et bénéfice",
            text: "Le tableau de bord reconnaît le chiffre d'affaires et la marge au prorata de ce qui a été réellement encaissé. Une vente à crédit non remboursée n'est donc pas comptée comme un bénéfice acquis. C'est volontaire : ce que le client vous doit n'est pas de l'argent que vous avez. Les montants facturés, eux, se lisent sur la page Ventes.",
          },
        ],
        keywords: ["accueil", "kpi", "chiffre d'affaires", "marge", "statistiques", "résumé"],
      },
      {
        id: "stores",
        title: "Boutiques",
        route: "/stores",
        tagline: "Vos points de vente : leur stock, leur caisse, leurs documents.",
        access: "Propriétaire, et gestionnaires selon leurs droits.",
        blocks: [
          {
            kind: "p",
            text: "Chaque boutique a son propre stock, ses propres ventes et sa propre configuration d'impression. Une entreprise peut en avoir plusieurs ; le nombre autorisé dépend de votre abonnement.",
          },
          {
            kind: "bullets",
            title: "Les trois boutons de la carte d'une boutique",
            items: [
              "Configurer le ticket : format 58 mm ou 80 mm, en-tête, pied de page, mentions légales, impression automatique après encaissement.",
              "Configurer la facture A4 : logo, slogan, nom et fonction du signataire, mentions, modèle de mise en page.",
              "Modifier : nom, adresse, téléphone de la boutique. Ces informations sont imprimées sur les documents remis au client.",
            ],
          },
          {
            kind: "bullets",
            title: "Catalogue par boutique",
            items: [
              "Un produit peut être partagé par toute l'entreprise, ou réservé à une boutique donnée.",
              "Utile quand vos points de vente ne vendent pas la même chose : la caisse d'une boutique n'est pas encombrée par les articles d'une autre.",
              "Le réglage se fait depuis la fiche produit ou depuis la boutique (dialogue Catalogue).",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Où se lance la caisse",
            text: "La caisse ne se lance pas depuis cette page mais depuis Ventes. La page Boutiques sert à paramétrer, pas à vendre.",
          },
        ],
        keywords: ["magasin", "point de vente", "succursale", "ticket", "facture", "configuration"],
      },
      {
        id: "users",
        title: "Employés et rôles",
        route: "/users",
        tagline: "Qui a le droit de faire quoi, et dans quelle boutique.",
        access: "Propriétaire, ou utilisateur disposant du droit de gestion des utilisateurs.",
        blocks: [
          {
            kind: "steps",
            title: "Créer un employé",
            items: [
              "Cliquez sur « Nouvel employé ».",
              "Saisissez le nom, l'e-mail (son identifiant) et un mot de passe provisoire.",
              "Choisissez son rôle — c'est lui qui détermine les pages visibles.",
              "Affectez-le à une boutique si son travail se limite à un point de vente.",
              "Transmettez-lui ses identifiants et demandez-lui de changer le mot de passe.",
            ],
          },
          {
            kind: "table",
            title: "Les rôles",
            head: ["Rôle", "Ce qu'il peut faire"],
            rows: [
              ["Propriétaire", "Tout, sans restriction : chiffres, réglages, employés, suppression de données."],
              ["Gestionnaire", "Pilote l'activité : ventes, stock, achats, rapports. Pas les réglages sensibles."],
              ["Gestionnaire de boutique", "Comme ci-dessus, mais limité à sa boutique."],
              ["Caissier", "Vend, encaisse, imprime. Voit les produits, les clients et les alertes de stock. Ne voit ni les marges ni les prix d'achat."],
              ["Magasinier", "Gère le dépôt central, les entrées, les transferts et les inventaires. Ne vend pas."],
              ["Comptable", "Accède à la comptabilité et aux états financiers."],
              ["Lecture seule", "Consulte sans jamais rien modifier."],
            ],
          },
          {
            kind: "bullets",
            title: "Droits fins",
            items: [
              "Au-delà du rôle, certaines pages s'accordent une par une : Crédit, Promotions, Code Barre, Dépenses, Péremptions, Prix de revient, Emplacements, Boutique en ligne, Comptabilité…",
              "Par défaut ces pages sont réservées au propriétaire ; vous les ouvrez explicitement à un employé.",
              "Le bouton en forme de clé réinitialise le mot de passe d'un employé sans passer par l'e-mail.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Le départ d'un employé",
            text: "Désactivez son compte le jour même. Ne le supprimez pas : ses ventes passées doivent rester rattachées à son nom pour vos rapports et votre journal d'audit.",
          },
        ],
        keywords: ["utilisateurs", "personnel", "caissier", "droits", "permissions", "rôle", "équipe"],
      },
      {
        id: "settings",
        title: "Paramètres",
        route: "/settings",
        tagline: "Le poste de pilotage : tout ce que le propriétaire active ou coupe.",
        access: "Propriétaire (certaines cartes sont visibles par les autres pour leur seul profil).",
        blocks: [
          {
            kind: "bullets",
            title: "Caisse rapide",
            items: [
              "Impression automatique du ticket après encaissement.",
              "Saisie des quantités : boutons + / − ou champ libre.",
              "Vente à crédit en caisse rapide : ajoute un bouton « CRÉDIT » au moment du paiement. Désactivé par défaut.",
              "Saisie du prix en caisse rapide : rend le prix unitaire modifiable dans le panier. À n'ouvrir que si vous négociez réellement vos prix — sinon vos marges deviennent imprévisibles.",
              "Affichage de l'emplacement du produit à la caisse (si le module Emplacements est actif).",
              "Affichage des modèles compatibles à la caisse (si le module Pièces est actif).",
            ],
          },
          {
            kind: "bullets",
            title: "Facture A4",
            items: [
              "Paramétrage du document : logo, slogan, signataire, mentions.",
              "Vue tableau : une saisie de facture en mode tableau, plus rapide pour les longues listes d'articles.",
            ],
          },
          {
            kind: "bullets",
            title: "Modules que le propriétaire ouvre lui-même",
            items: [
              "Prix de revient — calcul du coût réel d'un arrivage.",
              "Emplacements des produits — plan de rangement de la boutique.",
              "Autres noms des produits — alias de recherche (quatre au maximum par produit).",
            ],
          },
          {
            kind: "bullets",
            title: "Entreprise, abonnement, apparence",
            items: [
              "Fiche entreprise : nom, logo, coordonnées.",
              "Abonnement : votre plan en cours (détail complet sur la page Abonnement).",
              "Apparence : thème clair, sombre ou système.",
              "Notifications push : recevez les alertes sur votre téléphone.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Zone de purge",
            text: "En bas de la page se trouvent des actions de vidage (stock, produits, ventes, achats, transferts, mouvements). Elles sont irréversibles et destinées à nettoyer une période de test avant le démarrage réel. Vérifiez le périmètre affiché — toute l'entreprise ou une boutique — avant de confirmer.",
          },
        ],
        keywords: ["réglages", "configuration", "options", "activer", "préférences", "purge"],
      },
      {
        id: "subscription",
        title: "Abonnement",
        route: "/abonnement",
        tagline: "Votre plan, sa date de renouvellement, vos factures.",
        access: "Propriétaire.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Consultez le plan en cours et son statut : actif, paiement en attente ou résilié.",
              "Le plan détermine notamment le nombre de boutiques et d'employés autorisés.",
              "Souscrivez ou changez de formule depuis cette page.",
              "Téléchargez les factures d'abonnement.",
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Besoin d'une boutique de plus ?",
            text: "Si vous atteignez le quota de votre plan, une demande d'augmentation peut être faite depuis la page Boutiques. Elle est validée par FasoStock.",
          },
        ],
        keywords: ["plan", "paiement", "facture", "renouvellement", "quota", "souscription"],
      },
      {
        id: "help-tutorials",
        title: "Aide et tutoriels vidéo",
        route: "/help",
        tagline: "Cette page : la documentation, les vidéos et les contacts du support.",
        access: "Tout le monde. Le guide détaillé est réservé au propriétaire.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Tutoriels vidéo : classés par module, filtrables, lus directement dans l'application.",
              "Documentation : l'ensemble des modules, avec recherche par mot-clé.",
              "Contact : WhatsApp, appel vocal et e-mail. Les mêmes numéros servent pour l'écrit et la voix.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Avant d'appeler",
            text: "Notez la page où le problème survient, l'heure, et le message affiché à l'écran. Le support retrouve la trace de l'action bien plus vite avec ces trois informations.",
          },
        ],
        keywords: ["aide", "support", "documentation", "vidéo", "tutoriel", "contact", "whatsapp"],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 2. CATALOGUE                                                        */
  /* ------------------------------------------------------------------ */
  {
    id: "catalogue",
    title: "2 · Catalogue et prix",
    summary: "Ce que vous vendez : les fiches produits, les codes-barres, les prix et les remises.",
    articles: [
      {
        id: "products",
        title: "Produits",
        route: "/products",
        tagline: "Le cœur du logiciel : tout part de la fiche produit.",
        access: "Selon le rôle. Le caissier consulte, le gestionnaire modifie.",
        blocks: [
          {
            kind: "p",
            text: "Une fiche produit mal remplie se paie partout ailleurs : marges fausses, alertes qui ne sonnent pas, recherche lente en caisse. C'est le module sur lequel il faut passer du temps une bonne fois.",
          },
          {
            kind: "table",
            title: "Les champs, et à quoi ils servent vraiment",
            head: ["Champ", "Conséquence si mal rempli"],
            rows: [
              ["Nom", "Le caissier ne trouve pas l'article et perd du temps devant le client."],
              ["Prix d'achat", "Aucune marge calculable : le tableau de bord et les rapports deviennent aveugles."],
              ["Prix de vente", "C'est le prix appliqué automatiquement en caisse."],
              ["Stock", "La quantité disponible dans la boutique sélectionnée."],
              ["Seuil d'alerte", "Sans seuil, aucune alerte de rupture ne se déclenche."],
              ["Code-barres", "Sans code, pas de scan possible en caisse."],
              ["Catégorie", "Sert aux filtres et à l'analyse par famille dans les rapports."],
              ["Photo", "Aide à l'identification visuelle, surtout en caisse tactile."],
            ],
          },
          {
            kind: "bullets",
            title: "Import et export",
            items: [
              "Import CSV : pour créer ou mettre à jour des centaines d'articles d'un coup. Un modèle téléchargeable donne les colonnes attendues.",
              "Travaillez le fichier dans un tableur, contrôlez-le, puis importez. L'application vous montre ce qu'elle a compris avant d'écrire.",
              "Export : récupérez votre catalogue pour le retravailler ou l'archiver.",
            ],
          },
          {
            kind: "bullets",
            title: "Conditionnements multiples",
            items: [
              "Un même produit peut se vendre à l'unité, au paquet ou au carton.",
              "Vous définissez combien d'unités contient un paquet et un carton.",
              "En caisse, le choix du conditionnement décompte automatiquement le bon nombre d'unités du stock.",
              "Indispensable dès que vous achetez en gros et revendez au détail.",
            ],
          },
          {
            kind: "bullets",
            title: "Autres noms (alias de recherche)",
            items: [
              "Jusqu'à quatre noms alternatifs par produit : nom local, marque, abréviation, faute d'orthographe courante.",
              "Le caissier tape le mot qu'il connaît, l'article sort quand même.",
              "À activer par le propriétaire dans Paramètres.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Le bon réflexe",
            text: "Ne créez jamais deux fiches pour le même article. Une fiche dupliquée sépare le stock en deux et fausse durablement vos ventes par produit. En cas de doute, cherchez avant de créer.",
          },
        ],
        keywords: ["articles", "catalogue", "fiche", "prix", "csv", "import", "conditionnement", "alias"],
      },
      {
        id: "barcodes",
        title: "Code Barre",
        route: "/barcodes",
        tagline: "Imprimer vos propres étiquettes sur imprimante thermique.",
        access: "Propriétaire par défaut ; accordable à un employé.",
        blocks: [
          {
            kind: "p",
            text: "Pour les articles qui n'ont pas de code d'usine, ou dont l'étiquette est illisible. Vous imprimez vos étiquettes et le scan redevient possible en caisse.",
          },
          {
            kind: "steps",
            items: [
              "Sélectionnez les produits à étiqueter.",
              "Indiquez le nombre d'étiquettes par produit.",
              "Choisissez le format ; le format QR 40 × 30 mm est celui qui a été validé sur le terrain.",
              "Lancez l'impression sur votre imprimante thermique.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Réglage imprimante",
            text: "Le format 40 × 30 mm a été validé sur une Xprinter XP-237B. Si vos étiquettes sortent décalées, le problème vient presque toujours du réglage du papier dans le pilote de l'imprimante, pas de l'application.",
          },
        ],
        keywords: ["étiquette", "qr", "scan", "imprimante", "thermique", "code-barres"],
      },
      {
        id: "parts",
        title: "Pièces",
        route: "/pieces",
        tagline: "Pour la pièce détachée : quelle pièce va sur quel modèle, et par quoi la remplacer.",
        access: "Propriétaire par défaut ; accordable.",
        activation: "Ouvert par FasoStock pour votre entreprise ou pour une boutique donnée.",
        blocks: [
          {
            kind: "p",
            text: "Conçu pour les quincailleries et vendeurs de pièces : le client décrit son engin plus qu'il ne connaît la référence. Ce module fait le lien.",
          },
          {
            kind: "table",
            title: "Les quatre onglets",
            head: ["Onglet", "Ce qu'on y fait"],
            rows: [
              ["Recherche", "Le client dit son modèle, vous obtenez la liste des pièces compatibles en stock."],
              ["Modèles", "Créez les modèles d'engins ou de machines que vous servez."],
              ["Équivalences", "Déclarez que la pièce A remplace la pièce B. Si A manque, vous proposez B au lieu de perdre la vente."],
              ["Variantes", "Regroupez les déclinaisons d'une même pièce (taille, couleur, qualité)."],
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Gagner la vente en caisse",
            text: "Vous pouvez afficher les modèles compatibles directement en caisse (puces « Va sur : … »). Le caissier confirme au client que la pièce ira sur son engin sans quitter l'écran de vente.",
          },
        ],
        keywords: ["pièce détachée", "compatibilité", "équivalence", "variante", "moto", "modèle"],
      },
      {
        id: "product-locations",
        title: "Emplacements",
        route: "/emplacements",
        tagline: "Où se trouve physiquement l'article dans la boutique.",
        access: "Propriétaire par défaut ; accordable.",
        activation: "Activé par le propriétaire dans Paramètres.",
        blocks: [
          {
            kind: "p",
            text: "Quand le magasin grossit, on perd plus de temps à chercher un article qu'à le vendre. Ce module donne à chaque produit une adresse : allée, rayon, étagère, casier.",
          },
          {
            kind: "table",
            title: "Les trois onglets",
            head: ["Onglet", "Ce qu'on y fait"],
            rows: [
              ["Plan", "Décrivez la structure de votre boutique une fois pour toutes (allées, rayons, niveaux)."],
              ["Ranger", "Attribuez un emplacement à chaque produit. Le filtre « Sans emplacement » montre ce qui reste à faire."],
              ["Trouver", "Tapez un nom de produit, obtenez son emplacement. C'est l'onglet du quotidien."],
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "À la caisse aussi",
            text: "Une option de Paramètres affiche l'emplacement directement dans l'écran de vente : le caissier envoie le manutentionnaire au bon endroit sans changer de page.",
          },
        ],
        keywords: ["rangement", "rayon", "allée", "étagère", "localisation", "où est"],
      },
      {
        id: "promotions",
        title: "Promotions",
        route: "/promotions",
        tagline: "Des remises en pourcentage, sur une période, appliquées seules en caisse.",
        access: "Propriétaire par défaut ; accordable.",
        blocks: [
          {
            kind: "steps",
            items: [
              "Créez une promotion : produit concerné, pourcentage de remise, boutique, date de début et date de fin.",
              "À la date de début, la caisse applique la remise automatiquement — le caissier n'a rien à calculer ni à saisir.",
              "À la date de fin, le prix normal revient de lui-même.",
            ],
          },
          {
            kind: "bullets",
            title: "Ce que ça change ailleurs",
            items: [
              "Le ticket montre le prix remisé : le client voit ce qu'il a gagné.",
              "Les rapports enregistrent le montant réellement encaissé, remise déduite : votre marge reste juste.",
              "Une affiche publicitaire peut être générée pour communiquer sur l'offre, si FasoStock a ouvert cette option.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Vérifiez la marge avant",
            text: "Une remise de 20 % sur un article dont la marge est de 15 % vend à perte. Le module applique ce que vous lui dites — il ne vous en empêchera pas.",
          },
        ],
        keywords: ["remise", "solde", "réduction", "pourcentage", "offre", "affiche"],
      },
      {
        id: "landed-cost",
        title: "Prix de revient",
        route: "/prix-revient",
        tagline: "Ce que la marchandise vous coûte vraiment, transport et douane compris.",
        access: "Propriétaire par défaut ; accordable.",
        activation: "Activé par le propriétaire dans Paramètres.",
        blocks: [
          {
            kind: "p",
            text: "Le prix payé au fournisseur n'est pas le prix de revient. Entre les deux il y a le transport, la douane, la manutention, parfois le change. Ce module répartit ces frais d'approche sur chaque article de l'arrivage et vous dit à quel prix vendre pour gagner ce que vous voulez gagner.",
          },
          {
            kind: "steps",
            title: "Traiter un arrivage",
            items: [
              "Créez l'arrivage : sa date, son fournisseur, sa référence.",
              "Saisissez les articles reçus avec leur quantité et leur prix fournisseur.",
              "Ajoutez les frais : transport, douane, manutention, et tout autre coût lié à cet arrivage.",
              "L'application répartit ces frais et affiche, ligne par ligne, le coût réel de l'article.",
              "Fixez votre marge : le prix de vente conseillé s'affiche.",
              "Appliquez : les prix d'achat et de vente du catalogue sont mis à jour. L'arrivage passe de « Brouillon » à « Appliqué ».",
            ],
          },
          {
            kind: "bullets",
            title: "Bon à savoir",
            items: [
              "Un arrivage reste modifiable tant qu'il est en brouillon. Une fois appliqué, il est verrouillé pour garder une trace fiable.",
              "L'historique des prix conserve la trace de chaque changement : vous savez pourquoi un prix a bougé et quand.",
              "Le guide complet, avec un exemple chiffré de bout en bout, s'ouvre depuis la page (bouton « Comment ça marche ? »).",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "L'erreur classique",
            text: "Vendre avec la marge calculée sur le prix fournisseur seul. Sur un conteneur, les frais d'approche représentent souvent 10 à 25 % du coût : une marge de 15 % appliquée au mauvais prix, c'est une vente à perte sans s'en apercevoir.",
          },
        ],
        keywords: ["coût", "frais d'approche", "douane", "transport", "arrivage", "marge", "revient"],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 3. VENDRE                                                           */
  /* ------------------------------------------------------------------ */
  {
    id: "vendre",
    title: "3 · Vendre et encaisser",
    summary: "La caisse, la facture, l'historique des ventes et les canaux de vente particuliers.",
    articles: [
      {
        id: "pos-quick",
        title: "Caisse rapide (POS)",
        route: "/sales",
        tagline: "Encaisser vite, avec ticket thermique. C'est l'écran le plus utilisé de la journée.",
        access: "Caissier, gestionnaire, propriétaire.",
        blocks: [
          {
            kind: "steps",
            title: "Le geste de base",
            items: [
              "Ouvrez la caisse depuis la page Ventes, pour la boutique concernée.",
              "Ajoutez les articles : scannez le code-barres, ou tapez le nom et touchez le produit. Un bip et une vibration confirment l'ajout au panier.",
              "Ajustez les quantités et, si besoin, le conditionnement (unité, paquet, carton).",
              "Touchez Payer, choisissez le mode : espèces, mobile money, carte — ou crédit si l'option est activée.",
              "Le ticket s'imprime, automatiquement si vous l'avez réglé ainsi.",
            ],
          },
          {
            kind: "bullets",
            title: "Ce que la caisse fait toute seule",
            items: [
              "Décompte le stock de la boutique en temps réel.",
              "Applique les promotions en cours sans intervention.",
              "Calcule la monnaie à rendre.",
              "Rattache la vente au caissier connecté — c'est la base du rapport « qui a vendu combien ».",
            ],
          },
          {
            kind: "bullets",
            title: "Options que le propriétaire peut ouvrir",
            items: [
              "Bouton CRÉDIT : vendre à un client qui paiera plus tard, avec ou sans acompte.",
              "Prix unitaire modifiable dans le panier : pour les commerces où l'on négocie.",
              "Emplacement du produit affiché : pour envoyer chercher l'article sans quitter l'écran.",
              "Modèles compatibles affichés : pour la pièce détachée.",
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Le bip d'ajout au panier",
            text: "Il est volontairement franc et sec : dans le bruit d'une boutique, un son doux ne s'entend pas et le caissier scanne deux fois le même article. Sur iPhone, il reste muet si le téléphone est en mode silencieux — la vibration prend alors le relais.",
          },
        ],
        keywords: ["caisse", "pos", "vendre", "encaisser", "ticket", "panier", "scan", "monnaie"],
      },
      {
        id: "invoice-a4",
        title: "Facture A4",
        route: "/sales",
        tagline: "La vente détaillée avec un vrai document commercial, pour les professionnels.",
        access: "Selon le droit « facture A4 ».",
        blocks: [
          {
            kind: "p",
            text: "Quand le client est une entreprise, une administration ou un chantier, le ticket thermique ne suffit pas. La facture A4 porte votre logo, vos coordonnées, le détail des lignes, le mode de règlement et la signature.",
          },
          {
            kind: "bullets",
            title: "Ce qui est paramétrable, par boutique",
            items: [
              "Logo, slogan, coordonnées.",
              "Nom et fonction du signataire.",
              "Modèle de mise en page.",
              "Mentions légales et conditions de règlement.",
            ],
          },
          {
            kind: "bullets",
            title: "Crédit et acompte sur la facture",
            items: [
              "Le règlement est affiché même s'il est à zéro : le client voit ce qu'il a versé.",
              "La ligne « À crédit » indique le montant restant dû.",
              "L'échéance convenue est imprimée sur le document.",
              "La remise accordée apparaît quand le modèle de facture la prévoit.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Vue tableau",
            text: "Pour une facture de trente lignes, activez la vue tableau dans Paramètres : la saisie se fait au clavier, ligne après ligne, sans passer par l'écran tactile.",
          },
        ],
        keywords: ["facture", "a4", "pdf", "devis", "professionnel", "signature", "logo"],
      },
      {
        id: "sales",
        title: "Historique des ventes",
        route: "/sales",
        tagline: "Toutes les ventes : les retrouver, les rééditer, les analyser.",
        access: "Caissier (les siennes selon les droits), gestionnaire, propriétaire.",
        blocks: [
          {
            kind: "bullets",
            title: "Ce que vous pouvez faire",
            items: [
              "Filtrer par période avec les puces rapides, ou choisir des dates précises.",
              "Filtrer par vendeur : utile pour vérifier une caisse en fin de journée.",
              "Ouvrir une vente pour voir son détail ligne par ligne.",
              "Réimprimer le ticket ou télécharger la facture.",
              "Envoyer le document au client par WhatsApp ou une autre application.",
              "Annuler une vente si vous en avez le droit — le stock est alors remis.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Facturé n'est pas encaissé",
            text: "Les montants de cette page sont les montants facturés. Les Rapports, eux, raisonnent en encaissé. Un écart entre les deux pages n'est pas une erreur : c'est votre crédit client. C'est même l'écart le plus utile à surveiller.",
          },
        ],
        keywords: ["historique", "ventes", "journal", "annuler", "réimprimer", "vendeur", "période"],
      },
      {
        id: "online-store",
        title: "Boutique en ligne",
        route: "/boutique-en-ligne",
        tagline: "Un catalogue public partageable, et les commandes qui en découlent.",
        access: "Propriétaire par défaut ; accordable.",
        activation: "Ouverte par FasoStock pour votre entreprise ou une boutique.",
        blocks: [
          {
            kind: "p",
            text: "Vos produits deviennent une page web publique que vous partagez par lien, sur WhatsApp ou sur les réseaux. Le client commande depuis son téléphone ; la commande arrive dans l'application.",
          },
          {
            kind: "table",
            title: "Les trois onglets",
            head: ["Onglet", "Ce qu'on y fait"],
            rows: [
              ["Commandes", "Les commandes reçues, filtrables : à traiter, confirmées, prêtes, encaissées, annulées."],
              ["Vitrine", "Ce que le public voit : produits affichés, présentation, informations de la boutique."],
              ["Partager", "Le lien de votre catalogue, à copier et diffuser."],
            ],
          },
          {
            kind: "steps",
            title: "Le parcours d'une commande",
            items: [
              "Le client commande depuis le lien public.",
              "La commande apparaît dans l'onglet Commandes, à l'état « À traiter ».",
              "Vous la confirmez et préparez les articles.",
              "Vous la passez à « Prête », le client est prévenu et dispose d'un lien de suivi.",
              "À la remise, vous encaissez : la commande devient « Encaissée » et le stock est décompté.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Un catalogue public est un engagement",
            text: "Prix faux ou article indisponible affiché en ligne, le client le découvre en arrivant. Tenez la vitrine à jour, ou n'affichez que les produits dont vous maîtrisez le stock.",
          },
        ],
        keywords: ["e-commerce", "vitrine", "catalogue en ligne", "commande web", "lien", "partager"],
      },
      {
        id: "engine-sales",
        title: "Vente Engins",
        route: "/engins",
        tagline: "Vendre des motos et engins : facture A4 nominative et QR de vérification.",
        access: "Propriétaire et employés autorisés.",
        activation: "Activé par boutique par FasoStock.",
        blocks: [
          {
            kind: "p",
            text: "Un engin n'est pas un article de rayon : il a un numéro de châssis, un numéro de moteur, un acheteur nommé, et il se paie souvent en plusieurs fois. Ce module traite ce cas de bout en bout.",
          },
          {
            kind: "steps",
            items: [
              "Ouvrez la vente d'engin pour la boutique concernée.",
              "Sélectionnez l'engin et saisissez ses identifiants : châssis, moteur, couleur, modèle.",
              "Renseignez l'acheteur — son identité figurera sur la facture et sur les documents administratifs.",
              "Enregistrez le règlement : total, partiel ou impayé. L'état de la vente suit ces trois cas.",
              "Éditez la facture A4. Elle porte un QR code qui permet de vérifier son authenticité en ligne.",
            ],
          },
          {
            kind: "bullets",
            title: "Suivi des règlements",
            items: [
              "Payé, Partiel, Impayé : chaque vente affiche son état.",
              "Vous encaissez les versements successifs depuis la fiche de la vente.",
              "Le reste dû est visible à tout moment.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Le QR de vérification",
            text: "Il pointe vers une page publique qui confirme que la facture est bien la vôtre. C'est votre protection contre les fausses factures présentées en votre nom.",
          },
        ],
        keywords: ["moto", "engin", "châssis", "moteur", "vente", "qr", "vérification"],
      },
      {
        id: "engine-registration",
        title: "Immatriculation Engins",
        route: "/immatriculation",
        tagline: "Suivre les papiers de l'engin jusqu'à la carte grise, sans litige.",
        access: "Propriétaire et employés autorisés.",
        activation: "Activé par boutique par FasoStock.",
        blocks: [
          {
            kind: "p",
            text: "Après la vente commence le parcours administratif : CMC, plaque WW, récépissé, carte grise. Le client revient réclamer ses papiers des mois plus tard — et la mémoire ne suffit pas.",
          },
          {
            kind: "bullets",
            title: "Ce qui est suivi, étape par étape",
            items: [
              "CMC : le certificat de mise en circulation.",
              "Plaque WW : la plaque provisoire.",
              "Récépissé : le document intermédiaire.",
              "Carte grise : le document final.",
            ],
          },
          {
            kind: "bullets",
            title: "La remise au client — la partie anti-litige",
            items: [
              "Chaque document remis est marqué : remis ou non.",
              "La date de remise est enregistrée.",
              "Le nom de celui qui a remis est enregistré.",
              "Le nom de celui qui a reçu est enregistré.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Pourquoi ces quatre informations",
            text: "Le jour où un client affirme n'avoir jamais reçu sa carte grise, vous sortez la date, le nom de votre employé et le nom du récepteur. La discussion s'arrête là.",
          },
        ],
        keywords: ["carte grise", "ww", "cmc", "récépissé", "papiers", "administration", "litige"],
      },
      {
        id: "progressive",
        title: "Achats Progressifs",
        route: "/achats-progressifs",
        tagline: "Le client épargne chez vous par versements jusqu'à pouvoir emporter son article.",
        access: "Propriétaire par défaut ; accordable.",
        activation: "Activé par boutique par FasoStock.",
        blocks: [
          {
            kind: "p",
            text: "Beaucoup de clients ne peuvent pas payer un article d'un coup mais peuvent verser régulièrement. Plutôt que de leur faire crédit, vous encaissez d'abord : ils épargnent chez vous, et emportent l'article quand le montant est atteint. Ce n'est pas réservé aux engins — tous les métiers peuvent l'utiliser.",
          },
          {
            kind: "steps",
            items: [
              "Créez un plan : le client, l'article visé, le montant total, le rythme envisagé.",
              "À chaque passage du client, enregistrez le versement. Un ticket thermique lui est remis à chaque fois.",
              "Le plan affiche en permanence le versé, le restant et l'avancement.",
              "Quand le total est atteint, le plan passe à « Prêt ».",
              "Vous convertissez le plan en vente et remettez l'article.",
            ],
          },
          {
            kind: "bullets",
            title: "États d'un plan",
            items: [
              "En cours : le client verse encore.",
              "Prêt : le montant est atteint, l'article peut être remis.",
              "Remis / converti : l'article est parti, la vente est enregistrée.",
              "Annulé : le plan s'arrête. Traitez le remboursement selon vos règles commerciales.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Le ticket à chaque versement",
            text: "Ne l'omettez jamais, même pour un petit montant, même pour un habitué. C'est la preuve du client et la vôtre. Un plan d'épargne sans traces écrites finit toujours en discussion.",
          },
        ],
        keywords: ["épargne", "versement", "acompte", "tontine", "progressif", "plan", "ticket"],
      },
      {
        id: "rental",
        title: "Location",
        route: "/location",
        tagline: "Gestion locative : biens, locataires, baux, loyers et quittances.",
        access: "Propriétaire par défaut ; accordable.",
        activation: "Activé par boutique par FasoStock.",
        blocks: [
          {
            kind: "table",
            title: "Les cinq onglets",
            head: ["Onglet", "Ce qu'on y fait"],
            rows: [
              ["Tableau de bord", "Encaissé du mois, retards, échéances à venir."],
              ["Loyers & baux", "Le suivi du quotidien, filtrable : tous, en retard, à encaisser, à jour, clôturés."],
              ["Biens", "Vos immeubles et leurs unités (appartements, boutiques, chambres)."],
              ["Locataires", "Les fiches : identité, contact, historique de paiement."],
              ["Charges", "Les dépenses du bien : réparations, entretien, taxes."],
            ],
          },
          {
            kind: "steps",
            title: "Mettre en place",
            items: [
              "Créez le bien, puis ses unités.",
              "Créez le locataire.",
              "Créez le bail : unité, locataire, montant du loyer, périodicité, date de début.",
              "À chaque paiement, enregistrez-le et imprimez la quittance (58 ou 80 mm).",
              "À la sortie, clôturez le bail.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Le filtre « En retard »",
            text: "C'est votre liste d'appels du mois. Un retard traité à cinq jours se récupère ; à trois mois, beaucoup moins.",
          },
        ],
        keywords: ["loyer", "bail", "locataire", "immobilier", "quittance", "appartement", "charges"],
      },
      {
        id: "send-document",
        title: "Envoyer un document au client",
        tagline: "Transmettre un reçu, une facture ou une quittance depuis le téléphone.",
        access: "Toute personne pouvant éditer le document concerné.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Un bouton « Envoyer » figure sur les reçus, tickets, quittances et factures.",
              "Sur téléphone, il propose WhatsApp et les autres applications installées.",
              "Sur ordinateur, l'application produit un PDF que vous joignez ensuite manuellement dans WhatsApp.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Le réflexe qui évite les réclamations",
            text: "Envoyez le document même quand le client a déjà son ticket papier. Un papier se perd, un message WhatsApp reste et se retrouve des mois après.",
          },
        ],
        keywords: ["envoyer", "whatsapp", "partager", "pdf", "reçu", "transmettre"],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 4. STOCK                                                            */
  /* ------------------------------------------------------------------ */
  {
    id: "stock",
    title: "4 · Stock et approvisionnement",
    summary: "Ce que vous avez, ce qui manque, ce qui périme et ce qu'il faut commander.",
    articles: [
      {
        id: "inventory",
        title: "Stock",
        route: "/inventory",
        tagline: "L'état des quantités, boutique par boutique, et l'historique de leurs mouvements.",
        access: "Selon le rôle. Le caissier consulte, le gestionnaire ajuste.",
        blocks: [
          {
            kind: "bullets",
            title: "Ce qu'on y fait",
            items: [
              "Consulter les quantités disponibles dans la boutique sélectionnée.",
              "Repérer ce qui est sous le seuil d'alerte ou en rupture.",
              "Ajuster une quantité : correction d'erreur, casse, perte, don, retour.",
              "Consulter l'historique complet des mouvements.",
            ],
          },
          {
            kind: "bullets",
            title: "L'historique des mouvements",
            items: [
              "Chaque entrée et chaque sortie est tracée, avec sa cause : vente, achat, transfert, ajustement, inventaire.",
              "La colonne « Par qui » indique l'auteur du mouvement, ainsi que la boutique ou le dépôt concerné.",
              "L'affichage est paginé pour rester rapide même après des dizaines de milliers de mouvements.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Ajuster n'est pas inventorier",
            text: "Un ajustement corrige une ligne. Pour recompter tout le magasin, passez par une session d'inventaire : vous garderez la trace des écarts, ce qu'un ajustement ne fait pas.",
          },
        ],
        keywords: ["stock", "quantité", "ajustement", "mouvement", "rupture", "historique"],
      },
      {
        id: "inventory-sessions",
        title: "Inventaire",
        route: "/inventaire",
        tagline: "Le comptage physique complet : compter, comparer, valider.",
        access: "Propriétaire, magasinier, ou droit de gestion d'inventaire.",
        blocks: [
          {
            kind: "steps",
            items: [
              "Ouvrez une session d'inventaire pour la boutique concernée. Elle passe à l'état « En cours ».",
              "Comptez physiquement et saisissez les quantités réelles, article par article.",
              "L'application affiche l'écart entre le stock théorique et le stock compté, ligne par ligne.",
              "Examinez les écarts importants avant de valider : ce sont eux qui portent l'information.",
              "Validez. Le stock est mis à jour d'un seul bloc et la session passe à « Validé ».",
            ],
          },
          {
            kind: "bullets",
            title: "Bon à savoir",
            items: [
              "La validation est atomique : elle passe entièrement ou pas du tout. Pas d'inventaire à moitié appliqué.",
              "Une session peut être reprise, y compris après validation, pour corriger une erreur de comptage.",
              "Les écarts sont conservés : ils sont votre mesure de la démarque et des erreurs de saisie.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Quand le faire",
            text: "Boutique fermée, ou tôt le matin. Un inventaire pendant que la caisse tourne produit des écarts qui ne veulent rien dire, et vous ferez chercher des explications à des différences causées par vos propres ventes.",
          },
        ],
        keywords: ["inventaire", "comptage", "écart", "démarque", "session", "recompter"],
      },
      {
        id: "stock-cashier",
        title: "Stock (alertes)",
        route: "/stock-c",
        tagline: "La vue simplifiée du caissier : ce qui manque, sans les chiffres confidentiels.",
        access: "Caissier.",
        blocks: [
          {
            kind: "p",
            text: "Le caissier a besoin de savoir ce qui est en rupture pour prévenir le client et alerter le gérant. Il n'a pas besoin de voir les prix d'achat ni les marges. Cette page lui donne exactement ce qu'il lui faut.",
          },
          {
            kind: "note",
            tone: "tip",
            title: "Le bon usage",
            text: "Demandez à vos caissiers de la consulter en début de service. Cinq minutes suffisent pour éviter de promettre un article qui n'est plus là.",
          },
        ],
        keywords: ["alerte", "rupture", "caissier", "manque", "disponible"],
      },
      {
        id: "expiry",
        title: "Péremptions",
        route: "/peremption",
        tagline: "Les dates limites : écouler avant, pas jeter après.",
        access: "Propriétaire par défaut ; accordable.",
        activation: "Ouvert par FasoStock pour l'entreprise ou une boutique. Actif d'office pour les métiers à suivi de lots (pharmacie, supermarché).",
        blocks: [
          {
            kind: "bullets",
            title: "Les filtres, du plus urgent au plus calme",
            items: [
              "Périmés : à retirer de la vente immédiatement.",
              "≤ 7 jours : à écouler cette semaine, promotion si nécessaire.",
              "≤ 30 jours : à surveiller, à mettre en avant en rayon.",
              "≤ 90 jours : horizon de gestion normal.",
              "Valides : le reste.",
            ],
          },
          {
            kind: "bullets",
            title: "Comment les dates entrent dans le système",
            items: [
              "Par les lots à la réception d'un achat : chaque lot porte sa propre date.",
              "Depuis la fiche produit, pour les lots déjà en stock.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "En pharmacie",
            text: "Vendre un produit périmé n'est pas une erreur de gestion, c'est une faute. Consultez cette page tous les jours, pas toutes les semaines.",
          },
        ],
        keywords: ["péremption", "dlc", "dluo", "date", "lot", "périmé", "expiration"],
      },
      {
        id: "warehouse",
        title: "Magasin (dépôt)",
        route: "/warehouse",
        tagline: "Le dépôt central qui alimente les boutiques.",
        access: "Propriétaire et magasinier.",
        activation: "Module ouvert par FasoStock.",
        blocks: [
          {
            kind: "p",
            text: "Quand la marchandise arrive en gros et se répartit ensuite entre les points de vente, elle doit d'abord entrer quelque part. C'est le dépôt.",
          },
          {
            kind: "table",
            title: "Les six onglets",
            head: ["Onglet", "Ce qu'on y fait"],
            rows: [
              ["Tableau de bord", "L'état du dépôt et sa valeur (au prix d'achat, au prix de vente, selon ce qui est ouvert)."],
              ["Stock dépôt", "Les quantités présentes au dépôt, filtrables (tout, bas, correct)."],
              ["Mouvements", "Entrées et sorties du dépôt, avec leur auteur."],
              ["Transfert", "Envoyer de la marchandise du dépôt vers une boutique."],
              ["Historiques des bons", "Les bons émis, à retrouver et rééditer."],
              ["Inventaire", "Le comptage physique du dépôt, avec écarts et validation."],
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Dépôt et boutique",
            text: "Le stock du dépôt n'est pas vendable en caisse. Il faut d'abord le transférer vers une boutique. C'est voulu : la marchandise change de responsable en changeant de lieu.",
          },
        ],
        keywords: ["dépôt", "entrepôt", "magasin", "gros", "bon", "dispatch"],
      },
      {
        id: "transfers",
        title: "Transferts",
        route: "/transfers",
        tagline: "Déplacer du stock d'un lieu à un autre, avec traçabilité.",
        access: "Selon les droits de création et d'approbation de transfert.",
        blocks: [
          {
            kind: "steps",
            items: [
              "Créez le transfert : lieu de départ, lieu d'arrivée, articles et quantités.",
              "Le transfert part en attente d'approbation si votre organisation l'exige.",
              "À l'approbation, le stock est retiré du lieu de départ et ajouté au lieu d'arrivée.",
              "Le mouvement reste consultable des deux côtés, avec son auteur.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Ne jamais transférer par double ajustement",
            text: "Retirer d'un côté et ajouter de l'autre par deux ajustements donne le bon stock mais détruit la traçabilité : plus personne ne sait que la marchandise a bougé, ni qui l'a déplacée.",
          },
        ],
        keywords: ["transfert", "déplacer", "boutique à boutique", "dépôt", "approbation"],
      },
      {
        id: "purchases",
        title: "Achats",
        route: "/purchases",
        tagline: "Ce que vous commandez et recevez de vos fournisseurs.",
        access: "Selon les droits d'achat.",
        activation: "Module ouvert par FasoStock.",
        blocks: [
          {
            kind: "steps",
            items: [
              "Créez l'achat : le fournisseur, les articles, les quantités et les prix d'achat.",
              "À la livraison, réceptionnez : le stock entre, et les prix d'achat du catalogue peuvent être mis à jour.",
              "Pour les produits à date limite, saisissez les lots et leurs dates au moment de la réception.",
              "Si l'achat n'est pas payé comptant, la dette est suivie côté Fournisseurs.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Le moment des prix",
            text: "La réception est le seul moment où vous avez la facture sous les yeux. C'est là qu'il faut corriger les prix d'achat — pas trois semaines plus tard de mémoire.",
          },
        ],
        keywords: ["achat", "commande", "fournisseur", "réception", "livraison", "lot"],
      },
      {
        id: "restock",
        title: "Réassort",
        route: "/reassort",
        tagline: "Quoi recommander, et en quelle quantité.",
        access: "Propriétaire par défaut ; accordable.",
        activation: "Actif par défaut. FasoStock peut le couper.",
        blocks: [
          {
            kind: "p",
            text: "Le module croise vos meilleures ventes avec votre stock restant et remonte ce qui se vend bien mais dont il ne reste plus grand-chose. C'est la liste de commande que vous auriez faite à la main, sans l'oubli.",
          },
          {
            kind: "steps",
            items: [
              "Choisissez la période d'analyse des ventes : 14 jours, 30 jours ou 3 mois.",
              "Choisissez la couverture visée : combien de temps le stock doit tenir (15 jours, 1 mois, 2 mois).",
              "La liste s'affiche avec une quantité conseillée par article.",
              "Bouton « Combien commander ? (IA) » : un avis argumenté et des quantités ajustées.",
              "Corrigez les quantités que vous jugez fausses, puis générez la commande.",
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Changer de période change tout",
            text: "Une période de 14 jours réagit vite mais suit les accidents ; 3 mois lisse mais retarde. Sur un produit saisonnier, la période choisie change complètement la quantité conseillée. Vous restez le décideur : l'IA propose, vous tranchez.",
          },
        ],
        keywords: ["réassort", "recommander", "commander", "quantité", "ia", "rupture", "prévision"],
      },
      {
        id: "suppliers",
        title: "Fournisseurs",
        route: "/suppliers",
        tagline: "Vos fiches fournisseurs et surtout : ce que vous leur devez.",
        access: "Selon les droits fournisseurs.",
        blocks: [
          {
            kind: "table",
            title: "Les quatre onglets",
            head: ["Onglet", "Ce qu'on y fait"],
            rows: [
              ["Tableau de bord", "Total dû, et répartition par ancienneté : pas encore dû, 1–30 j, 31–60 j, 61–90 j, plus de 90 j."],
              ["Mes dettes", "Les dettes filtrables : à payer, en retard, sous 7 jours, soldées."],
              ["Fournisseurs", "Les fiches : coordonnées, conditions, historique."],
              ["Règlements", "Les paiements effectués, avec leur imputation."],
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "La courbe d'ancienneté",
            text: "C'est l'indicateur à regarder en premier. Une dette qui passe la barre des 90 jours coûte votre relation commerciale : c'est elle qui fait qu'un fournisseur cesse de vous livrer à crédit.",
          },
        ],
        keywords: ["fournisseur", "dette", "payer", "échéance", "règlement", "401", "ancienneté"],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 5. CLIENTS ET ARGENT                                                */
  /* ------------------------------------------------------------------ */
  {
    id: "argent",
    title: "5 · Clients, argent et comptabilité",
    summary: "Qui vous doit, ce que vous dépensez, et la tenue des comptes.",
    articles: [
      {
        id: "customers",
        title: "Clients",
        route: "/customers",
        tagline: "Le fichier client : indispensable dès que vous faites crédit.",
        access: "Selon les droits clients.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Fiche : nom, téléphone, adresse, notes.",
              "Historique complet des achats du client.",
              "Situation de crédit : ce qu'il doit, depuis quand.",
              "Rattachement d'une vente à un client au moment de l'encaissement.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Le téléphone est obligatoire",
            text: "Huit chiffres au minimum. Ce n'est pas une contrainte administrative : sans numéro, un client à crédit devient introuvable. Prenez le numéro avant d'accorder le crédit, jamais après.",
          },
        ],
        keywords: ["client", "fichier", "téléphone", "historique", "fidélité"],
      },
      {
        id: "credit",
        title: "Crédit",
        route: "/credit",
        tagline: "Qui vous doit combien, depuis quand, et ce qui rentre.",
        access: "Propriétaire par défaut ; accordable.",
        blocks: [
          {
            kind: "bullets",
            title: "Ce qu'on y suit",
            items: [
              "L'encours total : la somme que vos clients vous doivent.",
              "Le détail par client, avec l'ancienneté de la dette (7, 30, 90 jours).",
              "Les remboursements sur une période au choix, avec le total encaissé.",
              "Les acomptes versés lors des ventes, inclus dans le « déjà encaissé ».",
            ],
          },
          {
            kind: "steps",
            title: "Enregistrer un remboursement",
            items: [
              "Ouvrez la fiche du client.",
              "Enregistrez le paiement : montant et mode (espèces, mobile money, carte).",
              "Un reçu est édité — remettez-le systématiquement.",
              "Le solde du client se met à jour immédiatement.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Le crédit n'est pas du bénéfice",
            text: "Tant qu'il n'est pas remboursé, il ne compte ni dans votre chiffre d'affaires ni dans votre marge sur le tableau de bord et les rapports. Ce choix diverge des règles comptables SYSCOHADA, qui reconnaissent le produit à la facturation. Il est assumé : il vous montre l'argent que vous avez réellement, pas celui qu'on vous promet.",
          },
        ],
        keywords: ["crédit", "créance", "dette client", "remboursement", "encours", "recouvrement"],
      },
      {
        id: "expenses",
        title: "Dépenses",
        route: "/depenses",
        tagline: "Loyer, salaires, carburant, électricité : tout ce qui sort.",
        access: "Propriétaire par défaut ; accordable en consultation ou en gestion.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Enregistrez chaque dépense : montant, catégorie, date, justificatif.",
              "Filtrez par période : ce mois, mois précédent, cette année, tout.",
              "Suivez les totaux par catégorie pour voir où part réellement l'argent.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "Sans les dépenses, la marge ment",
            text: "Une marge de 30 % sur les ventes ne dit rien si le loyer, les salaires et le carburant ne sont pas comptés. Saisissez les dépenses au fil de l'eau : rattrapées en fin de mois, elles sont toujours incomplètes.",
          },
        ],
        keywords: ["dépense", "charge", "loyer", "salaire", "sortie", "frais"],
      },
      {
        id: "accounting",
        title: "Comptabilité",
        route: "/comptabilite",
        tagline: "Tenue comptable SYSCOHADA : écritures, grand livre, balance, états financiers.",
        access: "Propriétaire et comptable, selon les droits.",
        activation: "Module ouvert par FasoStock.",
        blocks: [
          {
            kind: "table",
            title: "Les six onglets",
            head: ["Onglet", "Ce qu'on y fait"],
            rows: [
              ["Écritures", "Les écritures comptables ; saisie manuelle possible."],
              ["Plan comptable", "Les comptes SYSCOHADA de votre entreprise."],
              ["Grand livre", "Le détail des mouvements compte par compte."],
              ["Balance", "Débits et crédits par compte, avec les soldes."],
              ["États financiers", "Les états de synthèse."],
              ["Paramètres", "Exercices, comptes par défaut, TVA."],
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Deux lectures du même commerce",
            text: "La comptabilité suit les règles SYSCOHADA — une vente est un produit dès qu'elle est facturée. Le tableau de bord, lui, raisonne en encaissé. Les deux sont justes, ils répondent à deux questions différentes : « qu'ai-je gagné sur le papier » et « qu'ai-je réellement en caisse ».",
          },
        ],
        keywords: ["comptabilité", "syscohada", "écriture", "grand livre", "balance", "bilan", "tva"],
      },
      {
        id: "hr",
        title: "Ressources humaines",
        route: "/rh",
        tagline: "Employés, congés et paie.",
        access: "Propriétaire, selon les droits.",
        activation: "Module ouvert par FasoStock.",
        blocks: [
          {
            kind: "table",
            title: "Les cinq onglets",
            head: ["Onglet", "Ce qu'on y fait"],
            rows: [
              ["Tableau de bord", "Effectif, congés en cours, masse salariale."],
              ["Employés", "Les fiches du personnel : contrat, salaire, coordonnées."],
              ["Congés", "Demandes, validations, soldes."],
              ["Paie", "Les bulletins, éditables et imprimables."],
              ["Paramètres", "Les règles de paie applicables à votre entreprise."],
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "RH et Employés, deux pages distinctes",
            text: "La page Employés gère les accès à l'application (qui se connecte, avec quels droits). Le module RH gère la relation de travail (contrat, congés, salaire). Une même personne y figure des deux côtés, pour deux usages différents.",
          },
        ],
        keywords: ["rh", "paie", "bulletin", "congé", "salaire", "personnel", "contrat"],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 6. PILOTAGE                                                         */
  /* ------------------------------------------------------------------ */
  {
    id: "pilotage",
    title: "6 · Pilotage et contrôle",
    summary: "Comprendre ce qui s'est passé, anticiper ce qui vient, vérifier qui a fait quoi.",
    articles: [
      {
        id: "reports",
        title: "Rapports",
        route: "/reports",
        tagline: "L'analyse : les chiffres, leur évolution, et les responsables.",
        access: "Propriétaire, et selon le droit de consultation globale ou par boutique.",
        blocks: [
          {
            kind: "table",
            title: "Les onglets",
            head: ["Onglet", "Ce qu'on y trouve"],
            rows: [
              ["Synthèse", "Chiffre d'affaires, marge, nombre de ventes, avec l'écart par rapport à la période précédente."],
              ["Équipe", "Qui a vendu combien. Réservé au propriétaire."],
              ["Produits", "Les meilleures ventes, les articles qui dorment, la contribution de chaque article."],
              ["Stock", "La valeur du stock et sa rotation."],
            ],
          },
          {
            kind: "bullets",
            title: "Périodes",
            items: [
              "Aujourd'hui, cette semaine, ce mois — ou une plage de dates au choix.",
              "Les écarts affichés comparent toujours à la période équivalente précédente : c'est la variation qui informe, pas le chiffre brut.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Rapports ≠ page Ventes",
            text: "Les Rapports raisonnent en encaissé, la page Ventes en facturé. L'écart entre les deux, c'est votre crédit client. Si vous ne deviez surveiller qu'un seul chiffre, ce serait celui-là.",
          },
        ],
        keywords: ["rapport", "analyse", "performance", "équipe", "meilleures ventes", "marge", "période"],
      },
      {
        id: "ai",
        title: "Prédictions IA",
        route: "/ai",
        tagline: "Ce que vos données laissent prévoir.",
        access: "Selon le droit de consultation IA.",
        activation: "Module ouvert par FasoStock.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Tendances de vente et projections.",
              "Produits à risque de rupture.",
              "Analyses proposées à partir de votre historique réel.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Une prévision n'est pas une certitude",
            text: "L'IA travaille sur votre historique. Elle ne connaît ni la fermeture d'une route, ni l'ouverture d'un concurrent, ni la fête qui arrive. Ses propositions se corrigent — c'est prévu, et c'est à vous de le faire.",
          },
        ],
        keywords: ["ia", "prédiction", "prévision", "tendance", "intelligence artificielle"],
      },
      {
        id: "audit",
        title: "Journal d'audit",
        route: "/audit",
        tagline: "Qui a fait quoi, quand. La mémoire de l'application.",
        access: "Propriétaire, ou droit de consultation d'audit.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Chaque action sensible est enregistrée : vente annulée, prix modifié, stock ajusté, employé créé, réglage changé.",
              "L'auteur, l'horodatage et l'objet de l'action sont conservés.",
              "Les interventions du support FasoStock en mode dépannage y figurent également, avec leur motif.",
            ],
          },
          {
            kind: "note",
            tone: "tip",
            title: "À consulter en cas de doute",
            text: "Un stock qui ne correspond pas, un prix qui a changé sans explication, une vente disparue : la réponse est ici, et elle est datée. C'est aussi ce qui protège un employé injustement soupçonné.",
          },
        ],
        keywords: ["audit", "journal", "traçabilité", "historique", "qui a fait", "log"],
      },
      {
        id: "integrations",
        title: "Intégrations API",
        route: "/integrations",
        tagline: "Connecter FasoStock à un autre outil.",
        access: "Propriétaire. Accessible depuis Paramètres.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Génération de clés d'accès pour un logiciel tiers.",
              "Révocation d'une clé à tout moment.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Une clé est un mot de passe",
            text: "Elle donne accès à vos données. Ne la partagez qu'avec un prestataire identifié, et révoquez-la dès la fin de la mission.",
          },
        ],
        keywords: ["api", "clé", "intégration", "connecter", "développeur"],
      },
      {
        id: "support-mode",
        title: "Mode dépannage FasoStock",
        tagline: "Quand le support entre dans votre entreprise pour vous aider.",
        access: "Réservé à FasoStock ; visible de vous.",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Le support ne peut entrer que pour un motif déclaré.",
              "L'accès expire automatiquement au bout d'une durée limitée.",
              "Un bandeau visible signale l'intervention en cours.",
              "Tout ce qui est fait est inscrit dans votre journal d'audit.",
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Vous gardez la trace",
            text: "Aucune intervention n'est invisible. Si vous voyez le bandeau sans avoir appelé, contactez-nous.",
          },
        ],
        keywords: ["support", "dépannage", "assistance", "intervention", "impersonation"],
      },
      {
        id: "notifications",
        title: "Notifications",
        route: "/notifications",
        tagline: "Vos messages reçus, et les alertes sur votre téléphone.",
        access: "Tout le monde : chacun ne voit que ses propres messages.",
        blocks: [
          {
            kind: "p",
            text: "La page rassemble les messages qui vous ont été envoyés (équipe FasoStock, alertes de votre entreprise). Ils y restent même si vous n'avez rien activé : l'historique ne dépend pas du téléphone.",
          },
          {
            kind: "steps",
            items: [
              "Ouvrez Notifications dans le menu.",
              "Bouton « Activer les notifications » : le navigateur demande votre autorisation, répondez Autoriser.",
              "La pastille verte « Activées » confirme que cet appareil recevra les alertes.",
              "Refaites-le sur chaque appareil : téléphone, tablette, ordinateur de la boutique.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Si vous avez répondu « Bloquer »",
            text: "Le navigateur garde ce refus et FasoStock ne peut plus rien demander. Touchez l'icône à gauche de l'adresse du site, autorisez les notifications, puis revenez sur la page.",
          },
          {
            kind: "note",
            tone: "tip",
            title: "Sur iPhone",
            text: "Ajoutez d'abord FasoStock à l'écran d'accueil (Partager › Sur l'écran d'accueil), puis rouvrez l'app depuis cette icône : c'est la seule façon de recevoir les alertes sur iPhone.",
          },
        ],
        keywords: ["notification", "alerte", "push", "message", "activer", "autoriser", "téléphone"],
      },
    ],
  },
];

/** Tous les articles à plat — pratique pour la recherche et le comptage. */
export const DOC_ARTICLES: DocArticle[] = DOC_GROUPS.flatMap((g) => g.articles);

/** Texte indexé d'un article (titre, résumé, mots-clés et contenu des blocs). */
export function articleSearchText(a: DocArticle): string {
  const fromBlocks = a.blocks
    .map((b) => {
      switch (b.kind) {
        case "p":
          return b.text;
        case "bullets":
        case "steps":
          return [b.title ?? "", ...b.items].join(" ");
        case "table":
          return [b.title ?? "", ...b.rows.flat()].join(" ");
        case "note":
          return `${b.title} ${b.text}`;
      }
    })
    .join(" ");
  return [a.title, a.tagline, a.access, a.activation ?? "", a.keywords.join(" "), fromBlocks]
    .join(" ")
    .toLowerCase();
}
