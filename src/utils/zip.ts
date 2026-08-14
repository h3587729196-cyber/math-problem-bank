const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<{ method: number; data: Uint8Array }> {
  if (typeof CompressionStream === "undefined") return { method: 0, data };
  try {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    return { method: 8, data: out };
  } catch {
    return { method: 0, data };
  }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持解压备份，请使用新版 Chrome/Edge");
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export async function makeZip(
  entries: ZipEntry[],
  onProgress?: (done: number, total: number, label: string) => void
): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const nameBytes = textEncoder.encode(entry.name);
    const { method, data: compressed } = await deflateRaw(entry.data);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, compressed);

    const centralEntry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralEntry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralEntry.set(nameBytes, 46);
    central.push(centralEntry);

    offset += local.length + compressed.length;
    onProgress?.(i + 1, total, `正在打包 ${i + 1}/${total}`);
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...chunks, ...central, eocd] as BlobPart[], {
    type: "application/zip",
  });
}

function findEocd(buf: Uint8Array): number {
  const minPos = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      return i;
    }
  }
  return -1;
}

export async function readZip(
  file: Blob,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<Map<string, Uint8Array>> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const eocdPos = findEocd(buf);
  if (eocdPos < 0) throw new Error("不是有效的备份文件");

  const ev = new DataView(buf.buffer, eocdPos, 22);
  const entryCount = ev.getUint16(10, true);
  const cdSize = ev.getUint32(12, true);
  const cdOffset = ev.getUint32(16, true);
  if (cdOffset + cdSize > buf.length) throw new Error("备份文件已损坏");

  const map = new Map<string, Uint8Array>();
  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    const header = new DataView(buf.buffer, pos, 46);
    if (header.getUint32(0, true) !== 0x02014b50) throw new Error("备份文件已损坏");
    const method = header.getUint16(10, true);
    const compSize = header.getUint32(20, true);
    const uncompSize = header.getUint32(24, true);
    const nameLen = header.getUint16(28, true);
    const extraLen = header.getUint16(30, true);
    const commentLen = header.getUint16(32, true);
    const localOffset = header.getUint32(42, true);
    const name = textDecoder.decode(buf.subarray(pos + 46, pos + 46 + nameLen));

    const lv = new DataView(buf.buffer, localOffset, 30);
    const lNameLen = lv.getUint16(26, true);
    const lExtraLen = lv.getUint16(28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = await inflateRaw(compressed);
    } else {
      throw new Error(`备份文件使用了不支持的压缩方式（${method}）`);
    }
    if (data.length !== uncompSize) throw new Error("备份文件已损坏");

    map.set(name, data);
    pos += 46 + nameLen + extraLen + commentLen;
    onProgress?.(i + 1, entryCount, `正在解析 ${i + 1}/${entryCount}`);
  }
  return map;
}
