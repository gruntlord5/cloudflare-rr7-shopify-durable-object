// Database configuration with single namespace, multiple instances
export const DATABASE_CONFIG = [
  { 
    key: 'DB1', 
    name: 'Primary Database', 
    instanceName: 'database-1',
    tableName: 'settings',
    settingKey: 'test_checkbox_db1' 
  },
  { 
    key: 'DB2', 
    name: 'Secondary Database', 
    instanceName: 'database-2',
    tableName: 'settings',
    settingKey: 'test_checkbox_db2' 
  },
  { 
    key: 'DB3', 
    name: 'Tertiary Database', 
    instanceName: 'database-3',
    tableName: 'settings',
    settingKey: 'test_checkbox_db3' 
  }
] as const;

export type DatabaseKey = typeof DATABASE_CONFIG[number]['key'];
export type DatabaseConfig = typeof DATABASE_CONFIG[number];

/**
 * Helper function to get specific Durable Object stub from single namespace
 */
function getDurableObjectStub(context: any, instanceName: string): any | null {
  try {
    const namespace = context?.cloudflare?.env?.SHOPIFY_STORAGE;
    if (!namespace) return null;
    
    // Use different instance names to get separate Durable Object instances
    const id = namespace.idFromName(instanceName);
    return namespace.get(id);
  } catch (error) {
    console.error(`Error getting Durable Object stub for ${instanceName}:`, error);
    return null;
  }
}

/**
 * Helper function to initialize a database table
 */
async function createTableIfNotExists(stub: any, tableName: string, schema: string): Promise<boolean> {
  if (!stub) {
    throw new Error('Durable Object is not available');
  }

  try {
    const result = await stub.run(`CREATE TABLE IF NOT EXISTS ${tableName} (${schema})`);
    if (!result.success) {
      throw new Error(result.error || 'Failed to create table');
    }
    return true;
  } catch (error) {
    console.error(`Failed to create table ${tableName}:`, error);
    throw error;
  }
}

/**
 * Helper function to get a setting from the durable object
 */
async function getSetting(stub: any, tableName: string, key: string): Promise<any> {
  if (!stub) {
    throw new Error('Durable Object is not available');
  }

  try {
    const result = await stub.first(`SELECT * FROM ${tableName} WHERE key = ?`, key);
    if (result.error) {
      throw new Error(result.error);
    }
    return result.result;
  } catch (error) {
    console.error(`Failed to get setting ${key}:`, error);
    throw error;
  }
}

/**
 * Helper function to get all settings from the durable object
 */
async function getAllSettings(stub: any, tableName: string): Promise<any[]> {
  if (!stub) {
    throw new Error('Durable Object is not available');
  }

  try {
    const result = await stub.all(`SELECT * FROM ${tableName} ORDER BY updated_at DESC`);
    if (result.error) {
      throw new Error(result.error);
    }
    return result.results || [];
  } catch (error) {
    console.error(`Failed to get all settings:`, error);
    throw error;
  }
}

/**
 * Helper function to update a setting in the durable object
 */
async function updateSetting(stub: any, tableName: string, key: string, value: string): Promise<boolean> {
  if (!stub) {
    throw new Error('Durable Object is not available');
  }

  try {
    const timestamp = Date.now(); // Business logic: generate timestamp here
    const result = await stub.run(
      `INSERT OR REPLACE INTO ${tableName} (key, value, updated_at) VALUES (?, ?, ?)`,
      key, value, timestamp
    );
    if (!result.success) {
      throw new Error(result.error || 'Failed to update setting');
    }
    return true;
  } catch (error) {
    console.error(`Failed to update setting ${key}:`, error);
    throw error;
  }
}

/**
 * Load settings for a specific database instance - OPTIMIZED VERSION
 */
