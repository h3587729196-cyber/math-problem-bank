import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { installLiquidLens } from "./utils/liquidGlass";

// 安全清理：移除历史版本以明文形式残留在浏览器里的网盘（WebDAV）凭据。
// 网盘同步功能已下线，这些字段（服务器地址/用户名/应用密码/加密口令）不再需要。
try {
  localStorage.removeItem("mb-sync-config");
  localStorage.removeItem("mb-sync-last-upload");
} catch {
  // localStorage 不可用时忽略
}

// 安装液态玻璃透镜滤镜（feDisplacementMap 折射背景像素）
try {
  installLiquidLens();
} catch {
  // 滤镜不可用时自动回退到纯模糊玻璃
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

