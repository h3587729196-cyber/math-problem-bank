// 端到端功能测试：覆盖增删改查、图片上传、状态切换、方法与标签管理。
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import os from "node:os";
import puppeteer from "puppeteer-core";

const executable = process.argv[2] ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: executable,
  headless: true,
  defaultViewport: { width: 1440, height: 900 },
  userDataDir: await mkdtemp(path.join(os.tmpdir(), "mb-e2e-")),
  args: ["--no-sandbox", "--no-proxy-server", "--disable-gpu"],
  timeout: 20000,
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

async function clickByText(selector, text, exact = true) {
  const done = await page.evaluate(
    (sel, txt, exactMatch) => {
      const el = Array.from(document.querySelectorAll(sel)).find((n) => {
        const t = (n.textContent ?? "").trim();
        return exactMatch ? t === txt : t.startsWith(txt);
      });
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text,
    exact
  );
  if (!done) throw new Error(`未找到按钮: ${text}`);
}

// 等待保存按钮可用后再点击（图片压缩是异步的，避免点击被禁用的按钮）
async function clickSave(label) {
  await page.waitForFunction(
    (txt) => {
      const btn = Array.from(document.querySelectorAll(".sheet-footer .btn")).find(
        (b) => (b.textContent ?? "").trim() === txt
      );
      return !!btn && !btn.disabled;
    },
    { timeout: 15000 },
    label
  );
  await clickByText(".sheet-footer .btn", label);
}

// 准备一张测试图片
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const workDir = path.resolve("C:/Users/Administrator/Documents/Codex/2026-08-11/n/work");
await mkdir(workDir, { recursive: true });
const imgPath = path.join(workDir, "e2e-test.png");
await writeFile(imgPath, png);

await page.goto(base, { waitUntil: "networkidle0" });
await page.waitForSelector(".card", { timeout: 8000 });
check("初始 3 道种子题", (await page.$$(".card")).length === 3);

// ---- 新增题目 ----
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
await page.type("#pf-title", "E2E 测试题：求 x+y");
await page.type("#pf-source", "E2E 来源");
await page.type(".tag-input input", "E2E标签");
await page.keyboard.press("Enter");
const [chooser] = await Promise.all([
  page.waitForFileChooser(),
  page.click(".sheet .dropzone"),
]);
await chooser.accept([imgPath]);
await sleep(300);
await clickSave("保存题目");
await page.waitForFunction(() => document.querySelectorAll(".card").length === 4);
check("新增后 4 张卡片", true);

const titleText = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(".card"));
  return cards.find((c) => c.textContent.includes("E2E 测试题"))?.textContent ?? "";
});
check("新卡片标题正确", titleText.includes("E2E 测试题"));

// ---- 详情与状态切换 ----
await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(".card"));
  cards.find((c) => c.textContent.includes("E2E 测试题"))?.click();
});
await page.waitForSelector(".sheet .detail-img");
check("详情页题干图片渲染", (await page.$(".sheet .detail-img img")) !== null);
await clickByText(".sheet .segmented button", "已解");
await sleep(500);
const activeStatus = await page.$eval(".sheet .segmented button.active", (el) =>
  el.textContent.trim()
);
check("状态切换为已解", activeStatus === "已解", `active=${activeStatus}`);

// ---- 编辑 ----
await clickByText(".sheet-footer .btn", "编辑");
await page.waitForSelector("#pf-title");
await sleep(900);
await page.evaluate(() => {
  const el = document.querySelector("#pf-title");
  el?.focus();
  el?.select();
});
await page.type("#pf-title", "E2E 测试题·改");
await clickSave("保存题目");
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll(".card")).some((c) => c.textContent.includes("E2E 测试题·改"))
);
check("编辑标题已生效", true);

// ---- 删除 ----
await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(".card"));
  cards.find((c) => c.textContent.includes("E2E 测试题·改"))?.click();
});
await page.waitForSelector(".sheet-footer .btn-danger");
await clickByText(".sheet-footer .btn", "删除");
await page.waitForSelector(".dialog-card");
await clickByText(".dialog-actions .btn", "删除");
await page.waitForFunction(() => document.querySelectorAll(".card").length === 3);
check("删除后回到 3 张卡片", true);

// ---- 搜索筛选 ----
await page.type(".search input", "数列");
await sleep(600);
check("搜索“数列”只留 1 张", (await page.$$(".card")).length === 1);
await page.evaluate(() => {
  const el = document.querySelector(".search .input");
  el?.focus();
  el?.select();
});
await page.keyboard.press("Backspace");
await sleep(500);
check("清空搜索恢复 3 张", (await page.$$(".card")).length === 3);

// ---- 新建方法 ----
await clickByText(".nav-item", "方法库", false);
await page.waitForSelector(".method-card");
await clickByText(".btn", "新建方法");
await page.waitForSelector("#mf-name");
await page.type("#mf-name", "E2E 方法");
await page.type("#mf-signal", "看到 E2E 标记时使用");
await page.type("#mf-desc", "用于端到端测试的占位方法。");
await page.type(".sheet .tag-input input", "E2E标签");
await page.keyboard.press("Enter");
await clickSave("保存方法");
await page.waitForFunction(() => document.querySelectorAll(".method-card").length === 4);
check("新建方法后 4 张方法卡", true);

// ---- 标签重命名与删除 ----
await clickByText(".nav-item", "标签", false);
await page.waitForSelector(".tag-row");
await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll(".tag-row")).find((r) =>
    r.querySelector(".name")?.textContent === "E2E标签"
  );
  row?.querySelector('button[aria-label^="重命名"]')?.click();
});
await page.waitForSelector(".tag-row input");
await sleep(300);
await page.$eval(".tag-row input", (el) => {
  el.focus();
  el.select();
});
await page.keyboard.type("E2E标签改");
await page.keyboard.press("Enter");
await sleep(800);
const renamedOk = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".tag-row")).some(
    (r) => r.querySelector(".name")?.textContent === "E2E标签改"
  )
);
check("重命名结果可见", renamedOk);

