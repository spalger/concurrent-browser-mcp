import { chromium, firefox, webkit, Browser } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { BrowserInstance, BrowserConfig, ServerConfig, ToolResult } from './types.js';
import { execSync } from 'child_process';

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
      
      const instanceId = uuidv4();
      const instance: BrowserInstance = {
        id: instanceId,
        browser,
        context,
        page,
        createdAt: new Date(),
        lastUsed: new Date(),
        isActive: true,
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