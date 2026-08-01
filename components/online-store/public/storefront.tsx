"use client";

/**
 * Catalogue public d'une boutique FasoStock.
 *
 * ── Parti pris de design ─────────────────────────────────────────────────────
 * Public visé : un client au Burkina, sur un téléphone Android d'entrée de gamme,
 * en 3G, qui n'a peut-être jamais commandé en ligne. Tout le design découle de là.
 *
 * • Couleur — la vitrine est en marque blanche : la couleur du commerçant
 *   (`--shop-accent`) pilote TOUT, y compris les gris, dérivés par `color-mix` avec
 *   4 % d'accent. Une quincaillerie bleue et une boutique de tissus fuchsia n'ont
 *   donc pas la même page, sans qu'on ait à dessiner deux thèmes. L'identité tient
 *   à la structure et au rythme typographique, pas à une teinte imposée.
 * • Typo — aucune police n'est chargée : Inter est déjà là (layout racine), et
 *   faire payer 80 ko de webfont à quelqu'un qui paie sa data au mégaoctet serait
 *   un mauvais calcul. Le caractère vient du contraste d'échelle (prix en 900 très
 *   serré, micro-labels en majuscules espacées) et des chiffres tabulaires.
 * • Rythme — un seul écran qui défile, jamais de navigation : chercher, ajouter,
 *   commander. Le panier vit dans une barre basse permanente, puis une feuille.
 * • Réseau — le catalogue entier arrive avec la page (rendu serveur). La recherche,
 *   les filtres et le panier n'appellent JAMAIS le réseau. Seule la validation de
 *   la commande fait un aller-retour. Le panier est sauvegardé sur l'appareil : une
 *   coupure de connexion ne fait rien perdre.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createPublicOnlineOrder } from "@/lib/features/online-store/public-api";
import { onlineOrderTrackPath } from "@/lib/config/routes";
import type {
  OnlineDeliveryMode,
  OnlinePaymentMethod,
  PublicCatalogProduct,
  PublicOnlineStore,
} from "@/lib/features/online-store/types";

type CartLine = { productId: string; quantity: number };
type Step = "catalog" | "cart" | "checkout" | "done";

const CART_KEY = (slug: string) => `fs_shop_cart_${slug}`;
const IDENTITY_KEY = "fs_shop_identity";

function fcfa(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} F`;
}

/** Recherche tolérante : sans accents, sans casse. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function Storefront({
  shop,
  products,
  source,
}: {
  shop: PublicOnlineStore;
  products: PublicCatalogProduct[];
  source: string;
}) {
  const [step, setStep] = useState<Step>("catalog");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<OnlineDeliveryMode>(
    shop.deliveryEnabled ? "delivery" : "pickup",
  );
  const [payment, setPayment] = useState<OnlinePaymentMethod>(
    shop.payOnDeliveryEnabled ? "cash_on_delivery" : shop.payMobileMoneyEnabled ? "mobile_money" : "on_site",
  );
  const [sending, setSending] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ orderNumber: string; token: string; total: number } | null>(
    null,
  );

  const searchRef = useRef<HTMLInputElement | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, PublicCatalogProduct>();
    for (const p of products) m.set(p.productId, p);
    return m;
  }, [products]);

  // ── Panier persistant (l'appareil, pas le serveur) ────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY(shop.slug));
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        // On oublie les lignes dont le produit n'est plus au catalogue.
        setCart(parsed.filter((l) => byId.has(l.productId) && l.quantity > 0));
      }
      const ident = localStorage.getItem(IDENTITY_KEY);
      if (ident) {
        const p = JSON.parse(ident) as { name?: string; phone?: string; address?: string };
        if (p.name) setName(p.name);
        if (p.phone) setPhone(p.phone);
        if (p.address) setAddress(p.address);
      }
    } catch {
      /* stockage indisponible (navigation privée) : on continue sans */
    }
    setCartLoaded(true);
  }, [shop.slug, byId]);

  useEffect(() => {
    if (!cartLoaded) return;
    try {
      localStorage.setItem(CART_KEY(shop.slug), JSON.stringify(cart));
    } catch {
      /* rien à faire */
    }
  }, [cart, cartLoaded, shop.slug]);

  // ── Dérivés ───────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const p of products) {
      const key = p.categoryId ?? "";
      if (!key) continue;
      const cur = counts.get(key);
      if (cur) cur.count += 1;
      else counts.set(key, { name: p.categoryName ?? "Autres", count: 1 });
    }
    return [...counts.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [products]);

  const visible = useMemo(() => {
    const q = normalize(search);
    return products.filter((p) => {
      if (category && p.categoryId !== category) return false;
      if (!q) return true;
      return (
        normalize(p.name).includes(q) ||
        normalize(p.categoryName ?? "").includes(q) ||
        normalize(p.brandName ?? "").includes(q)
      );
    });
  }, [products, search, category]);

  const lines = useMemo(
    () =>
      cart
        .map((l) => ({ line: l, product: byId.get(l.productId) }))
        .filter((x): x is { line: CartLine; product: PublicCatalogProduct } => x.product != null),
    [cart, byId],
  );

  const subtotal = useMemo(
    () => lines.reduce((s, x) => s + x.product.price * x.line.quantity, 0),
    [lines],
  );
  const itemCount = useMemo(() => lines.reduce((s, x) => s + x.line.quantity, 0), [lines]);
  const deliveryFee = mode === "delivery" ? shop.deliveryFee : 0;
  const total = subtotal + deliveryFee;
  const belowMinimum = subtotal < shop.minOrderAmount;

  const qtyOf = useCallback(
    (productId: string) => cart.find((l) => l.productId === productId)?.quantity ?? 0,
    [cart],
  );

  function setQty(productId: string, quantity: number) {
    const stock = byId.get(productId)?.stock ?? 0;
    const q = Math.max(0, Math.min(quantity, stock));
    setCart((prev) => {
      const others = prev.filter((l) => l.productId !== productId);
      return q === 0 ? others : [...others, { productId, quantity: q }];
    });
  }

  function addOne(p: PublicCatalogProduct) {
    setQty(p.productId, qtyOf(p.productId) + 1);
    setJustAdded(p.productId);
    window.setTimeout(() => setJustAdded((c) => (c === p.productId ? null : c)), 550);
  }

  async function submitOrder() {
    setOrderError(null);
    if (lines.length === 0) return;
    setSending(true);
    try {
      const supabase = createClient();
      const res = await createPublicOnlineOrder(supabase, {
        slug: shop.slug,
        customerName: name,
        customerPhone: phone,
        deliveryMode: mode,
        paymentMethod: payment,
        customerAddress: mode === "delivery" ? address : null,
        note: note.trim() || null,
        items: lines.map((x) => ({ productId: x.product.productId, quantity: x.line.quantity })),
        source,
      });
      try {
        localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name, phone, address }));
        localStorage.removeItem(CART_KEY(shop.slug));
      } catch {
        /* rien à faire */
      }
      setCart([]);
      setConfirmed({ orderNumber: res.orderNumber, token: res.publicToken, total: res.total });
      setStep("done");
    } catch (e) {
      setOrderError(
        e instanceof Error && e.message
          ? e.message
          : "La commande n'est pas partie. Vérifiez votre connexion et réessayez.",
      );
    } finally {
      setSending(false);
    }
  }

  const phoneDigits = phone.replace(/[^0-9]/g, "");
  const canOrder =
    name.trim().length >= 2 &&
    phoneDigits.length >= 8 &&
    (mode === "pickup" || address.trim().length >= 4) &&
    lines.length > 0 &&
    !belowMinimum;

  const whatsappHref = shop.whatsappPhone
    ? `https://wa.me/${shop.whatsappPhone.replace(/[^0-9]/g, "")}`
    : null;

  return (
    <div className="shop" style={{ "--shop-accent": shop.accentColor } as React.CSSProperties}>
      <ShopStyles />

      {/* ── En-tête : la boutique se présente ─────────────────────────────── */}
      <header className="shop-hero">
        {shop.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="shop-hero__cover" src={shop.coverUrl} alt="" aria-hidden />
        ) : (
          <div className="shop-hero__cover shop-hero__cover--fallback" aria-hidden />
        )}
        <div className="shop-hero__body">
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="shop-hero__logo" src={shop.logoUrl} alt="" />
          ) : (
            <div className="shop-hero__logo shop-hero__logo--initial" aria-hidden>
              {shop.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="shop-hero__text">
            <h1>{shop.displayName}</h1>
            {shop.tagline ? <p className="shop-hero__tagline">{shop.tagline}</p> : null}
            <p className="shop-hero__meta">
              <span className="shop-dot shop-dot--live" aria-hidden />
              Ouverte 24h/24 · {shop.productsCount} article
              {shop.productsCount > 1 ? "s" : ""} en stock
              {shop.city ? ` · ${shop.city}` : ""}
            </p>
          </div>
        </div>

        <div className="shop-hero__facts">
          {shop.deliveryEnabled ? (
            <span className="shop-fact">
              <strong>Livraison</strong>
              {shop.deliveryFee > 0 ? fcfa(shop.deliveryFee) : "offerte"}
            </span>
          ) : null}
          {shop.pickupEnabled ? (
            <span className="shop-fact">
              <strong>Retrait</strong>en boutique
            </span>
          ) : null}
          {shop.payOnDeliveryEnabled ? (
            <span className="shop-fact">
              <strong>Paiement</strong>à la réception
            </span>
          ) : null}
          {shop.payMobileMoneyEnabled ? (
            <span className="shop-fact">
              <strong>Mobile Money</strong>accepté
            </span>
          ) : null}
        </div>
      </header>

      {/* ── Recherche + catégories, collés en haut ────────────────────────── */}
      <div className="shop-sticky">
        <div className="shop-search">
          <svg viewBox="0 0 24 24" aria-hidden className="shop-search__icon">
            <path
              fill="currentColor"
              d="M10 18a8 8 0 1 1 5.29-14A8 8 0 0 1 10 18Zm0-2a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm11 6-5.6-5.6 1.4-1.4L22.4 20.6Z"
            />
          </svg>
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            placeholder="Chercher un article…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Chercher un article"
          />
          {search ? (
            <button type="button" className="shop-search__clear" onClick={() => setSearch("")}>
              Effacer
            </button>
          ) : null}
        </div>

        {categories.length > 0 ? (
          <div className="shop-rail" role="tablist" aria-label="Catégories">
            <button
              type="button"
              role="tab"
              aria-selected={category === ""}
              className={`shop-chip${category === "" ? " is-on" : ""}`}
              onClick={() => setCategory("")}
            >
              Tout <span>{products.length}</span>
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                className={`shop-chip${category === c.id ? " is-on" : ""}`}
                onClick={() => setCategory(category === c.id ? "" : c.id)}
              >
                {c.name} <span>{c.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Grille produits ──────────────────────────────────────────────── */}
      <main className="shop-main">
        {visible.length === 0 ? (
          <div className="shop-empty">
            <p className="shop-empty__title">Rien ne correspond à « {search} »</p>
            <p className="shop-empty__hint">
              Essayez un autre mot, ou appelez la boutique : on trouvera avec vous.
            </p>
            {shop.callPhone ? (
              <a className="shop-btn shop-btn--ghost" href={`tel:${shop.callPhone}`}>
                Appeler {shop.callPhone}
              </a>
            ) : null}
          </div>
        ) : (
          <ul className="shop-grid">
            {visible.map((p) => {
              const q = qtyOf(p.productId);
              const out = p.stock <= 0;
              return (
                <li key={p.productId} className={`shop-card${out ? " is-out" : ""}`}>
                  <div className="shop-card__media">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" />
                    ) : (
                      <span className="shop-card__noimage" aria-hidden>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    {p.discountPercent > 0 ? (
                      <span className="shop-tag shop-tag--promo">-{Math.round(p.discountPercent)}%</span>
                    ) : null}
                    {out ? (
                      <span className="shop-tag shop-tag--out">Épuisé</span>
                    ) : p.stock <= 3 ? (
                      <span className="shop-tag shop-tag--low">
                        {p.stock} restant{p.stock > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </div>

                  <div className="shop-card__body">
                    <p className="shop-card__name">{p.name}</p>
                    <p className="shop-card__price">
                      {fcfa(p.price)}
                      {p.discountPercent > 0 ? <s>{fcfa(p.basePrice)}</s> : null}
                    </p>
                  </div>

                  {out ? (
                    <p className="shop-card__outmsg">Bientôt de retour</p>
                  ) : q === 0 ? (
                    <button
                      type="button"
                      className={`shop-add${justAdded === p.productId ? " is-pop" : ""}`}
                      onClick={() => addOne(p)}
                    >
                      Ajouter
                    </button>
                  ) : (
                    <div className="shop-step" aria-label={`Quantité de ${p.name}`}>
                      <button
                        type="button"
                        onClick={() => setQty(p.productId, q - 1)}
                        aria-label="Retirer un"
                      >
                        −
                      </button>
                      <span aria-live="polite">{q}</span>
                      <button
                        type="button"
                        onClick={() => setQty(p.productId, q + 1)}
                        disabled={q >= p.stock}
                        aria-label="Ajouter un"
                      >
                        +
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {shop.description ? (
          <section className="shop-about">
            <h2>À propos</h2>
            <p>{shop.description}</p>
            {shop.address ? <p className="shop-about__line">📍 {shop.address}</p> : null}
            {shop.hoursNote ? <p className="shop-about__line">🕒 {shop.hoursNote}</p> : null}
            {shop.deliveryNote ? <p className="shop-about__line">🛵 {shop.deliveryNote}</p> : null}
          </section>
        ) : null}

        <footer className="shop-footer">
          <p>
            Stock et prix mis à jour en direct depuis la caisse de la boutique.
            <br />
            Boutique propulsée par <strong>FasoStock</strong>.
          </p>
        </footer>
      </main>

      {/* ── Barre panier permanente ──────────────────────────────────────── */}
      {itemCount > 0 && step === "catalog" ? (
        <div className="shop-bar">
          <button type="button" className="shop-bar__btn" onClick={() => setStep("cart")}>
            <span className="shop-bar__count" aria-live="polite">
              {itemCount}
            </span>
            <span className="shop-bar__label">Voir mon panier</span>
            <span className="shop-bar__total">{fcfa(subtotal)}</span>
          </button>
        </div>
      ) : null}

      {/* ── Feuille : panier ─────────────────────────────────────────────── */}
      {step === "cart" ? (
        <Sheet title="Mon panier" onClose={() => setStep("catalog")}>
          <ul className="shop-lines">
            {lines.map(({ line, product }) => (
              <li key={line.productId}>
                <div className="shop-lines__info">
                  <p className="shop-lines__name">{product.name}</p>
                  <p className="shop-lines__unit">{fcfa(product.price)} l&apos;unité</p>
                </div>
                <div className="shop-step shop-step--sm">
                  <button type="button" onClick={() => setQty(line.productId, line.quantity - 1)} aria-label="Retirer un">
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQty(line.productId, line.quantity + 1)}
                    disabled={line.quantity >= product.stock}
                    aria-label="Ajouter un"
                  >
                    +
                  </button>
                </div>
                <span className="shop-lines__total">{fcfa(product.price * line.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl className="shop-sum">
            <div>
              <dt>Articles</dt>
              <dd>{fcfa(subtotal)}</dd>
            </div>
            {shop.deliveryEnabled && mode === "delivery" ? (
              <div>
                <dt>Livraison</dt>
                <dd>{shop.deliveryFee > 0 ? fcfa(shop.deliveryFee) : "offerte"}</dd>
              </div>
            ) : null}
            <div className="shop-sum__total">
              <dt>Total</dt>
              <dd>{fcfa(total)}</dd>
            </div>
          </dl>

          {belowMinimum ? (
            <p className="shop-warn">
              Commande minimum : {fcfa(shop.minOrderAmount)}. Ajoutez encore{" "}
              {fcfa(shop.minOrderAmount - subtotal)}.
            </p>
          ) : null}

          <div className="shop-sheet__actions">
            <button type="button" className="shop-btn shop-btn--ghost" onClick={() => setStep("catalog")}>
              Continuer mes achats
            </button>
            <button
              type="button"
              className="shop-btn shop-btn--primary"
              disabled={belowMinimum || lines.length === 0}
              onClick={() => setStep("checkout")}
            >
              Commander
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* ── Feuille : coordonnées ────────────────────────────────────────── */}
      {step === "checkout" ? (
        <Sheet title="Vos coordonnées" onClose={() => setStep("cart")}>
          <p className="shop-sheet__lead">
            Pas de compte à créer. La boutique vous rappelle pour confirmer.
          </p>

          <label className="shop-field">
            <span>Votre nom</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Ex. Awa Traoré"
            />
          </label>

          <label className="shop-field">
            <span>Téléphone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="70 00 00 00"
            />
            {phone && phoneDigits.length < 8 ? (
              <em className="shop-field__err">Il faut au moins 8 chiffres.</em>
            ) : null}
          </label>

          {shop.deliveryEnabled && shop.pickupEnabled ? (
            <div className="shop-choice">
              <button
                type="button"
                className={mode === "delivery" ? "is-on" : ""}
                onClick={() => setMode("delivery")}
              >
                <strong>Je me fais livrer</strong>
                <em>{shop.deliveryFee > 0 ? fcfa(shop.deliveryFee) : "Livraison offerte"}</em>
              </button>
              <button
                type="button"
                className={mode === "pickup" ? "is-on" : ""}
                onClick={() => setMode("pickup")}
              >
                <strong>Je viens chercher</strong>
                <em>{shop.address ?? "En boutique"}</em>
              </button>
            </div>
          ) : null}

          {mode === "delivery" ? (
            <label className="shop-field">
              <span>Où livrer ?</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
                placeholder="Quartier, rue, repère connu…"
              />
            </label>
          ) : null}

          <div className="shop-pay">
            <span className="shop-field__label">Paiement</span>
            {shop.payOnDeliveryEnabled ? (
              <PayOption
                checked={payment === "cash_on_delivery"}
                onSelect={() => setPayment("cash_on_delivery")}
                title={mode === "pickup" ? "En espèces au retrait" : "En espèces à la livraison"}
                hint="Vous payez quand vous recevez."
              />
            ) : null}
            {shop.payMobileMoneyEnabled ? (
              <PayOption
                checked={payment === "mobile_money"}
                onSelect={() => setPayment("mobile_money")}
                title="Mobile Money"
                hint={shop.mobileMoneyNumber ? `Vers le ${shop.mobileMoneyNumber}` : "La boutique vous guidera."}
              />
            ) : null}
            <PayOption
              checked={payment === "on_site"}
              onSelect={() => setPayment("on_site")}
              title="Sur place, en boutique"
              hint="Vous réglez au comptoir."
            />
          </div>

          <label className="shop-field">
            <span>Un mot pour la boutique (facultatif)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ex. livrer après 17h"
            />
          </label>

          <dl className="shop-sum">
            <div className="shop-sum__total">
              <dt>À payer</dt>
              <dd>{fcfa(total)}</dd>
            </div>
          </dl>

          {orderError ? <p className="shop-warn shop-warn--err">{orderError}</p> : null}

          <div className="shop-sheet__actions">
            <button type="button" className="shop-btn shop-btn--ghost" onClick={() => setStep("cart")}>
              Retour
            </button>
            <button
              type="button"
              className="shop-btn shop-btn--primary"
              disabled={!canOrder || sending}
              onClick={() => void submitOrder()}
            >
              {sending ? "Envoi…" : `Envoyer ma commande · ${fcfa(total)}`}
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* ── Confirmation ─────────────────────────────────────────────────── */}
      {step === "done" && confirmed ? (
        <Sheet title="" onClose={() => setStep("catalog")} hideClose>
          <div className="shop-done">
            <div className="shop-done__mark" aria-hidden>
              ✓
            </div>
            <h2>Commande envoyée !</h2>
            <p className="shop-done__num">{confirmed.orderNumber}</p>
            <p className="shop-done__lead">
              {shop.displayName} a reçu votre commande de {fcfa(confirmed.total)} et vous
              rappellera au {phone} pour confirmer.
            </p>

            <div className="shop-done__actions">
              {whatsappHref ? (
                <a
                  className="shop-btn shop-btn--primary"
                  href={`${whatsappHref}?text=${encodeURIComponent(
                    `Bonjour, je viens de passer la commande ${confirmed.orderNumber} sur votre boutique en ligne.`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Prévenir sur WhatsApp
                </a>
              ) : null}
              <a
                className="shop-btn shop-btn--ghost"
                href={onlineOrderTrackPath(shop.slug, confirmed.token)}
              >
                Suivre ma commande
              </a>
              <button
                type="button"
                className="shop-btn shop-btn--ghost"
                onClick={() => {
                  setConfirmed(null);
                  setStep("catalog");
                }}
              >
                Commander autre chose
              </button>
            </div>
            <p className="shop-done__keep">
              Gardez le numéro <strong>{confirmed.orderNumber}</strong> : il suffit à la
              boutique pour retrouver votre commande.
            </p>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function PayOption({
  checked,
  onSelect,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button type="button" className={`shop-pay__opt${checked ? " is-on" : ""}`} onClick={onSelect}>
      <span className="shop-pay__radio" aria-hidden />
      <span>
        <strong>{title}</strong>
        <em>{hint}</em>
      </span>
    </button>
  );
}

function Sheet({
  title,
  children,
  onClose,
  hideClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  hideClose?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="shop-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Commande"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="shop-sheet__panel">
        <div className="shop-sheet__grip" aria-hidden />
        {title ? (
          <div className="shop-sheet__head">
            <h2>{title}</h2>
            {hideClose ? null : (
              <button type="button" onClick={onClose} aria-label="Fermer">
                ✕
              </button>
            )}
          </div>
        ) : null}
        <div className="shop-sheet__body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Feuille de style scopée à `.shop`. L'app est en thème clair/sombre piloté par une
 * classe (`html.dark`) que le visiteur anonyme ne peut pas changer : la vitrine suit
 * donc la préférence système du téléphone, indépendamment du thème de l'application.
 */
function ShopStyles() {
  return (
    <style>{`
.shop {
  --ink: #16130f;
  --ink-soft: color-mix(in srgb, var(--ink) 62%, transparent);
  --ink-faint: color-mix(in srgb, var(--ink) 42%, transparent);
  --paper: #ffffff;
  /* Gris teintés par la couleur du commerçant : la page lui appartient. */
  --surface: color-mix(in srgb, var(--shop-accent) 4%, #f7f6f4);
  --surface-2: color-mix(in srgb, var(--shop-accent) 7%, #efedea);
  --line: color-mix(in srgb, var(--ink) 12%, transparent);
  --accent: var(--shop-accent);
  --on-accent: #ffffff;
  --good: #15803d;
  --warn: #b45309;
  --bad: #b91c1c;
  --radius: 4px;
  --shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent),
            0 8px 24px -12px color-mix(in srgb, var(--ink) 22%, transparent);
  background: var(--surface);
  color: var(--ink);
  min-height: 100dvh;
  padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  font-variant-numeric: tabular-nums;
  -webkit-tap-highlight-color: transparent;
}

@media (prefers-color-scheme: dark) {
  .shop {
    --ink: #f2ede8;
    --paper: #17161a;
    --surface: color-mix(in srgb, var(--shop-accent) 6%, #0f0e12);
    --surface-2: color-mix(in srgb, var(--shop-accent) 10%, #1b1a20);
    --line: color-mix(in srgb, var(--ink) 16%, transparent);
    --good: #4ade80;
    --warn: #fbbf24;
    --bad: #f87171;
    --shadow: 0 1px 2px rgba(0,0,0,.5), 0 10px 30px -14px rgba(0,0,0,.8);
  }
}

.shop *, .shop *::before, .shop *::after { box-sizing: border-box; }
.shop button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
.shop :focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 3px;
}

/* ── Hero ─────────────────────────────────────────────────────────────── */
.shop-hero { background: var(--paper); border-bottom: 1px solid var(--line); }
.shop-hero__cover {
  display: block; width: 100%; height: 148px; object-fit: cover;
}
.shop-hero__cover--fallback {
  background:
    radial-gradient(120% 140% at 12% 0%, color-mix(in srgb, var(--accent) 78%, transparent), transparent 62%),
    linear-gradient(120deg, color-mix(in srgb, var(--accent) 92%, #000 8%), color-mix(in srgb, var(--accent) 45%, #000));
}
.shop-hero__body {
  display: flex; gap: 12px; align-items: flex-end;
  padding: 0 16px; margin-top: -34px;
}
.shop-hero__logo {
  width: 68px; height: 68px; flex: 0 0 auto; border-radius: 6px;
  object-fit: cover; background: var(--paper);
  border: 3px solid var(--paper); box-shadow: var(--shadow);
}
.shop-hero__logo--initial {
  display: grid; place-items: center;
  background: var(--accent); color: var(--on-accent);
  font-size: 28px; font-weight: 900; letter-spacing: -0.02em;
}
.shop-hero__text { min-width: 0; padding-bottom: 2px; }
.shop-hero h1 {
  margin: 0; font-size: 21px; font-weight: 800; letter-spacing: -0.025em;
  line-height: 1.15; text-wrap: balance;
}
.shop-hero__tagline {
  margin: 3px 0 0; font-size: 13px; color: var(--ink-soft); line-height: 1.35;
}
.shop-hero__meta {
  margin: 6px 0 0; font-size: 11.5px; color: var(--ink-faint);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.shop-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--good); flex: 0 0 auto; }
.shop-dot--live { box-shadow: 0 0 0 3px color-mix(in srgb, var(--good) 22%, transparent); }

.shop-hero__facts {
  display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
  padding: 14px 16px 16px;
}
.shop-hero__facts::-webkit-scrollbar { display: none; }
.shop-fact {
  flex: 0 0 auto; display: flex; flex-direction: column; gap: 1px;
  background: var(--surface-2); border-radius: 4px; padding: 7px 11px;
  font-size: 11.5px; color: var(--ink-soft); white-space: nowrap;
}
.shop-fact strong {
  font-size: 9.5px; font-weight: 800; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--accent);
}

/* ── Barre collante ───────────────────────────────────────────────────── */
.shop-sticky {
  position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
  padding: 10px 16px 8px;
}
.shop-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--paper); border: 1px solid var(--line);
  border-radius: 4px; padding: 0 12px;
}
.shop-search__icon { width: 18px; height: 18px; flex: 0 0 auto; color: var(--ink-faint); }
.shop-search input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: none;
  padding: 12px 0; font-size: 15px; color: var(--ink);
}
.shop-search input::placeholder { color: var(--ink-faint); }
.shop-search__clear {
  font-size: 12px; font-weight: 700; color: var(--accent); padding: 6px 0;
}

.shop-rail {
  display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none;
  margin-top: 9px; padding-bottom: 2px;
}
.shop-rail::-webkit-scrollbar { display: none; }
.shop-chip {
  flex: 0 0 auto; border-radius: 4px; padding: 7px 13px;
  background: var(--paper); border: 1px solid var(--line);
  font-size: 12.5px; font-weight: 600; white-space: nowrap;
  transition: background .16s ease, color .16s ease, border-color .16s ease;
}
.shop-chip span { color: var(--ink-faint); font-weight: 700; margin-left: 3px; }
.shop-chip.is-on {
  background: var(--accent); border-color: var(--accent); color: var(--on-accent);
}
.shop-chip.is-on span { color: color-mix(in srgb, var(--on-accent) 75%, transparent); }

/* ── Grille ───────────────────────────────────────────────────────────── */
.shop-main { padding: 14px 16px 0; }
.shop-grid {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;
}
@media (min-width: 640px) { .shop-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 960px) {
  .shop-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .shop-main, .shop-sticky, .shop-hero__body, .shop-hero__facts {
    max-width: 1120px; margin-inline: auto;
  }
}

.shop-card {
  display: flex; flex-direction: column;
  background: var(--paper); border: 1px solid var(--line);
  border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow);
}
.shop-card.is-out { opacity: .62; }
.shop-card__media { position: relative; aspect-ratio: 1 / 1; background: var(--surface-2); }
.shop-card__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.shop-card__noimage {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 26px; font-weight: 900; letter-spacing: .04em;
  color: color-mix(in srgb, var(--accent) 55%, transparent);
}
.shop-tag {
  position: absolute; top: 7px; left: 7px;
  border-radius: 3px; padding: 3px 8px;
  font-size: 10.5px; font-weight: 800; letter-spacing: .01em;
}
.shop-tag--promo { background: var(--bad); color: #fff; }
.shop-tag--low { top: auto; bottom: 7px; background: color-mix(in srgb, var(--warn) 16%, var(--paper)); color: var(--warn); }
.shop-tag--out { top: auto; bottom: 7px; background: var(--surface-2); color: var(--ink-soft); }

.shop-card__body { padding: 9px 10px 0; flex: 1; }
.shop-card__name {
  margin: 0; font-size: 13px; line-height: 1.3; font-weight: 600;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.shop-card__price {
  margin: 5px 0 0; font-size: 16px; font-weight: 900; letter-spacing: -0.03em;
}
.shop-card__price s {
  margin-left: 6px; font-size: 11.5px; font-weight: 600;
  color: var(--ink-faint); letter-spacing: 0;
}
.shop-card__outmsg {
  margin: 8px 10px 10px; font-size: 12px; font-weight: 600; color: var(--ink-faint);
}

.shop-add {
  margin: 9px 10px 10px; border-radius: 4px; padding: 9px 0;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent); font-size: 13px; font-weight: 800;
  transition: transform .18s cubic-bezier(.2,.9,.3,1.4), background .16s ease;
}
.shop-add:active { transform: scale(.97); }
.shop-add.is-pop { background: var(--accent); color: var(--on-accent); transform: scale(1.04); }

.shop-step {
  margin: 9px 10px 10px; display: grid; grid-template-columns: 36px 1fr 36px;
  align-items: center; border-radius: 4px; background: var(--accent); color: var(--on-accent);
}
.shop-step button { height: 36px; font-size: 19px; font-weight: 800; color: inherit; }
.shop-step button:disabled { opacity: .4; cursor: not-allowed; }
.shop-step span { text-align: center; font-size: 14px; font-weight: 800; }
.shop-step--sm { margin: 0; grid-template-columns: 30px 1fr 30px; }
.shop-step--sm button { height: 30px; font-size: 16px; }

.shop-empty { padding: 44px 8px; text-align: center; }
.shop-empty__title { margin: 0; font-size: 15px; font-weight: 800; }
.shop-empty__hint { margin: 6px 0 14px; font-size: 13px; color: var(--ink-soft); }

.shop-about {
  margin-top: 22px; background: var(--paper); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 14px 16px;
}
.shop-about h2 {
  margin: 0 0 6px; font-size: 10.5px; font-weight: 800;
  letter-spacing: .12em; text-transform: uppercase; color: var(--accent);
}
.shop-about p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--ink-soft); max-width: 62ch; }
.shop-about__line { margin-top: 8px !important; }

.shop-footer { padding: 26px 4px calc(20px + env(safe-area-inset-bottom, 0px)); text-align: center; }
.shop-footer p { margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--ink-faint); }

/* ── Barre panier ─────────────────────────────────────────────────────── */
.shop-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to top, var(--surface) 62%, transparent);
  animation: shop-rise .22s cubic-bezier(.2,.8,.3,1);
}
@keyframes shop-rise { from { transform: translateY(18px); opacity: 0 } to { transform: none; opacity: 1 } }
.shop-bar__btn {
  width: 100%; max-width: 560px; margin-inline: auto;
  display: flex; align-items: center; gap: 10px;
  background: var(--accent); color: var(--on-accent);
  border-radius: 5px; padding: 13px 14px; box-shadow: var(--shadow);
}
.shop-bar__count {
  display: grid; place-items: center; min-width: 26px; height: 26px;
  border-radius: 3px; background: color-mix(in srgb, #000 18%, transparent);
  font-size: 13px; font-weight: 900;
}
.shop-bar__label { flex: 1; text-align: left; font-size: 14.5px; font-weight: 800; letter-spacing: -0.01em; }
.shop-bar__total { font-size: 15px; font-weight: 900; letter-spacing: -0.02em; }

/* ── Feuilles ─────────────────────────────────────────────────────────── */
.shop-sheet {
  position: fixed; inset: 0; z-index: 40; display: flex; align-items: flex-end;
  background: color-mix(in srgb, #000 52%, transparent);
  animation: shop-fade .18s ease;
}
@keyframes shop-fade { from { opacity: 0 } to { opacity: 1 } }
.shop-sheet__panel {
  width: 100%; max-height: 92dvh; display: flex; flex-direction: column;
  background: var(--surface); border-radius: 8px 8px 0 0;
  animation: shop-slide .26s cubic-bezier(.2,.8,.3,1);
}
@media (min-width: 640px) {
  .shop-sheet { align-items: center; justify-content: center; padding: 24px; }
  .shop-sheet__panel { max-width: 520px; border-radius: 6px; }
}
@keyframes shop-slide { from { transform: translateY(24px) } to { transform: none } }
@media (prefers-reduced-motion: reduce) {
  .shop-sheet__panel, .shop-bar, .shop-add { animation: none; transition: none; }
}
.shop-sheet__grip {
  width: 38px; height: 4px; border-radius: 99px; background: var(--line);
  margin: 8px auto 0;
}
.shop-sheet__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 18px 6px;
}
.shop-sheet__head h2 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.02em; }
.shop-sheet__head button { font-size: 17px; color: var(--ink-faint); padding: 4px 6px; }
.shop-sheet__body { overflow-y: auto; padding: 6px 18px calc(18px + env(safe-area-inset-bottom, 0px)); }
.shop-sheet__lead { margin: 0 0 14px; font-size: 13px; color: var(--ink-soft); line-height: 1.5; }
.shop-sheet__actions { display: flex; gap: 8px; margin-top: 16px; }
.shop-sheet__actions .shop-btn { flex: 1; }

.shop-btn {
  display: inline-flex; align-items: center; justify-content: center; text-align: center;
  border-radius: 4px; padding: 13px 16px; font-size: 14px; font-weight: 800;
  text-decoration: none; line-height: 1.2;
}
.shop-btn--primary { background: var(--accent); color: var(--on-accent); }
.shop-btn--primary:disabled { opacity: .45; cursor: not-allowed; }
.shop-btn--ghost { background: var(--paper); border: 1px solid var(--line); color: var(--ink); }

.shop-lines { list-style: none; margin: 0; padding: 0; }
.shop-lines li {
  display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center;
  padding: 11px 0; border-bottom: 1px solid var(--line);
}
.shop-lines__info { min-width: 0; }
.shop-lines__name { margin: 0; font-size: 13.5px; font-weight: 700; line-height: 1.3; }
.shop-lines__unit { margin: 2px 0 0; font-size: 11.5px; color: var(--ink-faint); }
.shop-lines__total { font-size: 13.5px; font-weight: 800; min-width: 68px; text-align: right; }

.shop-sum { margin: 14px 0 0; }
.shop-sum div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.shop-sum dt { color: var(--ink-soft); margin: 0; }
.shop-sum dd { margin: 0; font-weight: 700; }
.shop-sum__total {
  border-top: 1px dashed var(--line); margin-top: 6px; padding-top: 10px !important;
}
.shop-sum__total dt { font-weight: 800; color: var(--ink); font-size: 14px; }
.shop-sum__total dd { font-size: 19px; font-weight: 900; letter-spacing: -0.03em; }

.shop-warn {
  margin: 12px 0 0; border-radius: 4px; padding: 10px 12px; font-size: 12.5px; line-height: 1.45;
  background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn);
}
.shop-warn--err { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad); }

.shop-field { display: block; margin-bottom: 12px; }
.shop-field > span, .shop-field__label {
  display: block; margin-bottom: 5px;
  font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink-faint);
}
.shop-field input, .shop-field textarea {
  width: 100%; border-radius: 4px; border: 1px solid var(--line); background: var(--paper);
  padding: 12px; font: inherit; font-size: 15px; color: var(--ink); outline: 0;
}
.shop-field input:focus, .shop-field textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
.shop-field__err { display: block; margin-top: 4px; font-size: 11.5px; font-style: normal; color: var(--bad); }

.shop-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.shop-choice button {
  display: flex; flex-direction: column; gap: 2px; text-align: left;
  border-radius: 4px; border: 1px solid var(--line); background: var(--paper); padding: 11px 12px;
}
.shop-choice strong { font-size: 13px; font-weight: 800; }
.shop-choice em { font-style: normal; font-size: 11.5px; color: var(--ink-faint); }
.shop-choice .is-on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--paper));
}

.shop-pay { margin-bottom: 12px; }
.shop-pay__opt {
  width: 100%; display: flex; align-items: flex-start; gap: 10px; text-align: left;
  border-radius: 4px; border: 1px solid var(--line); background: var(--paper);
  padding: 11px 12px; margin-bottom: 7px;
}
.shop-pay__opt strong { display: block; font-size: 13px; font-weight: 700; }
.shop-pay__opt em { font-style: normal; font-size: 11.5px; color: var(--ink-faint); }
.shop-pay__radio {
  width: 17px; height: 17px; margin-top: 2px; border-radius: 50%;
  border: 2px solid var(--line); flex: 0 0 auto;
}
.shop-pay__opt.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--paper)); }
.shop-pay__opt.is-on .shop-pay__radio { border-color: var(--accent); background: var(--accent); box-shadow: inset 0 0 0 3px var(--paper); }

.shop-done { text-align: center; padding: 12px 0 4px; }
.shop-done__mark {
  width: 62px; height: 62px; margin: 0 auto 14px; border-radius: 50%;
  display: grid; place-items: center; font-size: 30px; font-weight: 900;
  background: color-mix(in srgb, var(--good) 16%, transparent); color: var(--good);
}
.shop-done h2 { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.03em; }
.shop-done__num {
  margin: 8px auto 0; display: inline-block; border-radius: 3px;
  background: var(--surface-2); padding: 5px 12px;
  font-size: 15px; font-weight: 900; letter-spacing: .04em;
}
.shop-done__lead { margin: 12px auto 0; max-width: 40ch; font-size: 13.5px; line-height: 1.55; color: var(--ink-soft); }
.shop-done__actions { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }
.shop-done__keep { margin: 14px 0 0; font-size: 11.5px; color: var(--ink-faint); }
`}</style>
  );
}
