import { chromium, firefox, webkit, Browser } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { BrowserInstance, BrowserConfig, ServerConfig, ToolResult, ConsoleLogEntry, NetworkLogEntry } from './types.js';
import { execSync } from 'child_process';

const MAX_CONSOLE_LOG_ENTRIES = 1000;
const MAX_NETWORK_API_ENTRIES = 500;
const MAX_NETWORK_ASSET_ENTRIES = 200;
const MAX_CACHED_BODY_SIZE = 100_000;

const STATIC_RESOURCE_TYPES = new Set([
  'document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'manifest',
]);

const TEXT_CONTENT_TYPES = [
  'text/', 'application/json', 'application/xml', 'application/javascript',
  'application/x-javascript', 'application/xhtml+xml', 'application/ld+json',
];

export class BrowserManager {
  private instances: Map<string, BrowserInstance> = new Map();
  private config: ServerConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private detectedProxy?: string;
  private operationLocks: Map<string, number> = new Map();
  private proxyInitialized: Promise<void>;

  constructor(config: ServerConfig) {
    this.config = config;
    this.startCleanupTimer();

    // Initialize proxy detection during construction
    this.proxyInitialized = this.initializeProxy();
  }

  /**
   * Acquire an operation lock for an instance.
   * Returns a release function, or undefined if the instance doesn't exist.
   */
  acquireOperationLock(instanceId: string): (() => void) | undefined {
    if (!this.instances.has(instanceId)) {
      return undefined;
    }
    const current = this.operationLocks.get(instanceId) ?? 0;
    this.operationLocks.set(instanceId, current + 1);
    return () => {
      const count = this.operationLocks.get(instanceId) ?? 0;
      if (count <= 1) {
        this.operationLocks.delete(instanceId);
      } else {
        this.operationLocks.set(instanceId, count - 1);
      }
    };
  }

  /**
   * Check if an instance has active operation locks.
   */
  isInstanceLocked(instanceId: string): boolean {
    return (this.operationLocks.get(instanceId) ?? 0) > 0;
  }

  /**
   * Initialize proxy configuration
   */
  private async initializeProxy(): Promise<void> {
    const globalProxy = this.config.proxy;
    if (globalProxy?.server) {
      this.detectedProxy = globalProxy.server;
      console.log(`Using configured proxy: ${this.detectedProxy}`);
    } else if (globalProxy?.autoDetect !== false) {
      // Enable auto-detection by default
      this.detectedProxy = await this.detectLocalProxy();
      if (this.detectedProxy) {
        console.log(`Auto-detected proxy: ${this.detectedProxy}`);
      }
    }
  }

  /**
   * Auto-detect local proxy
   */
  private async detectLocalProxy(): Promise<string | undefined> {
    // 1. Check environment variables
    const envProxy = this.getProxyFromEnv();
    if (envProxy) {
      console.log(`Proxy detected from environment variables: ${envProxy}`);
      return envProxy;
    }

    // 2. Try to detect system proxy settings (macOS)
    if (process.platform === 'darwin') {
      const systemProxy = this.getMacOSSystemProxy();
      if (systemProxy) {
        console.log(`System proxy detected: ${systemProxy}`);
        return systemProxy;
      }
    }

    return undefined;
  }

  /**
   * Get proxy from environment variables
   */
  private getProxyFromEnv(): string | undefined {
    const httpProxy = process.env['HTTP_PROXY'] || process.env['http_proxy'];
    const httpsProxy = process.env['HTTPS_PROXY'] || process.env['https_proxy'];
    const allProxy = process.env['ALL_PROXY'] || process.env['all_proxy'];
    
    return httpProxy || httpsProxy || allProxy;
  }

  /**
   * Get macOS system proxy settings
   */
  private getMacOSSystemProxy(): string | undefined {
    try {
      const result = execSync('networksetup -getwebproxy "Wi-Fi" 2>/dev/null || networksetup -getwebproxy "Ethernet" 2>/dev/null', {
        encoding: 'utf8',
        timeout: 5000
      });
      
      const lines = result.split('\n');
      const enabled = lines.find(line => line.includes('Enabled: Yes'));
      if (!enabled) return undefined;
      
      const server = lines.find(line => line.includes('Server:'))?.split(': ')[1];
      const port = lines.find(line => line.includes('Port:'))?.split(': ')[1];
      
      if (server && port) {
        return `http://${server}:${port}`;
      }
    } catch (error) {
      // Ignore errors and continue with other methods
    }
    return undefined;
  }


