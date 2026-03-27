"use client";

import { useEffect, useId, useRef } from "react";
import { MdClose } from "react-icons/md";
import { cn } from "@/lib/utils/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  onDecoded: (text: string) => void;
  onError?: (message: string) => void;
};

/**
 * Scan code-barres / QR via la caméra (html5-qrcode).
 * HTTPS requis ; l’utilisateur doit autoriser la caméra.
 */
export function PosBarcodeScannerDialog({
  open,
  onClose,
  onDecoded,
  onError,
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const regionId = `pos-scan-${reactId}`;
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function finish(
      html5: import("html5-qrcode").Html5Qrcode,
      decodedText: string,
    ) {
      try {
        await html5.stop();
      } catch {
        /* */
      }
      try {
        html5.clear();
      } catch {
        /* */
      }
      scannerRef.current = null;
      const t = decodedText.replace(/\r|\n/g, "").trim();
      if (t) onDecodedRef.current(t);
      onClose();
    }

    const run = async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      await new Promise<void>((r) => {
        requestAnimationFrame(() => r());
      });
      if (cancelled) return;
      if (!document.getElementById(regionId)) return;

      const html5 = new Html5Qrcode(regionId, { verbose: false });
      scannerRef.current = html5;

      const config = { fps: 10, qrbox: { width: 280, height: 200 } } as const;
      const onFrameFail = () => {};

      try {
        const cams = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (cams?.length) {
          const back = cams.find((c) =>
            /back|rear|environment|arrière|wide/i.test(c.label),
          );
          const cameraId = (back ?? cams[cams.length - 1]).id;
          try {
            await html5.start(
              cameraId,
              config,
              (decodedText) => {
                void finish(html5, decodedText);
              },
              onFrameFail,
            );
            return;
          } catch {
            /* caméra choisie indisponible → facingMode */
          }
        }
      } catch {
        /* énumération des caméras impossible → facingMode */
      }

      if (cancelled) return;

      try {
        await html5.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            void finish(html5, decodedText);
          },
          onFrameFail,
        );
      } catch (e) {
        const msg =
          e instanceof Error &&
          (/Permission|NotAllowed|NotFound/i.test(e.message) ||
            e.name === "NotAllowedError")
            ? "Autorisez l’accès à la caméra pour scanner."
            : e instanceof Error
              ? e.message
              : "Impossible d’ouvrir la caméra.";
        onErrorRef.current?.(msg);
        try {
          html5.clear();
        } catch {
          /* */
        }
        scannerRef.current = null;
      }
    };

    void run();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s?.isScanning) {
        void s.stop().catch(() => {});
      }
    };
  }, [open, regionId, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-end bg-black/50 p-4 sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Scannez un code-barres"
    >
      <div
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-2xl bg-[#1F2937] shadow-xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-base font-semibold text-white">Scannez un code-barres</p>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-full p-2 text-white hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-6 w-6" aria-hidden />
          </button>
        </div>
        <div className="p-3">
          <div
            id={regionId}
            className="mx-auto min-h-[220px] w-full max-w-[360px] overflow-hidden rounded-xl bg-black"
          />
          <p className="mt-3 text-center text-xs text-white/70">
            Cadrez le code-barres ou le QR code. La lecture se fait automatiquement.
          </p>
        </div>
      </div>
    </div>
  );
}
