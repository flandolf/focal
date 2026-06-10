import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "vendor-charts"
          }
          if (id.includes("node_modules/framer-motion") || id.includes("node_modules/motion-")) {
            return "vendor-motion"
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix"
          }
          if (
            id.includes("node_modules/date-fns") ||
            id.includes("node_modules/react-day-picker")
          ) {
            return "vendor-dates"
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons"
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) {
            return "vendor-react"
          }
          return "vendor"
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
