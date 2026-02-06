import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPage } from './helpers/mocks.js';
import type { BrowserInstance } from '../types.js';

// Create a mock BrowserManager
function createMockBrowserManager() {
  const mockPage = createMockPage();

  const mockInstance = {
    id: 'test-instance-1',
    browser: { close: vi.fn() },
    context: { close: vi.fn() },
    page: mockPage,
    createdAt: new Date(),
    lastUsed: new Date(),
    isActive: true,
  } as unknown as BrowserInstance;

  const manager = {
    getInstance: vi.fn((id: string) => {
      if (id === 'test-instance-1') return mockInstance;
      return undefined;
    }),
    createInstance: vi.fn().mockResolvedValue({
      success: true,
      data: { instanceId: 'new-instance' },
      instanceId: 'new-instance',
    }),
    listInstances: vi.fn().mockReturnValue({
      success: true,
      data: { instances: [], totalCount: 0, maxInstances: 5 },
    }),
    closeInstance: vi.fn().mockResolvedValue({
      success: true,
      data: { instanceId: 'test-instance-1', closed: true },
    }),
    closeAllInstances: vi.fn().mockResolvedValue({
      success: true,
      data: { closedCount: 1 },
    }),
    getConsoleLogs: vi.fn().mockReturnValue({
      success: true,
      data: { logs: [], totalEntries: 0, returnedEntries: 0, filtered: false, cleared: false },
    }),
  };

  return { manager, mockInstance, mockPage };
}

// Import BrowserTools (no need to mock playwright here since we mock the manager)
const { BrowserTools } = await import('../tools.js');

