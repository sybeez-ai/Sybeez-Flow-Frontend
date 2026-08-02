import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = (env.VITE_API_URL || env.VITE_BACKEND_URL || "").trim();

  if (mode === "production") {
    if (!apiUrl) {
      throw new Error(
        "Production build requires VITE_API_URL or VITE_BACKEND_URL "
        + "(see frontend/.env.production.example).",
      );
    }
    if (
      /localhost|127\.0\.0\.1/i.test(apiUrl)
      && env.VITE_ALLOW_LOCALHOST_PROD !== "true"
    ) {
      throw new Error(
        "Production build refuses localhost API URL. "
        + "Set VITE_API_URL to https://flow-api.sybeez.ai "
        + "(or VITE_ALLOW_LOCALHOST_PROD=true for local prod smoke tests).",
      );
    }
  }

  return {
    server: {
      host: "::",
      port: 8081,
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
          ws: true,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
