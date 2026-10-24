import { defineConfig } from "vite";

// Loaded at serve time so Vite doesn't treat the parser as part of its config and restart when it changes.
const api = () => import(/* @vite-ignore */ new URL("./workbench/api.js", import.meta.url).href);

export default defineConfig({
  root: "workbench",
  plugins: [
    {
      name: "beta-interpreter-workbench-api",
      async configureServer(server) {
        (await api()).workbenchApi().configureServer(server);
      },
    },
  ],
  server: { host: "localhost", port: 5174, strictPort: true, watch: { ignored: ["**/vocabulary/**", "**/data/**"] } },
});
