import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, "assets");
const siteRoot = path.dirname(here);
await fs.mkdir(output, { recursive: true });

await sharp(path.join(siteRoot, "assets", "images", "pageme-mark.png"))
  .resize(240, 240, { fit: "cover" })
  .png({ compressionLevel: 9 })
  .toFile(path.join(output, "pageme-thumbnail-240.png"));

const slides = [
  ["focused", "01-focused-pager.png"],
  ["ucn", "02-ucn-pages.png"],
  ["communication", "03-grouped-communication.png"],
  ["automation", "04-focus-automation.png"]
];

const chrome = process.env.PAGEME_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath: chrome });
try {
  const page = await browser.newPage({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 1 });
  for (const [slide, filename] of slides) {
    const url = new URL(pathToFileURL(path.join(here, "render.html")).href);
    url.searchParams.set("slide", slide);
    await page.goto(url.href, { waitUntil: "load" });
    await page.locator(`#slide-${slide}`).screenshot({ path: path.join(output, filename) });
  }
} finally {
  await browser.close();
}

for (const filename of ["pageme-thumbnail-240.png", ...slides.map(([, name]) => name)]) {
  const file = path.join(output, filename);
  const metadata = await sharp(file).metadata();
  const stat = await fs.stat(file);
  console.log(`${filename}: ${metadata.width}x${metadata.height}, ${stat.size} bytes`);
}