  /**
   * Get effective proxy configuration
   */
  private getEffectiveProxy(browserConfig?: Partial<BrowserConfig>): string | undefined {
    // Priority: instance config > global config > auto-detected
    if (browserConfig?.proxy?.server) {
      return browserConfig.proxy.server;
    }
    
    if (browserConfig?.proxy?.autoDetect === false) {
      return undefined; // Explicitly disable proxy
    }
    
    return this.detectedProxy;
  }

  /**
   * Create a new browser instance
   */
  async createInstance(
    browserConfig?: Partial<BrowserConfig>,
    metadata?: BrowserInstance['metadata']
  ): Promise<ToolResult> {
    try {
      await this.proxyInitialized;

      if (this.instances.size >= this.config.maxInstances) {
        return {
          success: false,
          error: `Maximum number of instances (${this.config.maxInstances}) reached`
        };
      }

      const config = { ...this.config.defaultBrowserConfig, ...browserConfig };
      const browser = await this.launchBrowser(config);
      
      const contextOptions: Record<string, unknown> = {
        viewport: config.viewport,
        ignoreHTTPSErrors: config.contextOptions?.ignoreHTTPSErrors,
        bypassCSP: config.contextOptions?.bypassCSP,
      };
      if (config.userAgent) {
        contextOptions['userAgent'] = config.userAgent;
      }

      // Add proxy configuration to context
      const effectiveProxy = this.getEffectiveProxy(browserConfig);
      if (effectiveProxy) {
        contextOptions['proxy'] = { server: effectiveProxy };
      }
      
      const context = await browser.newContext(contextOptions);

      const page = await context.newPage();

      const consoleLogs: ConsoleLogEntry[] = [];
      page.on('console', (msg) => {
        const location = msg.location();
        consoleLogs.push({
          type: msg.type(),
          text: msg.text(),
          timestamp: new Date().toISOString(),
          location: {
            url: location.url,
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber,
          },
        });
        if (consoleLogs.length > MAX_CONSOLE_LOG_ENTRIES) {
          consoleLogs.splice(0, consoleLogs.length - MAX_CONSOLE_LOG_ENTRIES);
        }
      });

      const networkApiLogs: NetworkLogEntry[] = [];
      const networkAssetLogs: NetworkLogEntry[] = [];

      page.on('response', async (response) => {
        try {
          const request = response.request();
          const resourceType = request.resourceType();
          const entry: NetworkLogEntry = {
            url: request.url(),
            method: request.method(),
            resourceType,
            status: response.status(),
            statusText: response.statusText(),
            headers: response.headers(),
            timestamp: new Date().toISOString(),
          };

          try {
            const timing = request.timing();
            if (timing.responseEnd >= 0 && timing.startTime >= 0) {
              entry.duration = timing.responseEnd - timing.startTime;
            }
          } catch {
            // timing may not be available
          }

          const contentType = response.headers()['content-type'] ?? '';
          const isTextContent = TEXT_CONTENT_TYPES.some((t) => contentType.includes(t));
          if (isTextContent) {
            try {
              const body = await response.text();
              if (body.length <= MAX_CACHED_BODY_SIZE) {
                entry.cachedBody = body;
              }
            } catch {
              // body may not be available
            }
          }

          const targetBuffer = STATIC_RESOURCE_TYPES.has(resourceType) ? networkAssetLogs : networkApiLogs;
          const maxEntries = STATIC_RESOURCE_TYPES.has(resourceType) ? MAX_NETWORK_ASSET_ENTRIES : MAX_NETWORK_API_ENTRIES;
          targetBuffer.push(entry);
          if (targetBuffer.length > maxEntries) {
            targetBuffer.splice(0, targetBuffer.length - maxEntries);
          }
        } catch {
          // ignore errors in response handler
        }
      });

      page.on('requestfailed', (request) => {
        try {
          const resourceType = request.resourceType();
          const entry: NetworkLogEntry = {
            url: request.url(),
            method: request.method(),
            resourceType,
            timestamp: new Date().toISOString(),
            error: request.failure()?.errorText,
          };

          const targetBuffer = STATIC_RESOURCE_TYPES.has(resourceType) ? networkAssetLogs : networkApiLogs;
          const maxEntries = STATIC_RESOURCE_TYPES.has(resourceType) ? MAX_NETWORK_ASSET_ENTRIES : MAX_NETWORK_API_ENTRIES;
          targetBuffer.push(entry);
          if (targetBuffer.length > maxEntries) {
            targetBuffer.splice(0, targetBuffer.length - maxEntries);
          }
        } catch {
          // ignore errors in requestfailed handler
        }
      });

      const instanceId = uuidv4();
      const instance: BrowserInstance = {
        id: instanceId,
        browser,
        context,
        page,
        createdAt: new Date(),
        lastUsed: new Date(),
        isActive: true,
        consoleLogs,
        networkApiLogs,
        networkAssetLogs,
        ...(metadata && { metadata })
      };

      this.instances.set(instanceId, instance);

      return {
        success: true,
        data: {
          instanceId,
          browserType: config.browserType,
          headless: config.headless,
          viewport: config.viewport,
          proxy: effectiveProxy,
          metadata
        },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create browser instance: ${error instanceof Error ? error.message : error}`
      };
    }
  }

  /**
   * Get browser instance
   */
  getInstance(instanceId: string): BrowserInstance | undefined {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.lastUsed = new Date();
    }
    return instance;
  }

  /**
   * Get console logs for an instance
   */
  getConsoleLogs(
    instanceId: string,
    options?: { type?: string; limit?: number; clear?: boolean }
  ): ToolResult {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    const consoleLogs = instance.consoleLogs!;
    const totalEntries = consoleLogs.length;

    let logs = consoleLogs;
    const filtered = !!options?.type;
    if (options?.type) {
      logs = logs.filter((entry) => entry.type === options.type);
    }

    if (options?.limit && options.limit > 0) {
      logs = logs.slice(-options.limit);
    }

    const returnedEntries = logs.length;
    const cleared = !!options?.clear;

    // Copy before clearing so we return the right data
    const result = [...logs];

    if (cleared) {
      consoleLogs.length = 0;
    }

    return {
      success: true,
      data: {
        logs: result,
        totalEntries,
        returnedEntries,
        filtered,
        cleared,
      },
      instanceId,
    };
  }

  /**
   * Get network logs for an instance
   */
  getNetworkLogs(
    instanceId: string,
    options?: { includeAssets?: boolean; resourceType?: string; limit?: number; clear?: boolean }
  ): ToolResult {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    const apiLogs = instance.networkApiLogs!;
    const assetLogs = instance.networkAssetLogs!;
    const totalApiEntries = apiLogs.length;
    const totalAssetEntries = assetLogs.length;

    const stripBody = (entries: NetworkLogEntry[]): Omit<NetworkLogEntry, 'cachedBody'>[] =>
      entries.map(({ cachedBody, ...rest }) => rest);

    let filteredApiLogs = [...apiLogs];
    let filteredAssetLogs = options?.includeAssets ? [...assetLogs] : [];
    const filtered = !!options?.resourceType;

    if (options?.resourceType) {
      filteredApiLogs = filteredApiLogs.filter((e) => e.resourceType === options.resourceType);
      filteredAssetLogs = filteredAssetLogs.filter((e) => e.resourceType === options.resourceType);
    }

    if (options?.limit && options.limit > 0) {
      filteredApiLogs = filteredApiLogs.slice(-options.limit);
      filteredAssetLogs = filteredAssetLogs.slice(-options.limit);
    }

    const returnedApiEntries = filteredApiLogs.length;
    const returnedAssetEntries = options?.includeAssets ? filteredAssetLogs.length : undefined;
    const cleared = !!options?.clear;

    const resultApiLogs = stripBody(filteredApiLogs);
    const resultAssetLogs = options?.includeAssets ? stripBody(filteredAssetLogs) : undefined;

    if (cleared) {
      apiLogs.length = 0;
      if (options?.includeAssets) {
        assetLogs.length = 0;
      }
    }

    const data: Record<string, unknown> = {
      apiLogs: resultApiLogs,
      totalApiEntries,
      returnedApiEntries,
      filtered,
      cleared,
    };

    if (options?.includeAssets) {
      data['assetLogs'] = resultAssetLogs;
      data['totalAssetEntries'] = totalAssetEntries;
      data['returnedAssetEntries'] = returnedAssetEntries;
    }

    return {
      success: true,
      data,
      instanceId,
    };
  }

  /**
   * Get the cached response body for a specific network request
   */
  getResponseBody(instanceId: string, method: string, url: string): ToolResult {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    // Search both buffers, most recent match wins
    const allLogs = [...(instance.networkApiLogs ?? []), ...(instance.networkAssetLogs ?? [])];
    let match: NetworkLogEntry | undefined;
    for (const entry of allLogs) {
      if (entry.method === method && entry.url === url && entry.cachedBody !== undefined) {
        match = entry;
      }
    }

    if (!match) {
      return {
        success: true,
        data: { found: false, method, url },
        instanceId,
      };
    }

    return {
      success: true,
      data: {
        found: true,
        url: match.url,
        method: match.method,
        body: match.cachedBody,
        contentLength: match.cachedBody!.length,
      },
      instanceId,
    };
  }

  /**
   * List all instances
   */
  listInstances(): ToolResult {
    const instanceList = Array.from(this.instances.values()).map(instance => ({
      id: instance.id,
      isActive: instance.isActive,
      createdAt: instance.createdAt.toISOString(),
      lastUsed: instance.lastUsed.toISOString(),
      metadata: instance.metadata,
      currentUrl: instance.page.url()
    }));

    return {
      success: true,
      data: {
        instances: instanceList,
        totalCount: this.instances.size,
        maxInstances: this.config.maxInstances
      }
    };
  }

  /**
   * Close browser instance
   */
  async closeInstance(instanceId: string): Promise<ToolResult> {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        return {
          success: false,
          error: `Instance ${instanceId} not found`
        };
      }

      await instance.browser.close();
      this.instances.delete(instanceId);

      return {
        success: true,
        data: { instanceId, closed: true },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to close instance: ${error instanceof Error ? error.message : error}`
      };
    }
  }