describe('BrowserTools', () => {
  let tools: InstanceType<typeof BrowserTools>;
  let mockPage: ReturnType<typeof createMockPage>;
  let manager: ReturnType<typeof createMockBrowserManager>['manager'];

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMockBrowserManager();
    manager = mocks.manager;
    mockPage = mocks.mockPage;
    // BrowserTools constructor expects a BrowserManager - our mock satisfies the duck type
    tools = new BrowserTools(manager as never);
  });

  describe('tool definitions', () => {
    it('returns all expected tools', () => {
      const toolList = tools.getTools();

      expect(toolList.length).toBeGreaterThan(0);

      const toolNames = toolList.map((t) => t.name);
      expect(toolNames).toContain('browser_create_instance');
      expect(toolNames).toContain('browser_navigate');
      expect(toolNames).toContain('browser_click');
      expect(toolNames).toContain('browser_type');
      expect(toolNames).toContain('browser_fill');
      expect(toolNames).toContain('browser_screenshot');
      expect(toolNames).toContain('browser_evaluate');
      expect(toolNames).toContain('browser_get_markdown');
      expect(toolNames).toContain('browser_wait_for_element');
      expect(toolNames).toContain('browser_wait_for_navigation');
      expect(toolNames).toContain('browser_get_page_info');
      expect(toolNames).toContain('browser_get_element_text');
      expect(toolNames).toContain('browser_get_element_attribute');
      expect(toolNames).toContain('browser_select_option');
      expect(toolNames).toContain('browser_go_back');
      expect(toolNames).toContain('browser_go_forward');
      expect(toolNames).toContain('browser_refresh');
      expect(toolNames).toContain('browser_list_instances');
      expect(toolNames).toContain('browser_close_instance');
      expect(toolNames).toContain('browser_close_all_instances');
      expect(toolNames).toContain('browser_get_console_logs');
    });

    it('each tool has name, description, and inputSchema', () => {
      const toolList = tools.getTools();

      for (const tool of toolList) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('dispatch', () => {
    it('routes browser_create_instance correctly', async () => {
      const result = await tools.executeTools('browser_create_instance', {
        browserType: 'chromium',
      });

      expect(manager.createInstance).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('routes browser_list_instances correctly', async () => {
      const result = await tools.executeTools('browser_list_instances', {});

      expect(manager.listInstances).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('routes browser_close_instance correctly', async () => {
      const result = await tools.executeTools('browser_close_instance', {
        instanceId: 'test-instance-1',
      });

      expect(manager.closeInstance).toHaveBeenCalledWith('test-instance-1');
      expect(result.success).toBe(true);
    });

    it('routes browser_close_all_instances correctly', async () => {
      const result = await tools.executeTools('browser_close_all_instances', {});

      expect(manager.closeAllInstances).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('returns error for unknown tool name', async () => {
      const result = await tools.executeTools('nonexistent_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });

  describe('navigate', () => {
    it('calls page.goto and returns url and title', async () => {
      const result = await tools.executeTools('browser_navigate', {
        instanceId: 'test-instance-1',
        url: 'https://example.com',
      });

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ waitUntil: 'load' })
      );
      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://example.com');
      expect(result.data.title).toBe('Example Page');
    });

    it('rejects file:// URLs', async () => {
      const result = await tools.executeTools('browser_navigate', {
        instanceId: 'test-instance-1',
        url: 'file:///etc/passwd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unsupported.*protocol|file:/i);
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('rejects javascript: URLs', async () => {
      const result = await tools.executeTools('browser_navigate', {
        instanceId: 'test-instance-1',
        url: 'javascript:alert(1)',
      });

      expect(result.success).toBe(false);
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('rejects data: URLs', async () => {
      const result = await tools.executeTools('browser_navigate', {
        instanceId: 'test-instance-1',
        url: 'data:text/html,<h1>hi</h1>',
      });

      expect(result.success).toBe(false);
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('returns error for non-existent instance', async () => {
      const result = await tools.executeTools('browser_navigate', {
        instanceId: 'bad-id',
        url: 'https://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('handles navigation errors gracefully', async () => {
      mockPage.goto.mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));

      const result = await tools.executeTools('browser_navigate', {
        instanceId: 'test-instance-1',
        url: 'https://nonexistent.invalid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ERR_NAME_NOT_RESOLVED');
    });
  });

  describe('click', () => {
    it('calls page.click with selector and options', async () => {
      const result = await tools.executeTools('browser_click', {
        instanceId: 'test-instance-1',
        selector: '#btn',
        button: 'left',
      });

      expect(mockPage.click).toHaveBeenCalledWith(
        '#btn',
        expect.objectContaining({ button: 'left' })
      );
      expect(result.success).toBe(true);
      expect(result.data.clicked).toBe(true);
    });

    it('returns error when click fails', async () => {
      mockPage.click.mockRejectedValueOnce(new Error('Element not visible'));

      const result = await tools.executeTools('browser_click', {
        instanceId: 'test-instance-1',
        selector: '#hidden',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Element not visible');
    });

    it('rejects oversized selectors', async () => {
      const hugeSelector = 'a'.repeat(10_001);

      const result = await tools.executeTools('browser_click', {
        instanceId: 'test-instance-1',
        selector: hugeSelector,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum size');
    });
  });

  describe('type', () => {
    it('uses page.locator().pressSequentially() after fix', async () => {
      const result = await tools.executeTools('browser_type', {
        instanceId: 'test-instance-1',
        selector: '#input',
        text: 'hello',
      });

      expect(result.success).toBe(true);
      // After the fix, type() uses locator().pressSequentially() instead of page.type()
      expect(mockPage.locator).toHaveBeenCalledWith('#input');
      expect(mockPage.locator('#input').pressSequentially).toHaveBeenCalledWith(
        'hello',
        expect.any(Object)
      );
    });

    it('rejects oversized selectors', async () => {
      const hugeSelector = 'x'.repeat(10_001);

      const result = await tools.executeTools('browser_type', {
        instanceId: 'test-instance-1',
        selector: hugeSelector,
        text: 'hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum size');
    });
  });

  describe('fill', () => {
    it('calls page.fill with selector and value', async () => {
      const result = await tools.executeTools('browser_fill', {
        instanceId: 'test-instance-1',
        selector: '#name',
        value: 'John',
      });

      expect(mockPage.fill).toHaveBeenCalledWith('#name', 'John', expect.any(Object));
      expect(result.success).toBe(true);
      expect(result.data.filled).toBe(true);
    });

    it('rejects oversized selectors', async () => {
      const hugeSelector = 's'.repeat(10_001);

      const result = await tools.executeTools('browser_fill', {
        instanceId: 'test-instance-1',
        selector: hugeSelector,
        value: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum size');
    });
  });

  describe('selectOption', () => {
    it('calls page.selectOption correctly', async () => {
      const result = await tools.executeTools('browser_select_option', {
        instanceId: 'test-instance-1',
        selector: '#dropdown',
        value: 'opt1',
      });

      expect(mockPage.selectOption).toHaveBeenCalledWith('#dropdown', 'opt1', expect.any(Object));
      expect(result.success).toBe(true);
      expect(result.data.selected).toBe(true);
    });
  });

  describe('getPageInfo', () => {
    it('returns full page data with stats', async () => {
      mockPage.evaluate.mockResolvedValueOnce('complete');
      mockPage.evaluate.mockResolvedValueOnce({
        linksCount: 5,
        imagesCount: 3,
        formsCount: 1,
        scriptsCount: 2,
        stylesheetsCount: 1,
      });

      const result = await tools.executeTools('browser_get_page_info', {
        instanceId: 'test-instance-1',
      });

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://example.com');
      expect(result.data.title).toBe('Example Page');
      expect(result.data.content).toBeDefined();
      expect(result.data.stats).toBeDefined();
      expect(result.data.viewport).toEqual({ width: 1280, height: 720 });
    });
  });

  describe('getElementText', () => {
    it('calls page.textContent with selector and timeout', async () => {
      const result = await tools.executeTools('browser_get_element_text', {
        instanceId: 'test-instance-1',
        selector: '.title',
        timeout: 5000,
      });

      expect(mockPage.textContent).toHaveBeenCalledWith('.title', { timeout: 5000 });
      expect(result.success).toBe(true);
      expect(result.data.text).toBe('Hello World');
    });
  });

  describe('getElementAttribute', () => {
    it('calls page.getAttribute with correct params', async () => {
      const result = await tools.executeTools('browser_get_element_attribute', {
        instanceId: 'test-instance-1',
        selector: 'a.link',
        attribute: 'href',
      });

      expect(mockPage.getAttribute).toHaveBeenCalledWith('a.link', 'href', expect.any(Object));
      expect(result.success).toBe(true);
      expect(result.data.value).toBe('attr-value');
    });
  });

  describe('screenshot', () => {
    it('takes a full page screenshot', async () => {
      const result = await tools.executeTools('browser_screenshot', {
        instanceId: 'test-instance-1',
        fullPage: true,
      });

      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true })
      );
      expect(result.success).toBe(true);
      expect(result.data.screenshot).toBeDefined();
    });

    it('takes an element screenshot', async () => {
      const result = await tools.executeTools('browser_screenshot', {
        instanceId: 'test-instance-1',
        selector: '#hero',
      });

      expect(mockPage.$).toHaveBeenCalledWith('#hero');
      expect(result.success).toBe(true);
      expect(result.data.selector).toBe('#hero');
    });

    it('returns error when element not found for element screenshot', async () => {
      mockPage.$.mockResolvedValueOnce(null);

      const result = await tools.executeTools('browser_screenshot', {
        instanceId: 'test-instance-1',
        selector: '#nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Element not found');
    });

    it('returns base64-encoded data', async () => {
      mockPage.screenshot.mockResolvedValueOnce(Buffer.from('png-data'));

      const result = await tools.executeTools('browser_screenshot', {
        instanceId: 'test-instance-1',
      });

      expect(result.data.screenshot).toBe(Buffer.from('png-data').toString('base64'));
    });
  });

  describe('waitForElement', () => {
    it('calls page.waitForSelector with timeout', async () => {
      const result = await tools.executeTools('browser_wait_for_element', {
        instanceId: 'test-instance-1',
        selector: '.loading',
        timeout: 5000,
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.loading', { timeout: 5000 });
      expect(result.success).toBe(true);
      expect(result.data.found).toBe(true);
    });

    it('rejects oversized selectors', async () => {
      const hugeSelector = 'z'.repeat(10_001);

      const result = await tools.executeTools('browser_wait_for_element', {
        instanceId: 'test-instance-1',
        selector: hugeSelector,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum size');
    });
  });

  describe('waitForNavigation', () => {
    it('calls page.waitForEvent with framenavigated after fix', async () => {
      const result = await tools.executeTools('browser_wait_for_navigation', {
        instanceId: 'test-instance-1',
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      // After fix: uses page.waitForEvent('framenavigated') instead of deprecated waitForNavigation
      expect(mockPage.waitForEvent).toHaveBeenCalledWith('framenavigated', expect.any(Object));
    });
  });

  describe('evaluate', () => {
    it('calls page.evaluate and returns result', async () => {
      mockPage.evaluate.mockResolvedValueOnce(42);

      const result = await tools.executeTools('browser_evaluate', {
        instanceId: 'test-instance-1',
        script: '1 + 1',
      });

      expect(mockPage.evaluate).toHaveBeenCalledWith('1 + 1');
      expect(result.success).toBe(true);
      expect(result.data.result).toBe(42);
    });

    it('rejects scripts exceeding 1MB', async () => {
      const hugeScript = 'x'.repeat(1_000_001);

      const result = await tools.executeTools('browser_evaluate', {
        instanceId: 'test-instance-1',
        script: hugeScript,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum size');
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('handles evaluation errors', async () => {
      mockPage.evaluate.mockRejectedValueOnce(new Error('ReferenceError: x is not defined'));

      const result = await tools.executeTools('browser_evaluate', {
        instanceId: 'test-instance-1',
        script: 'x.y.z',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ReferenceError');
    });
  });

  describe('getMarkdown', () => {
    it('passes options to page.evaluate correctly', async () => {
      mockPage.evaluate.mockResolvedValueOnce('# Title\n\nContent');

      const result = await tools.executeTools('browser_get_markdown', {
        instanceId: 'test-instance-1',
        includeLinks: false,
        maxLength: 500,
        selector: '#main',
      });

      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          includeLinks: false,
          maxLength: 500,
          selector: '#main',
        })
      );
      expect(result.success).toBe(true);
      expect(result.data.markdown).toBe('# Title\n\nContent');
    });
  });

  describe('getConsoleLogs', () => {
    it('routes browser_get_console_logs to manager.getConsoleLogs', async () => {
      const result = await tools.executeTools('browser_get_console_logs', {
        instanceId: 'test-instance-1',
      });

      expect(manager.getConsoleLogs).toHaveBeenCalledWith('test-instance-1', {
        type: undefined,
        limit: undefined,
        clear: false,
      });
      expect(result.success).toBe(true);
    });

    it('passes type, limit, and clear options through', async () => {
      await tools.executeTools('browser_get_console_logs', {
        instanceId: 'test-instance-1',
        type: 'error',
        limit: 10,
        clear: true,
      });

      expect(manager.getConsoleLogs).toHaveBeenCalledWith('test-instance-1', {
        type: 'error',
        limit: 10,
        clear: true,
      });
    });
  });

  describe('navigate clears console logs', () => {
    it('clears consoleLogs buffer before navigating', async () => {
      const mockInstance = manager.getInstance('test-instance-1')!;
      (mockInstance as Record<string, unknown>)['consoleLogs'] = [
        { type: 'log', text: 'old', timestamp: '', location: { url: '', lineNumber: 0, columnNumber: 0 } },
      ];

      await tools.executeTools('browser_navigate', {
        instanceId: 'test-instance-1',
        url: 'https://newsite.com',
      });

      expect((mockInstance as Record<string, unknown>)['consoleLogs']).toEqual([]);
    });
  });

  describe('input validation', () => {
    it('validates selector size on getElementText', async () => {
      const hugeSelector = 'q'.repeat(10_001);

      const result = await tools.executeTools('browser_get_element_text', {
        instanceId: 'test-instance-1',
        selector: hugeSelector,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum size');
    });

    it('validates selector size on getElementAttribute', async () => {
      const hugeSelector = 'r'.repeat(10_001);

      const result = await tools.executeTools('browser_get_element_attribute', {
        instanceId: 'test-instance-1',
        selector: hugeSelector,
        attribute: 'href',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum size');
    });

    it('allows valid http URLs through navigate', async () => {
      const result = await tools.executeTools('browser_navigate', {
        instanceId: 'test-instance-1',
        url: 'http://example.com',
      });

      expect(result.success).toBe(true);
    });

    it('allows valid https URLs through navigate', async () => {
      const result = await tools.executeTools('browser_navigate', {
        instanceId: 'test-instance-1',
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
    });

    it('allows scripts under 1MB through evaluate', async () => {
      mockPage.evaluate.mockResolvedValueOnce('ok');
      const script = 'x'.repeat(999_999);

      const result = await tools.executeTools('browser_evaluate', {
        instanceId: 'test-instance-1',
        script,
      });

      expect(result.success).toBe(true);
    });

    it('allows selectors under 10KB', async () => {
      const selector = 'a'.repeat(9_999);

      const result = await tools.executeTools('browser_click', {
        instanceId: 'test-instance-1',
        selector,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('executeTools args type', () => {
    it('accepts Record<string, unknown> args', async () => {
      const args: Record<string, unknown> = {
        instanceId: 'test-instance-1',
        url: 'https://example.com',
      };

      const result = await tools.executeTools('browser_navigate', args);

      expect(result.success).toBe(true);
    });
  });
});
