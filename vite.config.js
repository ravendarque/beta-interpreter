import { defineConfig } from "vite";

export default defineConfig({
  root: "workbench",
  plugins: [
    {
      name: "beta-interpreter-workbench-api",
      configureServer(server) {
        // Loaded through Vite so edits to the API or the parser apply without restarting the server.
        server.middlewares.use(async (req, res, next) => {
          const api = await server.ssrLoadModule("/api.js");
          await api.handle(req, res, next);
        });
      },
    },
  ],
  server: { host: "localhost", port: 5174, strictPort: true, watch: { ignored: ["**/vocabulary/**", "**/data/**"] } },
});