await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll(".tag-row")).find((r) =>
    r.querySelector(".name")?.textContent === "E2E标签改"
  );
  row?.querySelector('button[aria-label^="删除"]')?.click();
});
await page.waitForSelector(".dialog-card");
await clickByText(".dialog-actions .btn", "删除");
await sleep(600);
const tagGone = await page.evaluate(
  () => !Array.from(document.querySelectorAll(".tag-row")).some((r) => r.textContent.includes("E2E标签改"))
);
check("标签已删除", tagGone);

// ================= 新功能 v2（TDD 先行） =================
const selVisible = async (sel, timeout = 4000) => {
  try {
    await page.waitForSelector(sel, { timeout });
    return true;
  } catch {
    return false;
  }
};

// T1 方法库：点击卡片打开专属详情视图
await clickByText(".nav-item", "方法库", false);
await page.waitForSelector(".method-card");
await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".method-card")).find((c) =>
    c.textContent.includes("对称式")
  );
  card?.click();
});
check("T1 方法卡点击打开详情视图", await selVisible(".method-detail"));
check("T1b 详情包含适用信号", await selVisible(".method-detail .signal"));
const t1Steps = await page
  .$eval(".method-detail", (el) => el.querySelectorAll(".method-steps li").length)
  .catch(() => 0);
check("T1c 详情包含操作步骤", t1Steps >= 1, `steps=${t1Steps}`);
const t1Linked = await page
  .$eval(".method-detail", (el) => el.querySelectorAll(".linked-problem").length)
  .catch(() => 0);
check("T1d 详情包含关联题目", t1Linked >= 1, `linked=${t1Linked}`);
await page.keyboard.press("Escape");
await sleep(600);

// T2 题目详情：用到的方法区块
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await page.click(".card");
await page.waitForSelector(".sheet .detail-img");
check("T2 题目详情显示用到的方法", await selVisible(".sheet .method-links"));
const t2Links = await page
  .$eval(".sheet .method-links", (el) => el.querySelectorAll(".method-link").length)
  .catch(() => 0);
check("T2b 题目至少关联一个方法", t2Links >= 1, `links=${t2Links}`);
await page.evaluate(() => document.querySelector(".sheet .method-link")?.click());
await sleep(900);
check("T2c 从题目可跳转方法详情", await selVisible(".method-detail"));
await page.keyboard.press("Escape");
await sleep(600);

// T3 从题目表单添加方法关联（搜索式选择器）
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
check("T3 题目表单含关联方法编辑区", await selVisible(".method-link-editor"));
check("T3c 关联选择器为搜索式", await selVisible(".method-picker-trigger"));
await page.click(".method-picker-trigger");
await sleep(300);
await page.type(".method-picker-search", "对称式");
await sleep(300);
await page.click(".method-pick-row");
await sleep(400);
const t3Rows = await page
  .$eval(".method-link-editor", (el) => el.querySelectorAll(".link-row").length)
  .catch(() => 0);
check("T3b 添加关联成功", t3Rows >= 1, `rows=${t3Rows}`);
await page.keyboard.press("Escape");
await sleep(600);

// T8 关联选择器支持搜索过滤
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
await page.click(".method-picker-trigger");
await sleep(300);
await page.type(".method-picker-search", "放缩");
await sleep(300);
const t8Rows = await page.evaluate(() => Array.from(document.querySelectorAll(".method-pick-row")).map((e) => e.textContent ?? ""));
check(
  "T8 搜索只显示匹配方法",
  t8Rows.length === 1 && t8Rows[0].includes("放缩"),
  JSON.stringify(t8Rows)
);
await page.click(".method-pick-row");
await sleep(400);
check("T8b 选中后生成关联行", await selVisible(".method-link-editor .link-row"));
await page.keyboard.press("Escape");
await sleep(600);

// T9 找不到时可新建并自动关联
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
await page.click(".method-picker-trigger");
await sleep(300);
await page.type(".method-picker-search", "不动点迭代");
await sleep(300);
check("T9 无结果时出现新建入口", await selVisible(".method-pick-new"));
await page.click(".method-pick-new");
await sleep(300);
await page.type("#quick-method-name", "不动点迭代");
await page.type("#quick-method-signal", "递推式收敛时想到");
await clickByText(".quick-method-save", "保存并关联");
await sleep(700);
const t9HasLink = await page
  .$eval(".method-link-editor", (el) => el.textContent.includes("不动点迭代"))
  .catch(() => false);
check("T9b 新方法自动关联到题目", t9HasLink);
await page.keyboard.press("Escape");
await sleep(600);

// T10 推荐分组：按题目标签排序
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
await page.type(".tag-input input", "导数");
await page.keyboard.press("Enter");
await sleep(200);
await page.click(".method-picker-trigger");
await sleep(300);
check("T10 有推荐分组", await selVisible(".method-pick-recommend"));
const t10First = await page.$eval(".method-pick-row", (el) => el.textContent ?? "").catch(() => "");
check(
  "T10b 推荐优先含导数方法",
  t10First.includes("放缩") || t10First.includes("导数"),
  t10First
);
await page.keyboard.press("Escape");
await sleep(600);

// T4 方法表单：操作步骤与易错点
await clickByText(".nav-item", "方法库", false);
await page.waitForSelector(".method-card");
await clickByText(".btn", "新建方法");
await page.waitForSelector("#mf-name");
check("T4 方法表单含步骤编辑", await selVisible("#mf-steps"));
check("T4b 方法表单含易错点输入", await selVisible("#mf-pitfalls"));
await page.keyboard.press("Escape");
await sleep(600);

