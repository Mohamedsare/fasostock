import fs from "fs";
import path from "path";

import type { Browser, Page } from "puppeteer-core";

let browserPromise: Promise<Browser> | null = null;
/** Incrémenté à chaque lancement, et retenu par instance (voir `generationOf`). */
let browserGeneration = 0;
/**
 * Génération de chaque navigateur lancé. Permet de ne purger le cache que si l'instance
 * fautive est bien celle qui y est encore : sans ce contrôle, un appel qui découvre un
 * Chromium mort pourrait jeter celui qu'un appel concurrent vient de relancer.
 */
const generationOf = new WeakMap<Browser, number>();

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

/**
 * Oublie l'instance courante. Le processus Chromium peut mourir sans prévenir
 * (OOM du conteneur, gel/dégel d'une lambda, crash du renderer) : sans cet oubli,
 * la promesse mémorisée continuerait de servir un navigateur injoignable et **toute**
 * édition de PDF — factures, reçus, tickets, bulletins — resterait cassée jusqu'au
 * prochain déploiement.
 */
function forgetBrowser(current: Browser): void {
  // Ne rien purger si un autre appel a déjà relancé entre-temps.
  if (generationOf.get(current) !== browserGeneration) return;
  browserPromise = null;
  // Au cas où seul l'onglet serait perdu : libérer le processus, sans jamais lever.
  void Promise.resolve(current.close()).catch(() => undefined);
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

function launchAndTrack(): Promise<Browser> {
  const generation = ++browserGeneration;
  const created = launchBrowser().then((browser) => {
    generationOf.set(browser, generation);
    browser.once("disconnected", () => forgetBrowser(browser));
    return browser;
  });
  // Un lancement raté ne doit pas se figer en cache : la requête suivante doit réessayer.
  browserPromise = created.catch((e: unknown) => {
    if (generation === browserGeneration) browserPromise = null;
    throw e;
  });
  return browserPromise;
}

async function getBrowser(): Promise<Browser> {
  const pending = browserPromise;
  if (pending) {
    // `connected` sépare l'instance réutilisable du processus déjà mort.
    const settled = await pending.then(
      (b) => b,
      () => null,
    );
    if (settled?.connected) return settled;
    // Un lancement échoué a déjà vidé le cache lui-même ; ici seule l'instance morte reste.
    if (settled) forgetBrowser(settled);
  }
  // Un appel concurrent a pu relancer pendant l'attente ci-dessus : ne pas doubler.
  return browserPromise ?? launchAndTrack();
}

/**
 * Ouvre un onglet, rend le document, et referme quoi qu'il arrive.
 *
 * Si Chromium s'est éteint entre deux requêtes, la panne se voit à l'ouverture de
 * l'onglet (« Target closed », « Connection closed ») : on relance une fois plutôt
 * que de renvoyer une erreur à un commerçant qui veut juste imprimer sa facture.
 */
async function withPdfPage<T>(render: (page: Page) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const browser = await getBrowser();
    let page: Page;
    try {
      page = await browser.newPage();
    } catch (e) {
      forgetBrowser(browser);
      if (attempt === 0) continue;
      throw e;
    }

    try {
      return await render(page);
    } catch (e) {
      // Le rendu a échoué parce que le navigateur est parti en cours de route.
      if (!browser.connected) {
        forgetBrowser(browser);
        if (attempt === 0) continue;
      }
      throw e;
    } finally {
      // Un `close()` qui lève masquerait l'erreur réelle du rendu.
      await page.close().catch(() => undefined);
    }
  }
}

/**
 * Lance Chromium sans rien rendre, pour qu'il soit déjà debout au premier document.
 *
 * Le démarrage à froid (décompression du binaire dans `/tmp`, puis lancement du
 * processus) se compte en secondes, et il retombe toujours sur la même personne : le
 * premier client après une accalmie — ouverture du matin, retour de pause. La caisse
 * appelle donc `/api/pdf/warmup` pendant qu'elle est ouverte, où cette attente ne
 * dérange personne. Ne lève jamais : un préchauffage raté n'est pas une panne, le
 * document suivant relancera de lui-même.
 */
export async function warmUpPdfBrowser(): Promise<boolean> {
  try {
    await withPdfPage(async () => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Viewport ~ A4 @96dpi pour que `vh` / flex pousse le pied de page comme MultiPage Flutter. */
const A4_VIEWPORT = { width: 794, height: 1123 };

export async function htmlToPdfBufferA4(html: string): Promise<Buffer> {
  return withPdfPage(async (page) => {
    await page.setViewport(A4_VIEWPORT);
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  });
}

/**
 * Variante plus tolérante pour documents avec images distantes (logos/miniatures).
 * Évite les timeouts "load" quand certaines images répondent lentement.
 */
export async function htmlToPdfBufferA4Resilient(html: string): Promise<Buffer> {
  return withPdfPage(async (page) => {
    await page.setViewport(A4_VIEWPORT);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 4_000 }).catch(() => undefined);
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  });
}

export async function htmlToPdfBufferA4ResilientWithPageNumbers(
  html: string,
): Promise<Buffer> {
  return withPdfPage(async (page) => {
    await page.setViewport(A4_VIEWPORT);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 4_000 }).catch(() => undefined);
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;padding:0 12mm;font-size:9px;color:#6b7280;font-family:Segoe UI,Arial,sans-serif;text-align:right;"><span class="pageNumber"></span>/<span class="totalPages"></span></div>',
      margin: { top: "12mm", right: "12mm", bottom: "16mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  });
}

function thermalPaperConfig(paperWidthMm: 58 | 80): {
  pageWidthMm: number;
  contentWidthMm: number;
  sideMarginMm: number;
} {
  if (paperWidthMm === 58) {
    const contentWidthMm = 48;
    return {
      pageWidthMm: 58,
      contentWidthMm,
      sideMarginMm: (58 - contentWidthMm) / 2,
    };
  }
  const contentWidthMm = 72;
  return {
    pageWidthMm: 80,
    contentWidthMm,
    sideMarginMm: (80 - contentWidthMm) / 2,
  };
}

export async function htmlToPdfBufferThermal(
  html: string,
  paperWidthMm: 58 | 80 = 80,
): Promise<Buffer> {
  return withPdfPage(async (page) => {
    const cfg = thermalPaperConfig(paperWidthMm);
    const contentWidthPx = Math.round((cfg.contentWidthMm / 25.4) * 96);
    await page.setViewport({
      width: contentWidthPx,
      height: 1200,
      deviceScaleFactor: 1,
    });
    /*
     * `load` — et non `domcontentloaded` — reste indispensable : la hauteur du rouleau
     * est mesurée juste en dessous, et mesurer avant que le logo soit posé donnerait un
     * ticket coupé. Ce qui change, c'est ce que `load` attend : la route embarque
     * désormais le logo en data URL et la police est en base64, donc plus une seule
     * ressource distante. L'attente est locale, et le plafond peut redescendre au niveau
     * des autres documents — 45 s n'était utile qu'à un téléchargement qui n'a plus lieu.
     */
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    const heightPx = await page.evaluate(() => {
      const el = document.body;
      if (!el) return 400;
      return Math.ceil(el.scrollHeight + 24);
    });
    const m = `${cfg.sideMarginMm}mm`;
    const pdf = await page.pdf({
      width: `${cfg.pageWidthMm}mm`,
      height: `${Math.max(heightPx, 200)}px`,
      printBackground: true,
      margin: { top: m, right: m, bottom: m, left: m },
    });
    return Buffer.from(pdf);
  });
}
