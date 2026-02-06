import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerConfig } from '../types.js';

// Mock the MCP SDK modules
const mockSetRequestHandler = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setRequestHandler = mockSetRequestHandler;
    this.connect = mockConnect;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: Symbol('CallToolRequestSchema'),
  ListToolsRequestSchema: Symbol('ListToolsRequestSchema'),
  ErrorCode: { InternalError: -32603 },
  McpError: class McpError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Mock BrowserManager to avoid real browser launches
vi.mock('../browser-manager.js', () => ({
  BrowserManager: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.createInstance = vi.fn().mockResolvedValue({ success: true });
    this.getInstance = vi.fn();
    this.listInstances = vi.fn().mockReturnValue({ success: true, data: { instances: [] } });
    this.closeInstance = vi.fn().mockResolvedValue({ success: true });
    this.closeAllInstances = vi.fn().mockResolvedValue({ success: true });
    this.destroy = vi.fn().mockResolvedValue(undefined);
  }),
}));

const { ConcurrentBrowserServer, defaultConfig } = await import('../server.js');
const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
const { ListToolsRequestSchema, CallToolRequestSchema, McpError, ErrorCode } = await import(
  '@modelcontextprotocol/sdk/types.js'
);

describe('ConcurrentBrowserServer', () => {
  let config: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      maxInstances: 10,
      defaultBrowserConfig: {
        browserType: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 720 },
        contextOptions: { ignoreHTTPSErrors: false },
      },
      instanceTimeout: 30 * 60 * 1000,
      cleanupInterval: 5 * 60 * 1000,
      proxy: { autoDetect: false },
    };
  });

  describe('constructor', () => {
    it('creates server with correct name and version', () => {
      new ConcurrentBrowserServer(config);

      expect(Server).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'concurrent-browser-mcp',
          version: '1.0.0',
        }),
        expect.any(Object)
      );
    });

    it('sets up request handlers', () => {
      new ConcurrentBrowserServer(config);

      // setRequestHandler should be called at least twice (ListTools, CallTool)
      expect(mockSetRequestHandler).toHaveBeenCalledTimes(2);
      expect(mockSetRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function)
      );
      expect(mockSetRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function)
      );
    });
  });

  describe('ListTools handler', () => {
    it('returns tools from BrowserTools', async () => {
      new ConcurrentBrowserServer(config);

      // Find the ListTools handler
      const listToolsCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === ListToolsRequestSchema
      );
      const handler = listToolsCall![1];

      const response = await handler();

      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools.length).toBeGreaterThan(0);
    });
  });

  describe('CallTool handler', () => {
    it('dispatches to executeTools and returns text content on success', async () => {
      new ConcurrentBrowserServer(config);

      const callToolCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === CallToolRequestSchema
      );
      const handler = callToolCall![1];

      const response = await handler({
        params: {
          name: 'browser_list_instances',
          arguments: {},
        },
      });

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');
    });

    it('throws McpError when tool execution fails', async () => {
      new ConcurrentBrowserServer(config);

      const callToolCall = mockSetRequestHandler.mock.calls.find(
        (call) => call[0] === CallToolRequestSchema
      );
      const handler = callToolCall![1];

      // Navigate with non-existent instance will fail via the mock that returns undefined from getInstance
      // We need a tool that will produce success: false
      // The mocked BrowserTools.executeTools will be used, let's call an unknown tool
      await expect(
        handler({
          params: {
            name: 'unknown_tool_that_fails',
            arguments: {},
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('default config', () => {
    it('has correct default values', () => {
      expect(defaultConfig.maxInstances).toBe(20);
      expect(defaultConfig.defaultBrowserConfig.browserType).toBe('chromium');
      expect(defaultConfig.defaultBrowserConfig.headless).toBe(true);
      expect(defaultConfig.defaultBrowserConfig.viewport).toEqual({
        width: 1280,
        height: 720,
      });
      expect(defaultConfig.instanceTimeout).toBe(30 * 60 * 1000);
      expect(defaultConfig.cleanupInterval).toBe(5 * 60 * 1000);
    });

    it('sets ignoreHTTPSErrors to false', () => {
      expect(defaultConfig.defaultBrowserConfig.contextOptions?.ignoreHTTPSErrors).toBe(false);
    });

    it('enables proxy auto-detection by default', () => {
      expect(defaultConfig.proxy?.autoDetect).toBe(true);
    });
  });

  describe('run', () => {
    it('connects to stdio transport', async () => {
      const server = new ConcurrentBrowserServer(config);
      await server.run();

      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('calls destroy on browser manager', async () => {
      const server = new ConcurrentBrowserServer(config);
      await server.shutdown();

      // The mocked BrowserManager.destroy should have been called
      const { BrowserManager } = await import('../browser-manager.js');
      const managerInstance = vi.mocked(BrowserManager).mock.results[0]?.value;
      expect(managerInstance.destroy).toHaveBeenCalled();
    });
  });
});