export async function loadDatabaseSettings(context: any, config: DatabaseConfig) {
  const stub = getDurableObjectStub(context, config.instanceName);
  
  let data = {
    key: config.key,
    name: config.name,
    instanceName: config.instanceName,
    tableName: config.tableName,
    isChecked: false,
    dbAvailable: false,
    allSettings: [],
    error: null as string | null
  };

  if (!stub) {
    data.error = `Durable Object instance ${config.instanceName} is not available`;
    return data;
  }

  try {
    // Try to get all settings first (single call)
    const allSettings = await getAllSettings(stub, config.tableName);
    
    // Find the specific checkbox setting within the results
    const checkboxSetting = allSettings.find(s => s.key === config.settingKey);
    const isChecked = checkboxSetting?.value === "true";
    
    data = {
      ...data,
      isChecked,
      dbAvailable: true,
      allSettings,
      error: null
    };
  } catch (error) {
    // If table doesn't exist, create it and retry
    if (error.message && (error.message.includes('no such table') || error.message.includes('does not exist'))) {
      try {
        // Create table first
        await createTableIfNotExists(
          stub,
          config.tableName,
          'key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER'
        );
        
        // Retry getting all settings (will be empty array for new table)
        const allSettings = await getAllSettings(stub, config.tableName);
        
        data = {
          ...data,
          isChecked: false, // New table, no checkbox setting yet
          dbAvailable: true,
          allSettings,
          error: null
        };
      } catch (retryError) {
        console.error(`Failed to create table and retry for ${config.name}:`, retryError);
        data.error = retryError instanceof Error ? retryError.message : String(retryError);
      }
    } else {
      console.error(`Durable Object error for ${config.name}:`, error);
      data.error = error instanceof Error ? error.message : String(error);
    }
  }
  
  return data;
}

/**
 * Load settings for all configured database instances
 */
export async function loadAllDatabaseSettings(context: any) {
  const databases = await Promise.all(
    DATABASE_CONFIG.map(config => loadDatabaseSettings(context, config))
  );
  
  return databases;
}

/**
 * Update a setting for a specific database instance
 */
