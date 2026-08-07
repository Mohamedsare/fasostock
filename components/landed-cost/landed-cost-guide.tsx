"use client";

import type { ReactNode } from "react";
import {
  MdClose,
  MdHelpOutline,
  MdInventory2,
  MdLightbulbOutline,
  MdWarningAmber,
} from "react-icons/md";
import { FsCard } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";

/**
 * Mode d'emploi du module, écrit POUR LE COMMERÇANT — pas pour un comptable.
 *
 * Parti pris : tout est démontré sur un seul arrivage chiffré, repris de bout en bout
 * (50 sacs de ciment + 20 pots de peinture, 120 000 F de camion, 80 000 F de douane).
 * Les chiffres sont exacts et vérifiables à la calculette : un exemple faux ferait
 * plus de mal qu'une absence de documentation.
 *
 * Il vit ici, dans la page, et non dans « Aide » : on le lit au moment où on bute,
 * sans perdre l'arrivage en cours de saisie.
 */

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="flex items-baseline gap-2 text-sm font-bold text-fs-text sm:text-base">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fs-accent/12 text-xs font-bold text-fs-accent">
          {n}
        </span>
        {title}
      </h3>
      <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-neutral-700">
        {children}
      </div>
    </section>
  );
}

/** Encadré « exemple chiffré » — le format que le commerçant recopie sur son cahier. */
function Example({ title, rows, footer }: { title: string; rows: [string, string][]; footer?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-black/[0.06] bg-fs-surface-container/70 p-3 dark:bg-white/4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </p>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <dt className="min-w-0 text-xs text-neutral-600">{k}</dt>
            <dd className="shrink-0 text-xs font-semibold tabular-nums text-fs-text">{v}</dd>
          </div>
        ))}
      </dl>
      {footer ? (
        <p className="mt-2 border-t border-black/[0.06] pt-2 text-xs leading-relaxed text-neutral-700">
          {footer}
        </p>
      ) : null}
    </div>
  );
}

function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  const Icon = tone === "warning" ? MdWarningAmber : MdLightbulbOutline;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-[10px] p-3 text-xs leading-relaxed",
        tone === "warning"
          ? "bg-amber-500/[0.1] text-amber-900 dark:text-amber-200"
          : "bg-sky-500/[0.08] text-sky-900 dark:text-sky-200",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

