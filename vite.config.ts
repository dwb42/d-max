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
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          if (id.includes("/livekit-client/") || id.includes("/@livekit/")) {
            return "vendor-livekit";
          }
          if (id.includes("/lucide-react/")) {
            return "vendor-icons";
          }
          return "vendor";
        }
      }
    }
  }
});
