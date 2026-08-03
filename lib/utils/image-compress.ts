"use client";

/**
 * Compression d'images dans le navigateur, avant l'envoi au Storage.
 *
 * Pourquoi : une photo prise au téléphone pèse 3 à 8 Mo en 4000×3000, alors que
 * l'interface l'affiche au mieux en 170 px (miniature produit : 48 px). Envoyer
 * l'original coûte cher deux fois — au commerçant qui l'envoie, puis à *chaque*
 * client qui charge la vitrine, sur des forfaits mobiles limités.
 *
 * Principe de prudence : cette fonction ne jette jamais et ne bloque jamais un
 * envoi. Au moindre doute (format exotique, navigateur ancien, encodage plus
 * lourd que l'original), elle renvoie le fichier d'origine inchangé. Une image
 * lourde vaut mieux qu'une image perdue.
 */

/** Réglages par usage — la miniature produit n'a pas les mêmes besoins qu'une couverture de vitrine. */
export type ImageCompressionPreset = "product" | "thumbnail" | "logo" | "cover";

type PresetSettings = {
  /** Plafond du plus grand côté, en pixels. */
  maxDimension: number;
  /** Qualité d'encodage avec perte (0–1). */
  quality: number;
  /** En dessous de ce poids ET déjà aux bonnes dimensions, on ne retouche rien. */
  skipUnderBytes: number;
};

const PRESETS: Record<ImageCompressionPreset, PresetSettings> = {
  // Image principale. Maintenue à 1024 px : c'est la résolution de travail de
  // `gpt-image-1` pour les affiches promo (voir app/api/ai/promo-ad/route.ts).
  // Le poids en liste est réglé par la vignette ci-dessous, pas en dégradant
  // celle-ci.
  product: { maxDimension: 1024, quality: 0.8, skipUnderBytes: 150 * 1024 },
  // Vignette servie dans les listes, le POS et les fiches de la vitrine.
  // 320 px est le compromis : large de reste pour la miniature 48 px et l'aperçu
  // 170 px, et suffisant pour une fiche de vitrine sur téléphone (~180 px CSS,
  // soit 360 px physiques). Au-delà on alourdirait les listes de 30 produits
  // pour ne gagner qu'un peu de netteté sur les grands écrans.
  thumbnail: { maxDimension: 320, quality: 0.72, skipUnderBytes: 0 },
  // Logos : petits, souvent avec transparence, parfois du texte fin à préserver.
  logo: { maxDimension: 512, quality: 0.85, skipUnderBytes: 60 * 1024 },
  // Couverture de vitrine / landing : plein écran sur mobile et desktop.
  cover: { maxDimension: 1600, quality: 0.82, skipUnderBytes: 300 * 1024 },
};

/**
 * Formats à ne jamais faire passer par le canvas :
 * - SVG : vectoriel, le rasteriser serait une régression (et un risque de flou) ;
 * - GIF : le canvas n'en garde que la première image — une animation serait
 *   silencieusement détruite.
 */
const PASSTHROUGH_TYPES = new Set(["image/svg+xml", "image/gif"]);

/** Formats susceptibles de porter de la transparence : la perdre noircirait le fond. */
const ALPHA_TYPES = new Set(["image/png", "image/webp", "image/avif"]);

/**
 * Le WebP pèse 25 à 35 % de moins que le JPEG à qualité perçue égale, et il
 * garde la transparence. Tous les navigateurs ne savent pas l'*encoder* pour
 * autant : `toBlob` retombe alors silencieusement sur du PNG, ce qui serait
 * catastrophique pour une photo. On sonde donc le support une fois pour toutes.
 */
let webpEncodeSupport: boolean | null = null;

function canEncodeWebp(): boolean {
  if (webpEncodeSupport !== null) return webpEncodeSupport;
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    webpEncodeSupport = probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpEncodeSupport = false;
  }
  return webpEncodeSupport;
}

/**
 * Décode le fichier en respectant l'orientation EXIF.
 *
 * Sans `imageOrientation: "from-image"`, une photo prise en portrait sur bon
 * nombre d'Android/iPhone ressort couchée : le capteur écrit l'image en paysage
 * et confie le redressement à une balise EXIF, que le canvas ignore par défaut.
 * L'option n'est pas universelle — on retombe sur un décodage simple plutôt que
 * d'échouer, quitte à perdre le redressement sur les navigateurs anciens.
 */
