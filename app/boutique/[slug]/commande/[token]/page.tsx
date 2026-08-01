import { createClient } from "@/lib/supabase/server";
import { fetchPublicOrderTracking } from "@/lib/features/online-store/public-api";
import {
  ONLINE_DELIVERY_MODE_LABELS,
  ONLINE_PAYMENT_LABELS,
  type OnlineOrderStatus,
} from "@/lib/features/online-store/types";
import { onlineStorePath } from "@/lib/config/routes";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suivi de commande",
  robots: { index: false, follow: false },
};

/** Les 4 étapes que le client comprend. « Annulée » sort du parcours. */
const STEPS: { key: OnlineOrderStatus; label: string; hint: string }[] = [
  { key: "pending", label: "Reçue", hint: "La boutique a votre commande." },
  { key: "confirmed", label: "Confirmée", hint: "Elle est en préparation." },
  { key: "ready", label: "Prête", hint: "En route ou prête à retirer." },
  { key: "completed", label: "Terminée", hint: "Commande remise et réglée." },
];

function fcfa(n: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} F`;
}

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;

  const supabase = await createClient();
  let order = null;
  try {
    order = await fetchPublicOrderTracking(supabase, token);
  } catch {
    order = null;
  }

  if (!order) {
    return (
      <main className="track">
        <TrackStyles />
        <div className="track__card">
          <h1>Commande introuvable</h1>
          <p>
            Ce lien de suivi ne correspond à aucune commande. Vérifiez qu&apos;il est
            complet, ou contactez la boutique avec votre numéro de commande.
          </p>
          <Link className="track__btn" href={onlineStorePath(slug)}>
            Retour à la boutique
          </Link>
        </div>
      </main>
    );
  }

  const canceled = order.status === "canceled";
  const currentIndex = STEPS.findIndex((s) => s.key === order.status);

  return (
    <main className="track">
      <TrackStyles />
      <div className="track__card">
        <p className="track__eyebrow">{order.shopName}</p>
        <h1>Commande {order.orderNumber}</h1>
        <p className="track__date">
          Passée le{" "}
          {new Date(order.createdAt).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        {canceled ? (
          <p className="track__canceled">
            Cette commande a été annulée. Contactez la boutique si c&apos;est une erreur.
          </p>
        ) : (
          <ol className="track__steps">
            {STEPS.map((s, i) => (
              <li key={s.key} className={i <= currentIndex ? "is-done" : ""}>
                <span className="track__bullet" aria-hidden>
                  {i < currentIndex ? "✓" : i === currentIndex ? "●" : ""}
                </span>
                <span>
                  <strong>{s.label}</strong>
                  <em>{s.hint}</em>
                </span>
              </li>
            ))}
          </ol>
        )}

        <ul className="track__items">
          {order.items.map((i, idx) => (
            <li key={`${i.name}-${idx}`}>
              <span>
                <b>{i.quantity}×</b> {i.name}
              </span>
              <span>{fcfa(i.total)}</span>
            </li>
          ))}
        </ul>

        <dl className="track__sum">
          <div>
            <dt>Articles</dt>
            <dd>{fcfa(order.subtotal)}</dd>
          </div>
          {order.deliveryFee > 0 ? (
            <div>
              <dt>Livraison</dt>
              <dd>{fcfa(order.deliveryFee)}</dd>
            </div>
          ) : null}
          <div className="track__sum-total">
            <dt>Total</dt>
            <dd>{fcfa(order.total)}</dd>
          </div>
        </dl>

        <p className="track__meta">
          {ONLINE_DELIVERY_MODE_LABELS[order.deliveryMode]} ·{" "}
          {ONLINE_PAYMENT_LABELS[order.paymentMethod]}
          {order.customerAddress ? ` · ${order.customerAddress}` : ""}
        </p>

        <div className="track__actions">
          {order.shopPhone ? (
            <a
              className="track__btn"
              href={`https://wa.me/${order.shopPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                `Bonjour, au sujet de ma commande ${order.orderNumber}.`,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Écrire à la boutique
            </a>
          ) : null}
          <Link className="track__btn track__btn--ghost" href={onlineStorePath(order.shopSlug ?? slug)}>
            Retour à la boutique
          </Link>
        </div>
      </div>
      <p className="track__foot">Suivi fourni par FasoStock</p>
    </main>
  );
}