  /**
   * Close all instances
   */
  async closeAllInstances(): Promise<ToolResult> {
    try {
      const entries = Array.from(this.instances.entries());
      const closePromises = entries.map(async ([id, instance]) => {
        await instance.browser.close();
        this.instances.delete(id);
      });

      await Promise.allSettled(closePromises);
      const closedCount = entries.length;

      return {
        success: true,
        data: { closedCount }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to close all instances: ${error instanceof Error ? error.message : error}`
      };
    }
  }

  /**
   * Launch browser
   */
  private async launchBrowser(config: BrowserConfig): Promise<Browser> {
    const launchOptions: any = {
      headless: config.headless ?? true
    };
    
    if (config.headless) {
      launchOptions.args = ['--no-sandbox', '--disable-setuid-sandbox'];
    }

    // Add proxy arguments for Chromium
    const effectiveProxy = this.getEffectiveProxy(config);
    if (effectiveProxy && config.browserType === 'chromium') {
      if (!launchOptions.args) {
        launchOptions.args = [];
      }
      launchOptions.args.push(`--proxy-server=${effectiveProxy}`);
    }

    switch (config.browserType) {
      case 'chromium':
        return await chromium.launch(launchOptions);
      case 'firefox':
        return await firefox.launch(launchOptions);
      case 'webkit':
        return await webkit.launch(launchOptions);
      default:
        throw new Error(`Unsupported browser type: ${config.browserType}`);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupInactiveInstances();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up inactive instances
   */
  private async cleanupInactiveInstances(): Promise<void> {
    const now = new Date();
    const instancesToClose: string[] = [];

    for (const [id, instance] of this.instances.entries()) {
      if (this.isInstanceLocked(id)) continue;
      const timeSinceLastUsed = now.getTime() - instance.lastUsed.getTime();
      if (timeSinceLastUsed > this.config.instanceTimeout) {
        instancesToClose.push(id);
      }
    }

    for (const instanceId of instancesToClose) {
      await this.closeInstance(instanceId);
      console.log(`Cleaned up inactive instance: ${instanceId}`);
    }
  }

  /**
   * Destroy manager
   */
  async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    await this.closeAllInstances();
  }
} 