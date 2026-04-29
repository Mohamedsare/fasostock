"use client";

import { useState } from "react";
import { MdArrowForward, MdMailOutline } from "react-icons/md";

export function NewsletterSubscribeForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    const value = email.trim();
    if (!value) {
      setError("Entrez une adresse e-mail.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadySubscribed?: boolean };
      if (!res.ok) {
        setError(data.error || "Inscription impossible pour le moment.");
        return;
      }
      setEmail("");
      setMessage(data.alreadySubscribed ? "Déjà inscrit à la newsletter." : "Inscription réussie. Merci.");
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-[1fr_auto]">
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
      <p className="text-xs text-white/60">
        {error ? <span className="text-red-300">{error}</span> : message || "Pas de spam. Désabonnement à tout moment."}
      </p>
    </div>
  );
}

