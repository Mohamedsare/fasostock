
type PartnerItem = {
  id: string;
  name: string;
  logoUrl: string;
};

export function PartnersSection({ partners }: { partners: PartnerItem[] }) {
  const looped = partners.length > 0 ? [...partners, ...partners] : [];

  return (
    <section className="mx-auto w-full max-w-none px-0 pb-8 sm:pb-10">
      <div className="bg-(--fs-surface,#eef1d7) px-4 py-10 sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-6xl">
          <div className="text-center">
            <h4 className="text-4xl font-black tracking-tight text-fs-accent sm:text-5xl">
              Nos partenaires
            </h4>
            <div className="mx-auto mt-3 h-1 w-14 rounded-full bg-fs-accent/70" />
          </div>

          {partners.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-600 sm:text-base">
              Aucun partenaire public pour le moment.
            </p>
          ) : (
            <div className="relative mt-8 overflow-hidden">
              <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-12 bg-linear-to-r from-(--fs-surface,#eef1d7) to-transparent sm:w-20" />
              <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-12 bg-linear-to-l from-(--fs-surface,#eef1d7) to-transparent sm:w-20" />
              <div className="partners-marquee-track flex w-max items-center gap-8 sm:gap-12">
                {looped.map((partner, idx) => (
                  <article
                    key={`${partner.id}-${idx}`}
                    className="flex min-w-[190px] flex-col items-center justify-center gap-2 sm:min-w-[240px]"
                  >
                    <div className="flex h-20 w-full items-center justify-center sm:h-24">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={partner.logoUrl}
                        alt={partner.name}
                        className="h-14 w-auto max-w-[200px] object-contain opacity-95 sm:h-16 sm:max-w-[240px]"
                      />
                    </div>
                    <p className="max-w-[95%] truncate text-center text-xs font-semibold text-neutral-600 sm:text-sm">
                      {partner.name}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
