import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.DMAX_API_PORT ?? "3088";
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/health": apiTarget
    }
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true
  }
});
