import type {
  Method,
  MethodImage,
  Problem,
  ProblemImage,
  ProblemSolution,
  ReviewInfo,
  SolutionSimplicity,
  ThoughtStep,
} from "../types";
import { db, STORES } from "./idb";
import { toThoughtStep } from "../utils/steps";
import { makeZip, readZip, type ZipEntry } from "../utils/zip";
import { readBackupSettings, type BackupSettings } from "./settings";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface BackupImageMeta {
  id: string;
  kind: ProblemImage["kind"];
  caption: string;
  file: string;
  type: string;
}

export interface BackupProblem {
  id: string;
  title: string;
  status: Problem["status"];
  difficulty: Problem["difficulty"];
  source: string;
  tags: string[];
  images: BackupImageMeta[];
  solutions: BackupSolution[];
  methodLinks: Problem["methodLinks"];
  thoughtSteps?: ThoughtStep[];
  review?: ReviewInfo;
  createdAt: number;
  updatedAt: number;
}

export interface BackupSolutionImage {
  id: string;
  caption: string;
  file: string;
  type: string;
}

export interface BackupSolution {
  id: string;
  label: string;
  steps: ThoughtStep[];
  image: BackupSolutionImage | null;
  simplicity: SolutionSimplicity;
  clever: boolean;
}

export interface BackupMethodImageMeta {
  id: string;
  caption: string;
  file: string;
  type: string;
}

export interface BackupMethod extends Omit<Method, "images"> {
  images: BackupMethodImageMeta[];
}

export interface BackupFile {
  app: string;
  version: 3;
  exportedAt: string;
  problems: BackupProblem[];
  methods: BackupMethod[];
  settings?: BackupSettings;
}

/** 旧版 JSON 备份（图片为 base64 dataUrl），用于兼容导入 */
interface LegacyBackupImage {
  id: string;
  kind: ProblemImage["kind"];
  caption: string;
  dataUrl: string;
}

interface LegacyBackupFile {
  app: string;
  version?: number;
  problems: Array<Omit<BackupProblem, "images"> & { images: LegacyBackupImage[] }>;
  methods: Array<Omit<BackupMethod, "images"> & { images: Array<{ id: string; caption: string; dataUrl: string }> }>;
}

function problemImagePath(problemId: string, imageId: string, blob: Blob): string {
  return `images/${problemId}/${imageId}.${extFromBlob(blob)}`;
}

function solutionImagePath(problemId: string, imageId: string, blob: Blob): string {
  return `images/${problemId}/solution-${imageId}.${extFromBlob(blob)}`;
}

function methodImagePath(methodId: string, imageId: string, blob: Blob): string {
  return `methods/${methodId}/${imageId}.${extFromBlob(blob)}`;
}

export async function buildBackupBlob(
  onProgress?: (done: number, total: number, label: string) => void
): Promise<{ blob: Blob; problems: number; methods: number; images: number }> {
  const [problems, methods] = await Promise.all([
    db.all<Problem>(STORES.PROBLEMS),
    db.all<Method>(STORES.METHODS),
  ]);
  const entries: ZipEntry[] = [];
  let images = 0;

  for (const p of problems) {
    for (const img of p.images) {
      entries.push({
        name: problemImagePath(p.id, img.id, img.blob),
        data: new Uint8Array(await img.blob.arrayBuffer()),
      });
      images += 1;
    }
    for (const sol of p.solutions ?? []) {
      if (!sol.image) continue;
      entries.push({
        name: solutionImagePath(p.id, sol.image.id, sol.image.blob),
        data: new Uint8Array(await sol.image.blob.arrayBuffer()),
      });
      images += 1;
    }
  }
  for (const m of methods) {
    for (const img of m.images) {
      entries.push({
        name: methodImagePath(m.id, img.id, img.blob),
        data: new Uint8Array(await img.blob.arrayBuffer()),
      });
      images += 1;
    }
  }

  const manifest: BackupFile = {
    app: "math-problem-bank",
    version: 3,
    exportedAt: new Date().toISOString(),
    settings: readBackupSettings(),
    problems: problems.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      difficulty: p.difficulty,
      source: p.source,
      tags: p.tags,
      methodLinks: p.methodLinks,
      review: p.review,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      images: p.images.map((img) => ({
        id: img.id,
        kind: img.kind,
        caption: img.caption,
        file: problemImagePath(p.id, img.id, img.blob),
        type: img.blob.type,
      })),
      solutions: (p.solutions ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        steps: s.steps.map(toThoughtStep),
        simplicity: s.simplicity,
        clever: s.clever,
        image: s.image
          ? {
              id: s.image.id,
              caption: s.image.caption,
              file: solutionImagePath(p.id, s.image.id, s.image.blob),
              type: s.image.blob.type,
            }
          : null,
      })),
    })),
    methods: methods.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      signal: m.signal,
      tags: m.tags,
      steps: m.steps,
      pitfalls: m.pitfalls,
      images: m.images.map((img) => ({
        id: img.id,
        caption: img.caption,
        file: methodImagePath(m.id, img.id, img.blob),
        type: img.blob.type,
      })),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
  };
  entries.push({
    name: "manifest.json",
    data: textEncoder.encode(JSON.stringify(manifest, null, 2)),
  });

  const blob = await makeZip(entries, onProgress);
  return { blob, problems: problems.length, methods: methods.length, images };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function blobFromBytes(bytes: Uint8Array, type: string): Promise<Blob> {
  return new Blob([bytes as BlobPart], { type: type || "application/octet-stream" });
}

