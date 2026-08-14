import QRCode from "qrcode";

/**
 * 生成苹果风格（深灰模块 + 白底）的二维码，返回 PNG data URL。
 * 用 <img> 渲染，避免把 SVG 字符串通过 innerHTML 注入页面（消除 XSS 通道）。
 */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 260,
    color: { dark: "#1d1d1f", light: "#ffffff" },
  });
}
