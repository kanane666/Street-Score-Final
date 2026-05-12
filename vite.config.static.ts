import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Static SPA build for Vercel / Netlify / any static host.
// Outputs to ./dist with index.html at the root.
// Run with: npm run build:static
export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    tsconfigPaths(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      manifest: {
        name: "StreetScore",
        short_name: "StreetScore",
        description: "Tableau d'affichage de basket-ball, prêt pour le match",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "landscape",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html", networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
    },
  },
});
