import { NotFoundExperience } from "@/components/errors/not-found-experience";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page introuvable",
  description: "Cette page n'existe pas ou a été déplacée sur FasoStock.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundExperience />;
}
