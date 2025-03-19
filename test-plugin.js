// Test script for plugins
const fs = require('fs');
const path = require('path');

// Mock logger
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.log('[WARN]', ...args),
  error: (...args) => console.log('[ERROR]', ...args)
};

try {
  // Load the hello plugin
  console.log('Attempting to load hello plugin...');
  const pluginPath = path.join(__dirname, 'plugins', 'hello.js');
  
  if (!fs.existsSync(pluginPath)) {
    console.error('Error: hello.js does not exist at path:', pluginPath);
    process.exit(1);
  }
  
  const helloPlugin = require(pluginPath);
  console.log('Plugin loaded:', helloPlugin.name);
  console.log('Plugin structure:', Object.keys(helloPlugin));
  console.log('Commands array exists:', Array.isArray(helloPlugin.commands));
  console.log('Initial commands length:', helloPlugin.commands.length);
  
  // Create mock client and bot
  const mockClient = {
    say: (channel, message) => {
      console.log(`[MOCK] Saying to ${channel}: ${message}`);
      return Promise.resolve();
    }
  };
  
  const mockBot = {
    client: mockClient,
    events: {
      on: (event, handler) => console.log(`[MOCK] Registered event handler for: ${event}`),
      emit: (event, data) => console.log(`[MOCK] Emitted event: ${event}`)
    }
  };
  
  // Initialize the plugin
  console.log('\nInitializing plugin...');
  const initResult = helloPlugin.init(mockBot, logger);
  console.log('Init result:', initResult);
  console.log('Commands after init:', helloPlugin.commands.length);
  
  if (helloPlugin.commands.length > 0) {
    const helloCommand = helloPlugin.commands[0];
    console.log('Command name:', helloCommand.name);
    console.log('Command execute exists:', typeof helloCommand.execute === 'function');
    
    // Execute the command
    console.log('\nExecuting command...');
    helloCommand.execute(mockClient, '#test', {username: 'tester'}, '!hello')
      .then(result => {
        console.log('Command execution result:', result);
      })
      .catch(err => {
        console.error('Command execution error:', err);
      });
  } else {
    console.error('No commands found in plugin after initialization!');
  }
} catch (error) {
  console.error('Error in test script:', error);
} 