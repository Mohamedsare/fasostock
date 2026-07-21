import { FaWhatsapp } from "react-icons/fa6";

import { cn } from "@/lib/utils/cn";

/** Numéro de contact WhatsApp FasoStock (Burkina Faso). */
const WHATSAPP_NUMBER = "22664712044";
const DEFAULT_MESSAGE = "Bonjour ! Je suis intéressé par FasoStock. Pouvez-vous m'aider ?";

/**
 * Bouton WhatsApp flottant (FAB) avec effet de pulsation.
 * - `message` : texte pré-rempli de la conversation.
 * - `side` : coin d'ancrage. « left » sur la landing (le coin droit est déjà
 *   occupé par le chatbot + le FAB de scroll), « right » ailleurs.
 */
export function WhatsappFloat({
  message = DEFAULT_MESSAGE,
  side = "right",
}: {
  message?: string;
  side?: "left" | "right";
}) {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contacter FasoStock sur WhatsApp"
      title="Discuter sur WhatsApp"
      className={cn(
        "fixed bottom-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_14px_34px_-8px_rgba(37,211,102,0.7)] transition hover:scale-105 active:scale-95 sm:bottom-6 sm:h-16 sm:w-16",
        side === "left" ? "left-5 sm:left-6" : "right-5 sm:right-6",
      )}
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366]/40" aria-hidden />
      <span className="absolute inline-flex h-full w-full rounded-full bg-[#25D366]/20 blur-md" aria-hidden />
      <FaWhatsapp className="relative h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
    </a>
  );
}
