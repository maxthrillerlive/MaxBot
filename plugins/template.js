/**
 * Template Plugin for MaxBot
 * 
 * This is a template that can be used as a starting point for creating new plugins.
 * Copy this file, rename it, and modify it to create your own plugin.
 * 
 * @version 1.0.0
 * @author Your Name
 */

// You can use either a plain object or a class for your plugin
// This example uses a plain object

const plugin = {
    // Required properties
    name: 'template',                  // Unique name for your plugin
    version: '1.0.0',                  // Version of your plugin
    description: 'Template plugin for MaxBot', // Description of what your plugin does
    author: 'Your Name',               // Your name or organization
    
    // Plugin state
    enabled: true,                     // Whether the plugin is enabled by default
    client: null,                      // Will be set to the Twitch client
    logger: null,                      // Will be set to the logger
    bot: null,                         // Will be set to the bot object
    
    // Help information for the plugin
    help: {
        description: 'Template plugin for MaxBot',
        commands: [
            {
                name: 'example',
                description: 'Example command',
                usage: '!example [options]',
                examples: [
                    '!example',
                    '!example option1'
                ]
            }
            // Add more command help entries as needed
        ]
    },
    
    // Default configuration
    config: {
        enabled: true,                 // Whether the plugin is enabled (required)
        // Your custom configuration options
        option1: 'default value',
        option2: 123
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Required methods
    
    // Called when the plugin is loaded and enabled
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.configManager = bot.pluginManager.configManager;
        
        this.logger.info(`[${this.name}] Plugin initializing...`);
        
        // Load configuration (if needed)
        this.loadConfig();
        
        // Set up commands
        this.setupCommands();
        
        // Set up event listeners
        this.setupEventListeners();
        
        this.logger.info(`[${this.name}] Plugin initialized successfully`);
        return true;
    },
    
    // Load plugin configuration
    loadConfig: function() {
        // Load the plugin's configuration
        if (this.configManager) {
            const config = this.configManager.loadPluginConfigWithoutSaving(this.name, this.config);
            this.config = { ...this.config, ...config };
            this.logger.info(`[${this.name}] Configuration loaded: ${JSON.stringify(this.config)}`);
        }
    },
    
    // Set up commands
    setupCommands: function() {
        this.commands = [
            {
                name: 'example',
                config: {
                    description: 'Example command',
                    usage: '!example [options]',
                    aliases: ['ex'],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        // Your command logic here
                        await client.say(channel, `@${context.username} Example command executed!`);
                        return true;
                    } catch (error) {
                        this.logger.error(`[${this.name}] Error in example command:`, error);
                        return false;
                    }
                }
            }
            // Add more commands as needed
        ];
    },
    
    // Set up event listeners
    setupEventListeners: function() {
        // Subscribe to Twitch events
        this.bot.events.on('twitch:message', this.onTwitchMessage.bind(this));
        this.bot.events.on('twitch:connected', this.onTwitchConnected.bind(this));
        
        // Subscribe to command events
        this.bot.events.on('command:before', this.onCommandBefore.bind(this));
        this.bot.events.on('command:after', this.onCommandAfter.bind(this));
        
        // Subscribe to timer events
        this.bot.events.on('timer:minute', this.onMinute.bind(this));
        
        // Subscribe to plugin events
        this.bot.events.on('plugin:enabled', this.onPluginEnabled.bind(this));
        this.bot.events.on('plugin:disabled', this.onPluginDisabled.bind(this));
        
        // Emit a custom event
        this.bot.emitEvent('initialized', { plugin: this.name, timestamp: Date.now() });
    },
    
    // Event handlers
    onTwitchMessage: function(data) {
        // Called for every Twitch message - be careful not to do too much here
        // this.logger.info(`[${this.name}] Message received: ${data.message}`);
    },
    
    onTwitchConnected: function(data) {
        this.logger.info(`[${this.name}] Connected to Twitch at ${data.address}:${data.port}`);
    },
    
    onCommandBefore: function(data) {
        // Called before a command is processed
        // this.logger.info(`[${this.name}] Command about to be processed: ${data.command}`);
    },
    
    onCommandAfter: function(data) {
        // Called after a command is processed
        // this.logger.info(`[${this.name}] Command processed: ${data.command} (success: ${data.success})`);
    },
    
    onMinute: function(data) {
        // Called every minute - be careful not to do too much here
        // this.logger.info(`[${this.name}] Minute tick: ${data.count}`);
    },
    
    onPluginEnabled: function(data) {
        // Called when a plugin is enabled
        this.logger.info(`[${this.name}] Plugin enabled: ${data.name}`);
    },
    
    onPluginDisabled: function(data) {
        // Called when a plugin is disabled
        this.logger.info(`[${this.name}] Plugin disabled: ${data.name}`);
    },
    
    // Optional methods
    
    // Called when a message is received (if registered with bot.onMessage)
    handleMessage: function(channel, user, message, self) {
        // Skip messages from the bot itself
        if (self) return;
        
        // Your message handling logic here
        // For example, you could respond to specific keywords or patterns
        if (message.toLowerCase().includes('hello')) {
            // Uncomment the line below to respond to messages containing "hello"
            // this.client.say(channel, `Hello, @${user.username}!`);
        }
    },
    
    // Called when the plugin is enabled
    enable: function() {
        this.config.enabled = true;
        this.logger.info(`[${this.name}] Plugin enabled`);
        return true;
    },
    
    // Called when the plugin is disabled
    disable: function() {
        this.config.enabled = false;
        this.logger.info(`[${this.name}] Plugin disabled`);
        return false;
    }
};

// Export the plugin
module.exports = plugin; 