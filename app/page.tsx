import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { PartnersSection } from "@/components/marketing/partners-section";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MdArrowForward,
  MdCheckCircle,
  MdCreditCard,
  MdGroups,
  MdInventory2,
  MdKeyboardArrowDown,
  MdMenu,
  MdPointOfSale,
  MdSecurity,
  MdSpeed,
  MdTrendingUp,
  MdWhatsapp,
} from "react-icons/md";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Logiciel de caisse et stock Burkina Faso",
  description:
    "FasoStock aide les commerces du Burkina Faso a gerer stock, ventes, credit client et caisse depuis mobile et web.",
  alternates: { canonical: "/" },
};

const highlights = [
  "Mobile-first, rapide meme sur connexion instable",
  "Stock, ventes, credit client et recouvrement",
  "Recu pro PDF, export Excel, suivi multi-boutiques",
] as const;

const features = [
  {
    icon: MdPointOfSale,
    title: "Caisse moderne",
    text: "Vendez vite avec historique, remises, paiements multiples et tickets propres.",
  },
  {
    icon: MdInventory2,
    title: "Stock en temps reel",
    text: "Entrees, sorties, alertes de rupture et inventaire clair par boutique.",
  },
  {
    icon: MdCreditCard,
    title: "Credits et remboursements",
    text: "Suivez dettes clients, paiements partiels et recus de remboursement verifiables.",
  },
  {
    icon: MdTrendingUp,
    title: "Pilotage business",
    text: "KPIs, rapports et chiffres utiles pour decider vite et mieux.",
  },
  {
    icon: MdGroups,
    title: "Equipe & permissions",
    text: "Roles clairs par employe pour securiser les operations sensibles.",
  },
  {
    icon: MdSecurity,
    title: "Fiable et securise",
    text: "Authentification, traces d'activite et structure solide pour usage quotidien.",
  },
] as const;

const faqs = [
  {
    q: "FasoStock convient-il aux petites boutiques ?",
    a: "Oui. L'application est faite pour demarrer simple puis evoluer avec votre activite.",
  },
  {
    q: "Puis-je l'utiliser sur telephone ?",
    a: "Oui, l'interface est mobile-first et fonctionne tres bien sur smartphone.",
  },
  {
    q: "Le credit client est-il bien gere ?",
    a: "Oui, avec suivi des restes, encaissements, historique et recus professionnels.",
  },
  {
    q: "Puis-je gerer plusieurs boutiques avec le meme compte ?",
    a: "Oui. Vous pouvez piloter plusieurs points de vente depuis une seule plateforme avec droits par utilisateur.",
  },
  {
    q: "Y a-t-il un support en cas de besoin ?",
    a: "Oui. Vous avez un support reactif pour vous aider a configurer, lancer et optimiser votre utilisation.",
  },
] as const;

