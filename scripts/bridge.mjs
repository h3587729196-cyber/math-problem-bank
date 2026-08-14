// 局域网设备同步：把“最新题库备份”存在本地服务端，
// 电脑和手机（同一 WiFi）通过本地服务共享同一份数据。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// 局域网数据桥上传体积上限，防止异常/恶意的超大上传占满磁盘（DoS）。
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB

function dataDir() {
  return process.env.BRIDGE_DIR
    ? path.resolve(process.env.BRIDGE_DIR)
    : path.resolve(dirname, "../data");
}

function bridgeFile() {
  return path.join(dataDir(), "bridge-backup.zip");
}

export async function handleBridge(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  // vite 中间件会去掉 /api/bridge 前缀，serve 不会，两种都兼容
  const action = url.pathname.replace(/^\/api\/bridge\//, "").replace(/^\/+/, "");
  try {
    if (action === "info" && req.method === "GET") {
      const s = await stat(bridgeFile()).catch(() => null);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          exists: !!s,
          modified: s ? Math.round(s.mtimeMs) : null,
          size: s ? s.size : null,
        })
      );
      return;
    }
    if (action === "download" && req.method === "GET") {
      const data = await readFile(bridgeFile()).catch(() => null);
      if (!data) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-length": data.length,
      });
      res.end(data);
      return;
    }
    if (action === "upload" && req.method === "POST") {
      await mkdir(dataDir(), { recursive: true });
      const chunks = [];
      let received = 0;
      for await (const c of req) {
        received += c.length;
        if (received > MAX_UPLOAD_BYTES) {
          req.destroy();
          res.writeHead(413, { "content-type": "text/plain; charset=utf-8" });
          res.end("Payload Too Large");
          return;
        }
        chunks.push(c);
      }
      await writeFile(bridgeFile(), Buffer.concat(chunks));
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, modified: Date.now() }));
      return;
    }
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`bridge error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
