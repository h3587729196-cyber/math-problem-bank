// 返回本机局域网 IPv4 地址，供“手机访问二维码”使用。
import os from "node:os";

export function handleNetInfo(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) {
      if (n.family === "IPv4" && !n.internal) candidates.push(n.address);
    }
  }
  const isPrivate = (ip) => {
    const p = ip.split(".").map(Number);
    if (p.length !== 4) return false;
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    return false;
  };
  const isReserved = (ip) => {
    const p = ip.split(".").map(Number);
    if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 127 || p[0] === 0) return true;
    return false;
  };
  // 优先普通局域网地址（192.168 / 10 / 172.16-31），避开虚拟网卡和保留网段
  const ip =
    candidates.find((x) => isPrivate(x) && !isReserved(x)) ??
    candidates.find((x) => !isReserved(x)) ??
    candidates[0] ??
    null;
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ip }));
}