// T11 方法表单支持图片上传
await clickByText(".nav-item", "方法库", false);
await page.waitForSelector(".method-card");
await clickByText(".btn", "新建方法");
await page.waitForSelector("#mf-name");
check("T11 方法表单含图片上传区", await selVisible(".method-images .dropzone"));
const [methodImgChooser] = await Promise.all([
  page.waitForFileChooser(),
  page.click(".method-images .dropzone"),
]);
await methodImgChooser.accept([imgPath]);
await sleep(300);
await page.type("#mf-name", "图片方法测试");
await clickSave("保存方法");
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll(".method-card")).some((c) =>
    c.textContent.includes("图片方法测试")
  )
);
check("T11b 带图片的方法已保存", true);

// T12 方法详情展示图片
await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".method-card")).find((c) =>
    c.textContent.includes("图片方法测试")
  );
  card?.click();
});
await page.waitForSelector(".method-detail");
await sleep(800);
const methodImgLoaded = await page
  .$eval(".method-detail .method-images img", (el) => el.naturalWidth > 0)
  .catch(() => false);
check("T12 方法详情展示上传的图片", methodImgLoaded);
await page.keyboard.press("Escape");
await sleep(600);

// T13 方法卡片显示缩略图
const cardThumbOk = await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".method-card")).find((c) =>
    c.textContent.includes("图片方法测试")
  );
  const img = card?.querySelector(".method-thumb img");
  return !!img && img.naturalWidth > 0;
});
check("T13 方法卡片显示缩略图", cardThumbOk);

// T14 标签支持点选多选
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
await page.click(".tag-pick-chip[data-tag='导数']");
await page.click(".tag-pick-chip[data-tag='不等式']");
await sleep(400);
const t14Selected = await page.$eval(
  ".tag-input",
  (el) => el.querySelectorAll(".chip").length
);
check("T14 点选两个标签", t14Selected === 2, `chips=${t14Selected}`);
await page.click(".tag-pick-chip[data-tag='导数']");
await sleep(400);
const t14AfterToggle = await page.$eval(
  ".tag-input",
  (el) => el.querySelectorAll(".chip").length
);
check("T14b 再点一次取消选中", t14AfterToggle === 1, `chips=${t14AfterToggle}`);
await page.click(".tag-pick-chip[data-tag='导数']");
await sleep(200);
const [tagImgChooser] = await Promise.all([
  page.waitForFileChooser(),
  page.click(".sheet .dropzone"),
]);
await tagImgChooser.accept([imgPath]);
await sleep(300);
await page.type("#pf-title", "多标签测试题");
await clickSave("保存题目");
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll(".card")).some((c) => c.textContent.includes("多标签测试题"))
);
await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".card")).find((c) =>
    c.textContent.includes("多标签测试题")
  );
  card?.click();
});
await page.waitForSelector(".sheet");
await sleep(600);
const t14DetailText = await page.$eval(".sheet", (el) => el.textContent ?? "");
check(
  "T14c 保存后题目含两个标签",
  t14DetailText.includes("导数") && t14DetailText.includes("不等式")
);
await page.keyboard.press("Escape");
await sleep(600);

// T15 思路图片只存一张 + 破题文字步骤多条
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
check("T15 表单含破题步骤编辑器", await selVisible(".thought-steps-editor .step-edit-row-text input"));
const [solChooser1] = await Promise.all([
  page.waitForFileChooser(),
  page.click(".solution-img-area .dropzone"),
]);
await solChooser1.accept([imgPath]);
await sleep(300);
const [solChooser2] = await Promise.all([
  page.waitForFileChooser(),
  page.click(".solution-img-area .dropzone"),
]);
await solChooser2.accept([imgPath]);
await sleep(300);
const solTiles = await page.$eval(
  ".solution-img-area",
  (el) => el.querySelectorAll(".img-tile").length
);
check("T15b 思路图片始终只保留一张", solTiles === 1, `tiles=${solTiles}`);

let stepInputs = await page.$$(".thought-steps-editor .step-edit-row-text input");
await stepInputs[0].type("第一步：看到对称式先求 ab");
await page.click(".thought-add-step");
await sleep(250);
stepInputs = await page.$$(".thought-steps-editor .step-edit-row-text input");
await stepInputs[1].type("第二步：用立方和公式展开");
await page.click(".thought-add-step");
await sleep(250);
stepInputs = await page.$$(".thought-steps-editor .step-edit-row-text input");
await stepInputs[2].type("第三步：代入化简");
await sleep(200);

const [mainImgChooser] = await Promise.all([
  page.waitForFileChooser(),
  page.click(".sheet .dropzone"),
]);
await mainImgChooser.accept([imgPath]);
await sleep(300);
await page.type("#pf-title", "破题步骤测试题");
await clickSave("保存题目");
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll(".card")).some((c) => c.textContent.includes("破题步骤测试题"))
);
await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".card")).find((c) =>
    c.textContent.includes("破题步骤测试题")
  );
  card?.click();
});
await page.waitForSelector(".sheet .thought-steps");
await sleep(600);
const t16Steps = await page.$eval(".sheet .thought-steps", (el) => el.querySelectorAll("li").length);
check("T16 详情展示三条破题步骤", t16Steps === 3, `steps=${t16Steps}`);
check("T16b 详情展示一张思路图", await selVisible(".sheet .solution-img img"));
await page.keyboard.press("Escape");
await sleep(600);

// T17 方法库支持模糊搜索
await clickByText(".nav-item", "方法库", false);
await page.waitForSelector(".method-card");
check("T17 方法库有搜索框", await selVisible(".method-search input"));
await page.type(".method-search input", "放缩");
await sleep(500);
const t17Cards = await page.$$(".method-card");
check("T17b 搜索过滤只剩匹配方法", t17Cards.length === 1, `cards=${t17Cards.length}`);
const t17Text = await page.$eval(".method-card", (el) => el.textContent ?? "");
check("T17c 匹配到切线放缩", t17Text.includes("放缩"));
await page.evaluate(() => {
  const el = document.querySelector(".method-search input");
  el?.focus();
  el?.select();
});
await page.keyboard.press("Backspace");
await sleep(500);
check("T17d 清空恢复全部", (await page.$$(".method-card")).length >= 3);

