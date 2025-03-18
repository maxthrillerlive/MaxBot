/**
 * Template Class Plugin for MaxBot
 * 
 * This is a class-based template that can be used as a starting point for creating new plugins.
 * Copy this file, rename it, and modify it to create your own plugin.
 * 
 * @version 1.0.0
 * @author Your Name
 */

class TemplatePlugin {
  constructor() {
    // Required properties
    this.name = 'template-class';
    this.version = '1.0.0';
    this.description = 'Class-based template plugin for MaxBot';
    this.author = 'Your Name';
    
    // Plugin state
    this.enabled = true;
    this.client = null;
    this.logger = null;
    this.bot = null;
    this.pluginManager = null;
    this.configManager = null;
    
    // Default configuration
    this.config = {
      enabled: true,
      option1: 'default value',
      option2: 123
    };
    
    // Commands provided by this plugin
    this.commands = [];
    
    // Help information for the plugin
    this.help = {
      description: 'Class-based template plugin for MaxBot',
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
      ]
    };
  }
  
  /**
   * Initialize the plugin
   * @param {Object} bot - The bot object
   * @param {Object} logger - The logger object
   * @returns {boolean} - Whether initialization was successful
   */
  init(bot, logger) {
    this.bot = bot;
    this.client = bot.client;
    this.logger = logger;
    this.pluginManager = bot.pluginManager;
    this.configManager = bot.pluginManager.configManager;
    
    this.logger.info(`[${this.name}] Plugin initializing...`);
    
    // Load configuration
    this.loadConfig();
    
    // Set up commands
    this.setupCommands();
    
    // Register message handlers if needed
    bot.onMessage(this.handleMessage.bind(this));
    
    this.logger.info(`[${this.name}] Plugin initialized successfully`);
    return true;
  }
  
  /**
   * Load plugin configuration
   */
  loadConfig() {
    if (this.configManager) {
      // Make a copy of the default config to use in loadPluginConfigWithoutSaving
      const defaultConfig = { ...this.config };
      
      // Load the plugin's configuration
      this.config = this.configManager.loadPluginConfigWithoutSaving(this.name, defaultConfig);
      
      this.logger.info(`[${this.name}] Configuration loaded: ${JSON.stringify(this.config)}`);
    }
  }
  
  /**
   * Set up plugin commands
   */
  setupCommands() {
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
        execute: this.exampleCommand.bind(this)
      }
    ];
  }
  
  /**
   * Example command handler
   * @param {Object} client - The Twitch client
   * @param {string} channel - The channel the command was used in
   * @param {Object} context - The user context
   * @param {string} commandText - The full command text
   * @returns {Promise<boolean>} - Whether the command was successful
   */
  async exampleCommand(client, channel, context, commandText) {
    try {
      // Your command logic here
      
      // Parse parameters from command text if needed
      const params = commandText.trim().split(' ').slice(1);
      
      await client.say(channel, `@${context.username} Example class-based command executed!`);
      return true;
    } catch (error) {
      this.logger.error(`[${this.name}] Error in example command:`, error);
      return false;
    }
  }
  
  /**
   * Message handler
   * @param {string} channel - The channel
   * @param {Object} user - The user who sent the message
   * @param {string} message - The message content
   * @param {boolean} self - Whether the message was sent by the bot
   */
  handleMessage(channel, user, message, self) {
    // Skip messages from the bot itself
    if (self) return;
    
    // Your message handling logic here
    // For example, you could respond to specific keywords or patterns
    if (message.toLowerCase().includes('template')) {
      // Uncomment the line below to respond to messages containing "template"
      // this.client.say(channel, `I'm a template plugin, @${user.username}!`);
    }
  }
  
  /**
   * Enable the plugin
   * @returns {boolean} - Whether enabling was successful
   */
  enable() {
    this.config.enabled = true;
    this.logger.info(`[${this.name}] Plugin enabled`);
    return true;
  }
  
  /**
   * Disable the plugin
   * @returns {boolean} - Whether disabling was successful
   */
  disable() {
    this.config.enabled = false;
    this.logger.info(`[${this.name}] Plugin disabled`);
    return true;
  }
}

// Export a new instance of the plugin
module.exports = new TemplatePlugin(); 