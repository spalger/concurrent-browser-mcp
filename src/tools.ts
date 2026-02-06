import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { BrowserManager } from './browser-manager.js';
import {
  BrowserConfig,
  BrowserInstance,
  ToolResult,
  NavigationOptions,
  ClickOptions,
  TypeOptions,
  ScreenshotOptions
} from './types.js';

const MAX_SCRIPT_SIZE = 1_000_000;
const MAX_SELECTOR_SIZE = 10_000;

export class BrowserTools {
  constructor(private browserManager: BrowserManager) {}

  private validateUrl(url: string): void {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported URL protocol: ${parsed.protocol} — only http: and https: are allowed`);
    }
  }

  private validateSelector(selector: string): ToolResult | null {
    if (selector.length > MAX_SELECTOR_SIZE) {
      return {
        success: false,
        error: `Selector exceeds maximum size of ${MAX_SELECTOR_SIZE} characters`
      };
    }
    return null;
  }

  /**
   * Get all tool definitions
   */
  getTools(): Tool[] {
    return [
      // Instance management tools
      {
        name: 'browser_create_instance',
        description: 'Create a new browser instance',
        inputSchema: {
          type: 'object',
          properties: {
            browserType: {
              type: 'string',
              enum: ['chromium', 'firefox', 'webkit'],
              description: 'Browser type',
              default: 'chromium'
            },
            headless: {
              type: 'boolean',
              description: 'Whether to run in headless mode',
              default: true
            },
            viewport: {
              type: 'object',
              properties: {
                width: { type: 'number', default: 1280 },
                height: { type: 'number', default: 720 }
              },
              description: 'Viewport size'
            },
            userAgent: {
              type: 'string',
              description: 'User agent string'
            },
            metadata: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Instance name' },
                description: { type: 'string', description: 'Instance description' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags' }
              },
              description: 'Instance metadata'
            }
          }
        }
      },
      {
        name: 'browser_list_instances',
        description: 'List all browser instances',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'browser_close_instance',
        description: 'Close the specified browser instance',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            }
          },
          required: ['instanceId']
        }
      },
      {
        name: 'browser_close_all_instances',
        description: 'Close all browser instances',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },

      // Navigation tools
      {
        name: 'browser_navigate',
        description: 'Navigate to a specified URL',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            url: {
              type: 'string',
              description: 'Target URL',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            },
            waitUntil: {
              type: 'string',
              enum: ['load', 'domcontentloaded', 'networkidle'],
              description: 'Wait condition',
              default: 'load'
            }
          },
          required: ['instanceId', 'url']
        }
      },
      {
        name: 'browser_go_back',
        description: 'Go back to the previous page',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            }
          },
          required: ['instanceId']
        }
      },
      {
        name: 'browser_go_forward',
        description: 'Go forward to the next page',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            }
          },
          required: ['instanceId']
        }
      },
      {
        name: 'browser_refresh',
        description: 'Refresh the current page',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            }
          },
          required: ['instanceId']
        }
      },

      // Page interaction tools
      {
        name: 'browser_click',
        description: 'Click on a page element',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            selector: {
              type: 'string',
              description: 'Element selector',
            },
            button: {
              type: 'string',
              enum: ['left', 'right', 'middle'],
              description: 'Mouse button',
              default: 'left'
            },
            clickCount: {
              type: 'number',
              description: 'Number of clicks',
              default: 1
            },
            delay: {
              type: 'number',
              description: 'Click delay in milliseconds',
              default: 0
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['instanceId', 'selector']
        }
      },
      {
        name: 'browser_type',
        description: 'Type text into an element',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            selector: {
              type: 'string',
              description: 'Element selector',
            },
            text: {
              type: 'string',
              description: 'Text to input',
            },
            delay: {
              type: 'number',
              description: 'Input delay in milliseconds',
              default: 0
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['instanceId', 'selector', 'text']
        }
      },
      {
        name: 'browser_fill',
        description: 'Fill a form field',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            selector: {
              type: 'string',
              description: 'Element selector',
            },
            value: {
              type: 'string',
              description: 'Value to fill',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['instanceId', 'selector', 'value']
        }
      },
      {
        name: 'browser_select_option',
        description: 'Select an option from a dropdown',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            selector: {
              type: 'string',
              description: 'Element selector',
            },
            value: {
              type: 'string',
              description: 'Value to select',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['instanceId', 'selector', 'value']
        }
      },

      // Page information tools
      {
        name: 'browser_get_page_info',
        description: 'Get detailed page information including full HTML content, page statistics, and metadata',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            }
          },
          required: ['instanceId']
        }
      },
      {
        name: 'browser_get_element_text',
        description: 'Get element text content',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            selector: {
              type: 'string',
              description: 'Element selector',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['instanceId', 'selector']
        }
      },
      {
        name: 'browser_get_element_attribute',
        description: 'Get element attribute value',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            selector: {
              type: 'string',
              description: 'Element selector',
            },
            attribute: {
              type: 'string',
              description: 'Attribute name',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['instanceId', 'selector', 'attribute']
        }
      },

      // Screenshot tool
      {
        name: 'browser_screenshot',
        description: 'Take a screenshot of the page or element',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            fullPage: {
              type: 'boolean',
              description: 'Whether to capture the full page',
              default: false
            },
            selector: {
              type: 'string',
              description: 'Element selector (capture specific element)'
            },
            type: {
              type: 'string',
              enum: ['png', 'jpeg'],
              description: 'Image format',
              default: 'png'
            },
            quality: {
              type: 'number',
              description: 'Image quality (1-100, JPEG only)',
              minimum: 1,
              maximum: 100,
              default: 80
            }
          },
          required: ['instanceId']
        }
      },

      // Wait tools
      {
        name: 'browser_wait_for_element',
        description: 'Wait for an element to appear',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            selector: {
              type: 'string',
              description: 'Element selector',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['instanceId', 'selector']
        }
      },
      {
        name: 'browser_wait_for_navigation',
        description: 'Wait for page navigation to complete',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['instanceId']
        }
      },

      // JavaScript execution tool
      {
        name: 'browser_evaluate',
        description: 'Execute JavaScript code in the page context',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            script: {
              type: 'string',
              description: 'JavaScript code to execute',
            }
          },
          required: ['instanceId', 'script']
        }
      },

      // Content extraction tool
      {
        name: 'browser_get_markdown',
        description: 'Get page content in Markdown format, optimized for large language models',
        inputSchema: {
          type: 'object',
          properties: {
            instanceId: {
              type: 'string',
              description: 'Instance ID'
            },
            includeLinks: {
              type: 'boolean',
              description: 'Whether to include links',
              default: true
            },
            maxLength: {
              type: 'number',
              description: 'Maximum content length in characters',
              default: 10000
            },
            selector: {
              type: 'string',
              description: 'Optional CSS selector to extract content from specific element only'
            }
          },
          required: ['instanceId']
        }
      }
    ];
  }

  /**
   * Execute tools
   */
  async executeTools(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'browser_create_instance':
          return await this.browserManager.createInstance(
            {
              browserType: (args['browserType'] as BrowserConfig['browserType']) || 'chromium',
              headless: (args['headless'] as boolean) ?? true,
              viewport: (args['viewport'] as { width: number; height: number }) || { width: 1280, height: 720 },
              userAgent: args['userAgent'] as string | undefined
            },
            args['metadata'] as BrowserInstance['metadata']
          );

        case 'browser_list_instances':
          return this.browserManager.listInstances();

        case 'browser_close_instance':
          return await this.browserManager.closeInstance(args['instanceId'] as string);

        case 'browser_close_all_instances':
          return await this.browserManager.closeAllInstances();

        case 'browser_navigate':
          return await this.navigate(args['instanceId'] as string, args['url'] as string, {
            timeout: (args['timeout'] as number) || 30000,
            waitUntil: (args['waitUntil'] as NavigationOptions['waitUntil']) || 'load'
          });

        case 'browser_go_back':
          return await this.goBack(args['instanceId'] as string);

        case 'browser_go_forward':
          return await this.goForward(args['instanceId'] as string);

        case 'browser_refresh':
          return await this.refresh(args['instanceId'] as string);

        case 'browser_click':
          return await this.click(args['instanceId'] as string, args['selector'] as string, {
            button: (args['button'] as ClickOptions['button']) || 'left',
            clickCount: (args['clickCount'] as number) || 1,
            delay: (args['delay'] as number) || 0,
            timeout: (args['timeout'] as number) || 30000
          });

        case 'browser_type':
          return await this.type(args['instanceId'] as string, args['selector'] as string, args['text'] as string, {
            delay: (args['delay'] as number) || 0,
            timeout: (args['timeout'] as number) || 30000
          });

        case 'browser_fill':
          return await this.fill(args['instanceId'] as string, args['selector'] as string, args['value'] as string, (args['timeout'] as number) || 30000);

        case 'browser_select_option':
          return await this.selectOption(args['instanceId'] as string, args['selector'] as string, args['value'] as string, (args['timeout'] as number) || 30000);

        case 'browser_get_page_info':
          return await this.getPageInfo(args['instanceId'] as string);

        case 'browser_get_element_text':
          return await this.getElementText(args['instanceId'] as string, args['selector'] as string, (args['timeout'] as number) || 30000);

        case 'browser_get_element_attribute':
          return await this.getElementAttribute(args['instanceId'] as string, args['selector'] as string, args['attribute'] as string, (args['timeout'] as number) || 30000);

        case 'browser_screenshot':
          return await this.screenshot(args['instanceId'] as string, {
            fullPage: (args['fullPage'] as boolean) || false,
            type: (args['type'] as 'png' | 'jpeg') || 'png',
            quality: (args['quality'] as number) || 80
          }, args['selector'] as string | undefined);

        case 'browser_wait_for_element':
          return await this.waitForElement(args['instanceId'] as string, args['selector'] as string, (args['timeout'] as number) || 30000);

        case 'browser_wait_for_navigation':
          return await this.waitForNavigation(args['instanceId'] as string, (args['timeout'] as number) || 30000);

        case 'browser_evaluate':
          return await this.evaluate(args['instanceId'] as string, args['script'] as string);

        case 'browser_get_markdown':
          return await this.getMarkdown(args['instanceId'] as string, {
            includeLinks: (args['includeLinks'] as boolean) ?? true,
            maxLength: (args['maxLength'] as number) || 10000,
            selector: args['selector'] as string | undefined
          });

        default:
          return {
            success: false,
            error: `Unknown tool: ${name}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : error}`
      };
    }
  }

  // Implementation of specific tool methods
  private async navigate(instanceId: string, url: string, options: NavigationOptions): Promise<ToolResult> {
    try {
      this.validateUrl(url);
    } catch (error) {
      return { success: false, error: `Invalid URL: ${error instanceof Error ? error.message : error}` };
    }

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      const gotoOptions: any = {
        waitUntil: options.waitUntil
      };
      if (options.timeout) {
        gotoOptions.timeout = options.timeout;
      }
      await instance.page.goto(url, gotoOptions);
      return {
        success: true,
        data: { url: instance.page.url(), title: await instance.page.title() },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Navigation failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async goBack(instanceId: string): Promise<ToolResult> {
    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      await instance.page.goBack();
      return {
        success: true,
        data: { url: instance.page.url() },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Go back failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async goForward(instanceId: string): Promise<ToolResult> {
    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      await instance.page.goForward();
      return {
        success: true,
        data: { url: instance.page.url() },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Go forward failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async refresh(instanceId: string): Promise<ToolResult> {
    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      await instance.page.reload();
      return {
        success: true,
        data: { url: instance.page.url() },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Refresh failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async click(instanceId: string, selector: string, options: ClickOptions): Promise<ToolResult> {
    const selectorError = this.validateSelector(selector);
    if (selectorError) return selectorError;

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      const clickOptions: any = {
        button: options.button
      };
      if (options.clickCount) clickOptions.clickCount = options.clickCount;
      if (options.delay) clickOptions.delay = options.delay;
      if (options.timeout) clickOptions.timeout = options.timeout;
      await instance.page.click(selector, clickOptions);
      return {
        success: true,
        data: { selector, clicked: true },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Click failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async type(instanceId: string, selector: string, text: string, options: TypeOptions): Promise<ToolResult> {
    const selectorError = this.validateSelector(selector);
    if (selectorError) return selectorError;

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      const typeOptions: any = {};
      if (options.delay) typeOptions.delay = options.delay;
      if (options.timeout) typeOptions.timeout = options.timeout;
      await instance.page.locator(selector).pressSequentially(text, typeOptions);
      return {
        success: true,
        data: { selector, text, typed: true },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Type failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async fill(instanceId: string, selector: string, value: string, timeout: number): Promise<ToolResult> {
    const selectorError = this.validateSelector(selector);
    if (selectorError) return selectorError;

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      await instance.page.fill(selector, value, { timeout });
      return {
        success: true,
        data: { selector, value, filled: true },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Fill failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async selectOption(instanceId: string, selector: string, value: string, timeout: number): Promise<ToolResult> {
    const selectorError = this.validateSelector(selector);
    if (selectorError) return selectorError;

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      await instance.page.selectOption(selector, value, { timeout });
      return {
        success: true,
        data: { selector, value, selected: true },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Select option failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async getPageInfo(instanceId: string): Promise<ToolResult> {
    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      const url = instance.page.url();
      const title = await instance.page.title();
      const content = await instance.page.content();
      
      // Get additional page information
      const viewport = instance.page.viewportSize();
      const loadState = await instance.page.evaluate(() => document.readyState);
      
      // Get basic page statistics
      const pageStats = await instance.page.evaluate(() => {
        const links = document.querySelectorAll('a[href]').length;
        const images = document.querySelectorAll('img').length;
        const forms = document.querySelectorAll('form').length;
        const scripts = document.querySelectorAll('script').length;
        const stylesheets = document.querySelectorAll('link[rel="stylesheet"]').length;
        
        return {
          linksCount: links,
          imagesCount: images,
          formsCount: forms,
          scriptsCount: scripts,
          stylesheetsCount: stylesheets
        };
      });
      
      return {
        success: true,
        data: { 
          url, 
          title, 
          content,  // Return complete HTML content
          contentLength: content.length,
          viewport,
          loadState,
          stats: pageStats,
          timestamp: new Date().toISOString()
        },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Get page info failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async getElementText(instanceId: string, selector: string, timeout: number): Promise<ToolResult> {
    const selectorError = this.validateSelector(selector);
    if (selectorError) return selectorError;

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      const text = await instance.page.textContent(selector, { timeout });
      return {
        success: true,
        data: { selector, text },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Get element text failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async getElementAttribute(instanceId: string, selector: string, attribute: string, timeout: number): Promise<ToolResult> {
    const selectorError = this.validateSelector(selector);
    if (selectorError) return selectorError;

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      const value = await instance.page.getAttribute(selector, attribute, { timeout });
      return {
        success: true,
        data: { selector, attribute, value },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Get element attribute failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async screenshot(instanceId: string, options: ScreenshotOptions, selector?: string): Promise<ToolResult> {
    if (selector) {
      const selectorError = this.validateSelector(selector);
      if (selectorError) return selectorError;
    }

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      let screenshotData: Buffer;
      
      if (selector) {
        const element = await instance.page.$(selector);
        if (!element) {
          return { success: false, error: `Element not found: ${selector}`, instanceId };
        }
        screenshotData = await element.screenshot({
          type: options.type,
          quality: options.type === 'jpeg' ? options.quality : undefined
        });
      } else {
        screenshotData = await instance.page.screenshot({
          fullPage: options.fullPage,
          type: options.type,
          quality: options.type === 'jpeg' ? options.quality : undefined,
          clip: options.clip
        });
      }

      return {
        success: true,
        data: { 
          screenshot: screenshotData.toString('base64'),
          type: options.type,
          selector
        },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Screenshot failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async waitForElement(instanceId: string, selector: string, timeout: number): Promise<ToolResult> {
    const selectorError = this.validateSelector(selector);
    if (selectorError) return selectorError;

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      await instance.page.waitForSelector(selector, { timeout });
      return {
        success: true,
        data: { selector, found: true },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Wait for element failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async waitForNavigation(instanceId: string, timeout: number): Promise<ToolResult> {
    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      await instance.page.waitForEvent('framenavigated', { timeout });
      return {
        success: true,
        data: { url: instance.page.url() },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Wait for navigation failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async evaluate(instanceId: string, script: string): Promise<ToolResult> {
    if (script.length > MAX_SCRIPT_SIZE) {
      return { success: false, error: `Script exceeds maximum size of ${MAX_SCRIPT_SIZE} characters` };
    }

    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      const result = await instance.page.evaluate(script);
      return {
        success: true,
        data: { script, result },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Evaluate failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }

  private async getMarkdown(instanceId: string, options: {
    includeLinks: boolean;
    maxLength: number;
    selector?: string;
  }): Promise<ToolResult> {
    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }

    try {
      // JavaScript function to extract page content and convert to Markdown
      const markdownContent = await instance.page.evaluate((opts) => {
        const { includeLinks, maxLength, selector } = opts;
        
        // Select the root element to process
        const rootElement = selector ? document.querySelector(selector) : document.body;
        if (!rootElement) {
          return 'Specified element or page content not found';
        }

        // HTML to Markdown conversion function
        function htmlToMarkdown(element: any, depth = 0) {
          let markdown = '';
          const indent = '  '.repeat(depth);
          
          for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent?.trim();
              if (text) {
                markdown += text + ' ';
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as Element;
              const tagName = el.tagName.toLowerCase();
              
              switch (tagName) {
                case 'h1':
                  markdown += `\n\n# ${el.textContent?.trim()}\n\n`;
                  break;
                case 'h2':
                  markdown += `\n\n## ${el.textContent?.trim()}\n\n`;
                  break;
                case 'h3':
                  markdown += `\n\n### ${el.textContent?.trim()}\n\n`;
                  break;
                case 'h4':
                  markdown += `\n\n#### ${el.textContent?.trim()}\n\n`;
                  break;
                case 'h5':
                  markdown += `\n\n##### ${el.textContent?.trim()}\n\n`;
                  break;
                case 'h6':
                  markdown += `\n\n###### ${el.textContent?.trim()}\n\n`;
                  break;
                case 'p':
                  const pText = htmlToMarkdown(el, depth);
                  if (pText.trim()) {
                    markdown += `\n\n${pText.trim()}\n`;
                  }
                  break;
                case 'br':
                  markdown += '\n';
                  break;
                case 'strong':
                case 'b':
                  markdown += `**${el.textContent?.trim()}**`;
                  break;
                case 'em':
                case 'i':
                  markdown += `*${el.textContent?.trim()}*`;
                  break;
                case 'code':
                  markdown += `\`${el.textContent?.trim()}\``;
                  break;
                case 'pre':
                  markdown += `\n\`\`\`\n${el.textContent?.trim()}\n\`\`\`\n`;
                  break;
                case 'a':
                  const href = el.getAttribute('href');
                  const linkText = el.textContent?.trim();
                  if (includeLinks && href && linkText) {
                    if (href.startsWith('http')) {
                      markdown += `[${linkText}](${href})`;
                    } else {
                      markdown += linkText;
                    }
                  } else {
                    markdown += linkText || '';
                  }
                  break;
                case 'ul':
                case 'ol':
                  markdown += '\n';
                  const listItems = el.querySelectorAll('li');
                  listItems.forEach((li, index) => {
                    const bullet = tagName === 'ul' ? '-' : `${index + 1}.`;
                    markdown += `${indent}${bullet} ${li.textContent?.trim()}\n`;
                  });
                  markdown += '\n';
                  break;
                case 'blockquote':
                  const quoteText = el.textContent?.trim();
                  if (quoteText) {
                    markdown += `\n> ${quoteText}\n\n`;
                  }
                  break;
                case 'div':
                case 'section':
                case 'article':
                case 'main':
                  // Recursively process container elements
                  markdown += htmlToMarkdown(el, depth);
                  break;
                case 'table':
                  // Simplified table processing
                  const rows = el.querySelectorAll('tr');
                  if (rows.length > 0) {
                    markdown += '\n\n';
                    rows.forEach((row, rowIndex) => {
                      const cells = row.querySelectorAll('td, th');
                      const cellTexts = Array.from(cells).map(cell => cell.textContent?.trim() || '');
                      markdown += '| ' + cellTexts.join(' | ') + ' |\n';
                      if (rowIndex === 0) {
                        markdown += '|' + ' --- |'.repeat(cells.length) + '\n';
                      }
                    });
                    markdown += '\n';
                  }
                  break;
                case 'script':
                case 'style':
                case 'nav':
                case 'footer':
                case 'aside':
                  // Ignore these elements
                  break;
                default:
                  // For other elements, continue recursive processing of child elements
                  markdown += htmlToMarkdown(el, depth);
                  break;
              }
            }
          }
          
          return markdown;
        }

        // Extract page title
        const title = document.title;
        const url = window.location.href;
        
        // Generate Markdown content
        let content = `# ${title}\n\n**URL:** ${url}\n\n`;
        content += htmlToMarkdown(rootElement);
        
        // Clean up extra line breaks and spaces
        content = content
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]+/g, ' ')
          .trim();
        
        // Truncate content if exceeds maximum length
        if (content.length > maxLength) {
          content = content.substring(0, maxLength) + '\n\n[Content truncated...]';
        }
        
        return content;
      }, options);

      return {
        success: true,
        data: { 
          markdown: markdownContent,
          length: markdownContent.length,
          truncated: markdownContent.length >= options.maxLength,
          url: instance.page.url(),
          title: await instance.page.title()
        },
        instanceId
      };
    } catch (error) {
      return {
        success: false,
        error: `Get markdown failed: ${error instanceof Error ? error.message : error}`,
        instanceId
      };
    }
  }
} 