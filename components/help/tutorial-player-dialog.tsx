"use client";

import { MdClose } from "react-icons/md";
import { FsCard } from "@/components/ui/fs-screen-primitives";
import { youTubeEmbedUrl } from "@/lib/features/tutorials/youtube";
import type { Tutorial } from "@/lib/features/tutorials/types";

/** Lecture d'un tutoriel YouTube intégrée à la page (sans quitter l'app). */
export function TutorialPlayerDialog({
  tutorial,
  videoId,
  onClose,
}: {
  tutorial: Tutorial | null;
  videoId: string | null;
  onClose: () => void;
}) {
  if (!tutorial || !videoId) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={tutorial.title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden shadow-xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
        padding="p-0"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/6 px-4 py-3">
          <h2 className="min-w-0 pr-2 text-base font-bold leading-snug text-fs-text">
            {tutorial.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="bg-black">
          <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              src={youTubeEmbedUrl(videoId)}
              title={tutorial.title}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>

        {tutorial.description ? (
          <div className="max-h-40 overflow-y-auto px-4 py-3">
            <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">
              {tutorial.description}
            </p>
          </div>
        ) : null}
      </FsCard>
    </div>
  );
}
