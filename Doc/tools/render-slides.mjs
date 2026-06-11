/**
 * Renderiza Doc/Fauchard_Presentacion_Comercial.html con Chrome headless y
 * captura cada bloque lógico como PNG de alta resolución (deviceScaleFactor 2).
 * Las secciones se capturan enteras; la sección Parámetros se pagina por
 * tarjeta para que cada slide entre bien.
 *
 * Salida: Doc/tools/slides/NNN_nombre.png + slides/manifest.json
 */
import puppeteer from "puppeteer-core";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { mkdir, rm, writeFile } from "fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..");
const HTML = join(REPO, "Doc", "Fauchard_Presentacion_Comercial.html");
const OUT = join(__dirname, "slides");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const VIEWPORT_W = 1280;
const PAD = 16; // margen vertical alrededor de cada bloque

const run = async () => {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--hide-scrollbars", "--force-color-profile=srgb"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: VIEWPORT_W, height: 1400, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(HTML).href, { waitUntil: "networkidle0", timeout: 60000 });

  // Esperar a que Mermaid termine de renderizar el diagrama.
  await page.waitForSelector(".mermaid svg", { timeout: 30000 });
  // Esperar a que carguen las webfonts.
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  await new Promise((r) => setTimeout(r, 800));

  const blocks = await page.evaluate(() => {
    const abs = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    };
    const out = [];

    // Portada: nav + hero
    const hero = document.querySelector("header.hero");
    out.push({ name: "portada", top: 0, bottom: abs(hero).bottom });

    // Secciones completas
    for (const sel of ["#flujo", "#complejidad", "#motor", "#pantalla", "#valor"]) {
      const el = document.querySelector(sel);
      if (el) out.push({ name: sel.slice(1), ...abs(el) });
    }

    // Parámetros: intro + (divisor de grupo + cada tarjeta) + notas
    const params = document.querySelector("#parametros");
    const firstPath = params.querySelector(".param-path");
    out.push({ name: "parametros-intro", top: abs(params).top, bottom: abs(firstPath).top });

    const kids = Array.from(params.children);
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      const cls = el.classList;
      if (cls.contains("param-path")) {
        const gh = kids[i + 1] && kids[i + 1].classList.contains("group-h") ? kids[i + 1] : null;
        const a = abs(el);
        const b = gh ? abs(gh) : a;
        out.push({ name: "grupo", top: a.top, bottom: b.bottom });
      } else if (cls.contains("pstack")) {
        for (const card of Array.from(el.children)) {
          if (card.classList.contains("pcard")) out.push({ name: "pcard", ...abs(card) });
        }
      } else if (cls.contains("flow-note") || cls.contains("validate")) {
        out.push({ name: "nota", ...abs(el) });
      }
    }

    const closing = document.querySelector(".closing");
    if (closing) out.push({ name: "cierre", ...abs(closing) });
    return out;
  });

  const manifest = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const y = Math.max(0, Math.floor(b.top - PAD));
    const height = Math.ceil(b.bottom - b.top + PAD * 2);
    const file = `${String(i + 1).padStart(3, "0")}_${b.name}.png`;
    await page.screenshot({
      path: join(OUT, file),
      clip: { x: 0, y, width: VIEWPORT_W, height },
      captureBeyondViewport: true,
    });
    manifest.push(file);
  }
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Capturas aisladas para la versión editable (solo el visual, sin títulos).
  for (const [sel, file] of [
    ["#flujo .diagram-wrap", "diagram.png"],
    ["#pantalla .mock", "mockup.png"],
  ]) {
    const el = await page.$(sel);
    if (el) await el.screenshot({ path: join(OUT, file) });
  }

  await browser.close();
  console.log(`OK · ${manifest.length} slides → ${OUT}`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
