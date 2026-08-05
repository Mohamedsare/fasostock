#!/usr/bin/env node
/**
 * Reprise des vignettes produits sur les images déjà en base.
 *
 * Les photos envoyées avant l'introduction des vignettes n'ont pas de fichier
 * `-t` et leur image principale ne porte pas le marqueur `-f` : elles sont donc
 * servies en pleine taille dans les listes. Ce script les rattrape.
 *
 * ── Sécurité : ordre des opérations ──────────────────────────────────────────
 * `product_images.url` pointe vers le fichier courant. Toute la prudence tient
 * dans l'ordre, choisi pour qu'à AUCUN instant la base ne référence un fichier
 * absent, même si le script est tué au milieu :
 *
 *   1. générer et envoyer la vignette      `<base>-t.<ext>`   (fichier neuf)
 *   2. vérifier qu'elle est réellement lisible
 *   3. COPIER l'image principale vers      `<base>-f.<ext>`   (l'original reste)
 *   4. vérifier que la copie est lisible
 *   5. seulement alors, mettre à jour l'URL en base
 *
 * Rien n'est jamais supprimé. L'original `<base>.<ext>` demeure : en cas de
 * problème, il suffit de remettre l'ancienne URL. Le surcoût de stockage est
 * négligeable (quelques dizaines de Mo) au regard des 100 Go du plan Pro.
 *
 * Le script est IDEMPOTENT et REPRENABLE : une ligne déjà traitée est reconnue
 * à son marqueur `-f` et ignorée. Interrompez-le, relancez-le, sans risque.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node scripts/backfill-product-thumbnails.mjs                  # simulation
 *   node scripts/backfill-product-thumbnails.mjs --limit 20       # simulation, 20 lignes
 *   node scripts/backfill-product-thumbnails.mjs --apply --limit 20   # ÉCRIT, 20 lignes
 *   node scripts/backfill-product-thumbnails.mjs --apply           # ÉCRIT, tout
 *
 * Sans `--apply`, RIEN n'est écrit : le script se contente de dire ce qu'il
 * ferait. Commencez toujours par une simulation, puis par un petit `--limit`.
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BUCKET = "product-images";
const OBJECT_SEGMENT = `/storage/v1/object/public/${BUCKET}/`;
const THUMB_MAX = 320;
const THUMB_QUALITY = 72;
const PAGE_SIZE = 500;

/** Formats que sharp traite ici. Le reste est ignoré, jamais forcé. */
const ENCODERS = {
  jpg: (img) => img.jpeg({ quality: THUMB_QUALITY, mozjpeg: true }),
  jpeg: (img) => img.jpeg({ quality: THUMB_QUALITY, mozjpeg: true }),
  png: (img) => img.png({ palette: true, quality: THUMB_QUALITY }),
  webp: (img) => img.webp({ quality: THUMB_QUALITY }),
  avif: (img) => img.avif({ quality: 60 }),
};

// ── Arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const limitArg = argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number.parseInt(argv[limitArg + 1] ?? "", 10) : Infinity;
if (limitArg >= 0 && !Number.isFinite(LIMIT)) {
  console.error("--limit attend un nombre.");
  process.exit(1);
}

