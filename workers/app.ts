import { createRequestHandler } from "react-router";
import { ShopifyStorage } from "./durable-storage";

// Define your Env type with all your bindings
interface Env {
  DB: D1Database;
  SHOPIFY_STORAGE: DurableObjectNamespace;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES?: string;
  SHOP_CUSTOM_DOMAIN?: string;
}

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
    db: D1Database;
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      // Create the load context that includes direct access to all bindings
      const loadContext = {
        cloudflare: {
          env,
          ctx,
        },
        // Pass database directly in context
        db: env.DB,
      };

      // Session tables are now initialized per shop when needed
      // No general initialization required
      
      return requestHandler(request, loadContext);
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

// Export the Durable Object class
export { ShopifyStorage };