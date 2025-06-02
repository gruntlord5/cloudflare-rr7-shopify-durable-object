import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@brandboostinggmbh/shopify-app-react-router/server";
import { Session } from "@shopify/shopify-api";
import { SessionStorage } from "@shopify/shopify-app-session-storage";
import { shopifySessionDb } from "./db.server";

// Create a D1 session storage adapter that works with context
class D1SessionStorage implements SessionStorage {
  private context: any;

  constructor(context: any) {
    this.context = context;
  }

  async storeSession(session: Session): Promise<boolean> {
    return await shopifySessionDb.storeSession(this.context, session);
  }

  async loadSession(id: string): Promise<Session | undefined> {
    return await shopifySessionDb.loadSession(this.context, id);
  }

  async deleteSession(id: string): Promise<boolean> {
    return await shopifySessionDb.deleteSession(this.context, id);
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    return await shopifySessionDb.deleteSessions(this.context, ids);
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    return await shopifySessionDb.findSessionsByShop(this.context, shop);
  }
}

// Factory function to create Shopify app with context
export function createShopifyApp(context: any) {
  const sessionStorage = new D1SessionStorage(context);

  return shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
    apiVersion: ApiVersion.January25,
    scopes: process.env.SCOPES?.split(","),
    appUrl: process.env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage,
    distribution: AppDistribution.AppStore,
    future: {
      unstable_newEmbeddedAuthStrategy: true,
      removeRest: true,
    },
    ...(process.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
  });
}

// Remove the general initialization function since we initialize per shop
// Session tables are now created automatically when needed

export const apiVersion = ApiVersion.January25;

// Main authenticate function that requires context
export const authenticate = {
  admin: async (request: Request, context: any) => {
    const shopify = createShopifyApp(context);
    return shopify.authenticate.admin(request);
  },
  public: async (request: Request, context: any) => {
    const shopify = createShopifyApp(context);
    return shopify.authenticate.public(request);
  }
};

// Main unauthenticated function that requires context
export const unauthenticated = {
  admin: async (request: Request, context: any) => {
    const shopify = createShopifyApp(context);
    return shopify.unauthenticated.admin(request);
  },
  public: async (request: Request, context: any) => {
    const shopify = createShopifyApp(context);
    return shopify.unauthenticated.public(request);
  }
};

// Other helper functions
export const login = async (request: Request, context: any) => {
  const shopify = createShopifyApp(context);
  return shopify.login(request);
};

export const registerWebhooks = async (request: Request, context: any) => {
  const shopify = createShopifyApp(context);
  return shopify.registerWebhooks(request);
};

export const addDocumentResponseHeaders = (request: Request, response: Response, context: any) => {
  const shopify = createShopifyApp(context);
  return shopify.addDocumentResponseHeaders(request, response);
};

export default {
  apiVersion,
  authenticate,
  unauthenticated,
  login,
  registerWebhooks,
  addDocumentResponseHeaders,
  createShopifyApp
};