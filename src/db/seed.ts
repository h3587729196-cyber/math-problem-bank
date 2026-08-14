import { db, STORES } from "./idb";
import type {
  Method,
  MethodImage,
  Problem,
  ProblemImage,
  ProblemMethodLink,
  SolutionImage,
  ThoughtStep,
} from "../types";
import { newId, uid } from "../utils/id";

const FONT =
  "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";

function makeSvg(title: string, body: string[], height = 440): Blob {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}">`,
    `<rect width="900" height="${height}" rx="30" fill="#ffffff"/>`,
    `<rect x="18" y="18" width="864" height="${height - 36}" rx="22" fill="none" stroke="#e8e8ed" stroke-width="2"/>`,
    `<text x="450" y="84" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="650" fill="#1d1d1f">${title}</text>`,
  ];
  body.forEach((line, i) => {
    const y = 150 + i * 50;
    parts.push(
      `<text x="450" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="26" fill="#3a3a3c">${line}</text>`
    );
  });
  parts.push("</svg>");
  return new Blob(parts, { type: "image/svg+xml" });
}

function img(
  kind: ProblemImage["kind"],
  caption: string,
  title: string,
  body: string[],
  height?: number
): ProblemImage {
  return { id: uid(), kind, caption, blob: makeSvg(title, body, height) };
}

function solImg(caption: string, title: string, body: string[], height = 320): SolutionImage {
  return { id: uid(), caption, blob: makeSvg(title, body, height) };
}

function methodImg(caption: string, body: string[], height = 320): MethodImage {
  return { id: uid(), caption, blob: makeSvg(caption, body, height) };
}

function step(
  text: string,
  starred = false,
  cleverness: ThoughtStep["cleverness"] = 1
): ThoughtStep {
  return { id: uid(), text, starred, cleverness };
}

function seedProblems(link: { sym: string; tan: string; seq: string }): Problem[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const linkTo = (methodId: string, note: string): ProblemMethodLink => ({
    id: uid(),
    methodId,
    role: "core",
    note,
  });

  const a: Problem = {
    id: newId(),
    title: "对称式的值：a+b=1, a²+b²=2，求 a³+b³",
    status: "solved",
    difficulty: 2,
    source: "课后提升",
    tags: ["代数", "对称式", "立方和"],
    methodLinks: [linkTo(link.sym, "看到对称式条件，先求基本对称量 ab 再代回")],
    images: [
      img(
        "problem",
        "题干",
        "已知 a + b = 1，a² + b² = 2，求 a³ + b³。",
        ["已知：a + b = 1", "      a² + b² = 2", "", "求：a³ + b³ = ？"]
      ),
    ],
    solutions: [
      {
        id: uid(),
        label: "解法一 · 整体代换",
        simplicity: 1,
        clever: true,
        steps: [
          step("由 (a+b)² = a²+b²+2ab 求出 ab = −1/2", true, 4),
          step("用立方和公式 a³+b³ = (a+b)(a²−ab+b²)"),
          step("代入 a+b=1、a²+b²=2，得 a³+b³ = 5/2"),
        ],
        image: solImg(
          "整体代换示意",
          "思路 · 先求 ab 再整体代入",
          ["a³ + b³ = (a + b)(a² − ab + b²)", "", "ab = ((a+b)² − (a²+b²)) / 2 = −1/2"],
          360
        ),
      },
    ],
    createdAt: now - 3 * day,
    updatedAt: now - 2 * day,
  };

  const b: Problem = {
    id: newId(),
    title: "导数切线放缩：证明 eˣ ≥ x + 1",
    status: "solved",
    difficulty: 3,
    source: "真题改编",
    tags: ["导数", "切线放缩", "不等式"],
    methodLinks: [linkTo(link.tan, "指数不等式证明，构造函数找最小值")],
    images: [
      img(
        "problem",
        "题干",
        "证明：对任意实数 x，eˣ ≥ x + 1",
        ["证明：对任意实数 x，恒有", "", "      eˣ ≥ x + 1", "", "（当且仅当 x = 0 时取等号）"]
      ),
    ],
    solutions: [
      {
        id: uid(),
        label: "解法一 · 单调性",
        simplicity: 2,
        clever: false,
        steps: [
          step("移项构造函数 f(x) = eˣ − x − 1"),
          step("求导 f′(x) = eˣ − 1，x = 0 是最小值点"),
          step("由 f(x) ≥ f(0) = 0 得证"),
        ],
        image: solImg(
          "单调性示意",
          "思路 · 研究单调性找最小值",
          ["f′(x) = eˣ − 1", "x < 0 递减，x > 0 递增", "f(x) ≥ f(0) = 0"],
          360
        ),
      },
    ],
    createdAt: now - 7 * day,
    updatedAt: now - 6 * day,
  };

  const c: Problem = {
    id: newId(),
    title: "构造新数列求通项：aₙ₊₁ = 2aₙ + 1",
    status: "stuck",
    difficulty: 2,
    source: "数列专题",
    tags: ["数列", "构造法"],
    methodLinks: [linkTo(link.seq, "一阶线性递推配凑常数化为等比")],
    images: [
      img(
        "problem",
        "题干",
        "已知 a₁ = 1，aₙ₊₁ = 2aₙ + 1，求通项公式 aₙ",
        ["数列 {aₙ} 满足：", "a₁ = 1", "aₙ₊₁ = 2aₙ + 1", "", "求通项公式 aₙ"]
      ),
    ],
    solutions: [
      {
        id: uid(),
        label: "解法一 · 配凑常数",
        simplicity: 1,
        clever: true,
        steps: [
          step("设 aₙ₊₁ + λ = 2(aₙ + λ)，对比常数得 λ = 1"),
          step("令 bₙ = aₙ + 1，化为等比数列，bₙ = 2ⁿ"),
          step("还原 aₙ = 2ⁿ − 1"),
        ],
        image: solImg(
          "配凑示意",
          "思路 · 配凑常数化为等比",
          ["aₙ₊₁ + λ = 2(aₙ + λ)", "λ = 1", "bₙ = aₙ + 1 = 2ⁿ"],
          360
        ),
      },
    ],
    createdAt: now - 1 * day,
    updatedAt: now - 1 * day,
  };

  return [a, b, c];
}

