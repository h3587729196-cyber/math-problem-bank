// 零依赖本地静态服务器：服务 dist 目录，默认端口 5173（与开发端口一致，数据互通）
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { readFile, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleNetInfo } from "./netinfo.mjs";
import { handleBridge } from "./bridge.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, "../dist");
const pidFile = path.resolve(dirname, "../.serve.pid");
const startPort = Number(process.env.PORT ?? 5173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".zip": "application/zip",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/netinfo") {
      handleNetInfo(req, res);
      return;
    }
    if (url.pathname.startsWith("/api/bridge")) {
      handleBridge(req, res);
      return;
    }
    let filePath = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    let info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      filePath = path.join(root, "index.html");
      info = await stat(filePath);
    }
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": TYPES[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Server error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

let port = startPort;

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout) => resolve(err ? "" : String(stdout)));
  });
}

async function ownerPid(targetPort) {
  const out = await run("netstat -ano");
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/\s*TCP\s+(\S+):(\d+)\s+(\S+):0\s+LISTENING\s+(\d+)/);
    if (m && Number(m[2]) === targetPort) return Number(m[4]);
  }
  return null;
}

// 用 PID 文件识别“本项目的旧实例”：它占用起始端口时，自动接管
async function reclaimOldServer() {
  try {
    const oldPid = Number((await readFile(pidFile, "utf8")).trim());
    if (oldPid && oldPid !== process.pid) {
      const pidOnPort = await ownerPid(startPort);
      if (pidOnPort === oldPid) {
        try {
          process.kill(oldPid, "SIGKILL");
        } catch {
          // 已退出
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } catch {
    // 没有 PID 文件，无需处理
  }
  await writeFile(pidFile, String(process.pid), "utf8").catch(() => {});
}

function tryListen() {
  server.removeAllListeners("listening");
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && port < startPort + 10) {
      port += 1;
      tryListen();
      return;
    }
    console.error(`[ERROR] Cannot start server: ${err.message}`);
    process.exit(1);
  });
  server.once("listening", () => {
    const url = `http://localhost:${port}`;
    console.log(`Math bank is running: ${url}`);
    if (port !== startPort) {
      console.log(
        `NOTE: port ${startPort} is busy, so we are using ${port} instead.`
      );
      console.log(
        `      Data is stored per port. If your problems live on http://localhost:${startPort}, stop the program using that port and restart.`
      );
    }
    console.log("Press Ctrl+C to stop.");
    if (!process.env.NO_OPEN) {
      import("node:child_process").then(({ exec }) => {
        exec(`start "" "${url}"`);
      });
    }
  });
  server.listen(port);
}

process.on("exit", () => {
  unlink(pidFile).catch(() => {});
});

await reclaimOldServer();
tryListen();
