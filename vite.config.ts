import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-ignore 局域网地址探测（Node 端）
import { handleNetInfo } from "./scripts/netinfo.mjs";
// @ts-ignore 局域网数据桥（Node 端）
import { handleBridge } from "./scripts/bridge.mjs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "lan-sync",
      configureServer(server) {
        server.middlewares.use("/api/netinfo", (req, res) => {
          handleNetInfo(req, res);
        });
        server.middlewares.use("/api/bridge", (req, res) => {
          handleBridge(req, res);
        });
      },
    },
  ],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
