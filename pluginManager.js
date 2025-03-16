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
    
    // Bind methods
    this.loadPlugins = this.loadPlugins.bind(this);
    this.initPlugins = this.initPlugins.bind(this);
    this.enablePlugin = this.enablePlugin.bind(this);
    this.disablePlugin = this.disablePlugin.bind(this);
    this.getPlugin = this.getPlugin.bind(this);
    this.processIncomingMessage = this.processIncomingMessage.bind(this);
    this.processOutgoingMessage = this.processOutgoingMessage.bind(this);
    this.handleCommand = this.handleCommand.bind(this);
  }
  
  /**
   * Set the bot instance for plugins to use
   * @param {Object} bot - The bot instance
   */
  setBot(bot) {
    this.bot = bot;
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
    
    // Get all JavaScript files in the plugins directory
    const pluginFiles = fs.readdirSync(this.pluginsDir)
      .filter(file => file.endsWith('.js'));
    
    // Load each plugin
    const loadedPlugins = [];
    for (const file of pluginFiles) {
      try {
        const pluginPath = path.join(this.pluginsDir, file);
        
        // Clear require cache to ensure we get fresh plugin code
        delete require.cache[require.resolve(pluginPath)];
        
        // Load the plugin
        const plugin = require(pluginPath);
        
        // Check if the plugin has the required properties and methods
        if (!plugin.name || typeof plugin.init !== 'function') {
          this.logger.warn(`[PluginManager] Invalid plugin format: ${file}`);
          continue;
        }
        
        // Add the plugin to our collection
        this.plugins.set(plugin.name, plugin);
        
        // Load plugin configuration if available
        if (this.configManager) {
          // Load plugin-specific configuration without saving
          const pluginConfig = this.configManager.loadPluginConfigWithoutSaving(plugin.name);
          
          // Ensure the plugin has a config object
          if (!plugin.config) {
            plugin.config = {};
          }
          
          // Merge the saved config with the plugin's default config
          plugin.config = { ...plugin.config, ...pluginConfig };
          
          // Ensure the enabled property exists
          if (plugin.config.enabled === undefined) {
            plugin.config.enabled = false;
          }

          // Check if the plugin should be enabled by default
          const enabledPlugins = this.configManager.get('plugins.enabled', []);
          if (enabledPlugins.includes(plugin.name) || plugin.config.enabled) {
            plugin.config.enabled = true;
          } else {
            plugin.config.enabled = false;
          }
        }
        
        loadedPlugins.push(plugin.name);
      } catch (error) {
        this.logger.error(`[PluginManager] Error loading plugin ${file}: ${error.message}`);
      }
    }
    
    this.logger.info(`[PluginManager] Loaded ${loadedPlugins.length} plugins: ${loadedPlugins.join(', ')}`);
  }
  
  /**
   * Initialize all loaded plugins
   */
  initPlugins() {
    this.logger.info('[PluginManager] Initializing plugins...');

    if (!this.bot) {
      this.logger.error('[PluginManager] Cannot initialize plugins: Bot not set');
      return;
    }

    // Get all enabled plugins
    const enabledPlugins = Array.from(this.plugins.values())
      .filter(plugin => plugin.config && plugin.config.enabled);

    if (enabledPlugins.length === 0) {
      this.logger.info('[PluginManager] No enabled plugins to initialize');
      return;
    }
    
    // Initialize each enabled plugin
    for (const plugin of enabledPlugins) {
      try {
        // Initialize the plugin
        plugin.init(this.bot, this.logger);
        
        // Register plugin commands if available
        if (plugin.commands && Array.isArray(plugin.commands)) {
          this.logger.info(`[PluginManager] Registering ${plugin.commands.length} commands from plugin ${plugin.name}`);
          
          for (const command of plugin.commands) {
            if (command && command.name && command.execute) {
              // Set default prefix if not specified
              if (!command.config) {
                command.config = {};
              }
              if (!command.config.prefix) {
                command.config.prefix = '!';
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(`[PluginManager] Error initializing plugin ${plugin.name}: ${error.message}`);
      }
    }

    this.logger.info(`[PluginManager] Initialized ${enabledPlugins.length} plugins: ${enabledPlugins.map(p => p.name).join(', ')}`);
  }
  
  /**
   * Enable a plugin by name
   * @param {string} pluginName - The name of the plugin to enable
   * @returns {boolean} - Whether the plugin was successfully enabled
   */
  enablePlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      this.logger.warn(`[PluginManager] Cannot enable plugin ${pluginName}: Plugin not found`);
      return false;
    }

    try {
      // Ensure the plugin has a config object
      if (!plugin.config) {
        plugin.config = {};
      }
      
      // Set the enabled flag
      plugin.config.enabled = true;
      
      // Call the plugin's enable method if it exists
      if (typeof plugin.enable === 'function') {
        plugin.enable();
      }
      
      // Update the enabled plugins list in the configuration
      if (this.configManager) {
        const enabledPlugins = this.configManager.get('plugins.enabled', []);
        if (!enabledPlugins.includes(pluginName)) {
          enabledPlugins.push(pluginName);
          this.configManager.set('plugins.enabled', enabledPlugins);
        }
        
        // Update the plugin's configuration
        this.configManager.set(`plugins.settings.${pluginName}.enabled`, true);
      }
      
      this.logger.info(`[PluginManager] Plugin ${pluginName} enabled`);
      
      // Initialize the plugin if the bot is available
      if (this.bot && typeof plugin.init === 'function') {
        plugin.init(this.bot, this.logger);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`[PluginManager] Error enabling plugin ${pluginName}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Disable a plugin by name
   * @param {string} pluginName - The name of the plugin to disable
   * @returns {boolean} - Whether the plugin was successfully disabled
   */
  disablePlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      this.logger.warn(`[PluginManager] Cannot disable plugin ${pluginName}: Plugin not found`);
      return false;
    }

    try {
      // Ensure the plugin has a config object
      if (!plugin.config) {
        plugin.config = {};
      }
      
      // Set the enabled flag
      plugin.config.enabled = false;
      
      // Call the plugin's disable method if it exists
      if (typeof plugin.disable === 'function') {
        plugin.disable();
      }
      
      // Update the enabled plugins list in the configuration
      if (this.configManager) {
        const enabledPlugins = this.configManager.get('plugins.enabled', []);
        const index = enabledPlugins.indexOf(pluginName);
        if (index !== -1) {
          enabledPlugins.splice(index, 1);
          this.configManager.set('plugins.enabled', enabledPlugins);
        }
        
        // Update the plugin's configuration
        this.configManager.set(`plugins.settings.${pluginName}.enabled`, false);
      }
      
      this.logger.info(`[PluginManager] Plugin ${pluginName} disabled`);
      return true;
    } catch (error) {
      this.logger.error(`[PluginManager] Error disabling plugin ${pluginName}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get a plugin by name
   * @param {string} pluginName - The name of the plugin to get
   * @returns {Object|null} - The plugin object or null if not found
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName) || null;
  }
  
  /**
   * Get all loaded plugins
   * @returns {Array} - Array of all loaded plugins
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get the status of all plugins
   * @returns {Array} - Array of plugin status objects
   */
  getPluginStatus() {
    const status = [];
    
    for (const [name, plugin] of this.plugins.entries()) {
      status.push({
        name,
        version: plugin.version || '1.0.0',
        enabled: plugin.config && plugin.config.enabled,
        description: plugin.description || '',
        author: plugin.author || 'Unknown',
        commands: plugin.commands ? plugin.commands.map(cmd => cmd.name) : []
      });
    }
    
    return status;
  }
  
  /**
   * Save a plugin's configuration
   * @param {string} pluginName - The name of the plugin
   * @param {Object} config - The configuration to save
   * @returns {boolean} - Whether the configuration was successfully saved
   */
  savePluginConfig(pluginName, config) {
    if (!this.configManager) {
      this.logger.error(`[PluginManager] Cannot save plugin configuration: Configuration manager not set`);
      return false;
    }
    
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      this.logger.warn(`[PluginManager] Cannot save configuration for plugin ${pluginName}: Plugin not found`);
      return false;
    }
    
    try {
      // Ensure the enabled property is preserved
      const enabled = plugin.config && plugin.config.enabled;
      
      // Update the plugin's configuration
      plugin.config = { ...config, enabled };
      
      // Save to the configuration manager using the plugin-specific method
      return this.configManager.savePluginConfig(pluginName, plugin.config);
    } catch (error) {
      this.logger.error(`[PluginManager] Error saving configuration for plugin ${pluginName}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Handle a command
   * @param {Object} client - The Twitch client
   * @param {string} target - The target channel
   * @param {Object} context - The user context
   * @param {string} commandText - The command text
   * @returns {Promise<boolean>} - Whether the command was handled
   */
  async handleCommand(client, target, context, commandText) {
    try {
      this.logger.info('[PluginManager] Handling command:', commandText);
      
      // Extract the command name and prefix
      const parts = commandText.trim().split(' ');
      const prefix = parts[0].charAt(0);
      const commandName = parts[0].substring(1).toLowerCase();
      
      this.logger.info(`[PluginManager] Looking for command: ${commandName} with prefix: ${prefix}`);
      
      // Find the command in enabled plugins
      for (const plugin of this.plugins.values()) {
        // Skip disabled plugins
        if (!plugin.config || !plugin.config.enabled) {
          continue;
        }
        
        // Skip plugins without commands
        if (!plugin.commands || !Array.isArray(plugin.commands)) {
          continue;
        }
        
        // Look for the command in this plugin by name or alias
        const command = plugin.commands.find(cmd => 
          cmd.name === commandName || 
          (cmd.config && cmd.config.aliases && Array.isArray(cmd.config.aliases) && cmd.config.aliases.includes(commandName))
        );
        
        if (!command) {
          continue;
        }
        
        this.logger.info(`[PluginManager] Found command ${commandName} in plugin ${plugin.name}`);
        
        // Check if command is enabled
        if (command.config && command.config.enabled === false) {
          this.logger.info(`[PluginManager] Command ${commandName} is disabled`);
          return false;
        }
        
        // Check if prefix matches (allow both ! and ? for all commands)
        if (prefix !== '!' && prefix !== '?') {
          this.logger.info(`[PluginManager] Invalid prefix for command ${commandName}. Expected: ! or ?, got: ${prefix}`);
          return false;
        }
        
        // Check if command is mod-only
        if (command.config && command.config.modOnly) {
          const isMod = context.mod || context.badges?.broadcaster === '1' || 
                        context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
          
          if (!isMod) {
            this.logger.info(`[PluginManager] Non-mod tried to use mod-only command: ${commandName}`);
            return false;
          }
        }
        
        // Execute the command
        this.logger.info(`[PluginManager] Executing command: ${command.name} from plugin: ${plugin.name}`);
        try {
          const result = await command.execute(client, target, context, commandText);
          this.logger.info(`[PluginManager] Command ${command.name} execution completed with result:`, result);
          return result;
        } catch (error) {
          this.logger.error(`[PluginManager] Error executing command ${command.name}:`, error);
          return false;
        }
      }
      
      this.logger.info(`[PluginManager] Command not found: ${commandName}`);
      return false;
    } catch (error) {
      this.logger.error('[PluginManager] Error handling command:', error);
      return false;
    }
  }
  
  /**
   * List all commands from all plugins
   * @returns {Array} - Array of command objects
   */
  listCommands() {
    const commands = [];
    
    // Iterate through all plugins
    for (const [pluginName, plugin] of this.plugins.entries()) {
      // Skip disabled plugins
      if (plugin.config && plugin.config.enabled === false) {
        continue;
      }
      
      // Check if the plugin has commands
      if (plugin.commands && Array.isArray(plugin.commands)) {
        // Add each command to the list
        for (const command of plugin.commands) {
          if (command && command.name) {
            // Add plugin name to the command
            command.pluginName = pluginName;
            
            // Add the command to the list
            commands.push(command);
          }
        }
      }
    }
    
    return commands;
  }
  
  /**
   * Enable a command by name
   * @param {string} commandName - The name of the command to enable
   * @returns {boolean} - Whether the command was successfully enabled
   */
  enableCommand(commandName) {
    for (const plugin of this.plugins.values()) {
      // Skip plugins without commands
      if (!plugin.commands || !Array.isArray(plugin.commands)) {
        continue;
      }
      
      // Find the command in this plugin
      const commandIndex = plugin.commands.findIndex(cmd => cmd.name === commandName);
      if (commandIndex === -1) {
        continue;
      }
      
      // Enable the command
      if (!plugin.commands[commandIndex].config) {
        plugin.commands[commandIndex].config = {};
      }
      
      plugin.commands[commandIndex].config.enabled = true;
      this.logger.info(`[PluginManager] Enabled command: ${commandName} in plugin: ${plugin.name}`);
      return true;
    }
    
    this.logger.warn(`[PluginManager] Cannot enable command ${commandName}: Command not found`);
    return false;
  }
  
  /**
   * Disable a command by name
   * @param {string} commandName - The name of the command to disable
   * @returns {boolean} - Whether the command was successfully disabled
   */
  disableCommand(commandName) {
    for (const plugin of this.plugins.values()) {
      // Skip plugins without commands
      if (!plugin.commands || !Array.isArray(plugin.commands)) {
        continue;
      }
      
      // Find the command in this plugin
      const commandIndex = plugin.commands.findIndex(cmd => cmd.name === commandName);
      if (commandIndex === -1) {
        continue;
      }
      
      // Disable the command
      if (!plugin.commands[commandIndex].config) {
        plugin.commands[commandIndex].config = {};
      }
      
      plugin.commands[commandIndex].config.enabled = false;
      this.logger.info(`[PluginManager] Disabled command: ${commandName} in plugin: ${plugin.name}`);
      return true;
    }
    
    this.logger.warn(`[PluginManager] Cannot disable command ${commandName}: Command not found`);
    return false;
  }
  
  /**
   * Process an incoming message through all enabled plugins
   * @param {Object} messageObj - The message object
   * @returns {Promise<Object>} - The processed message object
   */
  async processIncomingMessage(messageObj) {
    // Skip if no plugins are loaded
    if (this.plugins.size === 0) {
      return messageObj;
    }
    
    let processedMessage = { ...messageObj };
    
    // Process the message through each enabled plugin
    for (const plugin of this.plugins.values()) {
      if (plugin.config && plugin.config.enabled && typeof plugin.processIncomingMessage === 'function') {
        try {
          processedMessage = await plugin.processIncomingMessage(processedMessage);
        } catch (error) {
          this.logger.error(`[PluginManager] Error processing incoming message in plugin ${plugin.name}: ${error.message}`);
        }
      }
    }
    
    return processedMessage;
  }
  
  /**
   * Process an outgoing message through all enabled plugins
   * @param {Object} messageObj - The message object
   * @returns {Promise<Array>} - Array of processed message objects
   */
  async processOutgoingMessage(messageObj) {
    // Skip if no plugins are loaded
    if (this.plugins.size === 0) {
      return [messageObj];
    }
    
    let messages = [messageObj];
    
    // Process the message through each enabled plugin
    for (const plugin of this.plugins.values()) {
      if (plugin.config && plugin.config.enabled && typeof plugin.processOutgoingMessage === 'function') {
        try {
          const newMessages = [];
          
          // Process each message through the plugin
          for (const msg of messages) {
            const processed = await plugin.processOutgoingMessage(msg);
            if (Array.isArray(processed)) {
              newMessages.push(...processed);
            } else {
              newMessages.push(processed);
            }
          }
          
          messages = newMessages;
        } catch (error) {
          this.logger.error(`[PluginManager] Error processing outgoing message in plugin ${plugin.name}: ${error.message}`);
        }
      }
    }
    
    return messages;
  }
  
  /**
   * Reload a plugin by name
   * @param {string} pluginName - The name of the plugin to reload
   * @returns {boolean} - Whether the plugin was successfully reloaded
   */
  reloadPlugin(pluginName) {
    this.logger.info(`[PluginManager] Reloading plugin: ${pluginName}`);
    
    // Check if the plugin exists
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      this.logger.warn(`[PluginManager] Cannot reload plugin ${pluginName}: Plugin not found`);
      return false;
    }
    
    // Save the current plugin configuration
    const wasEnabled = plugin.config && plugin.config.enabled;
    const pluginConfig = { ...plugin.config };
    
    try {
      // Call the plugin's disable method if it exists and is enabled
      if (wasEnabled && typeof plugin.disable === 'function') {
        plugin.disable();
      }
      
      // Get the plugin file path
      const pluginFiles = fs.readdirSync(this.pluginsDir)
        .filter(file => file.endsWith('.js'));
      
      let pluginFile = null;
      for (const file of pluginFiles) {
        const tempPluginPath = path.join(this.pluginsDir, file);
        const tempPlugin = require.cache[require.resolve(tempPluginPath)];
        
        if (tempPlugin && tempPlugin.exports && tempPlugin.exports.name === pluginName) {
          pluginFile = file;
          break;
        }
      }
      
      // Remove the plugin from our collection
      this.plugins.delete(pluginName);
      
      // If the plugin file no longer exists, unregister it and return success
      if (!pluginFile) {
        this.logger.info(`[PluginManager] Plugin ${pluginName} no longer exists, unregistering it`);
        
        // Update the enabled plugins list in the configuration if needed
        if (this.configManager) {
          const enabledPlugins = this.configManager.get('plugins.enabled', []);
          const index = enabledPlugins.indexOf(pluginName);
          if (index !== -1) {
            enabledPlugins.splice(index, 1);
            this.configManager.set('plugins.enabled', enabledPlugins);
          }
        }
        
        return true;
      }
      
      const pluginPath = path.join(this.pluginsDir, pluginFile);
      
      // Clear require cache to ensure we get fresh plugin code
      delete require.cache[require.resolve(pluginPath)];
      
      // Load the plugin again
      const reloadedPlugin = require(pluginPath);
      
      // Check if the plugin has the required properties and methods
      if (!reloadedPlugin.name || typeof reloadedPlugin.init !== 'function') {
        this.logger.warn(`[PluginManager] Invalid plugin format after reload: ${pluginFile}`);
        return false;
      }
      
      // Restore the plugin configuration
      reloadedPlugin.config = { ...pluginConfig };
      
      // Add the plugin to our collection
      this.plugins.set(reloadedPlugin.name, reloadedPlugin);
      
      // Initialize the plugin if it was enabled
      if (wasEnabled) {
        reloadedPlugin.init(this.bot, this.logger);
        
        // Call the plugin's enable method if it exists
        if (typeof reloadedPlugin.enable === 'function') {
          reloadedPlugin.enable();
        }
      }
      
      this.logger.info(`[PluginManager] Successfully reloaded plugin: ${pluginName}`);
      return true;
    } catch (error) {
      this.logger.error(`[PluginManager] Error reloading plugin ${pluginName}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Reload all plugins
   * @returns {Object} - Object containing results of the reload operation
   */
  reloadAllPlugins() {
    this.logger.info('[PluginManager] Reloading all plugins...');
    
    const results = {
      success: [],
      failed: []
    };
    
    // Get all plugin names
    const pluginNames = Array.from(this.plugins.keys());
    
    // Reload each plugin
    for (const pluginName of pluginNames) {
      try {
        const success = this.reloadPlugin(pluginName);
        if (success) {
          results.success.push(pluginName);
        } else {
          results.failed.push(pluginName);
        }
      } catch (error) {
        // If an error occurs during reload, log it and continue with other plugins
        this.logger.error(`[PluginManager] Unexpected error reloading plugin ${pluginName}: ${error.message}`);
        results.failed.push(pluginName);
      }
    }
    
    // Load any new plugins that weren't previously loaded
    try {
      // Get all JavaScript files in the plugins directory
      const pluginFiles = fs.readdirSync(this.pluginsDir)
        .filter(file => file.endsWith('.js'));
      
      // Check for new plugins
      for (const file of pluginFiles) {
        try {
          const pluginPath = path.join(this.pluginsDir, file);
          
          // Clear require cache to ensure we get fresh plugin code
          delete require.cache[require.resolve(pluginPath)];
          
          // Load the plugin
          const plugin = require(pluginPath);
          
          // Check if the plugin has the required properties and methods
          if (!plugin.name || typeof plugin.init !== 'function') {
            this.logger.warn(`[PluginManager] Invalid plugin format: ${file}`);
            continue;
          }
          
          // Check if this is a new plugin
          if (!this.plugins.has(plugin.name)) {
            // Add the plugin to our collection
            this.plugins.set(plugin.name, plugin);
            
            // Load plugin configuration if available
            if (this.configManager) {
              const pluginConfig = this.configManager.get(`plugins.settings.${plugin.name}`, {});
              
              // Ensure the plugin has a config object
              if (!plugin.config) {
                plugin.config = {};
              }
              
              // Merge the saved config with the plugin's default config
              plugin.config = { ...plugin.config, ...pluginConfig };
              
              // Ensure the enabled property exists
              if (plugin.config.enabled === undefined) {
                plugin.config.enabled = false;
              }

              // Check if the plugin should be enabled by default
              const enabledPlugins = this.configManager.get('plugins.enabled', []);
              if (enabledPlugins.includes(plugin.name) || plugin.config.enabled) {
                plugin.config.enabled = true;
                
                // Initialize the plugin if it should be enabled
                if (this.bot) {
                  plugin.init(this.bot, this.logger);
                }
              }
            }
            
            results.success.push(plugin.name);
            this.logger.info(`[PluginManager] Loaded new plugin: ${plugin.name}`);
          }
        } catch (error) {
          this.logger.error(`[PluginManager] Error loading plugin ${file}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`[PluginManager] Error checking for new plugins: ${error.message}`);
    }
    
    this.logger.info(`[PluginManager] Reloaded ${results.success.length} plugins successfully, ${results.failed.length} failed`);
    return results;
  }
}

module.exports = PluginManager; 