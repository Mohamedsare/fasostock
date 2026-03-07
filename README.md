# FasoStock

Application de gestion de stock et point de vente pour boutiques de pièces moto. Déployée sur **fasostock.vercel.app**.

## Stack technique

- **Frontend** : React 18, Vite 6, Tailwind CSS
- **Backend** : Supabase (Auth + PostgreSQL + Storage)
- **Hébergement** : Vercel

## Prérequis

1. Un projet [Supabase](https://supabase.com)
2. Un compte [Vercel](https://vercel.com)

## Installation

1. Cloner le dépôt
2. `npm install`
3. Créer `.env.local` :

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-anon-key
```

4. Exécuter la migration SQL dans Supabase (SQL Editor) :  
   `supabase/migrations/001_initial_schema.sql`

5. Créer un bucket Storage nommé `uploads` dans Supabase (Storage → New bucket, public)

6. `npm run dev` pour lancer en local

## Déploiement sur Vercel

1. Connecter le repo GitHub à Vercel
2. Ajouter les variables d'environnement :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `DEEPSEEK_API_KEY` (optionnel, pour Rapports IA, Prévisions, Campagnes)
3. Déployer

Le domaine par défaut sera `fasostock.vercel.app` ou celui configuré dans Vercel.

## Rôles utilisateurs

- **super_admin** : Accès total, gestion boutiques et utilisateurs
- **manager** : Dashboard, ventes, stock, atelier, finances, paramètres
- **cashier** : Point de vente, ventes
- **stockist** : Stock, alertes
- **accountant** : Finances, ventes, rapports, prévisions

## License

Projet privé.
