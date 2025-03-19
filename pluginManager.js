/**
 * MaxBot Plugin Manager
 * 
 * This module handles loading, initializing, and managing plugins for MaxBot.
 */

const fs = require('fs');
const path = require('path');

class PluginManager {
  /**
   * Constructor for PluginManager
   * @param {Object} logger - Logger instance
   * @param {Object} configManager - Configuration manager instance
   */
  constructor(logger, configManager = null) {
    this.plugins = new Map();
    this.pluginsDir = path.join(__dirname, 'plugins');
    this.logger = logger;
    this.configManager = configManager;
    this.bot = null;
    
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
   * Set the bot instance
   * @param {Object} bot - The bot instance
   */
  init(bot) {
    this.bot = bot;
    this.logger.info('[PluginManager] Initialized with bot instance');
    
    // Initialize all enabled plugins
    this.initPlugins();
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
    
    this.logger.info(`[PluginManager] Found plugin files: ${pluginFiles.join(', ')}`);
    
    // Load each plugin
    const loadedPlugins = [];
    for (const file of pluginFiles) {
      try {
        const pluginPath = path.join(this.pluginsDir, file);
        
        // Clear require cache to ensure we get fresh plugin code
        if (require.cache[require.resolve(pluginPath)]) {
          this.logger.info(`[PluginManager] Clearing cache for plugin: ${file}`);
          delete require.cache[require.resolve(pluginPath)];
        }
        
        // Skip template plugins
        if (file === 'template.js' || file === 'template-class.js') {
          this.logger.info(`[PluginManager] Skipping template plugin: ${file}`);
          continue;
        }
        
        // Load the plugin
        this.logger.info(`[PluginManager] Loading plugin file: ${file}`);
        const plugin = require(pluginPath);
        
        // Log the raw plugin object to debug
        this.logger.info(`[PluginManager] Loaded plugin object: ${JSON.stringify({
          name: plugin.name,
          version: plugin.version,
          hasInit: typeof plugin.init === 'function',
          hasCommands: Array.isArray(plugin.commands),
          commandsLength: Array.isArray(plugin.commands) ? plugin.commands.length : 'N/A'
        })}`);
        
        // Check if the plugin has the required properties and methods
        if (!plugin.name || typeof plugin.init !== 'function') {
          this.logger.warn(`[PluginManager] Invalid plugin format: ${file}`);
          continue;
        }
        
        // Add the plugin to our collection
        this.plugins.set(plugin.name, plugin);
        
        // Add author information to the log if available
        const authorInfo = plugin.author ? ` by ${plugin.author}` : '';
        this.logger.info(`[PluginManager] Loaded plugin: ${plugin.name} v${plugin.version || '1.0.0'}${authorInfo}`);
        
        // Load the plugin's configuration
        if (this.configManager) {
          // Create a default config object if it doesn't exist
          if (!plugin.config) {
            plugin.config = { enabled: true };
          }
          
          // Load the plugin's configuration
          const config = this.configManager.loadPluginConfig(plugin.name, plugin.config);
          
          // If the plugin was previously in an error state, that might be fixed now
          if (config.errorState) {
            this.logger.info(`[PluginManager] Plugin ${plugin.name} was previously in error state: ${config.lastError}`);
            // Clear the error state since we're reloading
            config.errorState = false;
            config.lastError = null;
            this.configManager.savePluginConfig(plugin.name, config);
          }
          
          this.logger.info(`Loaded configuration for plugin ${plugin.name} from ${this.configManager.getPluginConfigPath(plugin.name)}`);
        } else {
          this.logger.info(`No configuration manager available, using default configuration for plugin ${plugin.name}`);
        }
        
        loadedPlugins.push(plugin.name);
      } catch (error) {
        this.logger.error(`[PluginManager] Error loading plugin ${file}:`, error);
      }
    }
    
    this.logger.info(`[PluginManager] Loaded ${loadedPlugins.length} plugins: ${loadedPlugins.join(', ')}`);
  }
  
  /**
   * Initialize plugins with the bot object
   * @param {Object} bot - The bot object to pass to plugins
   * @returns {Promise<void>} - Promise that resolves when initialization is complete
   */
  async initPlugins(bot) {
    // Safety check - ensure bot is valid and has client
    if (!bot || !bot.client) {
      this.logger.error('[PluginManager] Cannot initialize plugins: Invalid bot object or missing client property');
      return;
    }
    
    // Check if we already initialized plugins with this bot object
    if (this.bot === bot && this._initialized) {
      this.logger.info('[PluginManager] Plugins are already initialized with this bot instance, skipping');
      return;
    }
    
    this.bot = bot;
    this._initialized = true;
    
    if (this.plugins.size === 0) {
      this.logger.warn('[PluginManager] No plugins to initialize');
      return;
    }
    
    this.logger.info(`[PluginManager] Initializing ${this.plugins.size} plugins`);
    let initCount = 0;
    let failedPlugins = [];
    
    // Get enabled plugins from config or use defaults
    let enabledPlugins = this.configManager ? this.configManager.get('plugins.enabled', []) : [];
    
    // Log what plugins we have
    this.logger.info(`[PluginManager] Loaded plugins: ${[...this.plugins.keys()].join(', ')}`);
    this.logger.info(`[PluginManager] Enabled plugins from config: ${enabledPlugins.join(', ') || 'none'}`);
    
    for (const plugin of this.plugins.values()) {
      try {
        // Skip plugins that are already initialized
        if (plugin._initialized) {
          this.logger.info(`[PluginManager] Plugin ${plugin.name} is already initialized, skipping`);
          initCount++; // Count as successfully initialized
          continue;
        }
        
        // Log pre-init state
        this.logger.info(`[PluginManager] Pre-init state of ${plugin.name}: commands = ${plugin.commands ? plugin.commands.length : 'undefined'}`);
        
        // Skip plugins that don't have an init method
        if (typeof plugin.init !== 'function') {
          this.logger.warn(`[PluginManager] Plugin ${plugin.name} does not have an init method, skipping`);
          continue;
        }
        
        this.logger.info(`[PluginManager] Initializing plugin: ${plugin.name}`);
        
        // Initialize the plugin with timeout protection
        const initPromise = Promise.resolve().then(() => {
          try {
            // Pass the logger directly to the plugin
            const result = plugin.init(bot, this.logger);
            // Mark as initialized if successful
            if (result) {
              plugin._initialized = true;
            }
            return result;
          } catch (error) {
            // Catch synchronous errors in init
            throw new Error(`Synchronous error in plugin.init: ${error.message}`);
          }
        });
        
        // Add a timeout to prevent hanging during initialization
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Plugin initialization timed out (10s)'));
          }, 10000); // 10 second timeout
        });
        