function TrackStyles() {
  return (
    <style>{`
.track {
  --ink: #16130f; --paper: #fff; --surface: #f6f5f3;
  --line: rgba(22,19,15,.12); --accent: #F97316; --good: #15803d;
  min-height: 100dvh; background: var(--surface); color: var(--ink);
  padding: 24px 16px 40px; font-variant-numeric: tabular-nums;
}
@media (prefers-color-scheme: dark) {
  .track { --ink: #f2ede8; --paper: #17161a; --surface: #0f0e12; --line: rgba(242,237,232,.16); --good: #4ade80; }
}
.track__card {
  max-width: 480px; margin: 0 auto; background: var(--paper);
  border: 1px solid var(--line); border-radius: 5px; padding: 20px;
  box-shadow: 0 10px 30px -18px rgba(0,0,0,.4);
}
.track__eyebrow {
  margin: 0; font-size: 10.5px; font-weight: 800; letter-spacing: .12em;
  text-transform: uppercase; color: var(--accent);
}
.track h1 { margin: 6px 0 0; font-size: 20px; font-weight: 900; letter-spacing: -0.03em; }
.track__date { margin: 4px 0 0; font-size: 12.5px; color: color-mix(in srgb, var(--ink) 55%, transparent); }
.track__steps { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 2px; }
.track__steps li {
  display: grid; grid-template-columns: 26px 1fr; gap: 10px; align-items: start;
  padding: 9px 0; opacity: .42;
}
.track__steps li.is-done { opacity: 1; }
.track__bullet {
  display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid var(--line); font-size: 11px; font-weight: 900;
}
.track__steps li.is-done .track__bullet {
  border-color: var(--good); color: var(--good);
  background: color-mix(in srgb, var(--good) 12%, transparent);
}
.track__steps strong { display: block; font-size: 13.5px; font-weight: 800; }
.track__steps em { font-style: normal; font-size: 12px; color: color-mix(in srgb, var(--ink) 55%, transparent); }
.track__canceled {
  margin: 16px 0 0; border-radius: 4px; padding: 11px 12px; font-size: 13px;
  background: rgba(185,28,28,.12); color: #b91c1c;
}
.track__items { list-style: none; margin: 18px 0 0; padding: 14px 0 0; border-top: 1px solid var(--line); }
.track__items li { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 13px; }
.track__sum { margin: 12px 0 0; padding-top: 10px; border-top: 1px dashed var(--line); }
.track__sum div { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
.track__sum dt, .track__sum dd { margin: 0; }
.track__sum dt { color: color-mix(in srgb, var(--ink) 55%, transparent); }
.track__sum dd { font-weight: 700; }
.track__sum-total dt { font-weight: 800; color: var(--ink); }
.track__sum-total dd { font-size: 18px; font-weight: 900; letter-spacing: -0.03em; }
.track__meta { margin: 12px 0 0; font-size: 12px; color: color-mix(in srgb, var(--ink) 55%, transparent); }
.track__actions { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }
.track__btn {
  display: block; text-align: center; text-decoration: none;
  border-radius: 4px; padding: 12px 16px; font-size: 14px; font-weight: 800;
  background: var(--accent); color: #fff;
}
.track__btn--ghost { background: transparent; border: 1px solid var(--line); color: var(--ink); }
.track__foot {
  max-width: 480px; margin: 14px auto 0; text-align: center;
  font-size: 11px; color: color-mix(in srgb, var(--ink) 42%, transparent);
}
`}</style>
  );
}
