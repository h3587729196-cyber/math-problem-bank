/* ============================================================
 * 液态玻璃 · 透镜折射核心
 *
 * 原理（源自 Apple Liquid Glass 的公开逆向工程，shuding/childrentime）：
 * 玻璃不是「画上去的高光」，而是对背景像素的真实折射——
 * 1. 用圆角矩形 SDF 描述玻璃形状
 * 2. smoothStep 计算每个像素的位移：边缘像素被「拉向中心」，
 *    中心几乎不动，形成放大镜般的聚焦与边缘弯曲
 * 3. 把位移向量编码进 R（水平）/G（垂直）通道，生成位移图
 * 4. SVG feDisplacementMap 按位移图真实移动背景像素
 * 5. backdrop-filter: url(#lq-lens) blur() contrast() brightness() saturate()
 *
 * 本模块在运行时生成位移图并注入 SVG 滤镜，全应用共用。
 * ========================================================== */

const FILTER_ID = "lq-lens";
const MAP_SIZE = 256;

function smoothStep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

function length2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** 圆角矩形有符号距离场（单位空间，中心为原点） */
function roundedRectSDF(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  radius: number
): number {
  const qx = Math.abs(x) - halfW + radius;
  const qy = Math.abs(y) - halfH + radius;
  return (
    Math.min(Math.max(qx, qy), 0) +
    length2(Math.max(qx, 0), Math.max(qy, 0)) -
    radius
  );
}

function buildMap(): { dataUrl: string; maxScale: number } {
  const canvas = document.createElement("canvas");
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(MAP_SIZE, MAP_SIZE);
  const data = img.data;

  // 第一遍：计算每个像素的位移（拉向中心）
  const dxs = new Float32Array(MAP_SIZE * MAP_SIZE);
  const dys = new Float32Array(MAP_SIZE * MAP_SIZE);
  let maxScale = 0;
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const ux = x / MAP_SIZE - 0.5;
      const uy = y / MAP_SIZE - 0.5;
      // 玻璃边界（单位空间）：圆角矩形，边缘略内收
      const sdf = roundedRectSDF(ux, uy, 0.46, 0.46, 0.24);
      // 位移强度：边缘带最强，中心与远处为 0
      const displacement = smoothStep(0.55, 0.02, sdf - 0.06);
      const scaled = smoothStep(0, 1, displacement);
      // 新采样位置 = uv * scaled + (1-scaled) * 0.5 → 边缘像素采样自更靠近中心的内容
      const dx = (ux * scaled + (1 - scaled) * 0.5) * MAP_SIZE - x;
      const dy = (uy * scaled + (1 - scaled) * 0.5) * MAP_SIZE - y;
      dxs[y * MAP_SIZE + x] = dx;
      dys[y * MAP_SIZE + x] = dy;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
    }
  }
  maxScale = Math.max(1, maxScale);

  // 第二遍：编码进 R（水平）/ G（垂直），128 = 不动
  for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) {
    data[i * 4] = Math.round((dxs[i] / maxScale + 0.5) * 255);
    data[i * 4 + 1] = Math.round((dys[i] / maxScale + 0.5) * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { dataUrl: canvas.toDataURL(), maxScale };
}

/** 安装全局透镜滤镜（幂等），返回滤镜 URL */
export function installLiquidLens(): string {
  if (document.getElementById(FILTER_ID)) return "url(#" + FILTER_ID + ")";

  const { dataUrl } = buildMap();
  // 位移强度（bbox 单位）：channel = dx/maxScale + 0.5，
  // feDisplacementMap 位移 = (channel-0.5) × 2 × scale（元素尺寸比例），
  // 边缘最大拉移 ≈ 2 × scale；0.03 → 6%，轻微透镜感、无可见错位
  const scale = 0.03;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("style", "position:absolute;width:0;height:0");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.setAttribute("id", FILTER_ID);
  filter.setAttribute("x", "-20%");
  filter.setAttribute("y", "-20%");
  filter.setAttribute("width", "140%");
  filter.setAttribute("height", "140%");
  filter.setAttribute("colorInterpolationFilters", "sRGB");
  // 关键：bbox 坐标空间，位移图与元素边界精确对齐
  filter.setAttribute("primitiveUnits", "objectBoundingBox");

  const feImage = document.createElementNS("http://www.w3.org/2000/svg", "feImage");
  feImage.setAttribute("id", FILTER_ID + "-map");
  feImage.setAttribute("href", dataUrl);
  feImage.setAttribute("preserveAspectRatio", "none");
  feImage.setAttribute("x", "0");
  feImage.setAttribute("y", "0");
  feImage.setAttribute("width", "1");
  feImage.setAttribute("height", "1");
  feImage.setAttribute("result", "lqmap");

  const feDisp = document.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
  feDisp.setAttribute("in", "SourceGraphic");
  feDisp.setAttribute("in2", "lqmap");
  feDisp.setAttribute("xChannelSelector", "R");
  feDisp.setAttribute("yChannelSelector", "G");
  feDisp.setAttribute("scale", String(scale));

  filter.appendChild(feImage);
  filter.appendChild(feDisp);
  defs.appendChild(filter);
  svg.appendChild(defs);
  document.body.appendChild(svg);

  return "url(#" + FILTER_ID + ")";
}
