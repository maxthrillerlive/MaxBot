/**
 * MaxBot Plugin Manager
 * 
 * This module handles loading, initializing, and managing plugins for MaxBot.
 */

const fs = require('fs');
const path = require('path');

class PluginManager {
  constructor(logger, configManager = null) {
    this.plugins = new Map();
    this.logger = logger || console;
    this.pluginsDir = path.join(__dirname, 'plugins');
    this.bot = null;
    this.configManager = configManager;
    this.commandManager = null;
    
    // Bind methods
    this.loadPlugins = this.loadPlugins.bind(this);
    this.initPlugins = this.initPlugins.bind(this);
    this.enablePlugin = this.enablePlugin.bind(this);
    this.disablePlugin = this.disablePlugin.bind(this);
    this.getPlugin = this.getPlugin.bind(this);
    this.processIncomingMessage = this.processIncomingMessage.bind(this);
    this.processOutgoingMessage = this.processOutgoingMessage.bind(this);
  }
  
  /**
   * Set the bot instance for plugins to use
   * @param {Object} bot - The bot instance
   */
  setBot(bot) {
    this.bot = bot;
    this.commandManager = bot.commandManager;
    this.logger.info('[PluginManager] Bot and command manager set');
  }
  
  /**
   * Set the configuration manager
   * @param {Object} configManager - The configuration manager instance
   */
  setConfigManager(configManager) {
    this.configManager = configManager;
  }
  
  /**
   * Load all plugins from the plugins directory
   */
  loadPlugins() {
    this.logger.info('[PluginManager] Loading plugins...');
    
    // Check if plugins directory exists
    if (!fs.existsSync(this.pluginsDir)) {
      this.logger.warn(`[PluginManager] Plugins directory not found: ${this.pluginsDir}`);
      return;
    }
    
    this.logger.info(`[PluginManager] Plugins directory found at: ${this.pluginsDir}`);
    
    // Get all JavaScript files in the plugins directory
    const pluginFiles = fs.readdirSync(this.pluginsDir)
      .filter(file => file.endsWith('.js'));
    
    this.logger.info(`[PluginManager] Found ${pluginFiles.length} plugin files: ${pluginFiles.join(', ')}`);
    
    // Load each plugin
    for (const file of pluginFiles) {
      try {
        const pluginPath = path.join(this.pluginsDir, file);
        this.logger.info(`[PluginManager] Loading plugin from: ${pluginPath}`);
        
        // Clear require cache to ensure we get fresh plugin code
        delete require.cache[require.resolve(pluginPath)];
        
        // Load the plugin
        const plugin = require(pluginPath);
        
        // Check if the plugin has the required properties and methods
        if (!plugin.name || typeof plugin.init !== 'function') {
          this.logger.warn(`[PluginManager] Invalid plugin format: ${file}`);
          continue;
        }
        
        this.logger.info(`[PluginManager] Plugin loaded with name: ${plugin.name}`);
        
        // Add the plugin to our collection
        this.plugins.set(plugin.name, plugin);
        
        // Load plugin configuration if available
        if (this.configManager) {
          const pluginConfig = this.configManager.get(`plugins.settings.${plugin.name}`);
          if (pluginConfig && plugin.config) {
            // Merge the saved config with the plugin's default config
            plugin.config = { ...plugin.config, ...pluginConfig };
            this.logger.info(`[PluginManager] Loaded configuration for plugin: ${plugin.name}`);
          }
          
          // Check if the plugin should be enabled by default
          const enabledPlugins = this.configManager.get('plugins.enabled', []);
          if (enabledPlugins.includes(plugin.name)) {
            plugin.enabled = true;
            this.logger.info(`[PluginManager] Plugin ${plugin.name} enabled from configuration`);
          }
        }
        
        this.logger.info(`[PluginManager] Loaded plugin: ${plugin.name} v${plugin.version || '1.0.0'}`);
      } catch (error) {
        this.logger.error(`[PluginManager] Error loading plugin ${file}: ${error.message}`);
        this.logger.error(`[PluginManager] Error stack: ${error.stack}`);
      }
    }
    
    this.logger.info(`[PluginManager] Successfully loaded ${this.plugins.size} plugins: ${Array.from(this.plugins.keys()).join(', ')}`);
  }
  
