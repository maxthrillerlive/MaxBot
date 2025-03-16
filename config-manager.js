/**
 * MaxBot Configuration Manager
 * 
 * This module handles loading and saving configuration settings for MaxBot.
 * It provides a centralized way to manage settings across the application.
 * Configurations are stored in separate files within the config directory.
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor(logger) {
    this.logger = logger || console;
    this.configDir = path.join(__dirname, 'config');
    this.mainConfigPath = path.join(this.configDir, 'maxbot.json');
    this.botConfigPath = path.join(this.configDir, 'bot.json');
    this.webcpConfigPath = path.join(this.configDir, 'webcp.json');
    this.pluginsConfigPath = path.join(this.configDir, 'plugins.json');
    this.commandsConfigPath = path.join(this.configDir, 'commands.json');
    this.featuresConfigPath = path.join(this.configDir, 'features.json');
    
    // Ensure config directory exists
    this.ensureConfigDir();
    
    // Default configuration values
    this.config = {
      bot: {
        username: process.env.BOT_USERNAME || '',
        channels: process.env.CHANNEL_NAME ? [process.env.CHANNEL_NAME] : [],
        autoReconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10
      },
      webcp: {
        port: process.env.HTTP_PORT || 3000,
        wsPort: process.env.PORT || 8080
      },
      plugins: {
        enabled: ['translator'],
        settings: {
          translator: {
            apiKey: process.env.TRANSLATOR_API_KEY || '',
            defaultTargetLanguage: 'en',
            translateIncoming: false,
            translateOutgoing: false,
            outgoingLanguages: ['es', 'fr']
          }
        }
      },
      commands: {
        prefix: '!',
        cooldown: 1000
      },
      features: {
        enableLogging: true,
        enableChatHistory: true,
        maxChatHistory: 100,
        maxLogEntries: 1000
      }
    };
    
    // Load configuration from files
    this.loadConfig();
  }
  
  /**
   * Ensure the config directory exists
   * @private
   */
  ensureConfigDir() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        this.logger.info(`Created configuration directory at ${this.configDir}`);
      }
    } catch (error) {
      this.logger.error(`Error creating config directory: ${error.message}`);
    }
  }
  
  /**
   * Load configuration from files
   * @returns {Object} The loaded configuration
   */
  loadConfig() {
    try {
      // Load main configuration if it exists
      if (fs.existsSync(this.mainConfigPath)) {
        const mainConfig = this.loadConfigFile(this.mainConfigPath);
        if (mainConfig) {
          // If main config exists, use it as the base
          this.config = this.mergeConfigs(this.config, mainConfig);
          this.logger.info(`Loaded MaxBot configuration from ${this.mainConfigPath}`);
          return this.config;
        }
      }
      
      // Otherwise, load individual config files
      this.loadConfigSection('bot', this.botConfigPath);
      this.loadConfigSection('webcp', this.webcpConfigPath);
      this.loadConfigSection('plugins', this.pluginsConfigPath);
      this.loadConfigSection('commands', this.commandsConfigPath);
      this.loadConfigSection('features', this.featuresConfigPath);
      
      // Save the configuration to ensure all files exist
      this.saveConfig();
      
      return this.config;
    } catch (error) {
      this.logger.error(`Error loading configuration: ${error.message}`);
      return this.config;
    }
  }
  
  /**
   * Load a configuration section from a file
   * @param {string} section - The configuration section name
   * @param {string} filePath - The path to the configuration file
   * @private
   */
  loadConfigSection(section, filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const sectionConfig = this.loadConfigFile(filePath);
        if (sectionConfig) {
          this.config[section] = this.mergeConfigs(this.config[section], sectionConfig);
          this.logger.info(`Loaded ${section} configuration from ${filePath}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error loading ${section} configuration: ${error.message}`);
    }
  }
  
  /**
   * Load a configuration file
   * @param {string} filePath - The path to the configuration file
   * @returns {Object|null} The loaded configuration or null if error
   * @private
   */
  loadConfigFile(filePath) {
    try {
      const fileData = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileData);
    } catch (error) {
      this.logger.error(`Error loading configuration file ${filePath}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Save configuration to files
   * @returns {boolean} Whether the save was successful
   */
  saveConfig() {
    try {
      // Ensure config directory exists
      this.ensureConfigDir();
      
      // Save each section to its own file
      this.saveConfigSection('bot', this.botConfigPath);
      this.saveConfigSection('webcp', this.webcpConfigPath);
      this.saveConfigSection('plugins', this.pluginsConfigPath);
      this.saveConfigSection('commands', this.commandsConfigPath);
      this.saveConfigSection('features', this.featuresConfigPath);
      
      // Save the complete configuration to maxbot.json
      this.saveConfigFile(this.mainConfigPath, this.config);
      
      this.logger.info(`Configuration saved to ${this.configDir}`);
      return true;
    } catch (error) {
      this.logger.error(`Error saving configuration: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Save a configuration section to a file
   * @param {string} section - The configuration section name
   * @param {string} filePath - The path to the configuration file
   * @private
   */
  saveConfigSection(section, filePath) {
    try {
      this.saveConfigFile(filePath, this.config[section]);
      this.logger.info(`Saved ${section} configuration to ${filePath}`);
    } catch (error) {
      this.logger.error(`Error saving ${section} configuration: ${error.message}`);
    }
  }
  
  /**
   * Save a configuration object to a file
   * @param {string} filePath - The path to the configuration file
   * @param {Object} config - The configuration object to save
   * @private
   */
  saveConfigFile(filePath, config) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
      this.logger.error(`Error saving configuration file ${filePath}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get a configuration value
   * @param {string} key - Dot notation path to the config value (e.g., 'plugins.settings.translator.apiKey')
   * @param {*} defaultValue - Default value to return if the key doesn't exist
   * @returns {*} The configuration value or default value
   */
  get(key, defaultValue = null) {
    try {
      const parts = key.split('.');
      let value = this.config;
      
      for (const part of parts) {
        if (value === undefined || value === null || typeof value !== 'object') {
          return defaultValue;
        }
        value = value[part];
      }
      
      return value !== undefined ? value : defaultValue;
    } catch (error) {
      this.logger.error(`Error getting config value for ${key}: ${error.message}`);
      return defaultValue;
    }
  }
  
  /**
   * Set a configuration value
   * @param {string} key - Dot notation path to the config value
   * @param {*} value - The value to set
   * @param {boolean} save - Whether to save the config to file after setting
   * @returns {boolean} Whether the operation was successful
   */
  set(key, value, save = true) {
    try {
      const parts = key.split('.');
      const lastPart = parts.pop();
      let current = this.config;
      
      // Navigate to the correct object
      for (const part of parts) {
        if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }
      
      // Set the value
      current[lastPart] = value;
      
      // Save if requested
      if (save) {
        // Determine which section was modified and save that file
        const section = parts[0];
        if (section && this.config[section]) {
          switch (section) {
            case 'bot':
              this.saveConfigSection('bot', this.botConfigPath);
              break;
            case 'webcp':
              this.saveConfigSection('webcp', this.webcpConfigPath);
              break;
            case 'plugins':
              this.saveConfigSection('plugins', this.pluginsConfigPath);
              break;
            case 'commands':
              this.saveConfigSection('commands', this.commandsConfigPath);
              break;
            case 'features':
              this.saveConfigSection('features', this.featuresConfigPath);
              break;
            default:
              // If we can't determine the section, save everything
              this.saveConfig();
          }
          
          // Also update the main config file
          this.saveConfigFile(this.mainConfigPath, this.config);
        } else {
          // If we can't determine the section, save everything
          this.saveConfig();
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error setting config value for ${key}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Update multiple configuration values at once
   * @param {Object} updates - Object with key-value pairs to update
   * @param {boolean} save - Whether to save the config to file after updating
   * @returns {boolean} Whether the operation was successful
   */
  update(updates, save = true) {
    try {
      // Track which sections are modified
      const modifiedSections = new Set();
      
      for (const [key, value] of Object.entries(updates)) {
        const parts = key.split('.');
        const section = parts[0];
        
        // Set the value without saving yet
        this.set(key, value, false);
        
        // Track the modified section
        if (section && this.config[section]) {
          modifiedSections.add(section);
        }
      }
      
      // Save if requested
      if (save) {
        // Save each modified section
        for (const section of modifiedSections) {
          switch (section) {
            case 'bot':
              this.saveConfigSection('bot', this.botConfigPath);
              break;
            case 'webcp':
              this.saveConfigSection('webcp', this.webcpConfigPath);
              break;
            case 'plugins':
              this.saveConfigSection('plugins', this.pluginsConfigPath);
              break;
            case 'commands':
              this.saveConfigSection('commands', this.commandsConfigPath);
              break;
            case 'features':
              this.saveConfigSection('features', this.featuresConfigPath);
              break;
          }
        }
        
        // Also update the main config file
        this.saveConfigFile(this.mainConfigPath, this.config);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error updating config: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get the entire configuration object
   * @returns {Object} The configuration object
   */
  getAll() {
    return this.config;
  }
  
  /**
   * Reset configuration to defaults
   * @param {boolean} save - Whether to save the config to file after resetting
   * @returns {boolean} Whether the operation was successful
   */
  resetToDefaults(save = true) {
    try {
      // Re-initialize the config object with default values
      this.config = {
        bot: {
          username: process.env.BOT_USERNAME || '',
          channels: process.env.CHANNEL_NAME ? [process.env.CHANNEL_NAME] : [],
          autoReconnect: true,
          reconnectInterval: 5000,
          maxReconnectAttempts: 10
        },
        webcp: {
          port: process.env.HTTP_PORT || 3000,
          wsPort: process.env.PORT || 8080
        },
        plugins: {
          enabled: ['translator'],
          settings: {
            translator: {
              apiKey: process.env.TRANSLATOR_API_KEY || '',
              defaultTargetLanguage: 'en',
              translateIncoming: false,
              translateOutgoing: false,
              outgoingLanguages: ['es', 'fr']
            }
          }
        },
        commands: {
          prefix: '!',
          cooldown: 1000
        },
        features: {
          enableLogging: true,
          enableChatHistory: true,
          maxChatHistory: 100,
          maxLogEntries: 1000
        }
      };
      
      // Save if requested
      if (save) {
        this.saveConfig();
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error resetting config to defaults: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Recursively merge two configuration objects
   * @param {Object} target - The target object (defaults)
   * @param {Object} source - The source object (loaded config)
   * @returns {Object} The merged configuration
   * @private
   */
  mergeConfigs(target, source) {
    const output = { ...target };
    
    if (typeof source !== 'object' || source === null) {
      return output;
    }
    
    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // If the key exists in target and is an object, merge recursively
        if (target[key] && typeof target[key] === 'object') {
          output[key] = this.mergeConfigs(target[key], source[key]);
        } else {
          // Otherwise just copy the source value
          output[key] = source[key];
        }
      } else {
        // For non-objects (including arrays), just copy the value
        output[key] = source[key];
      }
    });
    
    return output;
  }
}

module.exports = ConfigManager; 