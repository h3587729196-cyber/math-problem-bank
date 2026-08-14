// 可视化验证：用本机 Chrome/Edge 无头模式逐页截图，并收集控制台错误。
// 用法：node scripts/visual-check.mjs [输出目录] [浏览器路径]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const outDir = path.resolve(process.argv[2] ?? "scripts/shots");
const executable =
  process.argv[3] ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = "http://localhost:5173/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findByText(page, selector, text) {
  return page.evaluate(
    (sel, txt) => {
      const nodes = Array.from(document.querySelectorAll(sel));
      const el = nodes.find((n) => (n.textContent ?? "").trim().startsWith(txt));
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      return true;
    },
    selector,
    text
  );
}

const browser = await puppeteer.launch({
  executablePath: executable,
  headless: "new",
  args: ["--window-size=1440,900", "--hide-scrollbars"],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

const shot = async (name) => {
  await sleep(900);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log("shot:", name);
};

await mkdir(outDir, { recursive: true });

// 1. 题库（浅色）
await page.goto(base, { waitUntil: "networkidle0" });
await page.waitForSelector(".card", { timeout: 8000 });
await shot("01-library-light.png");

// 2. 题库（深色）
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".card");
await shot("02-library-dark.png");
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

// 3. 题目详情
await page.click(".card");
await page.waitForSelector(".sheet");
await shot("03-detail.png");
await page.keyboard.press("Escape");
await sleep(500);

// 4. 录入表单
await findByText(page, ".btn", "新增题目");
await page.click(".btn-primary");
await page.waitForSelector(".sheet");
await shot("04-form.png");
await page.keyboard.press("Escape");
await sleep(500);

// 5. 方法库
await findByText(page, ".nav-item", "方法库");
await page.click(".nav-item:nth-child(2)");
await page.waitForSelector(".method-card");
await shot("05-methods.png");

// 6. 新建方法表单
await findByText(page, ".btn", "新建方法");
await page.click(".btn-primary");
await page.waitForSelector(".sheet");
await shot("06-method-form.png");
await page.keyboard.press("Escape");
await sleep(500);

// 7. 标签页
await findByText(page, ".nav-item", "标签");
await page.click(".nav-item:nth-child(3)");
await page.waitForSelector(".tag-row");
await shot("07-tags.png");

// 8. 灯箱（从详情页）
await findByText(page, ".nav-item", "题库");
await page.click(".nav-item:nth-child(1)");
await page.waitForSelector(".card");
await page.click(".card");
await page.waitForSelector(".sheet .detail-img");
await page.click(".detail-img");
await page.waitForSelector(".lightbox img");
await shot("08-lightbox.png");
await page.keyboard.press("Escape");

console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
await browser.close();