// T18 破题步骤支持标星与巧妙程度
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
let tInputs = await page.$$(".thought-steps-editor .step-edit-row-text input");
await tInputs[0].type("辅助线构造");
await page.evaluate(() => {
  document.querySelectorAll(".thought-star-btn")[0]?.click();
});
await sleep(300);
check("T18 标星后出现巧妙程度选择", await selVisible(".thought-cleverness"));
await page.evaluate(() => {
  document
    .querySelector(
      ".thought-steps-editor .step-edit-row-text:nth-of-type(1) .thought-cleverness [data-level='5']"
    )
    ?.click();
});
await sleep(200);
await page.click(".thought-add-step");
await sleep(250);
tInputs = await page.$$(".thought-steps-editor .step-edit-row-text input");
await tInputs[1].type("设而不求");
await page.evaluate(() => {
  document.querySelectorAll(".thought-star-btn")[1]?.click();
});
await sleep(300);
await page.evaluate(() => {
  document
    .querySelector(
      ".thought-steps-editor .step-edit-row-text:nth-of-type(2) .thought-cleverness [data-level='3']"
    )
    ?.click();
});
await sleep(200);
const t18Stars = await page.$eval(
  ".thought-steps-editor",
  (el) => el.querySelectorAll(".thought-star-btn[aria-pressed='true']").length
);
check("T18b 两个步骤均已标星", t18Stars === 2, `stars=${t18Stars}`);
const [cleverImgChooser] = await Promise.all([
  page.waitForFileChooser(),
  page.click(".sheet .dropzone"),
]);
await cleverImgChooser.accept([imgPath]);
await sleep(300);
await page.type("#pf-title", "巧思库测试题");
await clickSave("保存题目");

// T19 巧思-巧想库展示星标步骤
await clickByText(".nav-item", "巧思库", false);
await page.waitForSelector(".clever-card");
const t19Text = await page.$eval(".clever-card", (el) => el.textContent ?? "");
check("T19 巧思库显示星标步骤", t19Text.includes("辅助线构造"));
check("T19b 显示巧妙程度", t19Text.includes("绝妙"));

// T20 巧思库模糊搜索与程度排序
await page.type(".clever-search input", "设而不求");
await sleep(400);
check("T20 巧思库模糊搜索", (await page.$$(".clever-card")).length === 1);
await page.evaluate(() => {
  const el = document.querySelector(".clever-search input");
  el?.focus();
  el?.select();
});
await page.keyboard.press("Backspace");
await sleep(400);
check("T20c 巧思库有排序控件", await selVisible(".clever-sort"));
const t20First = await page.$eval(".clever-card", (el) => el.textContent ?? "");
check("T20b 按程度排序绝妙优先", t20First.includes("辅助线构造"));

// T21 星标步骤可溯源回原题目
await page.evaluate(() => {
  document.querySelector(".clever-card")?.click();
});
await page.waitForSelector(".sheet .detail-img");
await sleep(700);
const t21Title = await page.$eval(".sheet-title", (el) => el.textContent ?? "");
check("T21 点击巧思库条目打开原题目", t21Title.includes("巧思库测试题"), t21Title);
await page.keyboard.press("Escape");
await sleep(600);

// T5 整库备份入口与面板
const t5Btn = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll(".sidebar button")).find((b) =>
    b.textContent.includes("备份")
  );
  btn?.click();
  return !!btn;
});
check("T5 侧栏有备份入口", t5Btn);
check("T5b 备份面板打开", await selVisible(".backup-sheet"));
check("T5c 有导出备份按钮", await selVisible("#export-backup-btn"));
await page.keyboard.press("Escape");
await sleep(600);

// T6 题目详情有导出图片按钮
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await page.click(".card");
await page.waitForSelector(".sheet");
check("T6 题目详情有导出图片按钮", await selVisible(".export-images-btn"));
await page.keyboard.press("Escape");
await sleep(600);

// T7 备份导出 → 导入回环（ZIP 格式）
function readZipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("no eocd");
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const map = new Map();
  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("bad central dir");
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? comp : inflateRawSync(comp);
    if (data.length !== uncompSize) throw new Error("bad size");
    map.set(name, data);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return map;
}

const client = await page.createCDPSession();
const dlDir = path.join(workDir, "dl-" + Date.now());
await mkdir(dlDir, { recursive: true });
await client.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: dlDir,
});
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll(".sidebar button")).find((b) =>
    b.textContent.includes("备份")
  );
  btn?.click();
});
await page.waitForSelector(".backup-sheet");
await sleep(900);
const beforeFiles = new Set(await readdir(dlDir));
await page.evaluate(() =>
  localStorage.setItem("mb-local-sync-config", JSON.stringify({ enabled: true, keepCount: 10 }))
);
await page.click("#export-backup-btn");
let backupPath = "";
for (let i = 0; i < 50; i++) {
  const files = await readdir(dlDir);
  const fresh = files.filter((f) => !beforeFiles.has(f) && f.endsWith(".zip"));
  if (fresh.length > 0) {
    backupPath = path.join(dlDir, fresh[0]);
    break;
  }
  await sleep(200);
}
check("T7 备份文件已下载", backupPath.length > 0);
const backupEntries = readZipEntries(await readFile(backupPath));
const manifest = JSON.parse(backupEntries.get("manifest.json").toString("utf8"));
check("T7 备份文件包含题目", manifest.problems.length >= 3, `problems=${manifest.problems.length}`);
check("T7b 备份文件包含方法", manifest.methods.length >= 4, `methods=${manifest.methods.length}`);
const hasImages = manifest.problems.every((p) =>
  p.images.every((i) => backupEntries.has(i.file) && backupEntries.get(i.file).length > 0)
);
check("T7c 备份包含题目图片原图", hasImages);
const hasMethodImages = manifest.methods.every(
  (m) => !m.images || m.images.length === 0 || m.images.every((i) => backupEntries.has(i.file))
);
check("T7e 备份包含方法图片", hasMethodImages);
const hasSolutions = manifest.problems.every((p) => Array.isArray(p.solutions));
check("T7f 备份包含解法结构", hasSolutions);
check(
  "T7g 备份包含设置信息",
  !!manifest.settings &&
    typeof manifest.settings.theme === "string" &&
    manifest.settings.localSync?.enabled === true,
  JSON.stringify(manifest.settings ?? {})
);
const [importChooser] = await Promise.all([
  page.waitForFileChooser(),
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".backup-sheet button"))
      .find((b) => b.textContent.includes("导入"))
      ?.click()
  ),
]);
await importChooser.accept([backupPath]);
await page.waitForSelector(".backup-preview", { timeout: 10000 });
await clickByText(".backup-preview .segmented button", "替换（删除现有）");
await sleep(200);
await page.click(".backup-preview-actions .btn-primary");
await page.waitForSelector(".backup-msg.ok", { timeout: 15000 });
const importMsg = await page.$eval(".backup-msg.ok", (el) => el.textContent ?? "");
check("T7d 替换导入成功", importMsg.includes("替换完成"), importMsg);