async function zipToData(
  file: File,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<{ problems: Problem[]; methods: Method[]; settings?: BackupSettings }> {
  const entries = await readZip(file, onProgress);
  const manifestRaw = entries.get("manifest.json");
  if (!manifestRaw) throw new Error("备份文件缺少清单（manifest.json）");

  const backup = JSON.parse(textDecoder.decode(manifestRaw)) as BackupFile;
  if (
    backup.app !== "math-problem-bank" ||
    !Array.isArray(backup.problems) ||
    !Array.isArray(backup.methods)
  ) {
    throw new Error("不是有效的难题库备份文件");
  }

  const allImages = [
    ...backup.problems.flatMap((p) => [
      ...p.images.map((i) => ({ ...i, owner: "problem" as const })),
      ...(p.solutions ?? []).flatMap((s) =>
        s.image ? [{ ...s.image, owner: "solution" as const }] : []
      ),
    ]),
    ...backup.methods.flatMap((m) =>
      (m.images ?? []).map((i) => ({ ...i, owner: "method" as const }))
    ),
  ];
  let done = 0;
  const report = (label: string) =>
    onProgress?.(done, allImages.length, `${label} ${done}/${allImages.length}`);

  const problems: Problem[] = [];
  for (const p of backup.problems) {
    const images: ProblemImage[] = [];
    for (const img of p.images ?? []) {
      const bytes = entries.get(img.file);
      if (!bytes) throw new Error(`备份缺少图片：${img.file}`);
      images.push({
        id: img.id,
        kind: img.kind,
        caption: img.caption,
        blob: await blobFromBytes(bytes, img.type),
      });
      done += 1;
      report("正在还原图片");
    }
    const solutions: ProblemSolution[] = [];
    if (Array.isArray(p.solutions) && p.solutions.length > 0) {
      for (const s of p.solutions) {
        let image: ProblemSolution["image"] = null;
        if (s.image) {
          const bytes = entries.get(s.image.file);
          if (!bytes) throw new Error(`备份缺少图片：${s.image.file}`);
          image = {
            id: s.image.id,
            caption: s.image.caption ?? "",
            blob: await blobFromBytes(bytes, s.image.type),
          };
          done += 1;
          report("正在还原图片");
        }
        solutions.push({
          id: s.id,
          label: s.label || "解法一",
          steps: (s.steps ?? []).map(toThoughtStep),
          simplicity:
            s.simplicity === 1 || s.simplicity === 2 || s.simplicity === 3
              ? s.simplicity
              : 2,
          clever: s.clever === true,
          image,
        });
      }
    }
    problems.push({
      id: p.id,
      title: p.title,
      status: p.status,
      difficulty: p.difficulty,
      source: p.source,
      tags: p.tags,
      images,
      solutions,
      methodLinks: p.methodLinks ?? [],
      thoughtSteps: (p.thoughtSteps ?? []).map(toThoughtStep),
      review: p.review,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }

  const methods: Method[] = [];
  for (const m of backup.methods) {
    const images: MethodImage[] = [];
    for (const img of m.images ?? []) {
      const bytes = entries.get(img.file);
      if (!bytes) throw new Error(`备份缺少图片：${img.file}`);
      images.push({
        id: img.id,
        caption: img.caption,
        blob: await blobFromBytes(bytes, img.type),
      });
      done += 1;
      report("正在还原图片");
    }
    methods.push({
      id: m.id,
      name: m.name,
      description: m.description,
      signal: m.signal,
      tags: m.tags,
      steps: m.steps ?? [],
      pitfalls: m.pitfalls ?? "",
      images,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    });
  }
  return { problems, methods, settings: backup.settings };
}

async function legacyJsonToData(
  file: File,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<{ problems: Problem[]; methods: Method[]; settings?: BackupSettings }> {
  const text = await file.text();
  const data = JSON.parse(text) as LegacyBackupFile;
  if (
    data.app !== "math-problem-bank" ||
    !Array.isArray(data.problems) ||
    !Array.isArray(data.methods)
  ) {
    throw new Error("不是有效的难题库备份文件");
  }
  onProgress?.(1, 1, "正在读取旧版备份");
  const problems: Problem[] = await Promise.all(
    data.problems.map(async (p) => {
      const images: ProblemImage[] = await Promise.all(
        (p.images ?? []).map(async (img) => ({
          id: img.id,
          kind: img.kind,
          caption: img.caption,
          blob: await (await fetch(img.dataUrl)).blob(),
        }))
      );
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        difficulty: p.difficulty,
        source: p.source,
        tags: p.tags,
        images,
        solutions: [],
        methodLinks: p.methodLinks ?? [],
        thoughtSteps: (p.thoughtSteps ?? []).map(toThoughtStep),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    })
  );
  const methods: Method[] = await Promise.all(
    data.methods.map(async (m) => {
      const images: MethodImage[] = await Promise.all(
        (m.images ?? []).map(async (img) => ({
          id: img.id,
          caption: img.caption,
          blob: await (await fetch(img.dataUrl)).blob(),
        }))
      );
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        signal: m.signal,
        tags: m.tags,
        steps: m.steps ?? [],
        pitfalls: m.pitfalls ?? "",
        images,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    })
  );
  return { problems, methods, settings: undefined };
}

export async function backupFileToData(
  file: File,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<{ problems: Problem[]; methods: Method[]; settings?: BackupSettings }> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) {
    return zipToData(file, onProgress);
  }
  return legacyJsonToData(file, onProgress);
}

function extFromBlob(blob: Blob): string {
  const t = blob.type;
  if (t.includes("jpeg")) return "jpg";
  if (t.includes("png")) return "png";
  if (t.includes("svg")) return "svg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  return "png";
}

function sanitizeName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function imageFileName(img: ProblemImage): string {
  return blobFileName(img.caption || (img.kind === "problem" ? "题干" : "思路"), img.blob);
}

export function blobFileName(caption: string, blob: Blob): string {
  const base = sanitizeName(caption || "image") || "image";
  return `${base}.${extFromBlob(blob)}`;
}

export async function exportProblemImages(
  problem: Problem
): Promise<"saved" | "cancelled" | "downloaded"> {
  const picker = (window as Window & { showDirectoryPicker?: unknown })
    .showDirectoryPicker;
  if (typeof picker === "function") {
    try {
      const dir = await (
        picker as (opts: { mode: string }) => Promise<{
          getFileHandle: (
            name: string,
            opts?: { create?: boolean }
          ) => Promise<{
            createWritable: () => Promise<{
              write: (data: Blob | string) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        }>
      ).call(window, { mode: "readwrite" });

      const idPrefix = problem.id.slice(0, 8);
      const readme =
        `# ${problem.title}\n\n` +
        `导出时间：${new Date().toLocaleString("zh-CN")}\n` +
        `来源：${problem.source || "—"}\n` +
        `标签：${problem.tags.join("、") || "—"}\n` +
        `状态：${problem.status === "solved" ? "已解" : problem.status === "stuck" ? "卡住" : "待做"}\n` +
        `难度：${problem.difficulty}/5\n` +
        `关联方法：${
          problem.methodLinks.length > 0
            ? problem.methodLinks.map((l) => l.methodId).join("、")
            : "—"
        }\n`;
      const readmeHandle = await dir.getFileHandle("00-说明.txt", { create: true });
      const readmeWriter = await readmeHandle.createWritable();
      await readmeWriter.write(readme);
      await readmeWriter.close();

      let imageIndex = 0;
      for (const img of problem.images) {
        if (img.kind !== "problem") continue;
        imageIndex += 1;
        const ext = extFromBlob(img.blob);
        const caption = sanitizeName(img.caption);
        const name = `${idPrefix}-01-题干${caption ? "-" + caption : ""}.${ext}`;
        const handle = await dir.getFileHandle(name, { create: true });
        const writer = await handle.createWritable();
        await writer.write(img.blob);
        await writer.close();
      }
      for (const sol of problem.solutions ?? []) {
        if (!sol.image) continue;
        imageIndex += 1;
        const ext = extFromBlob(sol.image.blob);
        const caption = sanitizeName(sol.image.caption);
        const label = sanitizeName(sol.label) || "思路";
        const name = `${idPrefix}-${String(imageIndex).padStart(2, "0")}-${label}${
          caption ? "-" + caption : ""
        }.${ext}`;
        const handle = await dir.getFileHandle(name, { create: true });
        const writer = await handle.createWritable();
        await writer.write(sol.image.blob);
        await writer.close();
      }
      return "saved";
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return "cancelled";
      throw err;
    }
  }

  for (const img of problem.images) {
    downloadBlob(
      img.blob,
      `${sanitizeName(problem.title)}-${problem.id.slice(0, 8)}-${imageFileName(img)}`
    );
  }
  for (const sol of problem.solutions ?? []) {
    if (!sol.image) continue;
    downloadBlob(
      sol.image.blob,
      `${sanitizeName(problem.title)}-${problem.id.slice(0, 8)}-${sanitizeName(sol.label) || "思路"}-${
        blobFileName(sol.image.caption, sol.image.blob)
      }`
    );
  }
  return "downloaded";
}