  /**
   * Initialize all loaded plugins
   */
  initPlugins() {
    if (!this.bot) {
      this.logger.warn('[PluginManager] Bot instance not set, plugins may not function correctly');
    }
    
    this.logger.info('[PluginManager] Initializing plugins...');
    this.logger.info(`[PluginManager] Plugins to initialize: ${Array.from(this.plugins.keys()).join(', ')}`);
    
    for (const [name, plugin] of this.plugins.entries()) {
      try {
        this.logger.info(`[PluginManager] Initializing plugin: ${name}`);
        
        // Initialize the plugin with the bot instance and logger
        const success = plugin.init(this.bot, this.logger);
        
        if (success) {
          this.logger.info(`[PluginManager] Initialized plugin: ${name}`);
          
          // Register plugin commands with command manager if available
          if (this.commandManager && plugin.commands) {
            for (const [cmdName, command] of Object.entries(plugin.commands)) {
              this.commandManager.addCommand({
                name: cmdName,
                execute: (client, target, context, msg) => {
                    // Convert ? to ! for command processing
                    const modifiedMsg = msg.replace(/^\?/, '!');
                    return command.execute(client, target, context, modifiedMsg);
                },
                config: {
                  name: cmdName,
                  description: command.description || 'No description',
                  usage: command.usage || `?${cmdName}`,
                  enabled: command.enabled !== false,
                  modOnly: command.modOnly || false,
                  prefix: '?' // Add prefix indicator
                }
              });
              this.logger.info(`[PluginManager] Registered command: ${cmdName} from plugin: ${name}`);
            }
          }
        } else {
          this.logger.warn(`[PluginManager] Failed to initialize plugin: ${name}`);
        }
      } catch (error) {
        this.logger.error(`[PluginManager] Error initializing plugin ${name}: ${error.message}`);
        this.logger.error(`[PluginManager] Error stack: ${error.stack}`);
      }
    }
    
    this.logger.info(`[PluginManager] Plugin initialization complete. Enabled plugins: ${Array.from(this.plugins.entries()).filter(([_, p]) => p.enabled).map(([n, _]) => n).join(', ')}`);
  }
  
