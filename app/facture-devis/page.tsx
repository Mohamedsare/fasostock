import { InvoiceQuoteGenerator } from "@/components/tools/invoice-quote-generator";
import { SiteHeader } from "@/components/marketing/site-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Facture & Devis gratuits — générateur PDF",
  description:
    "Créez gratuitement une facture ou un devis professionnel en ligne, sans inscription. Aperçu en direct, impression et export PDF. Outil offert par FasoStock.",
  alternates: { canonical: "/facture-devis" },
  openGraph: {
    title: "Générateur de Facture & Devis gratuit — FasoStock",
    description:
      "Facture ou devis professionnel en quelques secondes : remplissez, prévisualisez, imprimez ou téléchargez en PDF. Gratuit et sans compte.",
    url: "/facture-devis",
  },
};

export default function FactureDevisPage() {
  return (
    <main
      id="landing-page"
      className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(232,93,44,0.12),transparent_42%),linear-gradient(to_bottom,#fff,#fff7f3)] text-neutral-900 dark:bg-[radial-gradient(circle_at_top,rgba(232,93,44,0.2),transparent_42%),linear-gradient(to_bottom,#0b1220,#111827)] dark:text-neutral-100 print:bg-white print:bg-none"
    >
      <div className="print:hidden">
        <SiteHeader sectionHrefPrefix="/" />
      </div>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <header className="mx-auto max-w-2xl text-center print:hidden">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-fs-accent/25 bg-fs-accent/[0.07] px-3 py-1 text-[12px] font-bold text-fs-accent">
            100 % gratuit · sans inscription
          </span>
          <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight sm:text-3xl lg:text-4xl">
            Générateur de <span className="text-fs-accent">Facture &amp; Devis</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-600 dark:text-neutral-300 sm:text-base">
            Renseignez vos informations, visualisez le rendu en direct, puis imprimez ou
            téléchargez votre document en PDF. Aucun compte requis.
          </p>
        </header>

        <div className="mt-7 print:mt-0">
          <InvoiceQuoteGenerator />
        </div>
      </section>
    </main>
  );
}
