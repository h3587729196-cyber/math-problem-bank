
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  defaultViewport: { width: 1440, height: 900 },
  userDataDir: await mkdtemp(path.join(os.tmpdir(), "mb-demo-")),
  args: ["--no-sandbox", "--no-proxy-server", "--disable-gpu"],
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 160)));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".card", { timeout: 10000 });
await sleep(1500);
// 按 F9 启动演示
await page.keyboard.press("F9");
await sleep(1000);
console.log("DEMO CHIP:", await page.evaluate(() => !!document.querySelector(".demo-chip")));
// 观察各阶段（采样 55 秒）
const samples = [];
for (let i = 0; i < 11; i++) {
  await sleep(5000);
  const s = await page.evaluate(() => ({
    chip: !!document.querySelector(".demo-chip"),
    sheet: !!document.querySelector(".sheet"),
    network: !!document.querySelector(".network-canvas"),
    inside: !!document.querySelector(".network-inside"),
    reviewCard: !!document.querySelector(".review-card"),
    methodCard: !!document.querySelector(".method-review-card"),
    answer: !!document.querySelector(".review-answer"),
    report: !!document.querySelector(".report-sheet"),
    view: (document.querySelector(".nav-item.active")?.textContent ?? "").slice(0, 10),
  }));
  samples.push(s);
  console.log("t=" + (i + 1) * 5 + "s", JSON.stringify(s));
}
console.log("ERRORS:", JSON.stringify(errors));
await browser.close();
