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
    if (result.downloadUrl !== "https://play.google.com/apps/internaltest/4701511113601505278") throw new Error("Internal-test link is not current");
    if (result.status !== "Internal testing on Google Play") throw new Error("Internal-test status is not current");
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

  const statusToken = "A".repeat(43);
  for (const width of widths) {
    const statusPage = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 1000 } });
    await statusPage.route("**/macros/s/**", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success", active: true, linkState: "active", context: "focus",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        focusEndsAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    }));
    await statusPage.goto(`${baseUrl}/page.html?s=${statusToken}`, { waitUntil: "networkidle" });
    const statusResult = await statusPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      title: document.querySelector("#status-title")?.textContent?.trim(),
      body: document.body.textContent || "",
      openUrl: document.querySelector("[data-open-app]")?.href,
      retryVisible: getComputedStyle(document.querySelector("[data-status-retry]")).display !== "none",
    }));
    if (statusResult.scrollWidth > statusResult.viewportWidth + 1) throw new Error(`Status page overflow at ${width}px`);
    if (statusResult.title !== "They are using PageMe") throw new Error(`Active status did not render at ${width}px`);
    if (statusResult.body.includes("AYO-001") || statusResult.body.includes("example.com")) throw new Error("Public status page exposed identity data");
    if (!statusResult.openUrl?.includes(`/page.html?s=${statusToken}`)) throw new Error("Open PageMe action lost its private token");
    if (statusResult.retryVisible) throw new Error(`Retry action was visible for an active status at ${width}px`);
    await statusPage.close();
  }

  const expiredPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await expiredPage.route("**/macros/s/**", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ status: "success", active: false, linkState: "expired" }),
  }));
  await expiredPage.goto(`${baseUrl}/page.html?s=${statusToken}`, { waitUntil: "networkidle" });
  if (await expiredPage.locator("#status-title").textContent() !== "Pager status ended") {
    throw new Error("Expired status did not fail closed");
  }
  await expiredPage.close();

  const invalidPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await invalidPage.goto(`${baseUrl}/page.html?s=short`, { waitUntil: "networkidle" });
  if (await invalidPage.locator("#status-title").textContent() !== "Invalid status link") {
    throw new Error("Malformed status token was not rejected");
  }
  await invalidPage.close();

  console.log("PageMe website and status-link verification passed at 360, 390, 768, and 1440 pixels.");
} finally {
  await browser.close();
}
