import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // 直接输出到站点里的 load-forecast/ccm/，构建后即可部署
    outDir: "../../../ccm",
    emptyOutDir: true,
  },
});
