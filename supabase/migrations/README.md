# Migrations — règle de numérotation

**Un numéro = un fichier. Jamais deux.**

Le CLI Supabase indexe les migrations appliquées par leur **préfixe de version** dans
`supabase_migrations.schema_migrations`, pas par le nom complet du fichier. Deux fichiers
qui partagent le même préfixe se disputent donc la même ligne : une fois la première
appliquée, la version est enregistrée et **la seconde peut être considérée comme déjà
faite, puis silencieusement sautée**. La fonctionnalité concernée arrive alors en
production sans son schéma, et l'erreur ne se voit qu'à l'exécution.

Avant de créer une migration : `ls supabase/migrations | tail -1`, puis prendre le numéro
suivant.

## Doublons historiques

Quatre collisions subsistent, antérieures à cette règle :

| Numéro  | Fichiers |
| ------- | -------- |
| `00031` | `fix_register_profile_is_active`, `register_profile_is_active` |
| `00088` | `company_saas_feature_flags`, `legacy_customer_credits` |
| `00089` | `barcodes_manage_permission`, `public_partners` |
| `00167` | `product_locations`, `storage_upload_scoping_fix` |

**Elles sont laissées telles quelles, volontairement.** Les huit fichiers sont appliqués
en production (leurs fonctionnalités tournent), et plusieurs contiennent des instructions
non idempotentes — `CREATE TABLE`, `CREATE POLICY`, `ALTER TABLE … ADD COLUMN` sans
`IF NOT EXISTS`. Les renuméroter les ferait passer pour de nouvelles migrations au
prochain `db push` et déclencherait une réexécution destructrice. Le risque du correctif
dépasse celui du défaut.

`00182_engine_verify_payment_details.sql` était la cinquième collision. Elle a été
renumérotée en `00186` car elle est entièrement idempotente : qu'elle ait déjà été
appliquée ou qu'elle ait été sautée à cause du doublon, la rejouer est sans effet de bord.

`00193_pos_checkout_permission.sql` (module Caisse à deux) est la sixième : elle est née
en même temps que `00193_quick_supply.sql`, deux fonctionnalités développées en parallèle
ayant lu le même « dernier numéro ». Même traitement — entièrement idempotente, donc
renumérotée en `00196`. `00194_pos_print_jobs.sql` l'a suivie en `00197` bien qu'elle
n'entrât en collision avec rien : elle appelle `can_checkout_pos_handoffs`, créée par la
précédente, et devait rester après elle.

**Deux chantiers menés en parallèle suffisent à recréer le défaut** : le numéro se prend
au moment d'écrire le fichier, pas au moment de le livrer. Vérifier `ls | tail -1` juste
avant de pousser, en plus d'avant de créer.

## Registre des migrations amorcé (30/08/2026)

Jusqu'ici, `supabase_migrations.schema_migrations` **n'existait pas** sur la base
distante : le schéma avait été construit entièrement depuis l'éditeur SQL, jamais par le
CLI. `supabase db push` aurait donc tenté de rejouer **l'intégralité** des migrations sur
la production — plusieurs d'entre elles n'étant pas idempotentes, le risque était réel.

Le registre a été amorcé avec `supabase migration repair --status applied`, après
vérification **objet par objet** de chaque migration contre le schéma réel : tables,
colonnes, fonctions, index, policies (schémas `public` ET `storage`), triggers et types
ont été inventoriés, puis confrontés à ce que chaque fichier prétend créer.

**213 versions sont marquées appliquées.** Deux ne le sont pas, et c'est volontaire :

| Version | Pourquoi elle reste en attente |
| ------- | ------------------------------ |
| `00189` | `products.activity_attributes` **absente** de la base. La couche API la demande déjà de façon optimiste et se rabat proprement (cf. `products/api.ts`). |
| `00190` | Les tables `repair_orders` / `repair_order_lines` **n'existent pas**. Le module Réparations n'est donc pas opérationnel. |

Un `db push` les appliquera — les deux sont additives.

### Deux écarts constatés, à traiter séparément

Ces migrations sont appliquées **à un objet près**. Elles sont marquées appliquées (leur
rejeu échouerait sur les instructions non idempotentes qu'elles contiennent) ; l'objet
manquant est donc à poser à la main, en connaissance de cause :

- `00089` — l'index `idx_public_partners_active_sort` n'existe pas. Sans conséquence
  fonctionnelle : c'est une question de performance sur une table minuscule.
- `00139` — le trigger `enforce_store_catalog` et sa fonction
  `enforce_store_catalog_on_inventory` n'existent pas. **Attention** : le poser
  maintenant ferait REFUSER des écritures d'inventaire aujourd'hui acceptées. Ce n'est
  pas un correctif neutre, c'est un changement de comportement pour les clients en
  production — à décider, pas à glisser dans un lot.

### Les quatre doublons historiques restent des doublons

`00031`, `00088`, `00089` et `00167` ont chacun deux fichiers. Le registre étant indexé
par version, un seul des deux fichiers de chaque paire est reconnu ; l'autre apparaît
« en attente » dans `supabase migration list`, et `db push` refuse de démarrer tant qu'on
ne tranche pas.

C'est un **refus, pas une réexécution** : l'état est sûr. Le régler demanderait de
renuméroter les quatre fichiers orphelins puis de marquer immédiatement les nouveaux
numéros comme appliqués — ce qui est désormais sans danger, le registre empêchant tout
rejeu. Décision à prendre sciemment : elle revient sur la règle posée plus haut dans ce
document.