// T22 删除方法后，题目中的关联同步清理（不再残留“未知方法”）
await clickByText(".nav-item", "方法库", false);
await page.waitForSelector(".method-card");
await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".method-card")).find((c) =>
    c.textContent.includes("对称式")
  );
  card?.click();
});
await page.waitForSelector(".method-detail");
await clickByText(".method-detail .sheet-footer .btn", "删除");
await page.waitForSelector(".dialog-card");
await clickByText(".dialog-actions .btn", "删除");
await page.waitForFunction(() => {
  const cards = Array.from(document.querySelectorAll(".method-card"));
  return cards.every((c) => !c.textContent.includes("对称式"));
});
check("T22 删除方法成功", true);
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".card")).find((c) =>
    c.textContent.includes("对称式的值")
  );
  card?.click();
});
await page.waitForSelector(".sheet");
await sleep(700);
const t22Links = await page
  .$eval(".sheet .method-links", (el) => el.textContent ?? "")
  .catch(() => "");
check("T22b 题目中不再残留未知方法", !t22Links.includes("未知方法"), t22Links);
await page.keyboard.press("Escape");
await sleep(500);

// T23 破题思路独立搜索池：只搜思路文字，结果按标签分组
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await clickByText(".segmented button", "破题思路");
await page.type(".search input", "等比");
await sleep(600);
const t23Groups = await page.$$(".thought-group");
check("T23 破题思路搜索按标签分组", t23Groups.length >= 1, `groups=${t23Groups.length}`);
const t23Text = await page
  .$eval(".thought-item", (el) => el.textContent ?? "")
  .catch(() => "");
check("T23b 搜索命中思路步骤文字", t23Text.includes("等比数列"), t23Text);
const t23Heads = await page.$$eval(".thought-group-head .chip", (els) =>
  els.map((el) => el.textContent ?? "")
);
check("T23c 分组标签正确", t23Heads.includes("数列"), t23Heads.join(","));
await page.keyboard.press("Escape");
await sleep(500);

// T24 一题多解：添加第二种解法并保存
await clickByText(".btn", "新增题目");
await page.waitForSelector(".sheet");
await page.type("#pf-title", "多解法测试题");
let t24FirstInputs = await page.$$(".thought-steps-editor .step-edit-row-text input");
await t24FirstInputs[0].type("第一种思路：直接代入");
await page.click(".solution-add");
await sleep(300);
const solEditors = await page.$$(".solution-editor");
check("T24 出现第二组解法编辑器", solEditors.length === 2, `editors=${solEditors.length}`);
const solLabels = await page.$$eval(".solution-label", (els) => els.map((e) => e.value));
check("T24b 默认解法命名递增", solLabels[1] === "解法二", JSON.stringify(solLabels));
const sol2Inputs = await solEditors[1].$$(".step-edit-row-text input");
await sol2Inputs[0].type("第二种思路：换元");
const [t24Chooser] = await Promise.all([
  page.waitForFileChooser(),
  page.click(".sheet .dropzone"),
]);
await t24Chooser.accept([imgPath]);
await sleep(300);
await clickSave("保存题目");
await clickByText(".nav-item", "题库", false);
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".segmented button"))
    .find((b) => b.textContent.trim() === "常规搜索")
    ?.click();
});
await page.evaluate(() => {
  const el = document.querySelector(".search .input");
  el?.focus();
  el?.select();
});
await page.keyboard.press("Backspace");
await page.waitForSelector(".card");
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll(".card")).some((c) => c.textContent.includes("多解法测试题"))
);
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".card"))
    .find((c) => c.textContent.includes("多解法测试题"))
    ?.click();
});
await page.waitForSelector(".sheet");
await sleep(700);
const t24Sections = await page.$$eval(".sheet .thought-steps", (els) => els.length);
check("T24c 详情展示两组解法", t24Sections === 2, `sections=${t24Sections}`);
const t24Text = await page.$eval(".sheet", (el) => el.textContent ?? "");
check(
  "T24d 两组解法内容都在",
  t24Text.includes("解法一") &&
    t24Text.includes("解法二") &&
    t24Text.includes("第二种思路：换元"),
  t24Text.slice(0, 120)
);
await page.keyboard.press("Escape");
await sleep(500);

// T25 回看池：到期题自动出现，强制思考 20 秒后揭晓，顺延后进入“还没到期”
await clickByText(".nav-item", "回看", false);
await page.waitForSelector(".review-card");
check("T25 到期题出现在回看池", (await page.$$(".review-card")).length >= 1);
check("T25a 强制思考阶段出现", (await page.$(".think-phase")) !== null);
await page.waitForSelector(".review-reveal-btn", { timeout: 30000 });
await page.click(".review-reveal-btn");
await sleep(400);
await page.click(".review-section .review-card .btn-ghost");
await sleep(700);
const t25DueAfter = await page.$$eval(".review-section:first-child .review-card", (els) => els.length);
check("T25b 顺延后不再到期", t25DueAfter === 0, `due=${t25DueAfter}`);
const t25Upcoming = await page.$$eval(".review-upcoming-row", (els) => els.length);
check("T25c 进入还没到期列表", t25Upcoming >= 1, `upcoming=${t25Upcoming}`);
const t25Text = await page
  .$eval(".review-section:nth-of-type(2)", (el) => el.textContent ?? "")
  .catch(() => "");
