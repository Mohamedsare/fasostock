"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { MdArrowForward, MdMailOutline } from "react-icons/md";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export function NewsletterSubscribeForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [startedAt] = useState(() => Date.now());
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileWidgetRendered, setTurnstileWidgetRendered] = useState(false);
  const [turnstileLoadError, setTurnstileLoadError] = useState("");
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileReady || !widgetRef.current || !window.turnstile) return;
    if (widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: turnstileSiteKey,
      theme: "dark",
      callback: (token: string) => {
        setTurnstileToken(token);
        setTurnstileLoadError("");
      },
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => {
        setTurnstileToken("");
        setTurnstileLoadError("Le widget anti-bot a rencontré une erreur.");
      },
    });
    setTurnstileWidgetRendered(true);
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
      setTurnstileWidgetRendered(false);
    };
  }, [turnstileReady, turnstileSiteKey]);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    if (turnstileReady) return;
    const timer = window.setTimeout(() => {
      setTurnstileLoadError(
        "Le widget anti-bot ne se charge pas. Désactivez le bloqueur de contenu ou rechargez la page.",
      );
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [turnstileReady, turnstileSiteKey]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    const value = email.trim();
    if (!value) {
      setError("Entrez une adresse e-mail.");
      return;
    }
    if (turnstileSiteKey && !turnstileWidgetRendered) {
      setError(
        "Le widget anti-bot n'est pas disponible. Rechargez la page ou vérifiez votre connexion.",
      );
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setError("Veuillez valider l'anti-bot visible ci-dessous.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: value,
          website: "",
          elapsedMs: Math.max(0, Date.now() - startedAt),
          turnstileToken,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadySubscribed?: boolean };
      if (!res.ok) {
        setError(data.error || "Inscription impossible pour le moment.");
        return;
      }
      setEmail("");
      setTurnstileToken("");
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
      setMessage(data.alreadySubscribed ? "Déjà inscrit à la newsletter." : "Inscription réussie. Merci.");
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => {
            setTurnstileReady(true);
            setTurnstileLoadError("");
          }}
          onError={() => {
            setTurnstileLoadError(
              "Impossible de charger l'anti-bot. Vérifiez votre réseau ou bloqueur de scripts.",
            );
          }}
        />
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden
          onChange={() => {
            /* honeypot: intentionally ignored */
          }}
        />
        <div className="flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-[#0e223f] px-4 text-white/55">
          <MdMailOutline className="h-4 w-4" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            className="h-full w-full bg-transparent text-sm text-white placeholder:text-white/45 outline-none"
            placeholder="Votre adresse e-mail"
            autoComplete="email"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-fs-accent px-6 text-sm font-black text-white disabled:opacity-60"
        >
          {loading ? "Envoi..." : "S'abonner"}
          <MdArrowForward className="h-4 w-4" />
        </button>
      </form>
      {turnstileSiteKey ? (
        <div className="pt-1">
          <div
            ref={widgetRef}
            className="min-h-[66px] rounded-lg border border-white/10 bg-[#0e223f]/55 p-1"
          />
          {turnstileLoadError ? (
            <p className="mt-1 text-[11px] text-amber-300">{turnstileLoadError}</p>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-white/60">
        {error ? <span className="text-red-300">{error}</span> : message || "Pas de spam. Désabonnement à tout moment."}
      </p>
    </div>
  );
}

