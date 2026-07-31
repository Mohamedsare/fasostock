/**
 * Extensions acceptées à l'upload — doit rester alignée avec la policy Storage
 * `supabase/migrations/00166_storage_upload_scoping.sql` (sinon l'upload est
 * refusé côté base).
 */
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "heic",
  "heif",
  "bmp",
  "tif",
  "tiff",
  "svg",
]);

/**
 * Extension assainie pour construire une clé d'objet Storage.
 *
 * `file.name` est contrôlé par l'utilisateur : sans filtrage, un nom comme
 * `photo.a/../autre` injecterait des segments de chemin dans la clé, et une
 * extension arbitraire (`.html`, `.js`) permettrait de déposer autre chose
 * qu'une image dans un bucket public. Repli sur `jpg` si l'extension est
 * inconnue — le contenu, lui, reste envoyé tel quel.
 */
export function safeImageExtension(fileName: string): string {
  const raw = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = raw.trim().toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : "jpg";
}
