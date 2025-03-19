// Test script for the hello plugin
const path = require('path');
const fs = require('fs');

// Mock objects
const mockLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.log('[WARN]', ...args),
  error: (...args) => console.log('[ERROR]', ...args)
};

const mockClient = {
  say: (channel, message) => {
    console.log(`[MOCK CLIENT] Saying to ${channel}: ${message}`);
    return Promise.resolve();
  }
};

// Mock context
const mockContext = {
  username: 'test_user',
  mod: true,
  badges: { broadcaster: '1' }
};

// Load the hello plugin directly
const pluginPath = path.join(__dirname, 'plugins', 'hello.js');
console.log(`Loading plugin from: ${pluginPath}`);

try {
  const helloPlugin = require(pluginPath);
  console.log('Plugin loaded:', helloPlugin);
  
  // Check if plugin has the right structure
  console.log('Plugin has name property:', !!helloPlugin.name);
  console.log('Plugin name:', helloPlugin.name);
  console.log('Plugin has init method:', typeof helloPlugin.init === 'function');
  console.log('Plugin has commands array:', Array.isArray(helloPlugin.commands));
  console.log('Plugin commands length:', helloPlugin.commands ? helloPlugin.commands.length : 0);
  
  // Initialize the plugin
  console.log('\nInitializing plugin...');
  const mockBot = { 
    client: mockClient, 
    events: { 
      emit: () => {}, 
      on: (event, handler) => {
        console.log(`[MOCK EVENTS] Registered handler for event: ${event}`);
      } 
    } 
  };
  const initResult = helloPlugin.init(mockBot, mockLogger);
  console.log('Init result:', initResult);
  
  // Check if commands are set up after initialization
  console.log('\nChecking commands after initialization...');
  console.log('Commands length:', helloPlugin.commands.length);
  for (const cmd of helloPlugin.commands) {
    console.log(`Command: ${cmd.name}`);
    console.log(`- Description: ${cmd.config.description}`);
    console.log(`- Execute function: ${typeof cmd.execute === 'function' ? 'exists' : 'missing'}`);
  }
  
  // Test execute hello command
  console.log('\nTesting hello command execution...');
  const helloCommand = helloPlugin.commands[0];
  helloCommand.execute(mockClient, '#testchannel', mockContext, '!hello')
    .then(result => {
      console.log('Command execution result:', result);
    })
    .catch(error => {
      console.error('Error executing command:', error);
    });
  
} catch (error) {
  console.error('Error loading or testing plugin:', error);
} 