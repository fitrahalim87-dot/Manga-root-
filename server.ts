import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { generateRecapWithProviders, testProviderKey } from "./src/lib/geminiDirect";

dotenv.config();

// Disable HMR in AI Studio environment to prevent WebSocket closed without opened errors
process.env.DISABLE_HMR = "true";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Remove payload limits for base64 manga images upload
  app.use(express.json({ limit: Infinity }));
  app.use(express.urlencoded({ limit: Infinity, extended: true }));

  // API endpoint to test API Key connection for Google AI Studio, Kie.ai, and OpenRouter
  app.post("/api/test-key", async (req, res) => {
    const result = await testProviderKey(req.body || {});
    return res.status(result.status).json(result.body);
  });

  // API endpoint to generate manga recap scripts
  app.post("/api/recap", async (req, res) => {
    const result = await generateRecapWithProviders(req.body || {}, process.env.GEMINI_API_KEY || "");
    return res.status(result.status).json(result.body);
  });

  // Serve static files and integrate Vite in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: "spa",
    });

    // Prevent Vite's default client from attempting a WebSocket connection when HMR is disabled
    app.get("/@vite/client", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.send(`
        import "/node_modules/vite/dist/client/env.mjs";
        const sheetsMap = new Map();
        const cspNonce = "document" in globalThis ? document.querySelector("meta[property=csp-nonce]")?.nonce : undefined;
        let lastInsertedStyle;
        export function updateStyle(id, content) {
          let style = sheetsMap.get(id);
          if (!style) {
            style = document.createElement("style");
            style.setAttribute("type", "text/css");
            style.setAttribute("data-vite-dev-id", id);
            style.textContent = content;
            if (cspNonce) style.setAttribute("nonce", cspNonce);
            if (!lastInsertedStyle) {
              document.head.appendChild(style);
              setTimeout(() => { lastInsertedStyle = undefined; }, 0);
            } else {
              lastInsertedStyle.insertAdjacentElement("afterend", style);
            }
            lastInsertedStyle = style;
          } else {
            style.textContent = content;
          }
          sheetsMap.set(id, style);
        }
        export function removeStyle(id) {
          const style = sheetsMap.get(id);
          if (style) {
            document.head.removeChild(style);
            sheetsMap.delete(id);
          }
        }
        const noop = () => {};
        const dataMap = new Map();
        export function createHotContext(ownerPath) {
          if (!dataMap.has(ownerPath)) dataMap.set(ownerPath, {});
          return {
            get data() { return dataMap.get(ownerPath); },
            accept: noop,
            acceptExports: noop,
            dispose: noop,
            prune: noop,
            decline: noop,
            invalidate: noop,
            on: noop,
            off: noop,
            send: noop,
          };
        }
        export function injectQuery(url, queryToInject) {
          if (url[0] !== "." && url[0] !== "/") return url;
          const pathname = url.replace(/[?#].*$/, "");
          const { search, hash } = new URL(url, "http://vite.dev");
          return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
        }
        export class ErrorOverlay { constructor() {} }
      `);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
