/**
 * Détecte PNG / JPEG / GIF pour balise <img> (aligné sur `pw.MemoryImage` Flutter).
 */
export function bytesToImageDataUrl(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return `data:image/jpeg;base64,${b64}`;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return `data:image/png;base64,${b64}`;
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return `data:image/gif;base64,${b64}`;
  }
  return `data:image/png;base64,${b64}`;
}
