"use client";

import { MdGroups } from "react-icons/md";

const testimonials = [
  {
    quote:
      "FasoStock a complètement changé ma façon de gérer mon magasin. Je sais maintenant ce que je vends, ce qui reste en stock et combien je gagne chaque jour.",
    name: "Ibrahim K.",
    role: "Gérant",
    tag: "Boutique pièces auto",
  },
  {
    quote:
      "La gestion des crédits clients est très claire. Je peux suivre toutes les dettes et relancer facilement les clients. Moins d'oublis, plus d'argent récupéré !",
    name: "Aminata S.",
    role: "Propriétaire",
    tag: "Restaurant",
  },
  {
    quote:
      "Le tableau de bord m'aide à prendre les bonnes décisions. Je vois mes ventes, mes charges et mes bénéfices en un coup d'œil. C'est un vrai outil de pilotage.",
    name: "Moussa D.",
    role: "Gérant",
    tag: "Pharmacie",
  },
  {
    quote:
      "Même quand internet coupe, je continue à vendre. Les données se synchronisent automatiquement quand la connexion revient. Très fiable !",
    name: "Harouna Z.",
    role: "Responsable",
    tag: "Quincaillerie",
  },
] as const;
const loopTestimonials = [...testimonials, ...testimonials] as const;

type TestimonialsStat = {
  value: string;
  label: string;
};

const defaultStats: TestimonialsStat[] = [
  { value: "500+", label: "Commerçants utilisent déjà FasoStock" },
  { value: "30+", label: "Types de commerces accompagnés" },
  { value: "98%", label: "De clients satisfaits selon nos retours" },
  { value: "+25%", label: "D'augmentation moyenne de performance" },
];

type TestimonialsSectionProps = {
  stats?: TestimonialsStat[];
  ctaTitle?: string;
  ctaSubtitle?: string;
};

const DEFAULT_CTA_TITLE = "La confiance de centaines de commerçants comme vous";
const DEFAULT_CTA_SUBTITLE =
  "Rejoignez la communauté FasoStock et faites passer votre commerce au niveau supérieur.";

export function TestimonialsSection({
  stats = defaultStats,
  ctaTitle = DEFAULT_CTA_TITLE,
  ctaSubtitle = DEFAULT_CTA_SUBTITLE,
}: TestimonialsSectionProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-12">
      <div className="rounded-[1.7rem] border border-black/8 bg-[#fbfbfb] px-4 py-6 sm:px-8 sm:py-8">
        <div className="text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5ef] px-3 py-1 text-xs font-black uppercase tracking-wide text-fs-accent">
            <MdGroups className="h-4 w-4" />
            Témoignages
          </p>
          <h3 className="mx-auto mt-3 max-w-4xl text-[2rem] font-black leading-[1.05] tracking-tight text-[#17253a] sm:text-[3.1rem]">
            Ils utilisent déjà <span className="text-fs-accent">FasoStock</span>
          </h3>
          <p className="mx-auto mt-3 max-w-3xl text-sm text-neutral-600 sm:text-[1.05rem]">
            Des commerçants satisfaits qui gagnent du temps, réduisent les pertes et développent leur activité grâce à FasoStock.
          </p>
        </div>

        <div className="mt-6 overflow-hidden">
          <div data-fs-stagger className="testimonials-auto-track flex items-stretch gap-3">
            {loopTestimonials.map((t, i) => (
              <article
                key={`${t.name}-${t.tag}-${i}`}
                className="flex min-h-[320px] w-[min(82vw,300px)] shrink-0 flex-col rounded-2xl border border-black/10 bg-white p-4 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.45)] sm:w-[min(44vw,320px)] lg:w-[320px]"
              >
                <p className="text-fs-accent">❝</p>
                <p className="mt-1 font-['Inter',ui-sans-serif,system-ui,sans-serif] text-[0.9rem] font-medium italic leading-[1.72] tracking-[0.003em] text-[#17253a]">
                  {t.quote}
                </p>
                <p className="mt-3 text-sm text-fs-accent">★★★★★</p>
                <div className="mt-auto border-t border-black/8 pt-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-11 w-11 rounded-full bg-[linear-gradient(135deg,#d9d9d9,#a8a8a8)] ring-1 ring-black/10" />
                    <div>
                      <p className="font-black text-[#202938]">{t.name}</p>
                      <p className="text-xs text-neutral-500">{t.role}</p>
                    </div>
                  </div>
                  <span className="mt-2 inline-flex rounded-full bg-[#fff5ef] px-2.5 py-1 text-[11px] font-bold text-fs-accent">
                    {t.tag}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-fs-accent/25 bg-[#fff7f1]">
          <div data-fs-stagger className="grid grid-cols-2 divide-y divide-fs-accent/15 text-center min-[760px]:grid-cols-4 min-[760px]:divide-x min-[760px]:divide-y-0">
            {stats.slice(0, 4).map((item, idx) => (
              <div key={`${idx}-${item.value}`} className="px-4 py-3">
                <p className="text-4xl font-black text-[#202938]">{item.value}</p>
                <p className="text-xs text-neutral-600">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 text-center">
          <p className="text-2xl font-black text-[#202938]">
            <span className="text-fs-accent">🛡</span> {ctaTitle}
          </p>
          <p className="text-sm text-neutral-600">{ctaSubtitle}</p>
        </div>
      </div>
    </section>
  );
}
