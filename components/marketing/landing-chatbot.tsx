"use client";

import { useEffect, useRef, useState } from "react";
import { MdClose, MdSend } from "react-icons/md";
import { FaRobot } from "react-icons/fa6";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTED = [
  "Quelles sont les fonctionnalités ?",
  "Combien ça coûte ?",
  "Avez-vous un essai gratuit ?",
  "Ça marche hors ligne ?",
];

const WELCOME: Msg = {
  role: "assistant",
  content:
    "Bonjour ! Je suis l'Assistant FasoStock 👋\nJe peux vous aider à découvrir nos fonctionnalités, nos tarifs ou à démarrer votre essai gratuit. Que souhaitez-vous savoir ?",
};

export function LandingChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggested, setShowSuggested] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setShowSuggested(false);
    const userMsg: Msg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const history = next.slice(1, -1); // exclude welcome + last user msg (sent as message)
      const res = await fetch("/api/ai/landing-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      const answer = data.answer ?? data.error ?? "Je n'ai pas pu répondre. Réessayez.";
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Une erreur s'est produite. Veuillez réessayer." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom)+3rem+0.75rem)] right-3 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 sm:bottom-24 sm:right-6"
        style={{ background: "var(--fs-accent, #e85d2c)" }}
      >
        {open ? (
          <MdClose className="h-6 w-6 text-white" />
        ) : (
          <FaRobot className="h-6 w-6 text-white" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom)+3rem+0.75rem+3.5rem+0.75rem)] right-3 z-50 flex w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-md shadow-2xl sm:bottom-[calc(6rem+3.5rem+0.75rem)] sm:right-6"
          style={{
            background: "var(--fs-surface, #f8f7f5)",
            border: "1px solid color-mix(in srgb, var(--fs-accent, #e85d2c) 20%, transparent)",
            height: "min(520px, calc(100dvh - 10rem))",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ background: "var(--fs-accent, #e85d2c)" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <FaRobot className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Assistant FasoStock</p>
              <p className="text-xs text-white/75">Disponible maintenant</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto text-white/80 transition-colors hover:text-white"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-md px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                    m.role === "user"
                      ? "text-white"
                      : "text-[var(--fs-text,#1c1b1f)] dark:text-[var(--fs-text-dark,#e6e1e5)]"
                  }`}
                  style={
                    m.role === "user"
                      ? { background: "var(--fs-accent, #e85d2c)" }
                      : {
                          background: "color-mix(in srgb, var(--fs-accent, #e85d2c) 8%, white)",
                          border:
                            "1px solid color-mix(in srgb, var(--fs-accent, #e85d2c) 15%, transparent)",
                        }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-1 rounded-md px-4 py-3"
                  style={{
                    background: "color-mix(in srgb, var(--fs-accent, #e85d2c) 8%, white)",
                    border:
                      "1px solid color-mix(in srgb, var(--fs-accent, #e85d2c) 15%, transparent)",
                  }}
                >
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--fs-accent,#e85d2c)] [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--fs-accent,#e85d2c)] [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--fs-accent,#e85d2c)] [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {/* Suggested questions */}
            {showSuggested && !loading && (
              <div className="mt-1 flex flex-wrap gap-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--fs-accent,#e85d2c)] hover:text-white hover:border-transparent"
                    style={{
                      borderColor: "color-mix(in srgb, var(--fs-accent, #e85d2c) 35%, transparent)",
                      color: "var(--fs-accent, #e85d2c)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t px-3 py-2.5"
            style={{ borderColor: "color-mix(in srgb, var(--fs-accent, #e85d2c) 15%, transparent)" }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez votre question…"
              disabled={loading}
              className="min-w-0 flex-1 rounded-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-gray-400 disabled:opacity-60"
              style={{ color: "var(--fs-text, #1c1b1f)" }}
              maxLength={500}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Envoyer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-40"
              style={{ background: "var(--fs-accent, #e85d2c)" }}
            >
              <MdSend className="h-4 w-4 text-white" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
