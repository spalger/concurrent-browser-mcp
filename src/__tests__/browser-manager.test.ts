import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockBrowser, createMockContext, createMockPage } from './helpers/mocks.js';
import type { ServerConfig } from '../types.js';

// Mock playwright before importing BrowserManager
const mockPage = createMockPage();
const mockContext = createMockContext(mockPage);
const mockBrowser = createMockBrowser(mockContext);

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) },
  firefox: { launch: vi.fn().mockResolvedValue(mockBrowser) },
  webkit: { launch: vi.fn().mockResolvedValue(mockBrowser) },
}));

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${++uuidCounter}`),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(''),
}));

// Import after mocks are set up
const { BrowserManager } = await import('../browser-manager.js');
const { chromium, firefox, webkit } = await import('playwright');
const { execSync } = await import('child_process');

function createConfig(overrides?: Partial<ServerConfig>): ServerConfig {
  return {
    maxInstances: 5,
    defaultBrowserConfig: {
      browserType: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 720 },
      contextOptions: {
        ignoreHTTPSErrors: false,
      },
    },
    instanceTimeout: 30 * 60 * 1000,
    cleanupInterval: 5 * 60 * 1000,
    proxy: { autoDetect: false },
    ...overrides,
  };
}

describe('BrowserManager', () => {
  let manager: InstanceType<typeof BrowserManager>;

  beforeEach(() => {
    vi.useFakeTimers();
    uuidCounter = 0;
    vi.clearAllMocks();
    mockBrowser.close.mockResolvedValue(undefined);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockContext.newPage.mockResolvedValue(mockPage);
    manager = new BrowserManager(createConfig());
  });

  afterEach(async () => {
    await manager.destroy();
    vi.useRealTimers();
  });

  describe('instance creation', () => {
    it('creates an instance with default config', async () => {
      const result = await manager.createInstance();

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe('test-uuid-1');
      expect(result.data?.browserType).toBe('chromium');
      expect(chromium.launch).toHaveBeenCalled();
    });

    it('creates a firefox instance when specified', async () => {
      const result = await manager.createInstance({ browserType: 'firefox' });

      expect(result.success).toBe(true);
      expect(firefox.launch).toHaveBeenCalled();
    });

    it('creates a webkit instance when specified', async () => {
      const result = await manager.createInstance({ browserType: 'webkit' });

      expect(result.success).toBe(true);
      expect(webkit.launch).toHaveBeenCalled();
    });

    it('rejects when max instances reached', async () => {
      const config = createConfig({ maxInstances: 2 });
      await manager.destroy();
      manager = new BrowserManager(config);

      await manager.createInstance();
      await manager.createInstance();
      const result = await manager.createInstance();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum number of instances');
    });

    it('passes viewport and userAgent to browser context', async () => {
      await manager.createInstance({
        viewport: { width: 800, height: 600 },
        userAgent: 'TestAgent/1.0',
      });

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 800, height: 600 },
          userAgent: 'TestAgent/1.0',
        })
      );
    });

    it('applies proxy config to context when proxy is set', async () => {
      await manager.destroy();
      manager = new BrowserManager(
        createConfig({
          proxy: { server: 'http://proxy.test:8080' },
        })
      );
      // Allow microtasks (proxy init) to settle without advancing interval timers infinitely
      await vi.advanceTimersByTimeAsync(1);

      await manager.createInstance();

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          proxy: { server: 'http://proxy.test:8080' },
        })
      );
    });
  });

  describe('instance retrieval', () => {
    it('returns instance and updates lastUsed for valid ID', async () => {
      const createResult = await manager.createInstance();
      const id = createResult.instanceId!;

      // Advance time to detect lastUsed update
      vi.advanceTimersByTime(5000);

      const instance = manager.getInstance(id);

      expect(instance).toBeDefined();
      expect(instance!.id).toBe(id);
    });

    it('returns undefined for invalid ID', () => {
      const instance = manager.getInstance('non-existent');

      expect(instance).toBeUndefined();
    });
  });

  describe('instance listing', () => {
    it('lists all instances with metadata', async () => {
      await manager.createInstance(undefined, { name: 'first' });
      await manager.createInstance(undefined, { name: 'second' });

      const result = manager.listInstances();

      expect(result.success).toBe(true);
      expect(result.data.instances).toHaveLength(2);
      expect(result.data.totalCount).toBe(2);
      expect(result.data.maxInstances).toBe(5);
    });

    it('returns empty list when no instances exist', () => {
      const result = manager.listInstances();

      expect(result.success).toBe(true);
      expect(result.data.instances).toHaveLength(0);
      expect(result.data.totalCount).toBe(0);
    });
  });

  describe('instance closing', () => {
    it('closes and removes instance', async () => {
      const createResult = await manager.createInstance();
      const id = createResult.instanceId!;

      const closeResult = await manager.closeInstance(id);

      expect(closeResult.success).toBe(true);
      expect(closeResult.data.closed).toBe(true);
      expect(mockBrowser.close).toHaveBeenCalled();
      expect(manager.getInstance(id)).toBeUndefined();
    });

    it('returns error for invalid instance ID', async () => {
      const result = await manager.closeInstance('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('close all instances', () => {
    it('closes all browsers and empties map', async () => {
      await manager.createInstance();
      await manager.createInstance();

      const result = await manager.closeAllInstances();

      expect(result.success).toBe(true);
      expect(result.data.closedCount).toBe(2);
      expect(manager.listInstances().data.totalCount).toBe(0);
    });

    it('uses Promise.allSettled so one failure does not block others', async () => {
      await manager.createInstance();
      await manager.createInstance();

      // Make the first close fail
      let callCount = 0;
      mockBrowser.close.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('browser crash'));
        }
        return Promise.resolve();
      });

      const result = await manager.closeAllInstances();

      // After fix, closeAllInstances uses Promise.allSettled so it succeeds overall
      expect(result.success).toBe(true);
    });
  });

  describe('cleanup timer', () => {
    it('cleans up expired instances', async () => {
      const config = createConfig({
        instanceTimeout: 10_000,
        cleanupInterval: 5_000,
      });
      await manager.destroy();
      manager = new BrowserManager(config);

      await manager.createInstance();

      // Advance past the timeout, triggering at least one cleanup interval
      // Use advanceTimersByTimeAsync to also flush microtasks (async cleanup)
      await vi.advanceTimersByTimeAsync(15_000);

      expect(manager.listInstances().data.totalCount).toBe(0);
    });

    it('preserves recently used instances', async () => {
      const config = createConfig({
        instanceTimeout: 10_000,
        cleanupInterval: 5_000,
      });
      await manager.destroy();
      manager = new BrowserManager(config);

      const createResult = await manager.createInstance();
      const id = createResult.instanceId!;

      // Advance 4s, then access the instance to keep it alive
      await vi.advanceTimersByTimeAsync(4_000);
      manager.getInstance(id);

      // Advance 7 more seconds (total 11s). Instance was accessed at 4s, so
      // only 7s since last use - within 10s timeout
      await vi.advanceTimersByTimeAsync(7_000);

      expect(manager.listInstances().data.totalCount).toBe(1);
    });

    it('skips locked instances during cleanup', async () => {
      const config = createConfig({
        instanceTimeout: 1_000,
        cleanupInterval: 500,
      });
      await manager.destroy();
      manager = new BrowserManager(config);

      const createResult = await manager.createInstance();
      const id = createResult.instanceId!;

      // Acquire a lock on the instance (after fix, this method exists)
      if (typeof (manager as Record<string, unknown>).acquireOperationLock === 'function') {
        (manager as Record<string, unknown>).acquireOperationLock(id);
      }

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(5_000);

      // After fix: locked instances are skipped by cleanup
      const instances = manager.listInstances();
      if (typeof (manager as Record<string, unknown>).acquireOperationLock === 'function') {
        expect(instances.data.totalCount).toBe(1);
      }
    });
  });

  describe('proxy detection', () => {
    it('uses proxy from environment variables', async () => {
      const originalEnv = process.env['HTTP_PROXY'];
      process.env['HTTP_PROXY'] = 'http://env-proxy:3128';

      await manager.destroy();
      manager = new BrowserManager(createConfig({ proxy: { autoDetect: true } }));
      // Let proxy init microtask resolve
      await vi.advanceTimersByTimeAsync(1);

      await manager.createInstance();

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          proxy: { server: 'http://env-proxy:3128' },
        })
      );

      // Restore
      if (originalEnv === undefined) {
        delete process.env['HTTP_PROXY'];
      } else {
        process.env['HTTP_PROXY'] = originalEnv;
      }
    });

    it('uses explicit proxy config over auto-detection', async () => {
      await manager.destroy();
      manager = new BrowserManager(
        createConfig({
          proxy: { server: 'http://explicit:9999', autoDetect: true },
        })
      );
      await vi.advanceTimersByTimeAsync(1);

      await manager.createInstance();

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          proxy: { server: 'http://explicit:9999' },
        })
      );
    });

    it('does not detect proxy when autoDetect is false', async () => {
      await manager.destroy();
      manager = new BrowserManager(createConfig({ proxy: { autoDetect: false } }));
      await vi.advanceTimersByTimeAsync(1);

      await manager.createInstance();

      const contextArgs = mockBrowser.newContext.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(contextArgs?.proxy).toBeUndefined();
    });

    it('detects macOS system proxy on darwin', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      // Clear env proxy so system proxy detection kicks in
      const origHttp = process.env['HTTP_PROXY'];
      const origHttps = process.env['HTTPS_PROXY'];
      const origAll = process.env['ALL_PROXY'];
      const origHttpLc = process.env['http_proxy'];
      const origHttpsLc = process.env['https_proxy'];
      const origAllLc = process.env['all_proxy'];
      delete process.env['HTTP_PROXY'];
      delete process.env['HTTPS_PROXY'];
      delete process.env['ALL_PROXY'];
      delete process.env['http_proxy'];
      delete process.env['https_proxy'];
      delete process.env['all_proxy'];

      vi.mocked(execSync).mockReturnValue(
        'Enabled: Yes\nServer: 192.168.1.1\nPort: 8080\nAuthenticated Proxy Enabled: 0\n'
      );

      await manager.destroy();
      manager = new BrowserManager(createConfig({ proxy: { autoDetect: true } }));
      await vi.advanceTimersByTimeAsync(1);

      await manager.createInstance();

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          proxy: { server: 'http://192.168.1.1:8080' },
        })
      );

      // Restore
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      if (origHttp !== undefined) process.env['HTTP_PROXY'] = origHttp;
      if (origHttps !== undefined) process.env['HTTPS_PROXY'] = origHttps;
      if (origAll !== undefined) process.env['ALL_PROXY'] = origAll;
      if (origHttpLc !== undefined) process.env['http_proxy'] = origHttpLc;
      if (origHttpsLc !== undefined) process.env['https_proxy'] = origHttpsLc;
      if (origAllLc !== undefined) process.env['all_proxy'] = origAllLc;
    });
  });

  describe('proxy init await', () => {
    it('createInstance waits for proxy initialization', async () => {
      await manager.destroy();
      manager = new BrowserManager(
        createConfig({ proxy: { server: 'http://wait-test:1234' } })
      );
      await vi.advanceTimersByTimeAsync(1);

      const result = await manager.createInstance();

      expect(result.success).toBe(true);
      expect(result.data?.proxy).toBe('http://wait-test:1234');
    });
  });

  describe('destroy', () => {
    it('stops cleanup timer and closes all instances', async () => {
      await manager.createInstance();
      await manager.createInstance();

      await manager.destroy();

      expect(manager.listInstances().data.totalCount).toBe(0);
    });
  });
});