check("T25d 显示顺延天数", t25Text.includes("1 天后回看"), t25Text);
await page.keyboard.press("Escape");
await sleep(500);

// T35 方法回看：低于熟练的方法进入回看（单卡会话），掌握提升后顺延或毕业
await clickByText(".nav-item", "回看", false);
await page.waitForSelector(".review-tabs");
await clickByText(".review-tabs .segmented button", "方法", false);
await page.waitForSelector(".method-review-card", { timeout: 10000 });
await page.waitForSelector(".review-reveal-btn", { timeout: 30000 });
await page.click(".review-reveal-btn");
await sleep(400);
const t35Text = await page.evaluate(
  () => document.querySelector(".method-review-card")?.textContent ?? ""
);
check(
  "T35 低掌握度方法进入回看",
  t35Text.includes("掌握提升了") && t35Text.includes("记忆强度"),
  t35Text.slice(0, 90)
);
const t35Name = await page.evaluate(
  () => document.querySelector(".method-review-card .review-card-title")?.textContent ?? ""
);
await page.evaluate(() => {
  document.querySelector(".method-review-card .review-actions .btn-primary")?.click();
});
await page.waitForFunction(
  (name) =>
    Array.from(document.querySelectorAll(".review-upcoming-row")).some((el) =>
      el.textContent.includes(name)
    ) || !!document.querySelector(".review-done"),
  { timeout: 10000 },
  t35Name
);
check("T35b 掌握提升后顺延或毕业", true);
await page.keyboard.press("Escape");
await sleep(500);

// T36 解法剧场：步骤逐条播放、多解法切换
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".card"))
    .find((c) => c.textContent.includes("多解法测试题"))
    ?.click();
});
await page.waitForSelector(".sheet");
await page.click('.sheet [aria-label="解法剧场"]');
await page.waitForSelector(".theater-panel", { timeout: 10000 });
check("T36 解法剧场打开", (await page.$(".theater-progress")) !== null);
await page.click(".theater-main-controls .icon-btn:last-child");
await page.waitForSelector(".theater-step", { timeout: 5000 });
const t36Step = await page.$eval(".theater-step-text", (el) => el.textContent ?? "");
check("T36b 步骤逐条播放", t36Step.length > 0, t36Step.slice(0, 40));
const t36Chips = await page.$$eval(".theater-chip", (els) => els.length);
check("T36c 多解法可切换", t36Chips >= 2);
await page.keyboard.press("Escape");
await sleep(400);
await page.keyboard.press("Escape");
await sleep(400);

// T37 招式网络：题目×方法关联动态网络（三维深空舞台）
await clickByText(".nav-item", "招式网络", false);
await page.waitForSelector(".network-view .network-canvas", { timeout: 10000 });
check("T37 招式网络渲染", (await page.$$(".network-node")).length >= 3);
await page.evaluate(() => {
  document.querySelector(".network-node")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await sleep(400);
const t37Info = await page.$eval(".network-info", (el) => el.textContent ?? "");
check("T37b 点击节点高亮并显示信息", t37Info.includes("打开详情"), t37Info.slice(0, 60));
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".network-info .btn"))
    .find((b) => b.textContent.includes("打开详情"))
    ?.click();
});
await page.waitForSelector(".method-detail", { timeout: 10000 });
check("T37c 从网络打开方法详情", true);
await page.keyboard.press("Escape");
await sleep(500);
// T37d 双击节点 → 飞入内部结构（解剖面板）
await page.evaluate(() => {
  document
    .querySelector(".network-node")
    ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
});
await page.waitForSelector(".network-inside", { timeout: 10000 });
const t37Inside = await page.$eval(".network-inside", (el) => el.textContent ?? "");
check(
  "T37d 双击飞入内部结构",
  t37Inside.includes("返回全景") && (t37Inside.includes("步骤") || t37Inside.includes("解法")),
  t37Inside.slice(0, 80)
);
await page.keyboard.press("Escape");
await sleep(800);
check("T37e Esc 返回全景", (await page.$(".network-inside")) === null);
await sleep(400);

// T26 数据分析报告页：A4 纸面布局 + 时间范围筛选
await clickByText(".nav-item", "数据分析", false);
await page.waitForSelector(".report-sheet", { timeout: 10000 });
check("T26 报告页渲染", (await page.$$(".kpi")).length >= 4, `kpi=${(await page.$$(".kpi")).length}`);
const t26Ranges = await page.$$eval(".report-toolbar .segmented button", (els) =>
  els.map((e) => e.textContent.trim())
);
check(
  "T26b 时间范围可筛选",
  t26Ranges.includes("本月") && t26Ranges.includes("近 90 天") && t26Ranges.includes("全部"),
  t26Ranges.join(",")
);
await clickByText(".report-toolbar .segmented button", "全部");
await sleep(500);
check("T26c 切换时间范围后仍正常", (await page.$$(".report-sheet")).length === 1);
const t26Print = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".report-toolbar button")).some((b) =>
    b.textContent.includes("打印")
  )
);
check("T26d 有 A4 打印按钮", t26Print);

