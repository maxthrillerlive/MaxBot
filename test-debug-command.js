// Test script for debugging command handling
const PluginManager = require('./pluginManager');
const path = require('path');
const fs = require('fs');

// Logger
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.log('[WARN]', ...args),
  error: (...args) => console.log('[ERROR]', ...args)
};

// Mock config manager
const configManager = {
  get: (key, defaultValue) => {
    if (key === 'plugins.enabled') {
      return ['hello'];
    }
    return defaultValue;
  },
  set: () => {},
  loadPluginConfig: () => ({ enabled: true }),
  savePluginConfig: () => true,
  getPluginConfigPath: () => 'mock-config-path'
};

// Mock client
const mockClient = {
  say: (channel, message) => {
    console.log(`[MOCK CLIENT] ${channel}: ${message}`);
    return Promise.resolve();
  }
};

// Mock context
const mockContext = {
  username: 'test_user',
  badges: { broadcaster: '1' },
  mod: true
};

async function runTest() {
  try {
    console.log('Creating plugin manager...');
    const pluginManager = new PluginManager(logger, configManager);
    
    console.log('Loading plugins...');
    pluginManager.loadPlugins();
    
    // Print loaded plugins
    console.log('\nLoaded plugins:');
    for (const [name, plugin] of pluginManager.plugins.entries()) {
      console.log(`- ${name}: ${plugin.description}, enabled: ${plugin.config?.enabled}`);
    }
    
    // Create mock bot
    const mockBot = {
      client: mockClient,
      events: {
        on: (event, handler) => console.log(`[MOCK] Registered event handler for: ${event}`),
        emit: (event, data) => console.log(`[MOCK] Emitted event: ${event}`)
      },
      pluginManager
    };
    
    console.log('\nInitializing plugins...');
    await pluginManager.initPlugins(mockBot);
    
    console.log('\nPlugin commands:');
    const commands = pluginManager.listCommands();
    for (const cmd of commands) {
      console.log(`- ${cmd.name} (from ${cmd.pluginName}): ${cmd.config?.description}`);
      if (cmd.config?.aliases && cmd.config.aliases.length > 0) {
        console.log(`  Aliases: ${cmd.config.aliases.join(', ')}`);
      }
    }
    
    // Test processing specific commands
    const commandsToTest = [
      '!hello',
      '!hi',
      '!hey',
      '!help',
      '!plugin list'
    ];
    
    for (const cmd of commandsToTest) {
      console.log(`\nTesting command: ${cmd}`);
      const result = await pluginManager.handleCommand(mockClient, '#test', mockContext, cmd);
      console.log(`Result: ${result}`);
    }
    
    // Check hello plugin specifically
    const helloPlugin = pluginManager.getPlugin('hello');
    if (helloPlugin) {
      console.log('\nHello plugin details:');
      console.log(`- Enabled: ${helloPlugin.config.enabled}`);
      console.log(`- Commands: ${helloPlugin.commands.length}`);
      console.log(`- First command: ${helloPlugin.commands[0]?.name}`);
      console.log(`- Execute function: ${typeof helloPlugin.commands[0]?.execute}`);
    } else {
      console.log('\nHello plugin not found!');
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

runTest(); 