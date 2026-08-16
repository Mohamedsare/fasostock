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
