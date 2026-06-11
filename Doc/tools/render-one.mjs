/**
 * Renderiza las slides de tamaño fijo (cada elemento .slide) de un HTML a PNG de
 * alta resolución (deviceScaleFactor 2). Captura el i-ésimo .slide al i-ésimo PNG.
 *
 * Uso: node render-one.mjs <html> <out1.png> [out2.png ...]
 */
import puppeteer from "puppeteer-core";
import { pathToFileURL } from "url";
import { resolve } from "path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const htmlArg = process.argv[2];
const outArgs = process.argv.slice(3);
if (!htmlArg || outArgs.length === 0) {
  console.error("Uso: node render-one.mjs <html> <out1.png> [out2.png ...]");
  process.exit(1);
}

const run = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--hide-scrollbars", "--force-color-profile=srgb"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1740, height: 1100, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(resolve(htmlArg)).href, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  await new Promise((r) => setTimeout(r, 600));

  const slides = await page.$$(".slide");
  for (let i = 0; i < outArgs.length; i++) {
    const target = slides[i] ?? page;
    await target.screenshot({ path: resolve(outArgs[i]) });
    console.log("OK ->", resolve(outArgs[i]));
  }
  if (slides.length !== outArgs.length) {
    console.warn(`Aviso: ${slides.length} slides en el HTML vs ${outArgs.length} salidas pedidas.`);
  }
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