export function LandedCostGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Comprendre le prix de revient"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none p-0 shadow-xl sm:rounded-xl"
        padding="p-0"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fs-text">Comprendre le prix de revient</h2>
            <p className="mt-0.5 text-xs text-neutral-600">
              Tout est expliqué sur un seul exemple, du début à la fin.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le guide"
            className="fs-touch-target -mr-1 shrink-0 rounded-lg p-1 text-neutral-500 hover:bg-black/5"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <Section n={1} title="Le problème : la facture du fournisseur ment">
            <p>
              Vous achetez un sac de ciment 4 000 F. Puis vous payez le camion. Puis la douane.
              Puis les manœuvres qui déchargent. Ce sac ne vous a pas coûté 4 000 F — il vous a
              coûté bien plus. Tant que vous ne le savez pas, vous fixez votre prix de vente sur
              un chiffre faux, et vous pouvez vendre à perte sans jamais vous en apercevoir.
            </p>
            <p>
              Ce module fait le calcul à votre place : il prend vos frais, les partage sur chaque
              article, et vous dit à quel prix vendre pour gagner ce que vous voulez gagner.
            </p>
            <Callout>
              <p>
                <strong>Un arrivage</strong> = une commande fournisseur + tout ce que vous avez
                payé en plus pour qu&apos;elle arrive dans votre boutique.
              </p>
            </Callout>
          </Section>

          <Section n={2} title="L'exemple qui servira dans tout ce guide">
            <p>Vous recevez un conteneur de Lomé :</p>
            <Example
              title="Ce que vous avez payé"
              rows={[
                ["50 sacs de ciment à 4 000 F (50 kg le sac)", "200 000 F"],
                ["20 pots de peinture à 15 000 F (5 kg le pot)", "300 000 F"],
                ["Marchandise", "500 000 F"],
                ["Camion Lomé–Ouaga", "120 000 F"],
                ["Douane", "80 000 F"],
                ["Total sorti de votre poche", "700 000 F"],
              ]}
              footer={
                <>
                  Vous avez donc payé <strong>700 000 F</strong>, pas 500 000 F. Reste à savoir
                  quelle part de ces 200 000 F de frais revient au ciment, et quelle part à la
                  peinture.
                </>
              }
            />
          </Section>

          <Section n={3} title="Partager les frais : la question qui change tout">
            <p>
              Le camion a été payé parce que la marchandise était <em>lourde</em>. La douane a été
              payée parce que la marchandise <em>valait cher</em>. Ce ne sont pas les mêmes
              raisons — donc ce ne sont pas les mêmes partages. Chaque frais choisit sa règle :
            </p>
            <ul className="space-y-1.5 pl-1">
              <li>
                <strong>À la valeur</strong> — l&apos;article cher porte plus de frais. Pour la
                douane, les taxes, l&apos;assurance, les commissions.
              </li>
              <li>
                <strong>Au poids</strong> — le lourd porte plus. Pour le camion, le fret. Vous
                saisissez alors le poids d&apos;un article dans sa ligne.
              </li>
              <li>
                <strong>À la quantité</strong> — chacun porte la même part. Quand tout se
                ressemble : mêmes cartons, mêmes sacs.
              </li>
              <li>
                <strong>Au volume</strong> — l&apos;encombrant porte plus. Pour un conteneur payé
                au mètre cube, pour le magasinage.
              </li>
              <li>
                <strong>À la main</strong> — vous fixez vous-même la part de chaque ligne, quand
                vous êtes le seul à savoir.
              </li>
            </ul>
            <Example
              title="Notre conteneur : camion au poids, douane à la valeur"
              rows={[
                ["Poids total (2 500 kg de ciment + 100 kg de peinture)", "2 600 kg"],
                ["Camion sur le ciment (2 500 ⁄ 2 600)", "115 385 F"],
                ["Camion sur la peinture (100 ⁄ 2 600)", "4 615 F"],
                ["Douane sur le ciment (200 000 ⁄ 500 000 = 40 %)", "32 000 F"],
                ["Douane sur la peinture (60 %)", "48 000 F"],
              ]}
            />
            <Example
              title="Le vrai prix de revient"
              rows={[
                ["Ciment : 200 000 + 147 385 = 347 385 F pour 50 sacs", "6 948 F le sac"],
                ["Peinture : 300 000 + 52 615 = 352 615 F pour 20 pots", "17 631 F le pot"],
              ]}
              footer={
                <>
                  Le sac facturé <strong>4 000 F</strong> vous revient en réalité à{" "}
                  <strong>6 948 F</strong>. Vendu 5 000 F, vous perdez 1 948 F par sac en croyant
                  gagner 1 000 F.
                </>
              }
            />
            <Callout tone="warning">
              <p>
                <strong>La règle choisie n&apos;est pas un détail.</strong> Si vous mettiez le
                camion « à la valeur » au lieu de « au poids », le même sac reviendrait à 5 600 F
                au lieu de 6 948 F — et la peinture à 21 000 F au lieu de 17 631 F. Le ciment est
                lourd et bon marché : c&apos;est le poids qui décide de son transport.
              </p>
            </Callout>
            <p className="text-xs text-neutral-600">
              L&apos;application ne perd jamais un franc : la somme des parts est toujours
              exactement égale au total de vos frais. Et si vous demandez un partage au poids sans
              avoir saisi les poids, elle bascule d&apos;elle-même sur la quantité plutôt que de
              donner un résultat farfelu.
            </p>
          </Section>

          <Section n={4} title="Votre marge : quatre façons de la dire">
            <p>
              Une fois le prix de revient connu, vous décidez ce que vous voulez gagner. Attention,
              « 25 % » ne veut pas dire la même chose selon la façon de compter :
            </p>
            <Example
              title="Sur notre sac de ciment à 6 948 F"
              rows={[
                ["Ajouter 25 % → 6 948 × 1,25", "8 685 F"],
                ["… ce qui vous laisse en réalité", "20 % du prix de vente"],
                ["Garder 25 % sur la vente → 6 948 ⁄ 0,75", "9 264 F"],
                ["… ce qui vous laisse bien", "25 % du prix de vente"],
              ]}
              footer={
                <>
                  Écart : <strong>579 F par sac</strong>, soit près de 29 000 F sur l&apos;arrivage.
                  Choisissez « Ajouter un % » si vous raisonnez « je majore », « Garder un % sur la
                  vente » si vous raisonnez « il doit me rester tant ».
                </>
              }
            />
            <p>
              Les deux autres façons : <strong>Ajouter un montant</strong> (coût + 1 500 F, quand
              votre marge est fixe par article) et <strong>Prix imposé</strong> (vous fixez le
              prix, l&apos;application vous dit ce qu&apos;il vous reste — pratique quand le prix
              du marché est connu d&apos;avance).
            </p>
            <p>
              La marge se règle pour tout l&apos;arrivage, et se change article par article si un
              produit mérite un traitement particulier.
            </p>
            <Callout>
              <p>
                <strong>Arrondi.</strong> Un prix conseillé à 8 685 F oblige à rendre la monnaie.
                Réglez l&apos;arrondi sur 25 F et il devient 8 675 F. Vos pièces existent, vos
                prix aussi.
              </p>
            </Callout>
          </Section>

          <Section n={5} title="L'ancien stock ne doit pas être confondu avec le nouveau">
            <p>
              Les frais changent d&apos;un arrivage à l&apos;autre : le carburant monte, le
              transporteur change, le taux de douane bouge. Le même sac ne vous revient donc pas
              au même prix qu&apos;il y a deux mois. Et il vous reste souvent des sacs de la
              commande d&apos;avant, payés moins cher.
            </p>
            <p>
              Si l&apos;application écrasait bêtement l&apos;ancien prix d&apos;achat, votre marge
              deviendrait fausse sur tout ce qui reste en rayon. Vous avez donc le choix :
            </p>
            <Example
              title="Il vous restait 12 sacs achetés 5 500 F, 50 sacs arrivent à 6 948 F"
              rows={[
                ["Moyenne avec l'ancien stock (recommandé)", "6 667 F"],
                ["Coût de cet arrivage seulement", "6 948 F"],
              ]}
              footer={
                <>
                  La <strong>moyenne</strong> mélange les 62 sacs au prorata des quantités : quel
                  que soit le sac que vous vendez, la marge affichée est juste. Le{" "}
                  <strong>coût de l&apos;arrivage</strong> est plus simple à suivre, mais votre
                  marge sera sous-estimée sur les 12 anciens sacs jusqu&apos;à leur écoulement.
                </>
              }
            />
            <p>
              Sur chaque ligne du tableau, vous voyez toujours ce qu&apos;il reste en stock et à
              quel prix il avait été payé. Et le bouton <strong>horloge</strong> ouvre
              l&apos;historique complet des prix d&apos;un produit : quand il a changé, de combien,
              à cause de quel arrivage, et combien vous en aviez ce jour-là.
            </p>
          </Section>

          <Section n={6} title="Entrer le stock, ou seulement les prix ?">
            <p>
              C&apos;est le réglage le plus important, et le seul qui puisse vous jouer un tour si
              vous le choisissez au hasard :
            </p>
            <ul className="space-y-1.5 pl-1">
              <li>
                <strong>Entrer le stock</strong> — vous n&apos;avez rien saisi ailleurs. En
                appliquant, les 50 sacs entrent en stock <em>et</em> les prix se mettent à jour.
              </li>
              <li>
                <strong>Prix seulement</strong> — la marchandise a déjà été enregistrée (module
                Achats, inventaire). En appliquant, <em>seuls les prix</em> changent.
              </li>
            </ul>
            <Callout tone="warning">
              <p>
                Si vous avez déjà saisi la commande dans <strong>Achats</strong>, utilisez le
                bouton « Reprendre un achat » : les lignes sont recopiées et l&apos;arrivage passe
                automatiquement en « prix seulement ». Impossible de compter la marchandise deux
                fois.
              </p>
            </Callout>
          </Section>

          <Section n={7} title="Rien ne bouge tant que vous n'avez pas appliqué">
            <p>
              Un arrivage en <strong>brouillon</strong> est une simulation : ni votre stock ni vos
              prix ne sont touchés. Vous pouvez essayer une marge, changer une règle de partage,
              ajouter un frais oublié, et regarder le résultat autant de fois que vous voulez.
            </p>
            <p>
              Quand vous appuyez sur <strong>Appliquer les prix</strong>, tout se fait d&apos;un
              seul coup : le stock (si vous l&apos;avez demandé), le nouveau prix d&apos;achat, et
              le nouveau prix de vente des articles que vous avez laissés cochés. Rien ne peut
              partir à moitié.
            </p>
            <p>
              Avant de valider, l&apos;application vous signale les lignes à regarder : une vente
              à perte, une marge négative, une hausse de prix de plus de 15 % que vos clients
              habituels remarqueront.
            </p>
            <Callout>
              <p>
                <strong>Vous pouvez revenir en arrière.</strong> Les anciens prix sont
                photographiés au moment d&apos;appliquer. Le bouton « Remettre les anciens prix »
                les restaure — mais ne touche jamais au stock : la marchandise, elle, est bien
                arrivée. Les articles dont le prix a changé depuis (autre arrivage, modification à
                la main) sont laissés tranquilles.
              </p>
            </Callout>
          </Section>

          <Section n={8} title="Marche à suivre, en résumé">
            <ol className="space-y-1.5 pl-1">
              <li>
                <strong>1.</strong> Créez l&apos;arrivage : un nom parlant, le fournisseur, la
                boutique qui reçoit.
              </li>
              <li>
                <strong>2.</strong> Ajoutez la marchandise avec le prix payé au fournisseur — ou
                reprenez un achat déjà saisi.
              </li>
              <li>
                <strong>3.</strong> Ajoutez chaque frais et choisissez sa règle de partage.
              </li>
              <li>
                <strong>4.</strong> Lisez le tableau : prix de revient réel, prix de vente
                conseillé, marge.
              </li>
              <li>
                <strong>5.</strong> Ajustez ce qui doit l&apos;être, puis appliquez.
              </li>
            </ol>
            <Callout>
              <p>
                <strong>La commande d&apos;après.</strong> Le bouton « copier » refait le même
                arrivage — mêmes articles, mêmes postes de frais. Vous ne changez que les montants
                qui ont bougé.
              </p>
            </Callout>
          </Section>

          <Section n={9} title="Questions fréquentes">
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-semibold text-fs-text">
                  J&apos;achète en cedis / en dollars. Je fais comment ?
                </dt>
                <dd className="mt-0.5 text-sm">
                  Dans les réglages avancés de l&apos;arrivage, indiquez la devise et combien vaut
                  1 unité en F CFA. Saisissez ensuite marchandise et frais dans cette devise :
                  l&apos;application convertit tout.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-fs-text">
                  Je ne veux pas toucher au prix de vente d&apos;un article.
                </dt>
                <dd className="mt-0.5 text-sm">
                  Décochez « Appliquer » sur sa ligne. Son prix d&apos;achat sera mis à jour (pour
                  que votre marge soit juste), mais son prix de vente restera celui d&apos;avant.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-fs-text">
                  Un frais est arrivé après coup (une amende, un déchargement en plus).
                </dt>
                <dd className="mt-0.5 text-sm">
                  Si l&apos;arrivage n&apos;est pas encore appliqué, ajoutez simplement le frais.
                  S&apos;il l&apos;est déjà, créez un nouvel arrivage en « prix seulement » avec
                  les mêmes articles et ce seul frais.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-fs-text">
                  Puis-je confier cette page à un employé ?
                </dt>
                <dd className="mt-0.5 text-sm">
                  Oui, en lui accordant le droit « Gérer le prix de revient » dans Employés. Sans
                  ce droit, la page reste invisible : elle touche à vos prix d&apos;achat et de
                  vente.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-fs-text">
                  Si je désactive le module, je perds tout ?
                </dt>
                <dd className="mt-0.5 text-sm">
                  Non. Vos arrivages et l&apos;historique des prix sont conservés, et reviennent
                  tels quels à la réactivation. Les prix déjà appliqués, eux, restent en place.
                </dd>
              </div>
            </dl>
          </Section>

          <p className="mt-6 flex gap-2 rounded-[10px] bg-fs-surface-container/70 p-3 text-xs leading-relaxed text-neutral-600 dark:bg-white/4">
            <MdInventory2 className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
            <span>
              Une question qui n&apos;est pas ici ? Écrivez-nous depuis la page{" "}
              <strong>Aide</strong> — nous répondons sur WhatsApp.
            </span>
          </p>
        </div>

        <div className="shrink-0 border-t border-black/[0.06] px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="fs-touch-target w-full rounded-xl bg-fs-accent py-3 text-sm font-semibold text-white sm:w-auto sm:px-6"
          >
            J&apos;ai compris
          </button>
        </div>
      </FsCard>
    </div>
  );
}

/** Bouton d'appel du guide — posé dans l'en-tête de la page et sur l'écran d'accueil vide. */
export function LandedCostGuideButton({
  onClick,
  className,
  label = "Comment ça marche ?",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fs-touch-target inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-fs-card px-2.5 py-1.5 text-xs font-semibold text-neutral-700",
        className,
      )}
    >
      <MdHelpOutline className="h-4 w-4 shrink-0 text-fs-accent" aria-hidden />
      {label}
    </button>
  );
}