export default async function Home() {
  if (!hasSupabaseConfig()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.is_super_admin) redirect("/admin");
    redirect("/dashboard");
  }

  const { data: partnersRaw } = await supabase
    .from("public_partners")
    .select("id, name, logo_url, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const partners = ((partnersRaw ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id ?? ""),
    name: String(p.name ?? "Partenaire"),
    logoUrl: String(p.logo_url ?? "/fs.png"),
  }));

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(232,93,44,0.14),transparent_42%),linear-gradient(to_bottom,#fff,#fff7f3)] text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/fs.png" alt="FasoStock" width={44} height={44} className="h-11 w-11 object-contain" priority />
            <span className="text-xl font-extrabold tracking-tight">
              <span className="text-neutral-900">Faso</span>
              <span className="text-[#f97316]">Stock</span>
            </span>
          </Link>
          <details className="relative sm:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-black/10 bg-white text-neutral-800">
              <MdMenu className="h-5 w-5" aria-hidden />
              <span className="sr-only">Ouvrir le menu</span>
            </summary>
            <div className="absolute right-0 top-12 z-30 w-[min(88vw,290px)] overflow-hidden rounded-2xl border border-black/10 bg-white p-2 shadow-[0_22px_40px_-20px_rgba(17,24,39,0.35)]">
              <nav className="flex flex-col">
                <Link href="/login" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
                  Se connecter
                </Link>
                <Link href="/register/select-activity" className="mt-1 rounded-xl bg-fs-accent px-3 py-2.5 text-sm font-bold text-white">
                  Essai gratuit
                </Link>
                <Link href="/help" className="mt-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-black/5">
                  Parler au support
                </Link>
              </nav>
            </div>
          </details>

          <div className="hidden items-center gap-2 sm:flex">
            <Link
              href="/login"
              className="rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-800"
            >
              Se connecter
            </Link>
            <Link
              href="/register/select-activity"
              className="rounded-xl bg-fs-accent px-3.5 py-2 text-sm font-bold text-white shadow-[0_10px_24px_-14px_rgba(232,93,44,0.95)]"
            >
              Essai gratuit
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6 sm:pb-14 sm:pt-7">

        <div className="grid items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
          <div className="max-w-2xl">
            <p className="mb-4 inline-flex items-center rounded-full border border-fs-accent/20 bg-fs-accent/10 px-3 py-1 text-xs font-bold text-fs-accent">
              Plateforme SaaS pour commerces au Burkina Faso
            </p>
            <h1 className="text-[2.05rem] font-black leading-[1.02] tracking-tight text-neutral-950 sm:text-5xl">
              Le cockpit de vente et stock pour piloter votre commerce en temps reel.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-700 sm:text-lg">
              Centralisez caisse, stock, credits clients et rapports dans une experience propre, rapide et ultra mobile-first.
            </p>
            <ul className="mt-5 space-y-2.5">
              {highlights.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm font-medium text-neutral-800 sm:text-[15px]">
                  <MdCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col gap-2.5 min-[430px]:flex-row">
              <Link
                href="/register/select-activity"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fs-accent px-5 py-3 text-base font-extrabold text-white shadow-[0_16px_36px_-16px_rgba(232,93,44,0.95)]"
              >
                Creer mon espace maintenant
                <MdArrowForward className="h-5 w-5" aria-hidden />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-black/10 bg-white px-5 py-3 text-base font-bold text-neutral-800"
              >
                J&apos;ai deja un compte
              </Link>
            </div>
            <p className="mt-3 text-xs font-medium text-neutral-500 sm:text-sm">
              Mise en place rapide, equipe et boutiques connectees sur une seule interface.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-2 -z-10 rounded-4xl bg-linear-to-br from-fs-accent/25 via-orange-200/20 to-transparent blur-2xl" />
            <div className="rounded-[1.6rem] border border-black/10 bg-white/95 p-4 shadow-[0_35px_80px_-30px_rgba(17,24,39,0.35)] sm:p-5">
              <div className="mb-4 flex items-center justify-between rounded-xl bg-neutral-900 px-3.5 py-3 text-white">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-300">Tableau de bord</p>
                  <p className="text-sm font-bold">Performance aujourd&apos;hui</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300">
                  <MdSpeed className="h-4 w-4" aria-hidden />
                  Live
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Ventes" value="3 004 500 F" hint="periode en cours" />
                <StatCard label="Credits restants" value="0 F" hint="controle instantane" />
                <StatCard label="Transactions" value="+18 000" hint="ce mois" />
                <StatCard label="Ruptures" value="-52%" hint="apres suivi stock" />
              </div>

              <div className="mt-4 rounded-xl border border-black/10 bg-fs-surface-container p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Resultat attendu</p>
                <p className="mt-1 text-sm font-bold text-fs-text">
                  Plus de vitesse en caisse, moins de pertes stock, meilleur recouvrement client.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item) => (
            <article key={item.title} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-fs-accent/12 text-fs-accent">
                <item.icon className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="text-base font-extrabold text-fs-text">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 sm:pb-12">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-[0_26px_60px_-32px_rgba(17,24,39,0.45)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.14em] text-fs-accent">Offre SaaS</p>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-fs-text sm:text-3xl">
                Lancez votre gestion pro aujourd&apos;hui
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-base">
                Commencez maintenant, equipez vos boutiques et centralisez vos decisions sur une seule plateforme.
              </p>
            </div>
            <div className="rounded-2xl bg-fs-accent px-5 py-4 text-white">
              <p className="text-sm font-semibold text-white/90">Pack demarrage</p>
              <p className="mt-1 text-3xl font-black">SaaS</p>
              <p className="mt-1 text-xs text-white/90">Accompagnement deploiement possible</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2.5 min-[460px]:flex-row">
            <Link
              href="/register/select-activity"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-fs-accent px-5 py-3 text-base font-extrabold text-white"
            >
              Demarrer gratuitement
            </Link>
            <Link
              href="/help"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-5 py-3 text-base font-bold text-neutral-800"
            >
              <MdWhatsapp className="h-5 w-5 text-emerald-600" aria-hidden />
              Parler au support
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 sm:pb-12">
        <div className="relative overflow-hidden rounded-4xl border border-[#d96a3f] bg-[#f7f3ea] px-4 py-5 sm:px-8 sm:py-7">
          <div className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-[#c89400]" />
          <h4 className="text-3xl font-black tracking-tight text-[#2d201d] sm:text-5xl">
            Plan d&apos;abonnement
          </h4>
          <p className="mt-2 text-sm text-[#6c615b] sm:text-lg">
            Simple et transparent — essai gratuit, puis abonnement
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <article className="rounded-4xl bg-[#f3efe5] p-4 sm:p-5">
              <div className="mb-4 border-t-[6px] border-[#2f7b5f] pt-4">
                <span className="inline-flex rounded-lg bg-[#2f7b5f] px-3 py-1 text-sm font-black tracking-wide text-white">
                  GRATUIT
                </span>
              </div>
              <p className="text-lg font-bold text-[#2d201d] sm:text-xl">Essai gratuit</p>
              <p className="mt-1 text-4xl font-black text-[#2f7b5f] sm:text-5xl">7 jours</p>
              <p className="mt-4 text-sm leading-relaxed text-[#3b322d] sm:text-base">
                Accès complet
                <br />
                Aucune carte requise
                <br />
                Support inclus
              </p>
              <Link
                href="/register/select-activity"
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#2f7b5f]/35 bg-white px-4 py-2 text-sm font-bold text-[#2f7b5f]"
              >
                S&apos;abonner
              </Link>
            </article>

            <article className="rounded-[2.2rem] bg-[#c94c25] p-4 text-white shadow-[0_24px_45px_-30px_rgba(34,24,20,0.9)] sm:p-5">
              <div className="mb-4">
                <span className="inline-flex rounded-lg bg-white px-3 py-1 text-sm font-black tracking-wide text-[#b24b2b]">
                  POPULAIRE
                </span>
              </div>
              <p className="text-xl font-bold sm:text-2xl">Annuel</p>
              <p className="mt-1.5 text-4xl font-black sm:text-5xl">125 000</p>
              <p className="mt-1 text-lg font-medium text-white/90 sm:text-xl">FCFA / an</p>
              <p className="mt-4 text-sm leading-relaxed text-white/95 sm:text-base">
                Tout le plan mensuel
                <br />
                Économisez 55 000 FCFA
                <br />
                Facturation unique
                <br />
                Idéal pour commerces établis
              </p>
              <Link
                href="/register/select-activity"
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-black text-[#b24b2b]"
              >
                S&apos;abonner
              </Link>
            </article>

            <article className="rounded-4xl bg-[#f3efe5] p-4 sm:p-5">
              <div className="mb-4 border-t-[6px] border-[#cc9603] pt-4">
                <span className="inline-flex rounded-lg bg-[#cc9603] px-3 py-1 text-sm font-black tracking-wide text-white">
                  FLEXIBLE
                </span>
              </div>
              <p className="text-lg font-bold text-[#2d201d] sm:text-xl">Mensuel</p>
              <p className="mt-1 text-4xl font-black text-[#b88700] sm:text-5xl">15 000</p>
              <p className="mt-1 text-lg font-medium text-[#5d5148] sm:text-xl">FCFA / mois</p>
              <p className="mt-4 text-sm leading-relaxed text-[#3b322d] sm:text-base">
                Toutes les fonctionnalités
                <br />
                Multi-boutiques & utilisateurs
                <br />
                Mode hors ligne complet
                <br />
                Support prioritaire
                <br />
                Mises à jour incluses
              </p>
              <Link
                href="/register/select-activity"
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#cc9603]/40 bg-white px-4 py-2 text-sm font-bold text-[#9f7300]"
              >
                S&apos;abonner
              </Link>
            </article>
          </div>

          <p className="mt-5 text-center text-sm font-medium text-[#6c615b] sm:text-base">
            Pas de frais cachés • Résiliation à tout moment • Support WhatsApp inclus
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
        <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-[0_20px_50px_-32px_rgba(17,24,39,0.35)] sm:p-6">
          <div className="mb-4 sm:mb-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fs-accent sm:text-sm">
              FAQ
            </p>
            <h4 className="mt-1 text-2xl font-black tracking-tight text-fs-text sm:text-3xl">
              Questions frequentes
            </h4>
            <p className="mt-1 text-sm text-neutral-600 sm:text-base">
              Tout ce qu&apos;il faut savoir avant de demarrer.
            </p>
          </div>

          <div className="space-y-2.5 sm:space-y-3">
          {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-black/10 bg-fs-card p-0 open:border-fs-accent/35 open:bg-fs-accent/5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                  <span className="text-sm font-extrabold text-fs-text sm:text-base">
                    {f.q}
                  </span>
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 text-neutral-600 transition-transform group-open:rotate-180 group-open:bg-fs-accent/20 group-open:text-fs-accent">
                    <MdKeyboardArrowDown className="h-5 w-5" aria-hidden />
                  </span>
                </summary>
                <p className="border-t border-black/8 px-4 pb-4 pt-3 text-sm leading-relaxed text-neutral-700 sm:px-5 sm:text-[15px]">
                  {f.a}
                </p>
              </details>
          ))}
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-fs-accent/35 bg-fs-accent/5 px-4 py-3.5 sm:px-5">
            <p className="text-sm font-semibold text-fs-text sm:text-base">
              Vous avez une question specifique ?
            </p>
            <Link
              href="/help"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-fs-accent px-3.5 py-2 text-sm font-bold text-white"
            >
              Contacter le support
              <MdArrowForward className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <PartnersSection partners={partners} />

      <footer className="border-t border-black/10 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2.5">
                <Image
                  src="/fs.png"
                  alt="FasoStock"
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
                <p className="text-lg font-extrabold tracking-tight text-neutral-900">
                  <span>Faso</span>
                  <span className="text-fs-accent">Stock</span>
                </p>
              </div>
              <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
                Gestion moderne de stock, caisse et crédit client.
              </p>
            </div>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-neutral-600 sm:text-sm">
              <Link href="/help" className="transition-colors hover:text-fs-accent">
                Support
              </Link>
              <Link href="/login" className="transition-colors hover:text-fs-accent">
                Connexion
              </Link>
              <Link href="/register/select-activity" className="transition-colors hover:text-fs-accent">
                Essai gratuit
              </Link>
            </nav>
          </div>
          <div className="mt-4 border-t border-black/8 pt-3">
            <p className="text-[11px] text-neutral-500 sm:text-xs">
              © {new Date().getFullYear()} FasoStock · Tous droits réservés
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-black tracking-tight text-fs-text">{value}</p>
      <p className="text-xs text-neutral-500">{hint}</p>
    </div>
  );
}