async function decodeBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      // HEIC/HEIF non décodable, fichier corrompu, mémoire insuffisante…
      return null;
    }
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.includes(".")
    ? fileName.slice(0, fileName.lastIndexOf("."))
    : fileName;
  const safeBase = base.trim() || "image";
  return `${safeBase}.${extension}`;
}

export type CompressionOutcome = {
  /** Le fichier à envoyer : compressé, ou l'original si la compression n'a pas abouti. */
  file: File;
  /** false quand on a délibérément gardé l'original. */
  compressed: boolean;
  originalBytes: number;
  bytes: number;
};

/**
 * Version détaillée — utile pour afficher « 4,2 Mo → 78 Ko » dans l'interface.
 * La plupart des appels préféreront `compressImageForUpload`.
 */
export async function compressImageWithReport(
  file: File,
  preset: ImageCompressionPreset = "product",
): Promise<CompressionOutcome> {
  const untouched: CompressionOutcome = {
    file,
    compressed: false,
    originalBytes: file.size,
    bytes: file.size,
  };

  // Rendu serveur, ou navigateur sans les API nécessaires.
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return untouched;
  }
  // Vidéos, PDF, et tout ce qui n'est pas une image : on ne touche à rien.
  // C'est ce garde-fou qui protège la bannière vidéo de la landing.
  if (!file.type.startsWith("image/")) return untouched;
  if (PASSTHROUGH_TYPES.has(file.type)) return untouched;

  const settings = PRESETS[preset];
  const bitmap = await decodeBitmap(file);
  if (!bitmap) return untouched;

  try {
    const longestSide = Math.max(bitmap.width, bitmap.height);
    if (longestSide === 0) return untouched;

    // Déjà légère et à la bonne taille : ré-encoder ne ferait que dégrader.
    if (longestSide <= settings.maxDimension && file.size <= settings.skipUnderBytes) {
      return untouched;
    }

    // On borne le plus grand côté, pas seulement la largeur : une image très
    // haute et étroite resterait énorme si l'on ne regardait que la largeur.
    const scale = Math.min(1, settings.maxDimension / longestSide);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return untouched;
    // Amélioration nette du rendu sur les forts facteurs de réduction
    // (4000 px → 1280 px), pour un coût négligeable.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const mayHaveAlpha = ALPHA_TYPES.has(file.type);
    const webpOk = canEncodeWebp();

    let outputType: string;
    if (webpOk) {
      outputType = "image/webp";
    } else if (mayHaveAlpha) {
      // Pas de WebP et de la transparence en jeu : le JPEG noircirait le fond.
      // On garde le PNG — le redimensionnement seul fait déjà l'essentiel du gain.
      outputType = "image/png";
    } else {
      outputType = "image/jpeg";
    }

    let blob = await encode(canvas, outputType, settings.quality);
    // Ceinture et bretelles : si `toBlob` a ignoré le type demandé (support
    // partiel), on refait une passe dans un format sûr plutôt que d'envoyer un
    // PNG de photo, bien plus lourd que l'original.
    if (blob && blob.type !== outputType && outputType === "image/webp") {
      const fallbackType = mayHaveAlpha ? "image/png" : "image/jpeg";
      blob = await encode(canvas, fallbackType, settings.quality);
      outputType = blob?.type || fallbackType;
    }
    if (!blob) return untouched;

    // Sur une image déjà bien optimisée, le ré-encodage peut grossir. Dans ce
    // cas l'original est objectivement meilleur : plus léger ET sans perte.
    if (blob.size >= file.size) return untouched;

    const extension =
      outputType === "image/webp" ? "webp" : outputType === "image/png" ? "png" : "jpg";
    const compressedFile = new File([blob], replaceExtension(file.name, extension), {
      type: outputType,
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      compressed: true,
      originalBytes: file.size,
      bytes: compressedFile.size,
    };
  } catch {
    return untouched;
  } finally {
    bitmap.close?.();
  }
}

/** Renvoie le fichier prêt à envoyer — compressé si possible, original sinon. */
export async function compressImageForUpload(
  file: File,
  preset: ImageCompressionPreset = "product",
): Promise<File> {
  const { file: out } = await compressImageWithReport(file, preset);
  return out;
}