// T27 方法掌握度：表单设置 → 卡片/详情展示
await clickByText(".nav-item", "方法库", false);
await page.waitForSelector(".method-card");
await clickByText(".btn", "新建方法");
await page.waitForSelector("#mf-name");
await page.type("#mf-name", "掌握度测试方法");
check("T27 方法表单含掌握度选择", (await page.$("#mf-mastery")) !== null);
await page.select("#mf-mastery", "3");
await clickSave("保存方法");
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll(".method-card")).some((c) =>
    c.textContent.includes("掌握度测试方法")
  )
);
const t27Card = await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll(".method-card")).find((c) =>
    c.textContent.includes("掌握度测试方法")
  );
  return card?.textContent ?? "";
});
check("T27b 卡片显示掌握度", t27Card.includes("熟练"), t27Card.slice(0, 60));
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".method-card"))
    .find((c) => c.textContent.includes("掌握度测试方法"))
    ?.click();
});
await page.waitForSelector(".method-detail");
const t27Detail = await page.$eval(".method-detail", (el) => el.textContent ?? "");
check("T27c 详情显示掌握度", t27Detail.includes("掌握度：熟练"), t27Detail.slice(0, 80));
await page.keyboard.press("Escape");
await sleep(500);

// T28 报告增强：自定义区间 + 上一期对比
await clickByText(".nav-item", "数据分析", false);
await page.waitForSelector(".report-sheet");
check("T28 本月报告含上一期对比", (await page.$$eval(".compare-strip", (els) => els.length)) >= 1);
await clickByText(".report-toolbar .segmented button", "自定义");
await page.waitForSelector(".custom-range input[type='date']");
await page.$eval(".custom-range input[type='date']:first-of-type", (el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "2026-08-01");
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.$eval(".custom-range input[type='date']:last-of-type", (el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "2026-08-12");
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(600);
check("T28b 自定义区间报告正常", (await page.$$(".report-sheet")).length === 1);

// T29 手机访问二维码
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".sidebar button"))
    .find((b) => b.textContent.includes("手机访问"))
    ?.click();
});
await page.waitForSelector(".qr-sheet img.qr-svg", { timeout: 10000 });
const t29Svg = await page.$eval(".qr-sheet img.qr-svg", (el) => el.outerHTML);
check(
  "T29 二维码已生成",
  t29Svg.length > 500 && t29Svg.includes("data:image"),
  `len=${t29Svg.length}`
);
const t29Url = await page.$eval(".qr-url", (el) => el.textContent ?? "");
check("T29b 显示访问地址", t29Url.includes("http"), t29Url);
check("T29c 有复制按钮", (await page.$eval(".qr-url-row .btn", (el) => el.textContent ?? "")).includes("复制"));
await page.keyboard.press("Escape");
await sleep(500);

// T30 局域网同步（手机 ↔ 电脑）入口
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".sidebar button"))
    .find((b) => b.textContent.includes("备份与恢复"))
    ?.click();
});
await page.waitForSelector(".backup-sheet");
check("T30 备份面板含局域网同步", (await page.$(".bridge-sync")) !== null);
const t30Text = await page.$eval(".bridge-sync", (el) => el.textContent ?? "");
check(
  "T30b 有合并/上传按钮",
  t30Text.includes("从其他设备合并") && t30Text.includes("上传当前题库"),
  t30Text.slice(0, 80)
);
await page.keyboard.press("Escape");
await sleep(500);

// T34 电脑端不弹“其他设备更新”提醒
await page.evaluate(() => localStorage.setItem("mb-bridge-last-sync", "0"));
await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForSelector(".card", { timeout: 10000 });
await new Promise((r) => setTimeout(r, 3000));
const t34Banner = await page.$$eval(".sync-reminder.bridge-update", (els) => els.length);
check("T34 电脑端不弹其他设备同步提醒", t34Banner === 0, `banners=${t34Banner}`);

// T32 按解法个数筛选
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await page.select('select[aria-label="按解法数筛选"]', "2");
await page.waitForFunction(() => document.querySelectorAll(".card").length === 1, { timeout: 5000 });
const t32Cards = await page.$$eval(".card .card-title", (els) => els.map((e) => e.textContent ?? ""));
check(
  "T32 按解法数筛选：2 解",
  t32Cards.length === 1 && t32Cards[0].includes("多解法测试题"),
  t32Cards.join("|")
);
await page.select('select[aria-label="按解法数筛选"]', "1");
await page.waitForFunction(() => document.querySelectorAll(".card").length === 6, { timeout: 5000 });
check("T32b 1 解共 6 道", true);
await page.select('select[aria-label="按解法数筛选"]', "3plus");
await page.waitForFunction(() => document.querySelectorAll(".card").length === 0, { timeout: 5000 });
check("T32c 3 解以上为空", true);
await page.select('select[aria-label="按解法数筛选"]', "all");
await page.waitForFunction(() => document.querySelectorAll(".card").length === 7, { timeout: 5000 });
check("T32d 重置后恢复", true);

// T33 解法双维度：简易度 + 妙解
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".card"))
    .find((c) => c.textContent.includes("多解法测试题"))
    ?.click();
});
await page.waitForSelector(".sheet");
await clickByText(".sheet-footer .btn", "编辑");
await page.waitForSelector(".solution-editor");
await page.evaluate(() => {
  const meta = document.querySelector(".solution-editor .solution-meta");
  const seg = meta?.querySelector(".segmented");
  Array.from(seg?.querySelectorAll("button") ?? [])
    .find((b) => b.textContent.trim() === "复杂")
    ?.click();
  meta?.querySelector(".clever-toggle")?.click();
});
await sleep(300);
await clickSave("保存题目");
await page.waitForFunction(() => document.querySelectorAll(".sheet").length === 0, { timeout: 10000 });
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".card"))
    .find((c) => c.textContent.includes("多解法测试题"))
    ?.click();
});
await page.waitForSelector(".sheet .badge.clever", { timeout: 10000 });
const t33Detail = await page.$eval(".sheet", (el) => el.textContent ?? "");
const t33CleverBadge = await page.$eval(".sheet .badge.clever", (el) => el.textContent ?? "");
check(
  "T33 解法双维度详情展示",
  t33Detail.includes("复杂") && t33CleverBadge.includes("妙解"),
  t33Detail.slice(0, 200)
);
await page.keyboard.press("Escape");
await sleep(400);
await clickByText(".nav-item", "数据分析", false);
await page.waitForSelector(".report-sheet");
const t33Report = await page.$eval(".report-sheet", (el) => el.textContent ?? "");
check(
  "T33b 报告含解法分析",
  t33Report.includes("解法分析") && t33Report.includes("妙解占比"),
  t33Report.slice(0, 80)
);

