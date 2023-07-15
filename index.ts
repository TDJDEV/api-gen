import { render, html, serve } from "https://cdn.skypack.dev/vno?dts";
import { Backoffice } from "./backoffice.tsx";
import { API } from "./api.ts";

const api = new API();

// Define the API routes
api.registerRoutes();

// Start the API server
api.start(3000);

// Render the Backoffice component
const backofficeHtml = render(html`<${Backoffice} />`);

// Serve the combined app
serve({
  "/api/*": api.serverRequestHandler,
  "/": () => new Response(backofficeHtml, { headers: { "content-type": "text/html" } }),
});
