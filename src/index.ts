#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ConcurrentBrowserServer, defaultConfig } from './server.js';
import { ServerConfig } from './types.js';

const program = new Command();

program
  .name('concurrent-browser-mcp')
  .description('A multi-concurrent browser MCP server')
  .version('1.0.0');

program
  .option('-m, --max-instances <number>', 'Maximum number of instances', (value) => parseInt(value), defaultConfig.maxInstances)
  .option('-t, --instance-timeout <number>', 'Instance timeout in minutes', (value) => parseInt(value) * 60 * 1000, defaultConfig.instanceTimeout)
  .option('-c, --cleanup-interval <number>', 'Cleanup interval in minutes', (value) => parseInt(value) * 60 * 1000, defaultConfig.cleanupInterval)
  .option('--browser <browser>', 'Default browser type', 'chromium')
  .option('--headless', 'Default headless mode', true)
  .option('--width <number>', 'Default viewport width', (value) => parseInt(value), defaultConfig.defaultBrowserConfig.viewport?.width || 1280)
  .option('--height <number>', 'Default viewport height', (value) => parseInt(value), defaultConfig.defaultBrowserConfig.viewport?.height || 720)
  .option('--user-agent <string>', 'Default user agent')
  .option('--ignore-https-errors', 'Ignore HTTPS errors', false)
  .option('--bypass-csp', 'Bypass CSP', false)
  .option('--proxy <string>', 'Proxy server (e.g., http://127.0.0.1:7890)')
  .option('--no-proxy-auto-detect', 'Disable automatic proxy detection')
  .action(async (options) => {
    // Build configuration
    const config: ServerConfig = {
      maxInstances: options.maxInstances,
      instanceTimeout: options.instanceTimeout,
      cleanupInterval: options.cleanupInterval,
      defaultBrowserConfig: {
        browserType: options.browser as 'chromium' | 'firefox' | 'webkit',
        headless: options.headless,
        viewport: {
          width: options.width,
          height: options.height,
        },
        userAgent: options.userAgent,
        contextOptions: {
          ignoreHTTPSErrors: options.ignoreHttpsErrors,
          bypassCSP: options.bypassCsp,
        },
      },
      proxy: {
        server: options.proxy,
        autoDetect: options.proxyAutoDetect !== false, // Enable by default unless explicitly disabled
      },
    };

    // Start server
    try {
      console.error(chalk.blue('🚀 Starting Concurrent Browser MCP Server...'));
      console.error(chalk.gray(`Max instances: ${config.maxInstances}`));
      console.error(chalk.gray(`Default browser: ${config.defaultBrowserConfig.browserType}`));
      console.error(chalk.gray(`Headless mode: ${config.defaultBrowserConfig.headless ? 'yes' : 'no'}`));
      console.error(chalk.gray(`Viewport size: ${config.defaultBrowserConfig.viewport?.width}x${config.defaultBrowserConfig.viewport?.height}`));
      console.error(chalk.gray(`Instance timeout: ${config.instanceTimeout / 60000} minutes`));
      console.error(chalk.gray(`Cleanup interval: ${config.cleanupInterval / 60000} minutes`));
      
      if (config.proxy?.server) {
        console.error(chalk.gray(`Proxy server: ${config.proxy.server}`));
      } else if (config.proxy?.autoDetect) {
        console.error(chalk.gray('Proxy: Auto-detection enabled'));
      } else {
        console.error(chalk.gray('Proxy: Disabled'));
      }
      console.error('');

      const server = new ConcurrentBrowserServer(config);
      await server.run();
    } catch (error) {
      console.error(chalk.red('❌ Failed to start server:'), error);
      process.exit(1);
    }
  });

// Add example command
program
  .command('example')
  .description('Show usage examples')
  .action(() => {
    console.log(chalk.bold('\n📚 Usage Examples:\n'));
    
    console.log(chalk.yellow('1. Start server (default configuration):'));
    console.log(chalk.gray('  npx concurrent-browser-mcp\n'));
    
    console.log(chalk.yellow('2. Start server (custom configuration):'));
    console.log(chalk.gray('  npx concurrent-browser-mcp --max-instances 25 --browser firefox --headless false\n'));
    
    console.log(chalk.yellow('3. Start server with proxy:'));
    console.log(chalk.gray('  npx concurrent-browser-mcp --proxy http://127.0.0.1:7890\n'));
    
    console.log(chalk.yellow('4. Start server without proxy auto-detection:'));
    console.log(chalk.gray('  npx concurrent-browser-mcp --no-proxy-auto-detect\n'));
    
    console.log(chalk.yellow('5. Use in MCP client:'));
    console.log(chalk.gray('  {'));
    console.log(chalk.gray('    "mcpServers": {'));
    console.log(chalk.gray('      "concurrent-browser": {'));
    console.log(chalk.gray('        "command": "npx",'));
    console.log(chalk.gray('        "args": ["concurrent-browser-mcp", "--max-instances", "20", "--proxy", "http://127.0.0.1:7890"]'));
    console.log(chalk.gray('      }'));
    console.log(chalk.gray('    }'));
    console.log(chalk.gray('  }\n'));
    
    console.log(chalk.yellow('6. Available tools include:'));
    console.log(chalk.gray('  - browser_create_instance: Create browser instance'));
    console.log(chalk.gray('  - browser_list_instances: List all instances'));
    console.log(chalk.gray('  - browser_navigate: Navigate to URL'));
    console.log(chalk.gray('  - browser_click: Click element'));
    console.log(chalk.gray('  - browser_type: Type text'));
    console.log(chalk.gray('  - browser_screenshot: Take screenshot'));
    console.log(chalk.gray('  - browser_evaluate: Execute JavaScript'));
    console.log(chalk.gray('  - and more...\n'));
    
    console.log(chalk.yellow('7. Test real functionality:'));
    console.log(chalk.gray('  - Simulation demo: node examples/demo.js'));
    console.log(chalk.gray('  - Real test: node test-real-screenshot.js (generates actual screenshot files)'));
    console.log(chalk.gray('  - View screenshots: open screenshot-*.png\n'));
  });

// Error handling
program.configureHelp({
  sortSubcommands: true,
  helpWidth: 80,
});

program.parse(); 