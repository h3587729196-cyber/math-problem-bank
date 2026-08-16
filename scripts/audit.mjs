// 布局与样式审计：不依赖人工看图，检查关键设计语言指标与功能状态。
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const executable = process.argv[2] ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = process.env.AUDIT_BASE ?? "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: executable,
  headless: true,
  defaultViewport: { width: 1440, height: 900 },
  userDataDir: await mkdtemp(path.join(os.tmpdir(), "mb-audit-")),
  args: ["--no-sandbox", "--no-proxy-server", "--disable-gpu"],
  timeout: 20000,
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(base, { waitUntil: "networkidle0" });
await page.waitForSelector(".card", { timeout: 8000 });

const audit = await page.evaluate(async () => {
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok, detail });

  await new Promise((r) => setTimeout(r, 900));

  // 图片是否真的加载
  const imgs = Array.from(document.images);
  const broken = imgs.filter((i) => i.naturalWidth === 0);
  check("图片全部加载", broken.length === 0, `${imgs.length - broken.length}/${imgs.length}`);

  // 是否横向溢出
  check(
    "无横向溢出",
    document.documentElement.scrollWidth <= window.innerWidth + 1,
    `scrollWidth=${document.documentElement.scrollWidth} innerWidth=${window.innerWidth}`
  );

  // 侧栏毛玻璃
  const sidebar = document.querySelector(".sidebar");
  const sb = sidebar ? getComputedStyle(sidebar) : null;
  const reducedTransparency = matchMedia("(prefers-reduced-transparency: reduce)").matches;
  if (reducedTransparency) {
    check(
      "降低透明时毛玻璃降级为实底",
      !!sb && !sb.backdropFilter.includes("blur") && parseFloat(sb.backgroundColor.split(",").pop()) >= 0.9,
      sb ? `backdrop=${sb.backdropFilter} bg=${sb.backgroundColor}` : "no sidebar"
    );
  } else {
    check(
      "侧栏毛玻璃生效",
      !!sb && sb.backdropFilter.includes("blur") && sb.backgroundColor !== "rgba(0, 0, 0, 0)",
      sb ? `backdrop=${sb.backdropFilter} bg=${sb.backgroundColor}` : "no sidebar"
    );
  }

  // 卡片数量与网格
  const cards = document.querySelectorAll(".card").length;
  check("题库卡片渲染（≥3）", cards >= 3, `${cards} cards`);

  // 分段控件活动胶囊
  const pill = document.querySelector(".seg-pill");
  check("分段控件胶囊渲染", !!pill && pill.getBoundingClientRect().width > 0);

  // 侧栏活动胶囊（弹簧滑动）
  check(
    "侧栏活动胶囊渲染",
    !!document.querySelector(".nav-item.active .nav-pill"),
    "nav-pill present"
  );

  // 标题字距（display 负 tracking）
  const title = document.querySelector(".page-title");
  check(
    "标题负字距",
    !!title && parseFloat(getComputedStyle(title).letterSpacing) < 0,
    title ? getComputedStyle(title).letterSpacing : "no title"
  );

  // 深色模式切换（主题按钮仍可用；先强制浅色再切深色，与系统初始主题无关）
  const html = document.documentElement;
  html.dataset.theme = "light";
  await new Promise((r) => setTimeout(r, 60));
  const bgLight = getComputedStyle(document.body).backgroundColor;
  html.dataset.theme = "dark";
  await new Promise((r) => setTimeout(r, 60));
  const bgDark = getComputedStyle(document.body).backgroundColor;
  delete html.dataset.theme;
  check("深色模式背景切换", bgLight !== bgDark, `${bgLight} -> ${bgDark}`);

  // 粒子背景画布常驻
  check("粒子背景画布存在", !!document.querySelector(".particle-bg"), "particle-bg present");

  return { results, brokenUrls: broken.map((i) => i.currentSrc) };
});

// 详情页
await page.click(".card");
await page.waitForSelector(".sheet");
await sleep(900);
const detail = await page.evaluate(() => {
  const out = [];
  const sheet = document.querySelector(".sheet");
  const r = sheet?.getBoundingClientRect();
  out.push({
    name: "详情弹层在视口内",
    ok: !!r && r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
    detail: r ? `left=${r.left} right=${r.right} top=${r.top} bottom=${r.bottom}` : "no sheet",
  });
  const steps = document.querySelectorAll(".thought-steps li").length;
  out.push({ name: "破题步骤渲染", ok: steps > 0, detail: `${steps} steps` });
  const stepImg = document.querySelector(".solution-img img");
  out.push({
    name: "思路图片加载",
    ok: !!stepImg && stepImg.naturalWidth > 0,
    detail: stepImg ? `naturalWidth=${stepImg.naturalWidth}` : "no thumb",
  });
  const detailImg = document.querySelector(".detail-img img");
  out.push({
    name: "题干大图加载",
    ok: !!detailImg && detailImg.naturalWidth > 0,
    detail: detailImg ? `naturalWidth=${detailImg.naturalWidth}` : "no img",
  });
  return out;
});
await page.keyboard.press("Escape");
await page.waitForFunction(() => !document.querySelector(".sheet"), { timeout: 10000 });
await sleep(300);

