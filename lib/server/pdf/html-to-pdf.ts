import type { Browser } from "puppeteer";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const puppeteer = await import("puppeteer");
    browserPromise = puppeteer.default.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined,
    });
  }
  return browserPromise;
}

/** Viewport ~ A4 @96dpi pour que `vh` / flex pousse le pied de page comme MultiPage Flutter. */
const A4_VIEWPORT = { width: 794, height: 1123 };

export async function htmlToPdfBufferA4(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport(A4_VIEWPORT);
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Ticket ~80 mm : hauteur = scroll du body (une seule ouverture de page). */
export async function htmlToPdfBufferThermal(
  html: string,
  widthMm = "80mm",
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    const heightPx = await page.evaluate(() => {
      const el = document.body;
      if (!el) return 400;
      return Math.ceil(el.scrollHeight + 24);
    });
    const pdf = await page.pdf({
      width: widthMm,
      height: `${Math.max(heightPx, 200)}px`,
      printBackground: true,
      margin: { top: "4mm", right: "2mm", bottom: "4mm", left: "2mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
