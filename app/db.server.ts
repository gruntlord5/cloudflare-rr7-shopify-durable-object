import { Session } from "@shopify/shopify-api";
import { 
  getDurableObjectStub, 
  createTableIfNotExists,
  updateSetting,
  getSetting,
  getAllSettings
} from "./utils/durable.service";

// Base configuration for Shopify sessions storage
const SHOPIFY_SESSION_CONFIG = {
  tableName: 'shopify_sessions'
};

// Helper function to get shop-specific instance name
const getShopifySessionInstanceName = (shop: string) => {
  // Clean shop domain and create unique instance name
  const cleanShop = shop.replace(/[^a-zA-Z0-9-]/g, '-');
  return `shopify-sessions-${cleanShop}`;
};

// Helper function to get Shopify sessions Durable Object for specific shop
const getShopifySessionsStub = (context: any, shop: string) => {
  try {
    const namespace = context?.cloudflare?.env?.SHOPIFY_STORAGE;
    if (!namespace) return null;
    
    const instanceName = getShopifySessionInstanceName(shop);
    const id = namespace.idFromName(instanceName);
    return namespace.get(id);
  } catch (error) {
    console.error('Error getting Shopify sessions Durable Object:', error);
    return null;
  }
};

// Helper functions for common Durable Object operations
export const executeQuery = async (context: any, query: string, params: any[] = []) => {
  // For general queries, we need a shop parameter or default
  throw new Error('executeQuery requires shop-specific context. Use shopifySessionDb methods instead.');
};

export const getAllRows = async (context: any, query: string, params: any[] = []) => {
  throw new Error('getAllRows requires shop-specific context. Use shopifySessionDb methods instead.');
};

export const getFirstRow = async (context: any, query: string, params: any[] = []) => {
  throw new Error('getFirstRow requires shop-specific context. Use shopifySessionDb methods instead.');
};

// Shopify session database operations using Durable Objects
export const shopifySessionDb = {
  async initializeTable(context: any, shop: string): Promise<boolean> {
    try {
      const stub = getShopifySessionsStub(context, shop);
      if (!stub) {
        console.error(`Shopify sessions Durable Object is not available for shop: ${shop}`);
        return false;
      }

      const schema = `
        id TEXT PRIMARY KEY, 
        shop TEXT NOT NULL, 
        state TEXT, 
        isOnline INTEGER, 
        scope TEXT, 
        accessToken TEXT, 
        expires INTEGER, 
        onlineAccessInfo TEXT
      `;

      const result = await stub.run(
        `CREATE TABLE IF NOT EXISTS ${SHOPIFY_SESSION_CONFIG.tableName} (${schema})`
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create sessions table');
      }

      console.log(`Shopify sessions table initialized successfully for shop: ${shop}`);
      return true;
    } catch (error) {
      console.error(`Failed to initialize Shopify sessions table for shop ${shop}:`, error);
      return false;
    }
  },

  async storeSession(context: any, session: Session): Promise<boolean> {
    try {
      const stub = getShopifySessionsStub(context, session.shop);
      if (!stub) throw new Error('Durable Object is not available');

      // Ensure table exists for this shop
      await this.initializeTable(context, session.shop);

      const result = await stub.run(
        `INSERT OR REPLACE INTO ${SHOPIFY_SESSION_CONFIG.tableName} 
         (id, shop, state, isOnline, scope, accessToken, expires, onlineAccessInfo) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        session.id,
        session.shop,
        session.state,
        session.isOnline ? 1 : 0,
        session.scope,
        session.accessToken,
        session.expires ? session.expires.getTime() : null,
        session.onlineAccessInfo ? JSON.stringify(session.onlineAccessInfo) : null
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to store session');
      }

      return true;
    } catch (error) {
      console.error("Failed to store session:", error);
      return false;
    }
  },

  async loadSession(context: any, id: string): Promise<Session | undefined> {
    try {
      // Extract shop from session ID (Shopify session IDs contain shop info)
      const shop = this.extractShopFromSessionId(id);
      if (!shop) {
        console.error("Could not extract shop from session ID:", id);
        return undefined;
      }

      const stub = getShopifySessionsStub(context, shop);
      if (!stub) throw new Error('Durable Object is not available');

      const result = await stub.first(
        `SELECT * FROM ${SHOPIFY_SESSION_CONFIG.tableName} WHERE id = ?`,
        id
      );

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.result) return undefined;

      const row = result.result;
      const session = new Session({
        id: row.id as string,
        shop: row.shop as string,
        state: row.state as string,
        isOnline: Boolean(row.isOnline)
      });

      session.scope = row.scope as string;
      session.accessToken = row.accessToken as string;
      if (row.expires) session.expires = new Date(row.expires as number);
      if (row.onlineAccessInfo) {
        session.onlineAccessInfo = JSON.parse(row.onlineAccessInfo as string);
      }

      return session;
    } catch (error) {
      console.error("Failed to load session:", error);
      return undefined;
    }
  },

  async deleteSession(context: any, id: string): Promise<boolean> {
    try {
      const shop = this.extractShopFromSessionId(id);
      if (!shop) {
        console.error("Could not extract shop from session ID:", id);
        return false;
      }

      const stub = getShopifySessionsStub(context, shop);
      if (!stub) throw new Error('Durable Object is not available');

      const result = await stub.run(
        `DELETE FROM ${SHOPIFY_SESSION_CONFIG.tableName} WHERE id = ?`,
        id
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete session');
      }

      return true;
    } catch (error) {
      console.error("Failed to delete session:", error);
      return false;
    }
  },

  async deleteSessions(context: any, ids: string[]): Promise<boolean> {
    try {
      for (const id of ids) {
        const success = await this.deleteSession(context, id);
        if (!success) return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to delete sessions:", error);
      return false;
    }
  },

  async findSessionsByShop(context: any, shop: string): Promise<Session[]> {
    try {
      const stub = getShopifySessionsStub(context, shop);
      if (!stub) throw new Error('Durable Object is not available');

      const result = await stub.all(
        `SELECT * FROM ${SHOPIFY_SESSION_CONFIG.tableName} WHERE shop = ?`,
        shop
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return (result.results || []).map(row => {
        const session = new Session({
          id: row.id as string,
          shop: row.shop as string,
          state: row.state as string,
          isOnline: Boolean(row.isOnline)
        });

        session.scope = row.scope as string;
        session.accessToken = row.accessToken as string;
        if (row.expires) session.expires = new Date(row.expires as number);
        if (row.onlineAccessInfo) {
          session.onlineAccessInfo = JSON.parse(row.onlineAccessInfo as string);
        }
        return session;
      });
    } catch (error) {
      console.error("Failed to find sessions by shop:", error);
      return [];
    }
  },

  // Helper method to extract shop from session ID
  extractShopFromSessionId(sessionId: string): string | null {
    try {
      // Shopify session IDs typically contain the shop domain
      // Format is usually something like: offline_shop-domain.myshopify.com or online_shop-domain.myshopify.com_user-id
      const parts = sessionId.split('_');
      if (parts.length >= 2) {
        let shopPart = parts[1];
        // Remove user ID if present (for online sessions)
        if (shopPart.includes('_')) {
          shopPart = shopPart.split('_')[0];
        }
        return shopPart;
      }
      return null;
    } catch (error) {
      console.error("Error extracting shop from session ID:", error);
      return null;
    }
  }
};

export { executeQuery as default };