        // Wait for initialization or timeout
        await Promise.race([initPromise, timeoutPromise]);
        
        // Verify critical properties after initialization
        if (!Array.isArray(plugin.commands)) {
          this.logger.warn(`[PluginManager] Plugin ${plugin.name} does not have a commands array after initialization`);
        } else if (plugin.commands.length === 0) {
          this.logger.warn(`[PluginManager] Plugin ${plugin.name} has an empty commands array after initialization`);
        } else {
          this.logger.info(`[PluginManager] Plugin ${plugin.name} initialized with ${plugin.commands.length} commands: ${plugin.commands.map(c => c.name).join(', ')}`);
        }
        
        // Enable the plugin if it's in the enabled list
        if (enabledPlugins.includes(plugin.name)) {
          // Use try-catch to prevent enable errors from affecting other plugins
          try {
            this.enablePlugin(plugin.name);
          } catch (enableError) {
            this.logger.error(`[PluginManager] Error enabling plugin ${plugin.name} after initialization: ${enableError.message}`);
            // Add to failed plugins but still count it as initialized
            failedPlugins.push({
              name: plugin.name,
              phase: 'enable',
              error: enableError.message
            });
          }
        }
        
        initCount++;
        
      } catch (error) {
        // Handle initialization errors
        this.logger.error(`[PluginManager] Error initializing plugin ${plugin.name}: ${error.message}`);
        
        // Clear initialized flag to allow retry later
        if (plugin._initialized) {
          plugin._initialized = false;
        }
        
        // Track the failed plugin
        failedPlugins.push({
          name: plugin.name,
          phase: 'initialization',
          error: error.message
        });
        
        // Mark the plugin as disabled due to error
        try {
          if (plugin.config) {
            plugin.config.enabled = false;
            plugin.config.errorState = true;
            plugin.config.lastError = error.message;
          } else {
            plugin.config = {
              enabled: false,
              errorState: true,
              lastError: error.message
            };
          }
          
          // Update the enabled plugins list to remove this plugin
          if (this.configManager) {
            const enabledPluginsList = this.configManager.get('plugins.enabled', []);
            const index = enabledPluginsList.indexOf(plugin.name);
            if (index !== -1) {
              enabledPluginsList.splice(index, 1);
              this.configManager.set('plugins.enabled', enabledPluginsList);
            }
          }
        } catch (configError) {
          // If we can't even update the config, just log and continue
          this.logger.error(`[PluginManager] Failed to update config after plugin error: ${configError.message}`);
        }
      }
    }
    
    // Log initialization summary
    const successCount = initCount - failedPlugins.length;
    if (failedPlugins.length > 0) {
      this.logger.warn(`[PluginManager] Initialization complete: ${successCount} successful, ${failedPlugins.length} failed`);
      
      // Log details about failed plugins
      failedPlugins.forEach(failed => {
        this.logger.warn(`[PluginManager] Failed plugin: ${failed.name} (${failed.phase}) - ${failed.error}`);
      });
      
      // Emit an event about failed plugins for monitoring
      if (this.bot && this.bot.events) {
        this.bot.events.emit('plugins:init:errors', { failedPlugins });
      }
    } else {
      this.logger.info(`[PluginManager] Initialized ${initCount} plugins successfully`);
    }
    
    // Listen for plugin API channel info requests
    this.setupEventListeners();
  }
  
  /**
   * Set up event listeners for the plugin manager
   */
  setupEventListeners() {
    // Only set up event listeners if we have a bot object with events
    if (!this.bot || !this.bot.events) {
      return;
    }
    
    // Register for any plugin-related events that need central handling
    this.bot.events.on('plugin:info:request', this.handlePluginInfoRequest.bind(this));
  }
  
  /**
   * Handle plugin info requests
   * @param {Object} data - The request data
   */
  handlePluginInfoRequest(data) {
    try {
      // Get the plugin info
      const pluginInfo = this.getPluginInfo(data.pluginName);
      
      // Emit the response event
      this.bot.events.emit('plugin:info:response', {
        requestId: data.requestId,
        pluginInfo,
        success: !!pluginInfo
      });
    } catch (error) {
      this.logger.error(`[PluginManager] Error handling plugin info request: ${error.message}`);
      
      // Emit error response
      this.bot.events.emit('plugin:info:response', {
        requestId: data.requestId,
        error: error.message,
        success: false
      });
    }
  }
  
  /**
   * Get information about a plugin
   * @param {string} pluginName - The name of the plugin
   * @returns {Object|null} - The plugin information or null if not found
   */
  getPluginInfo(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return null;
    }
    
    return {
      name: plugin.name,
      description: plugin.description || 'No description provided',
      enabled: plugin.config && plugin.config.enabled,
      commands: this.getPluginCommands(plugin)
    };
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
        
        // Update the plugin's configuration in the main config
        this.configManager.set(`plugins.settings.${pluginName}.enabled`, true);
      }
      
      this.logger.info(`[PluginManager] Plugin ${pluginName} enabled`);
      
      // Initialize the plugin if the bot is available
      if (this.bot && typeof plugin.init === 'function') {
        plugin.init(this.bot, this.logger);
      }
      
      // Emit plugin enabled event
      if (this.bot && this.bot.events) {
        this.bot.events.emit('plugin:enabled', { 
          name: pluginName,
          plugin
        });
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
        
        // Update the plugin's configuration in the main config
        this.configManager.set(`plugins.settings.${pluginName}.enabled`, false);
      }
      
      this.logger.info(`[PluginManager] Plugin ${pluginName} disabled`);
      
      // Emit plugin disabled event
      if (this.bot && this.bot.events) {
        this.bot.events.emit('plugin:disabled', { 
          name: pluginName,
          plugin
        });
      }
      
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
   * @returns {Array} - Array of plugins
   */
  getAllPlugins() {
    const pluginArray = [];
    
    for (const [name, plugin] of this.plugins.entries()) {
      pluginArray.push(plugin);
    }
    
    return pluginArray;
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
   * Handle a command from a user
   * @param {Object} client - Twitch client
   * @param {string} target - Target channel
   * @param {Object} context - User context (tags)
   * @param {string} commandText - Command text
   * @returns {Promise<boolean>} - Promise that resolves to true if command was handled, false otherwise
   */
  async handleCommand(client, target, context, commandText) {
    // Extract command name and parameters
    const parts = commandText.trim().split(' ');
    const commandName = parts[0].slice(1).toLowerCase(); // Remove ! and convert to lowercase
    
    // Skip built-in commands that should be handled by the main bot
    if (commandName === 'plugin') {
      this.logger.info(`[PluginManager] Ignoring !plugin command to let built-in handler handle it`);
      return false;
    }
    
    try {
      this.logger.info('[PluginManager] Handling command:', commandText);
      
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
        const prefix = parts[0].charAt(0);
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
   * Reload a plugin
   * @param {string} pluginName - The name of the plugin to reload
   * @returns {boolean} - Whether the plugin was successfully reloaded
   */
  reloadPlugin(pluginName) {
    this.logger.info(`[PluginManager] Reloading plugin: ${pluginName}`);
    
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      this.logger.warn(`[PluginManager] Cannot reload plugin ${pluginName}: Plugin not found`);
      return false;
    }
    
    try {
      // Get plugin file path
      const pluginFile = this.findPluginFile(pluginName);
      if (!pluginFile) {
        this.logger.warn(`[PluginManager] Cannot reload plugin ${pluginName}: Plugin file not found`);
        return false;
      }
      
      const pluginPath = path.join(this.pluginsDir, pluginFile);
      
      // Save whether the plugin was enabled
      const wasEnabled = plugin.config && plugin.config.enabled;
      
      // Save plugin configuration
      const pluginConfig = plugin.config ? { ...plugin.config } : { enabled: wasEnabled };
      
      // Call the plugin's disable method if it exists and it's enabled
      if (wasEnabled && typeof plugin.disable === 'function') {
        plugin.disable();
      }
      
      // Emit plugin unload event
      if (this.bot && this.bot.events) {
        this.bot.events.emit('plugin:unload', { 
          name: pluginName,
          plugin
        });
      }
      
      // Remove the plugin
      this.plugins.delete(pluginName);
      
      // Clear require cache
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
      
      // Emit plugin loaded event
      if (this.bot && this.bot.events) {
        this.bot.events.emit('plugin:loaded', { 
          name: pluginName,
          plugin: reloadedPlugin
        });
      }
      
      // Initialize the plugin if it was enabled
      if (wasEnabled) {
        reloadedPlugin.init(this.bot, this.logger);
        
        // Call the plugin's enable method if it exists
        if (typeof reloadedPlugin.enable === 'function') {
          reloadedPlugin.enable();
        }
        
        // Emit plugin enabled event
        if (this.bot && this.bot.events) {
          this.bot.events.emit('plugin:enabled', { 
            name: pluginName,
            plugin: reloadedPlugin
          });
        }
      }
      
      this.logger.info(`[PluginManager] Successfully reloaded plugin: ${pluginName}`);
      
      // Emit plugin reloaded event
      if (this.bot && this.bot.events) {
        this.bot.events.emit('plugin:reloaded', { 
          name: pluginName,
          plugin: reloadedPlugin
        });
      }
      
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
  
  /**
   * Find the file for a plugin by name
   * @param {string} pluginName - The name of the plugin to find
   * @returns {string|null} - The plugin file name or null if not found
   * @private
   */
  findPluginFile(pluginName) {
    try {
      const pluginFiles = fs.readdirSync(this.pluginsDir)
        .filter(file => file.endsWith('.js'));
      
      // First try to find by exact file name (pluginName.js)
      const exactMatch = pluginFiles.find(file => file === `${pluginName}.js`);
      if (exactMatch) {
        return exactMatch;
      }
      
      // If no exact match, try to find by plugin name property
      for (const file of pluginFiles) {
        try {
          const pluginPath = path.join(this.pluginsDir, file);
          const pluginModule = require.cache[require.resolve(pluginPath)];
          
          if (pluginModule && pluginModule.exports && pluginModule.exports.name === pluginName) {
            return file;
          }
        } catch (error) {
          this.logger.warn(`[PluginManager] Error checking plugin file ${file}:`, error);
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`[PluginManager] Error finding plugin file for ${pluginName}:`, error);
      return null;
    }
  }
  
  /**
   * Get all plugins that are in error state
   * @returns {Array} - Array of objects with plugin name and error information
   */
  getPluginsInErrorState() {
    const errorPlugins = [];
    
    for (const [name, plugin] of this.plugins.entries()) {
      if (plugin.config && plugin.config.errorState) {
        errorPlugins.push({
          name,
          error: plugin.config.lastError || 'Unknown error',
          plugin
        });
      }
    }
    
    return errorPlugins;
  }
  
  /**
   * Attempt to recover a plugin from error state
   * @param {string} pluginName - Name of the plugin to recover
   * @returns {boolean} - Whether recovery was successful
   */
  recoverPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      this.logger.warn(`[PluginManager] Cannot recover plugin ${pluginName}: Plugin not found`);
      return false;
    }
    
    // Check if plugin is in error state
    if (!plugin.config || !plugin.config.errorState) {
      this.logger.warn(`[PluginManager] Plugin ${pluginName} is not in error state`);
      return false;
    }
    
    try {
      this.logger.info(`[PluginManager] Attempting to recover plugin ${pluginName} from error state`);
      
      // Clear error state
      plugin.config.errorState = false;
      plugin.config.lastError = null;
      
      // Attempt to reload the plugin
      const reloadSuccess = this.reloadPlugin(pluginName);
      
      if (reloadSuccess) {
        this.logger.info(`[PluginManager] Successfully recovered plugin ${pluginName}`);
        
        // Emit recovery event
        if (this.bot && this.bot.events) {
          this.bot.events.emit('plugin:recovered', { 
            name: pluginName,
            plugin
          });
        }
        
        return true;
      } else {
        this.logger.error(`[PluginManager] Failed to recover plugin ${pluginName}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`[PluginManager] Error recovering plugin ${pluginName}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Debug function to log the state of all plugins and their commands
   */
  logPluginStatus() {
    this.logger.info('===== PLUGIN STATUS DEBUG =====');
    this.logger.info(`Total plugins loaded: ${this.plugins.size}`);
    
    for (const [name, plugin] of this.plugins.entries()) {
      this.logger.info(`Plugin: ${name}`);
      this.logger.info(`- Enabled: ${plugin.config?.enabled}`);
      this.logger.info(`- Initialized: ${plugin._initialized}`);
      this.logger.info(`- Error state: ${plugin.config?.errorState || false}`);
      
      if (plugin.commands) {
        this.logger.info(`- Commands (${plugin.commands.length}):`);
        for (const cmd of plugin.commands) {
          this.logger.info(`  - ${cmd.name} (enabled: ${cmd.config?.enabled !== false})`);
          if (cmd.config?.aliases && cmd.config.aliases.length > 0) {
            this.logger.info(`    Aliases: ${cmd.config.aliases.join(', ')}`);
          }
        }
      } else {
        this.logger.info('- No commands array');
      }
    }
    
    this.logger.info('================================');
  }
  
  /**
   * Debug function to explicitly dump the hello plugin state
   */
  debugHelloPlugin() {
    const helloPlugin = this.getPlugin('hello');
    if (!helloPlugin) {
      this.logger.warn('[DEBUG] Hello plugin not found!');
      return;
    }
    
    this.logger.info('[DEBUG] Hello plugin details:');
    this.logger.info(`- Plugin object: ${typeof helloPlugin}`);
    this.logger.info(`- Enabled: ${helloPlugin.config?.enabled}`);
    this.logger.info(`- Initialized: ${helloPlugin._initialized}`);
    
    if (helloPlugin.commands) {
      this.logger.info(`- Commands array exists with ${helloPlugin.commands.length} commands`);
      for (const cmd of helloPlugin.commands) {
        this.logger.info(`  - Command: ${cmd.name}`);
        this.logger.info(`    Execute function: ${typeof cmd.execute}`);
        this.logger.info(`    Plugin reference: ${typeof cmd.plugin}`);
      }
    } else {
      this.logger.warn('- No commands array exists!');
    }
  }
}

module.exports = PluginManager; 