  /**
   * Enable a specific plugin
   * @param {string} name - The name of the plugin to enable
   * @returns {boolean} - Whether the plugin was successfully enabled
   */
  enablePlugin(name) {
    try {
      const plugin = this.plugins.get(name);
      if (!plugin) {
        this.logger.error(`[PluginManager] Plugin not found: ${name}`);
        return false;
      }

      // Call the plugin's enable method
      const result = plugin.enable();
      
      if (result) {
        this.logger.info(`[PluginManager] Enabled plugin: ${name}`);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`[PluginManager] Error enabling plugin ${name}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Disable a specific plugin
   * @param {string} name - The name of the plugin to disable
   * @returns {boolean} - Whether the plugin was successfully disabled
   */
  disablePlugin(name) {
    const plugin = this.plugins.get(name);
    
    if (!plugin) {
      this.logger.warn(`[PluginManager] Plugin not found: ${name}`);
      return false;
    }
    
    try {
      if (typeof plugin.disable === 'function') {
        const success = plugin.disable();
        
        if (success) {
          this.logger.info(`[PluginManager] Disabled plugin: ${name}`);
          
          // Update configuration if available
          if (this.configManager) {
            const enabledPlugins = this.configManager.get('plugins.enabled', []);
            const index = enabledPlugins.indexOf(name);
            if (index !== -1) {
              enabledPlugins.splice(index, 1);
              this.configManager.set('plugins.enabled', enabledPlugins);
              this.logger.info(`[PluginManager] Updated enabled plugins in configuration`);
            }
          }
          
          return true;
        } else {
          this.logger.warn(`[PluginManager] Failed to disable plugin: ${name}`);
          return false;
        }
      } else {
        this.logger.warn(`[PluginManager] Plugin ${name} does not have a disable method`);
        return false;
      }
    } catch (error) {
      this.logger.error(`[PluginManager] Error disabling plugin ${name}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get a specific plugin by name
   * @param {string} name - The name of the plugin to get
   * @returns {Object|null} - The plugin object or null if not found
   */
  getPlugin(name) {
    return this.plugins.get(name) || null;
  }
  
  /**
   * Get all loaded plugins
   * @returns {Array} - Array of plugin objects
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get all plugin commands
   * @returns {Object} - Object mapping command names to handlers
   */
  getPluginCommands() {
    const commands = {};
    
    for (const plugin of this.plugins.values()) {
      // Skip disabled plugins
      if (!plugin.enabled) {
        continue;
      }
      
      // Get commands from plugin
      if (plugin.commands) {
        for (const [name, command] of Object.entries(plugin.commands)) {
          commands[name] = {
            ...command,
            plugin: plugin
          };
        }
      }
    }
    
    return commands;
  }
  
  /**
   * Process incoming message through plugins
   */
  async processIncomingMessage(messageObj) {
    // Skip if no plugins
    if (this.plugins.size === 0) {
      return messageObj;
    }
    
    // Process through each enabled plugin
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled && typeof plugin.processIncomingMessage === 'function') {
        try {
          messageObj = await plugin.processIncomingMessage(messageObj);
        } catch (error) {
          this.logger.error(`[PluginManager] Error processing message in plugin ${plugin.name}: ${error.message}`);
        }
      }
    }
    
    return messageObj;
  }
  
  /**
   * Process an outgoing chat message through all enabled plugins
   * @param {Object} message - The chat message object
   * @returns {Promise<Array<Object>>} - Array of processed messages
   */
  async processOutgoingMessage(message) {
    let messages = [message];
    
    for (const plugin of this.plugins.values()) {
      // Skip disabled plugins
      if (plugin.enabled === false) {
        continue;
      }
      
      // Check if the plugin has a processOutgoingMessage method
      if (typeof plugin.processOutgoingMessage === 'function') {
        try {
          // Process each message in the array
          const processedMessages = [];
          
          for (const msg of messages) {
            const result = await plugin.processOutgoingMessage(msg);
            processedMessages.push(...result);
          }
          
          messages = processedMessages;
        } catch (error) {
          this.logger.error(`[PluginManager] Error processing outgoing message with plugin ${plugin.name}: ${error.message}`);
        }
      }
    }
    
    return messages;
  }
  
  /**
   * Save plugin configuration
   * @param {string} name - The name of the plugin
   * @param {Object} config - The configuration to save
   * @returns {boolean} - Whether the configuration was successfully saved
   */
  savePluginConfig(name, config) {
    if (!this.configManager) {
      this.logger.warn(`[PluginManager] Cannot save plugin configuration: ConfigManager not set`);
      return false;
    }
    
    if (!name) {
      this.logger.warn(`[PluginManager] Cannot save plugin configuration: Plugin name is missing`);
      return false;
    }
    
    if (!config) {
      this.logger.warn(`[PluginManager] Cannot save plugin configuration: Configuration is missing for plugin ${name}`);
      return false;
    }
    
    try {
      // Get the plugin
      const plugin = this.plugins.get(name);
      if (!plugin) {
        this.logger.warn(`[PluginManager] Plugin not found: ${name}`);
        return false;
      }
      
      this.logger.info(`[PluginManager] Saving configuration for plugin: ${name}`);
      
      // Create a deep copy of the config to avoid reference issues
      const configCopy = JSON.parse(JSON.stringify(config));
      
      // Update the plugin's configuration
      if (typeof plugin.updateConfig === 'function') {
        // Use the plugin's updateConfig method if available
        this.logger.info(`[PluginManager] Using plugin's updateConfig method for ${name}`);
        const success = plugin.updateConfig(configCopy);
        if (!success) {
          this.logger.warn(`[PluginManager] Plugin ${name} failed to update configuration`);
          return false;
        }
      } else {
        // Otherwise, directly update the config property
        this.logger.info(`[PluginManager] Directly updating config property for ${name}`);
        plugin.config = { ...plugin.config, ...configCopy };
      }
      
      // Save to the configuration manager
      this.configManager.set(`plugins.settings.${name}`, configCopy);
      this.logger.info(`[PluginManager] Saved configuration for plugin: ${name}`);
      
      return true;
    } catch (error) {
      this.logger.error(`[PluginManager] Error saving plugin configuration for ${name}: ${error.message}`);
      this.logger.error(`[PluginManager] Error stack: ${error.stack}`);
      return false;
    }
  }
  
  /**
   * Get status information for all plugins
   * @returns {Array} - Array of plugin status objects
   */
  getPluginStatus() {
    const status = [];
    
    for (const plugin of this.plugins.values()) {
      try {
        // If the plugin has a getStatus method, use it
        if (typeof plugin.getStatus === 'function') {
          status.push(plugin.getStatus());
        } else {
          // Otherwise, create a basic status object
          status.push({
            name: plugin.name,
            description: plugin.description || 'No description',
            version: plugin.version || '1.0.0',
            enabled: plugin.enabled === true
          });
        }
      } catch (error) {
        this.logger.error(`[PluginManager] Error getting status for plugin ${plugin.name}: ${error.message}`);
        
        // Add a basic status object with error information
        status.push({
          name: plugin.name,
          description: plugin.description || 'No description',
          version: plugin.version || '1.0.0',
          enabled: plugin.enabled === true,
          error: error.message
        });
      }
    }
    
    return status;
  }
}

module.exports = PluginManager; 