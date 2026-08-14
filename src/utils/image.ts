const MAX_EDGE = 1920;
const QUALITY = 0.85;

/**
 * 录入时自动压缩图片：
 * - 超过 MAX_EDGE 的图片缩小到最长边 MAX_EDGE
 * - 照片类（jpeg）转成 jpeg；带透明通道的 png/webp 转成 webp
 * - svg/gif 保持原样（无法安全重编码）
 */
export async function processImageFile(file: File | Blob): Promise<Blob> {
  const type = file.type;
  if (type === "image/svg+xml" || type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && type === "image/jpeg") {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const hasAlpha = type === "image/png" || type === "image/webp";
    const outType = hasAlpha ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outType, QUALITY)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function processImageFiles(files: (File | Blob)[]): Promise<Blob[]> {
  return Promise.all(files.map((f) => processImageFile(f)));
}