// 录入表单
await page.click(".btn-primary");
await page.waitForSelector(".sheet");
await sleep(900);
const form = await page.evaluate(() => {
  const out = [];
  const dz = document.querySelectorAll(".dropzone").length;
  out.push({ name: "上传区渲染", ok: dz === 2, detail: `${dz} dropzones` });
  const saveBtn = Array.from(document.querySelectorAll(".sheet-footer .btn")).pop();
  out.push({
    name: "无题干时保存禁用",
    ok: !!saveBtn && saveBtn.disabled,
    detail: saveBtn ? `disabled=${saveBtn.disabled}` : "no btn",
  });
  return out;
});
await page.keyboard.press("Escape");
await sleep(500);

// 方法库
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".nav-item"))
    .find((n) => n.textContent.startsWith("方法库"))
    ?.click();
});
await page.waitForSelector(".method-card");
await sleep(900);
const methods = await page.evaluate(() => {
  const cards = document.querySelectorAll(".method-card").length;
  const signals = document.querySelectorAll(".signal").length;
  return [
    { name: "方法卡片渲染", ok: cards >= 3, detail: `${cards} cards` },
    { name: "适用信号渲染", ok: signals >= 3, detail: `${signals} signals` },
  ];
});

// 标签页
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".nav-item"))
    .find((n) => n.textContent.startsWith("标签"))
    ?.click();
});
await page.waitForSelector(".tag-row");
await sleep(900);
const tags = await page.evaluate(() => {
  const rows = document.querySelectorAll(".tag-row").length;
  const text = document.querySelector(".tag-table")?.textContent ?? "";
  return [
    { name: "标签行渲染", ok: rows >= 5, detail: `${rows} rows` },
    { name: "统计信息存在", ok: text.includes("题 ·"), detail: "contains 题 · 方法" },
  ];
});

// 移动端视口
await page.setViewport({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".card", { timeout: 8000 });
await sleep(900);
const mobile = await page.evaluate(() => {
  const sidebar = document.querySelector(".sidebar");
  const sb = sidebar ? getComputedStyle(sidebar) : null;
  return [
    {
      name: "移动端无横向溢出",
      ok: document.documentElement.scrollWidth <= window.innerWidth + 1,
      detail: `scrollWidth=${document.documentElement.scrollWidth} innerWidth=${window.innerWidth}`,
    },
    {
      name: "移动端侧栏隐藏、底部标签栏显示",
      ok:
        (!sidebar || sb?.display === "none") &&
        !!document.querySelector(".mobile-tabbar") &&
        getComputedStyle(document.querySelector(".mobile-tabbar")).display !== "none",
      detail: sb ? `sidebar=${sb.display}` : "no sidebar",
    },
    {
      name: "移动端活动标签胶囊",
      ok: !!document.querySelector(".mobile-tab-pill"),
      detail: "pill present",
    },
    {
      name: "移动端卡片渲染",
      ok: document.querySelectorAll(".card").length >= 3,
      detail: `${document.querySelectorAll(".card").length} cards`,
    },
    {
      name: "移动端主内容区占满视口",
      ok: (() => {
        const m = document.querySelector("main");
        if (!m) return false;
        const b = m.getBoundingClientRect();
        return b.x <= 1 && b.width >= window.innerWidth - 2;
      })(),
      detail: (() => {
        const m = document.querySelector("main");
        const b = m?.getBoundingClientRect();
        return b ? `main x=${Math.round(b.x)} w=${Math.round(b.width)}` : "no main";
      })(),
    },
    {
      name: "移动端 FAB 固定右下角",
      ok: (() => {
        const f = document.querySelector(".mobile-fab");
        if (!f) return false;
        const b = f.getBoundingClientRect();
        return (
          getComputedStyle(f).position === "fixed" &&
          Math.abs(b.x - (window.innerWidth - 18 - 56)) <= 2
        );
      })(),
      detail: (() => {
        const f = document.querySelector(".mobile-fab");
        if (!f) return "no fab";
        const b = f.getBoundingClientRect();
        return `fab pos=${getComputedStyle(f).position} x=${Math.round(b.x)}`;
      })(),
    },
  ];
});

const all = [...audit.results, ...detail, ...form, ...methods, ...tags, ...mobile];
const failed = all.filter((r) => !r.ok);
for (const r of all) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  ${r.detail}`);
if (errors.length) console.log("BROWSER ERRORS:\n" + errors.join("\n"));
console.log(failed.length === 0 && errors.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECKS FAILED`);
await browser.close();
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