// ── Configuration ───────────────────────────────────────────────────────────
function readEnvLocal() {
  let raw;
  try {
    raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  } catch {
    console.error("Fichier .env.local introuvable à la racine du projet.");
    process.exit(1);
  }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis dans .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Utilitaires ─────────────────────────────────────────────────────────────

/** Clé Storage à partir de l'URL publique, ou null si l'URL n'est pas gérée. */
function storageKeyFromUrl(url) {
  const i = url.indexOf(OBJECT_SEGMENT);
  if (i < 0) return null;
  const raw = url.slice(i + OBJECT_SEGMENT.length).split("?")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function splitKey(key) {
  const dot = key.lastIndexOf(".");
  if (dot <= 0) return null;
  return { base: key.slice(0, dot), ext: key.slice(dot + 1).toLowerCase() };
}

function publicUrlFor(key) {
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

/** Vérifie qu'un objet est réellement lisible — pas seulement « pas d'erreur à l'envoi ». */
async function objectIsReadable(key) {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error || !data) return false;
  return data.size > 0;
}

const kb = (n) => (n / 1024).toFixed(1) + " Ko";

// ── Traitement d'une ligne ──────────────────────────────────────────────────

const SKIP = (raison) => ({ statut: "ignore", raison });

async function processRow(row) {
  const url = String(row.url ?? "");
  if (!url) return SKIP("url vide");

  const key = storageKeyFromUrl(url);
  if (!key) return SKIP("url hors bucket product-images (externe ?)");

  const parts = splitKey(key);
  if (!parts) return SKIP("nom de fichier sans extension");
  const { base, ext } = parts;

  if (base.endsWith("-f")) return SKIP("déjà traitée");
  if (base.endsWith("-t")) return SKIP("c'est une vignette");
  if (!ENCODERS[ext]) return SKIP(`format non géré (.${ext})`);

  const thumbKey = `${base}-t.${ext}`;
  const fullKey = `${base}-f.${ext}`;

  // 1. Télécharger l'original.
  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(key);
  if (dlErr || !blob) return { statut: "erreur", raison: `téléchargement : ${dlErr?.message ?? "vide"}` };
  const input = Buffer.from(await blob.arrayBuffer());

  // 2. Générer la vignette, dans le MÊME format que l'original : la dérivation
  //    d'URL ne change que le suffixe, l'extension doit rester cohérente avec
  //    le contenu réel du fichier.
  let thumb;
  try {
    const pipeline = sharp(input, { limitInputPixels: 268402689 })
      .rotate() // respecte l'orientation EXIF
      .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true });
    thumb = await ENCODERS[ext](pipeline).toBuffer();
  } catch (e) {
    return { statut: "erreur", raison: `décodage/encodage : ${e.message}` };
  }

  if (!APPLY) {
    return { statut: "simule", avant: input.length, apres: thumb.length, thumbKey, fullKey };
  }

  // 3. Envoyer la vignette. Si elle existe déjà (reprise après interruption),
  //    ce n'est pas une erreur.
  const up = await supabase.storage.from(BUCKET).upload(thumbKey, thumb, {
    contentType: blob.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: false,
  });
  const thumbExisted = up.error && /exists/i.test(up.error.message ?? "");
  if (up.error && !thumbExisted) {
    return { statut: "erreur", raison: `envoi vignette : ${up.error.message}` };
  }

  // 4. Ne rien changer d'autre tant que la vignette n'est pas lisible.
  if (!(await objectIsReadable(thumbKey))) {
    return { statut: "erreur", raison: "vignette envoyée mais illisible — base inchangée" };
  }

  // 5. Copier l'image principale sous son nom marqué. L'original reste en place.
  const cp = await supabase.storage.from(BUCKET).copy(key, fullKey);
  const fullExisted = cp.error && /exists/i.test(cp.error.message ?? "");
  if (cp.error && !fullExisted) {
    return { statut: "erreur", raison: `copie image principale : ${cp.error.message}` };
  }

  // 6. Vérifier la copie avant de toucher à la base.
  if (!(await objectIsReadable(fullKey))) {
    return { statut: "erreur", raison: "copie illisible — base inchangée" };
  }

  // 7. Dernière étape seulement : basculer l'URL.
  const { error: updErr } = await supabase
    .from("product_images")
    .update({ url: publicUrlFor(fullKey) })
    .eq("id", row.id);
  if (updErr) {
    return { statut: "erreur", raison: `mise à jour base : ${updErr.message} (fichiers créés, URL inchangée)` };
  }

  return { statut: "traite", avant: input.length, apres: thumb.length, thumbKey, fullKey };
}

// ── Boucle principale ───────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log(APPLY ? "MODE ÉCRITURE — les fichiers et la base seront modifiés." : "SIMULATION — rien ne sera écrit.");
  if (Number.isFinite(LIMIT)) console.log(`Limite : ${LIMIT} ligne(s).`);
  console.log("");

  const stats = { total: 0, traite: 0, simule: 0, ignore: 0, erreur: 0, octetsAvant: 0, octetsApres: 0 };
  const raisonsIgnore = new Map();
  const erreurs = [];

  let from = 0;
  let done = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("product_images")
      .select("id, url")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Lecture product_images :", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (done >= LIMIT) break;
      stats.total++;
      let res;
      try {
        res = await processRow(row);
      } catch (e) {
        res = { statut: "erreur", raison: `inattendu : ${e.message}` };
      }

      if (res.statut === "ignore") {
        stats.ignore++;
        raisonsIgnore.set(res.raison, (raisonsIgnore.get(res.raison) ?? 0) + 1);
      } else if (res.statut === "erreur") {
        stats.erreur++;
        erreurs.push({ id: row.id, raison: res.raison });
        console.log(`  [ERREUR] ${row.id} — ${res.raison}`);
      } else {
        stats[res.statut]++;
        stats.octetsAvant += res.avant;
        stats.octetsApres += res.apres;
        done++;
        console.log(
          `  [${res.statut === "traite" ? "FAIT" : "SIMU"}] ${kb(res.avant)} -> ${kb(res.apres)}  ${res.thumbKey}`,
        );
      }
    }

    if (done >= LIMIT) break;
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log("");
  console.log("── Résumé ──────────────────────────────────────────");
  console.log(`  Lignes examinées : ${stats.total}`);
  console.log(`  ${APPLY ? "Traitées" : "À traiter"}       : ${APPLY ? stats.traite : stats.simule}`);
  console.log(`  Ignorées         : ${stats.ignore}`);
  for (const [raison, n] of [...raisonsIgnore].sort((a, b) => b[1] - a[1])) {
    console.log(`      · ${raison} : ${n}`);
  }
  console.log(`  Erreurs          : ${stats.erreur}`);
  const n = APPLY ? stats.traite : stats.simule;
  if (n > 0) {
    console.log(`  Poids en liste   : ${kb(stats.octetsAvant)} -> ${kb(stats.octetsApres)}`);
    console.log(`  Gain             : ${(100 - (stats.octetsApres / stats.octetsAvant) * 100).toFixed(1)} %`);
  }
  if (erreurs.length > 0) {
    console.log("");
    console.log("  Les lignes en erreur n'ont PAS été modifiées en base. Relancez le");
    console.log("  script : il reprendra uniquement celles qui restent.");
  }
  if (!APPLY && n > 0) {
    console.log("");
    console.log("  Simulation terminée. Pour écrire :");
    console.log("    node scripts/backfill-product-thumbnails.mjs --apply --limit 20");
  }
  console.log("");
}

main().catch((e) => {
  console.error("Échec :", e);
  process.exit(1);
});
