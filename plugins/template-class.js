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
    
    // Set up event listeners
    this.setupEventListeners();
    
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
   * Set up event listeners
   */
  setupEventListeners() {
    // Subscribe to Twitch events
    this.bot.events.on('twitch:message', this.onTwitchMessage.bind(this));
    this.bot.events.on('twitch:connected', this.onTwitchConnected.bind(this));
    this.bot.events.on('twitch:subscription', this.onSubscription.bind(this));
    this.bot.events.on('twitch:cheer', this.onCheer.bind(this));
    this.bot.events.on('twitch:raid', this.onRaid.bind(this));
    
    // Subscribe to command events
    this.bot.events.on('command:before', this.onCommandBefore.bind(this));
    this.bot.events.on('command:after', this.onCommandAfter.bind(this));
    
    // Subscribe to timer events
    this.bot.events.on('timer:minute', this.onMinute.bind(this));
    this.bot.events.on('timer:hour', this.onHour.bind(this));
    this.bot.events.on('bot:uptime', this.onUptime.bind(this));
    
    // Subscribe to plugin events
    this.bot.events.on('plugin:enabled', this.onPluginEnabled.bind(this));
    this.bot.events.on('plugin:disabled', this.onPluginDisabled.bind(this));
    this.bot.events.on('plugin:loaded', this.onPluginLoaded.bind(this));
    this.bot.events.on('plugin:unload', this.onPluginUnload.bind(this));
    this.bot.events.on('plugin:reloaded', this.onPluginReloaded.bind(this));
    
    // Subscribe to custom events - both general and plugin-specific
    this.bot.events.on('custom:example', this.onCustomEvent.bind(this));
    this.bot.events.on(`plugin:${this.name}:example`, this.onPluginSpecificEvent.bind(this));
    
    // Emit a custom event
    this.bot.emitEvent('initialized', { plugin: this.name, timestamp: Date.now() });
  }
  
  /**
   * Twitch message event handler
   * @param {Object} data - Event data
   */
  onTwitchMessage(data) {
    // Called for every Twitch message - be careful not to do too much here
    // this.logger.info(`[${this.name}] Message received: ${data.message}`);
  }
  
  /**
   * Twitch connected event handler
   * @param {Object} data - Event data
   */
  onTwitchConnected(data) {
    this.logger.info(`[${this.name}] Connected to Twitch at ${data.address}:${data.port}`);
  }
  
  /**
   * Subscription event handler
   * @param {Object} data - Event data
   */
  onSubscription(data) {
    this.logger.info(`[${this.name}] Subscription: ${data.username}`);
  }
  
  /**
   * Cheer event handler
   * @param {Object} data - Event data
   */
  onCheer(data) {
    this.logger.info(`[${this.name}] Cheer: ${data.userstate.bits} bits from ${data.userstate.username}`);
  }
  
  /**
   * Raid event handler
   * @param {Object} data - Event data
   */
  onRaid(data) {
    this.logger.info(`[${this.name}] Raid from ${data.username} with ${data.viewers} viewers`);
  }
  
  /**
   * Command before event handler
   * @param {Object} data - Event data
   */
  onCommandBefore(data) {
    // Called before a command is processed
    // this.logger.info(`[${this.name}] Command about to be processed: ${data.command}`);
  }
  
  /**
   * Command after event handler
   * @param {Object} data - Event data
   */
  onCommandAfter(data) {
    // Called after a command is processed
    // this.logger.info(`[${this.name}] Command processed: ${data.command} (success: ${data.success})`);
  }
  
  /**
   * Minute timer event handler
   * @param {Object} data - Event data
   */
  onMinute(data) {
    // Called every minute - be careful not to do too much here
    // this.logger.info(`[${this.name}] Minute tick: ${data.count}`);
  }
  
  /**
   * Hour timer event handler
   * @param {Object} data - Event data
   */
  onHour(data) {
    this.logger.info(`[${this.name}] Hour tick: ${data.count}`);
  }
  
  /**
   * Uptime event handler
   * @param {Object} data - Event data
   */
  onUptime(data) {
    // this.logger.info(`[${this.name}] Bot uptime: ${data.uptimeHours} hours`);
  }
  
  /**
   * Plugin enabled event handler
   * @param {Object} data - Event data
   */
  onPluginEnabled(data) {
    this.logger.info(`[${this.name}] Plugin enabled: ${data.name}`);
  }
  
  /**
   * Plugin disabled event handler
   * @param {Object} data - Event data
   */
  onPluginDisabled(data) {
    this.logger.info(`[${this.name}] Plugin disabled: ${data.name}`);
  }
  
  /**
   * Plugin loaded event handler
   * @param {Object} data - Event data
   */
  onPluginLoaded(data) {
    this.logger.info(`[${this.name}] Plugin loaded: ${data.name}`);
  }
  
  /**
   * Plugin unload event handler
   * @param {Object} data - Event data
   */
  onPluginUnload(data) {
    this.logger.info(`[${this.name}] Plugin unloaded: ${data.name}`);
  }
  
  /**
   * Plugin reloaded event handler
   * @param {Object} data - Event data
   */
  onPluginReloaded(data) {
    this.logger.info(`[${this.name}] Plugin reloaded: ${data.name}`);
  }
  
  /**
   * Custom event handler
   * @param {Object} data - Event data
   */
  onCustomEvent(data) {
    this.logger.info(`[${this.name}] Custom event: ${JSON.stringify(data)}`);
  }
  
  /**
   * Plugin-specific event handler
   * @param {Object} data - Event data
   */
  onPluginSpecificEvent(data) {
    this.logger.info(`[${this.name}] Plugin-specific event: ${JSON.stringify(data)}`);
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