export async function updateDatabaseSetting(context: any, dbKey: string, isChecked: boolean) {
  const config = DATABASE_CONFIG.find(c => c.key === dbKey);
  if (!config) {
    return { success: false, error: "Invalid database key" };
  }

  const stub = getDurableObjectStub(context, config.instanceName);
  
  if (!stub) {
    return { success: false, error: `Durable Object instance ${config.instanceName} is not available` };
  }

  try {
    // Business Logic: Convert boolean to string and update the setting
    const stringValue = isChecked ? "true" : "false";
    await updateSetting(stub, config.tableName, config.settingKey, stringValue);
    
    // Business Logic: Fetch the updated settings list for UI display
    const allSettings = await getAllSettings(stub, config.tableName);
    
    // Business Logic: Return success response with updated data
    return { 
      success: true,
      dbKey,
      isChecked,
      allSettings
    };
  } catch (error) {
    console.error(`Durable Object error saving setting for ${config.name}:`, error);
    return { 
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Advanced Business Logic: Bulk update multiple settings
 */
export async function bulkUpdateSettings(context: any, updates: Array<{dbKey: string, key: string, value: string}>) {
  const results = [];
  
  for (const update of updates) {
    const config = DATABASE_CONFIG.find(c => c.key === update.dbKey);
    if (!config) {
      results.push({ dbKey: update.dbKey, success: false, error: "Invalid database key" });
      continue;
    }

    const stub = getDurableObjectStub(context, config.instanceName);
    if (!stub) {
      results.push({ dbKey: update.dbKey, success: false, error: "Durable Object not available" });
      continue;
    }

    try {
      await updateSetting(stub, config.tableName, update.key, update.value);
      results.push({ dbKey: update.dbKey, success: true });
    } catch (error) {
      results.push({ 
        dbKey: update.dbKey, 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return results;
}

/**
 * Business Logic: Get aggregated statistics across all databases
 */
export async function getDatabaseStatistics(context: any) {
  const stats = {
    totalSettings: 0,
    databasesAvailable: 0,
    lastUpdated: null as Date | null,
    settingsByDatabase: {} as Record<string, number>
  };

  for (const config of DATABASE_CONFIG) {
    const stub = getDurableObjectStub(context, config.instanceName);
    if (!stub) continue;

    try {
      const allSettings = await getAllSettings(stub, config.tableName);
      stats.databasesAvailable++;
      stats.totalSettings += allSettings.length;
      stats.settingsByDatabase[config.key] = allSettings.length;

      // Find the most recent update
      const mostRecent = allSettings.reduce((latest, current) => {
        return current.updated_at > latest ? current.updated_at : latest;
      }, 0);

      if (mostRecent > 0) {
        const recentDate = new Date(mostRecent);
        if (!stats.lastUpdated || recentDate > stats.lastUpdated) {
          stats.lastUpdated = recentDate;
        }
      }
    } catch (error) {
      console.error(`Error getting stats for ${config.name}:`, error);
    }
  }

  return stats;
}

/**
 * Business Logic: Search settings across all databases
 */
export async function searchSettings(context: any, searchTerm: string) {
  const results = [];

  for (const config of DATABASE_CONFIG) {
    const stub = getDurableObjectStub(context, config.instanceName);
    if (!stub) continue;

    try {
      const allSettings = await getAllSettings(stub, config.tableName);
      const matchingSettings = allSettings.filter(setting => 
        setting.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        setting.value.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (matchingSettings.length > 0) {
        results.push({
          database: config.name,
          instanceName: config.instanceName,
          matches: matchingSettings
        });
      }
    } catch (error) {
      console.error(`Error searching in ${config.name}:`, error);
    }
  }

  return results;
}

/**
 * Business Logic: Clear all settings from a specific database
 */
export async function clearDatabaseSettings(context: any, dbKey: string) {
  const config = DATABASE_CONFIG.find(c => c.key === dbKey);
  if (!config) {
    return { success: false, error: "Invalid database key" };
  }

  const stub = getDurableObjectStub(context, config.instanceName);
  
  if (!stub) {
    return { success: false, error: `Durable Object instance ${config.instanceName} is not available` };
  }

  try {
    // Use the direct SQL method to delete all records
    const result = await stub.run(`DELETE FROM ${config.tableName}`);
    if (result.error) {
      throw new Error(result.error);
    }

    return { 
      success: true,
      dbKey,
      message: `All settings cleared from ${config.name}`
    };
  } catch (error) {
    console.error(`Error clearing settings for ${config.name}:`, error);
    return { 
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get configuration for a specific database
 */
export function getDatabaseConfig(dbKey: string): DatabaseConfig | undefined {
  return DATABASE_CONFIG.find(config => config.key === dbKey);
}

/**
 * Check if all Durable Object instances are available
 */
export function isDurableObjectAvailable(context: any): boolean {
  return DATABASE_CONFIG.every(config => 
    getDurableObjectStub(context, config.instanceName) !== null
  );
}

/**
 * Check if a specific Durable Object instance is available
 */
export function isSpecificDurableObjectAvailable(context: any, dbKey: string): boolean {
  const config = DATABASE_CONFIG.find(c => c.key === dbKey);
  if (!config) return false;
  
  return getDurableObjectStub(context, config.instanceName) !== null;
}

/**
 * Get debug information about available Durable Object instances
 */
export function getDurableObjectDebugInfo(context: any) {
  const instanceInfo = DATABASE_CONFIG.map(config => ({
    key: config.key,
    instanceName: config.instanceName,
    available: !!getDurableObjectStub(context, config.instanceName)
  }));

  return {
    contextKeys: Object.keys(context || {}),
    hasCloudflare: !!context?.cloudflare,
    cloudflareKeys: Object.keys(context?.cloudflare || {}),
    hasEnv: !!context?.cloudflare?.env,
    envKeys: Object.keys(context?.cloudflare?.env || {}),
    hasShopifyStorage: !!context?.cloudflare?.env?.SHOPIFY_STORAGE,
    shopifyStorageType: typeof context?.cloudflare?.env?.SHOPIFY_STORAGE,
    instances: instanceInfo
  };
}