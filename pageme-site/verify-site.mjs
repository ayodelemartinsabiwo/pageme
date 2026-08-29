import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.PAGEME_SITE_URL || "http://127.0.0.1:4173";
const chrome = process.env.PAGEME_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const widths = [360, 390, 768, 1440];
const browser = await chromium.launch({ headless: true, executablePath: chrome });

try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 1000 } });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    const result = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      ucnTitle: document.querySelector("#ucn-title")?.textContent?.trim(),
      downloadUrl: document.querySelector("[data-download-link]")?.href,
      status: document.querySelector("[data-test-status]")?.textContent?.trim()
    }));
    if (result.scrollWidth > result.viewportWidth + 1) throw new Error(`Horizontal overflow at ${width}px: ${result.scrollWidth}px`);
    if (result.ucnTitle !== "A pager address of your own.") throw new Error(`UCN section missing at ${width}px`);
    if (result.downloadUrl !== "https://play.google.com/apps/testing/com.pageme.app") throw new Error("Closed-test link is not current");
    if (result.status !== "Closed testing on Google Play") throw new Error("Closed-test status is not current");
    await page.close();
  }

  const guide = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await guide.goto(`${baseUrl}/guide.html#ucn-pages/send-to-ucn`, { waitUntil: "networkidle" });
  if (await guide.locator("[data-guide-title]").textContent() !== "Send a direct page by UCN") {
    throw new Error("UCN guide deep link did not render");
  }
  if (await guide.locator("[data-guide-select]").inputValue() !== "ucn-pages") {
    throw new Error("UCN guide chapter was not selected");
  }
  const guideOverflow = await guide.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (guideOverflow) throw new Error("Guide has horizontal overflow at 390px");
  await guide.close();

  console.log("PageMe website verification passed at 360, 390, 768, and 1440 pixels.");
} finally {
  await browser.close();
}