function seedMethods(): Method[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return [
    {
      id: newId(),
      name: "对称式：先算基本对称量",
      description:
        "条件与结论都是关于若干个变量的对称多项式时，先求最基本的对称量（如两变量的和与积），再逐层代回高阶表达式。",
      signal: "看到 a+b、a²+b²、a³+b³ 这类对称条件，立刻想用 (a+b)² 与 ab 表示一切。",
      tags: ["代数", "对称式", "立方和"],
      steps: [
        "由 (a+b)² 与 a²+b² 求出 ab",
        "用对称多项式把目标式写成和与积的组合",
        "代入并化简",
      ],
      pitfalls: "ab 可能为负，代入时保留符号；不要把 a³+b³ 与 (a+b)³ 混淆。",
      images: [
        methodImg("公式示意", [
          "a³ + b³ = (a + b)(a² − ab + b²)",
          "",
          "先算 ab = ((a+b)² − (a²+b²)) / 2",
        ]),
      ],
      mastery: { level: 3, updatedAt: now - 4 * day },
      createdAt: now - 5 * day,
      updatedAt: now - 4 * day,
    },
    {
      id: newId(),
      name: "切线放缩（eˣ ≥ x+1）",
      description:
        "对凸函数，其在某点的切线是全局下界。指数函数在 (0,1) 处的切线给出常用不等式 eˣ ≥ x + 1，对数同理 ln x ≤ x − 1。",
      signal: "含 eˣ 或 ln x 的不等式证明，且等号容易在 x=0 或 x=1 取到。",
      tags: ["导数", "切线放缩", "不等式"],
      steps: [
        "构造函数 f(x) = eˣ − x − 1",
        "求导并找到最小值点 x = 0",
        "说明取等条件，下结论",
      ],
      pitfalls: "放缩方向别反：凸函数用切线作下界；使用前确认函数凹凸性。",
      images: [
        methodImg("函数示意", [
          "f(x) = eˣ − x − 1",
          "f′(x) = eˣ − 1",
          "x = 0 处取最小值 0",
        ]),
      ],
      mastery: { level: 4, updatedAt: now - 5 * day },
      createdAt: now - 6 * day,
      updatedAt: now - 5 * day,
    },
    {
      id: newId(),
      name: "构造新数列（一阶线性递推）",
      description:
        "形如 aₙ₊₁ = p·aₙ + q 的递推，配凑常数 λ 使 aₙ₊₁ + λ = p(aₙ + λ)，从而化为等比数列，再还原通项。",
      signal: "递推式右边是上一项项的线性式加上常数。",
      tags: ["数列", "构造法"],
      steps: [
        "设 aₙ₊₁ + λ = p(aₙ + λ)，对比常数求 λ",
        "令 bₙ = aₙ + λ，化为等比数列",
        "写出 bₙ 通项，再还原 aₙ",
      ],
      pitfalls: "配凑时 λ 的符号最容易错，展开后要对比常数项验证。",
      images: [
        methodImg("配凑示意", [
          "aₙ₊₁ + λ = p(aₙ + λ)",
          "λ = q / (p − 1)",
        ]),
      ],
      createdAt: now - 2 * day,
      updatedAt: now - 2 * day,
    },
  ];
}

async function doSeed(): Promise<void> {
  const methods = seedMethods();
  await Promise.all(methods.map((m) => db.put(STORES.METHODS, m)));
  const problems = seedProblems({
    sym: methods[0].id,
    tan: methods[1].id,
    seq: methods[2].id,
  });
  await Promise.all(problems.map((p) => db.put(STORES.PROBLEMS, p)));
}

let seedPromise: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      if (localStorage.getItem("mb-seeded")) return;
      const [ps, ms] = await Promise.all([
        db.all<Problem>(STORES.PROBLEMS),
        db.all<Method>(STORES.METHODS),
      ]);
      if (ps.length > 0 || ms.length > 0) {
        localStorage.setItem("mb-seeded", "1");
        return;
      }
      await doSeed();
      localStorage.setItem("mb-seeded", "1");
    })();
  }
  return seedPromise;
}
