import { DurableObject } from "cloudflare:workers";

export class ShopifyStorage extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
  }

  /**
   * Execute a SQL query directly - similar to D1's prepare().bind().run()
   */
  async run(query: string, ...params: any[]): Promise<{ success: boolean; error?: string; meta?: any }> {
    try {
      const cursor = this.ctx.storage.sql.exec(query, ...params);
      return { 
        success: true,
        meta: {
          rowsRead: cursor.rowsRead,
          rowsWritten: cursor.rowsWritten
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a SQL query and return first result - similar to D1's prepare().bind().first()
   */
  async first(query: string, ...params: any[]): Promise<{ result: any; error?: string }> {
    try {
      const cursor = this.ctx.storage.sql.exec(query, ...params);
      const results = cursor.toArray();
      const result = results.length > 0 ? results[0] : null;
      
      return { result };
    } catch (error) {
      return { result: null, error: error.message };
    }
  }

  /**
   * Execute a SQL query and return all results - similar to D1's prepare().bind().all()
   */
  async all(query: string, ...params: any[]): Promise<{ results: any[]; error?: string; meta?: any }> {
    try {
      const cursor = this.ctx.storage.sql.exec(query, ...params);
      const results = cursor.toArray();
      
      return { 
        results,
        meta: {
          rowsRead: cursor.rowsRead,
          rowsWritten: cursor.rowsWritten
        }
      };
    } catch (error) {
      return { results: [], error: error.message };
    }
  }

  /**
   * Execute raw SQL - for more complex operations
   */
  async executeQuery(query: string, ...params: any[]): Promise<{ results?: any[]; result?: any; error?: string }> {
    try {
      const cursor = this.ctx.storage.sql.exec(query, ...params);
      const results = cursor.toArray();
      const result = results.length > 0 ? results[0] : null;
      
      return { results, result };
    } catch (error) {
      return { error: error.message };
    }
  }
}