import Image from "next/image";
import Link from "next/link";
import { MdMenu, MdPhone } from "react-icons/md";

type SiteHeaderProps = {
  sectionHrefPrefix?: string;
};

export function SiteHeader({ sectionHrefPrefix = "" }: SiteHeaderProps) {
  const section = (id: string) => `${sectionHrefPrefix}#${id}`;

  return (
    <header className="sticky top-0 z-40 border-b border-black/8 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
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
              <Link href={section("fonctionnalites-principales")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
                Fonctionnalités
              </Link>
              <Link href={section("tarifs")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
                Tarifs
              </Link>
              <Link href={section("temoignages")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
                Témoignages
              </Link>
              <Link href={section("faq")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-black/5">
                FAQ
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-fs-accent/45 bg-fs-accent/8 px-3 py-2.5 text-sm font-extrabold text-fs-accent shadow-[0_10px_24px_-18px_rgba(232,93,44,0.85)]"
              >
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

        <nav className="hidden items-center gap-6 lg:flex">
          <Link href={section("fonctionnalites-principales")} className="inline-flex items-center text-sm font-semibold text-neutral-800 hover:text-fs-accent">
            Fonctionnalités
          </Link>
          <Link href={section("tarifs")} className="text-sm font-semibold text-neutral-800 hover:text-fs-accent">
            Tarifs
          </Link>
          <Link href={section("temoignages")} className="text-sm font-semibold text-neutral-800 hover:text-fs-accent">
            Témoignages
          </Link>
          <Link href={section("faq")} className="text-sm font-semibold text-neutral-800 hover:text-fs-accent">
            FAQ
          </Link>
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-bold text-neutral-800">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fs-accent/12 text-fs-accent">
              <MdPhone className="h-4 w-4" />
            </span>
            +226 03 07 96 18
          </span>
          <Link
            href="/login"
            className="rounded-xl border border-fs-accent/55 bg-white px-3.5 py-2 text-sm font-semibold text-fs-accent"
          >
            Se connecter
          </Link>
          <Link
            href="/register/select-activity"
            className="inline-flex items-center gap-1 rounded-xl bg-fs-accent px-3.5 py-2 text-sm font-bold text-white shadow-[0_10px_24px_-14px_rgba(232,93,44,0.95)]"
          >
            ☰ Essayer gratuitement
          </Link>
        </div>
      </div>
    </header>
  );
}
