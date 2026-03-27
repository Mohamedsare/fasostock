import fs from "fs";
import path from "path";

import type { Browser } from "puppeteer-core";

let browserPromise: Promise<Browser> | null = null;

/** Vercel / AWS Lambda : pas de Chrome installé — @sparticuz/chromium fournit un binaire compatible serverless. */
function isServerlessPdfEnv(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
    process.env.AWS_EXECUTION_ENV !== undefined
  );
}

function resolveLocalChromeExecutablePath(): string | undefined {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (env && fs.existsSync(env)) return env;

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const pf = process.env.PROGRAMFILES ?? "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA ?? "";
    candidates.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
    );
  }
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");

  if (isServerlessPdfEnv()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    // `chromium.args` inclut déjà `--headless=…` (chrome-headless-shell) : ne pas
    // redemander un mode headless à Puppeteer pour éviter un double mode.
    return puppeteer.default.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: false,
    });
  }

  const executablePath = resolveLocalChromeExecutablePath();
  if (!executablePath) {
    throw new Error(
      "Chrome ou Edge introuvable. Installez Google Chrome, ou définissez PUPPETEER_EXECUTABLE_PATH vers chrome.exe / chromium.",
    );
  }

  return puppeteer.default.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
    ],
  });
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((e) => {
      browserPromise = null;
      throw e;
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

/**
 * Ticket thermique : **papier 80 mm**, zone utile **~72 mm** (marges ~4 mm par côté).
 * Le PDF a une largeur de page 80 mm ; les marges réduisent la boîte de contenu à 72 mm.
 */
const THERMAL_PAPER_WIDTH_MM = 80;
/** (80 − 72) / 2 — bande non imprimable typique sur rouleau 80 mm. */
const THERMAL_SIDE_MARGIN_MM = (THERMAL_PAPER_WIDTH_MM - 72) / 2;

export async function htmlToPdfBufferThermal(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const contentWidthPx = Math.round((72 / 25.4) * 96);
    await page.setViewport({
      width: contentWidthPx,
      height: 1200,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    const heightPx = await page.evaluate(() => {
      const el = document.body;
      if (!el) return 400;
      return Math.ceil(el.scrollHeight + 24);
    });
    const m = `${THERMAL_SIDE_MARGIN_MM}mm`;
    const pdf = await page.pdf({
      width: `${THERMAL_PAPER_WIDTH_MM}mm`,
      height: `${Math.max(heightPx, 200)}px`,
      printBackground: true,
      margin: { top: m, right: m, bottom: m, left: m },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