// T38 认知回看：难题进入排期，降档毕业
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".card");
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".card"))
    .find((c) => c.textContent.includes("多解法测试题"))
    ?.click();
});
await page.waitForSelector(".sheet");
await clickByText(".sheet-footer .btn", "编辑");
await page.waitForSelector(".solution-editor");
await page.evaluate(() => {
  const field = Array.from(document.querySelectorAll(".field")).find(
    (f) => f.textContent.includes("难度") && !f.textContent.includes("当时觉得")
  );
  Array.from(field?.querySelectorAll("button") ?? [])
    .find((b) => b.textContent.trim() === "困难")
    ?.click();
});
await sleep(300);
await clickSave("保存题目");
await page.waitForFunction(() => document.querySelectorAll(".sheet").length === 0, { timeout: 10000 });
await clickByText(".nav-item", "认知回看", false);
await page.waitForSelector(".review-upcoming-row", { timeout: 10000 });
const t38Upcoming = await page.$eval(".review-upcoming-row", (el) => el.textContent ?? "");
check("T38 难题进入认知回看排期", t38Upcoming.includes("多解法测试题"), t38Upcoming.slice(0, 60));

const forceDue = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("math-problem-bank");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("problems", "readwrite");
          const store = tx.objectStore("problems");
          const get = store.getAll();
          get.onsuccess = () => {
            const p = get.result.find((x) => x.title.includes("多解法测试题"));
            if (p) {
              p.hardReview = {
                stuckAt: 0,
                nextReviewAt: Date.now() - 1000,
                reviewCount: 0,
                ease: 1,
              };
              const put = store.put(p);
              put.onsuccess = () => resolve();
              put.onerror = () => resolve();
            } else {
              resolve();
            }
          };
        };
        req.onerror = () => resolve();
      })
  );

const waitPersisted = (opts) =>
  page.evaluate(
    ({ difficulty, hasFutureReview, timeout }) =>
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const req = indexedDB.open("math-problem-bank");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("problems", "readonly");
            const store = tx.objectStore("problems");
            const get = store.getAll();
            get.onsuccess = () => {
              const p = get.result.find((x) => x.title.includes("多解法测试题"));
              const ok =
                !!p &&
                (difficulty == null || p.difficulty === difficulty) &&
                (!hasFutureReview || (p.hardReview?.nextReviewAt ?? 0) > Date.now());
              if (ok) return resolve();
              if (Date.now() - started > timeout) return resolve();
              setTimeout(tick, 150);
            };
            get.onerror = () => setTimeout(tick, 150);
          };
          req.onerror = () => setTimeout(tick, 150);
        };
        tick();
      }),
    opts
  );

// 记录「这次觉得难度」再点击记录按钮
const setFelt = async (n) => {
  await page.evaluate((level) => {
    const dots = Array.from(
      document.querySelectorAll(".hard-review-card .felt-dots .felt-dot")
    );
    dots.find((d) => d.textContent.trim() === String(level))?.click();
  }, n);
  await sleep(200);
};
await waitPersisted({ difficulty: 5, hasFutureReview: true });
await forceDue();
await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
await clickByText(".nav-item", "认知回看", false);
await page.waitForSelector(".hard-review-card", { timeout: 10000 });
await setFelt(4);
await page.click(".hard-review-card .review-actions .btn-primary");
await page.waitForFunction(() => document.querySelectorAll(".hard-review-card").length === 0, {
  timeout: 10000,
});
check("T38b 觉得难度 4 · 降档后离开到期区", true);
await waitPersisted({ difficulty: 4, hasFutureReview: true });
await forceDue();
await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
await clickByText(".nav-item", "认知回看", false);
await page.waitForSelector(".hard-review-card", { timeout: 10000 });
await setFelt(3);
await page.click(".hard-review-card .review-actions .btn-primary");
await page.waitForFunction(() => document.querySelectorAll(".hard-review-card").length === 0, {
  timeout: 10000,
});
const t38Empty = await page.evaluate(
  () => document.querySelector(".empty h3")?.textContent ?? ""
);
check("T38c 觉得难度 3 · 毕业", t38Empty.includes("没有待认知回看"), t38Empty);

// T31 一键清空全部数据
await page.evaluate(() => {
  Array.from(document.querySelectorAll(".sidebar button"))
    .find((b) => b.textContent.includes("备份与恢复"))
    ?.click();
});
await page.waitForSelector(".backup-sheet");
await clickByText(".backup-sheet .btn-danger", "清空全部题目与方法");
await page.waitForSelector(".dialog-card");
await clickByText(".dialog-actions .btn", "清空全部");
await page.waitForFunction(
  () =>
    Array.from(document.querySelectorAll(".backup-msg.ok")).some((el) =>
      el.textContent.includes("已清空")
    ),
  { timeout: 15000 }
);
const t31Msg = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll(".backup-msg.ok"));
  return els[els.length - 1]?.textContent ?? "";
});
check("T31 一键清空成功", t31Msg.includes("已清空"), t31Msg);
await page.keyboard.press("Escape");
await sleep(500);
await clickByText(".nav-item", "题库", false);
await page.waitForSelector(".empty", { timeout: 10000 });
check("T31b 清空后题库为空", (await page.$$(".card")).length === 0);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  ${r.detail ?? ""}`);
if (errors.length) console.log("BROWSER ERRORS:\n" + errors.join("\n"));
console.log(failed.length === 0 && errors.length === 0 ? "ALL E2E PASSED" : `${failed.length} E2E FAILED`);
await browser.close();
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
