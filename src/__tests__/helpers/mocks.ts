import { vi } from 'vitest';

export function createMockPage() {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(undefined),
    goForward: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Example Page'),
    content: vi.fn().mockResolvedValue('<html><body>Hello</body></html>'),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue('Hello World'),
    getAttribute: vi.fn().mockResolvedValue('attr-value'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
    $: vi.fn().mockResolvedValue({
      screenshot: vi.fn().mockResolvedValue(Buffer.from('element-screenshot')),
    }),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForEvent: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue('evaluated'),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    locator: vi.fn().mockReturnValue({
      pressSequentially: vi.fn().mockResolvedValue(undefined),
    }),
    on: vi.fn(),
  };
  return page;
}

export function createMockContext(page?: ReturnType<typeof createMockPage>) {
  return {
    newPage: vi.fn().mockResolvedValue(page ?? createMockPage()),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockBrowser(context?: ReturnType<typeof createMockContext>) {
  const ctx = context ?? createMockContext();
  return {
    newContext: vi.fn().mockResolvedValue(ctx),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
