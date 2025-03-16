/**
 * MaxBot Chat Plugin
 * 
 * This plugin provides chat configuration and management capabilities.
 * It allows users to configure chat display settings and manage chat history.
 */

const fs = require('fs');
const path = require('path');

class ChatPlugin {
  constructor() {
    this.name = 'chat';
    this.description = 'Chat configuration and management';
    this.version = '1.0.0';
    this.enabled = true;
    
    // Define the config path
    this.configDir = path.join(__dirname, '..', 'config');
    this.configPath = path.join(this.configDir, 'chat.json');
    
    // Default configuration
    this.config = {
      maxMessages: 100,           // Maximum number of messages to store in history
      showTimestamps: true,       // Show timestamps in chat
      showBadges: true,           // Show user badges in chat
      highlightMentions: true,    // Highlight messages that mention the bot
      fontSizeChat: 'medium',     // Font size for chat (small, medium, large)
      chatColors: {
        background: '#1e1e1e',    // Chat background color
        text: '#e0e0e0',          // Chat text color
        timestamp: '#888888',     // Timestamp color
        username: '#4CAF50',      // Username color
        mention: '#ff9800',       // Mention highlight color
        command: '#2196F3'        // Command color
      },
      filterCommands: false,      // Filter out command messages from chat display
      showNotifications: true     // Show chat notifications
    };
    
    // Load config from file if exists
    this.loadConfig();
  }
  
  init(bot, logger) {
    this.bot = bot;
    this.logger = logger;
    
    this.logger.info(`[Chat] Plugin initialized`);
    
    // Register any event handlers
    if (this.bot.on) {
      this.bot.on('chat', this.processChat.bind(this));
    }
    
    return true;
  }
  
  enable() {
    this.enabled = true;
    this.logger.info(`[Chat] Plugin enabled`);
    return true;
  }
  
  disable() {
    this.enabled = false;
    this.logger.info(`[Chat] Plugin disabled`);
    return true;
  }
  
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = JSON.parse(configData);
        
        // Merge loaded config with default config to ensure all properties exist
        this.config = {
          ...this.config,
          ...loadedConfig
        };
        
        // Ensure chatColors object has all required properties
        this.config.chatColors = {
          ...this.config.chatColors,
          ...(loadedConfig.chatColors || {})
        };
      } else {
        // Config file doesn't exist, create it with default values
        this.ensureConfigDir();
        this.saveConfig();
      }
    } catch (error) {
      console.error(`[Chat] Error loading config: ${error.message}`);
    }
  }
  
  ensureConfigDir() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
    } catch (error) {
      console.error(`[Chat] Error creating config directory: ${error.message}`);
    }
  }
  
  saveConfig() {
    try {
      this.ensureConfigDir();
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      this.logger.info(`[Chat] Configuration saved to ${this.configPath}`);
      return true;
    } catch (error) {
      this.logger.error(`[Chat] Error saving configuration: ${error.message}`);
      return false;
    }
  }
  
  updateConfig(newConfig) {
    try {
      // Update config with new values
      this.config = {
        ...this.config,
        ...newConfig
      };
      
      // Ensure chatColors object has all required properties
      if (newConfig.chatColors) {
        this.config.chatColors = {
          ...this.config.chatColors,
          ...newConfig.chatColors
        };
      }
      
      // Save the updated config
      const saved = this.saveConfig();
      
      if (saved) {
        this.logger.info(`[Chat] Configuration updated successfully`);
        return true;
      } else {
        this.logger.error(`[Chat] Failed to save updated configuration`);
        return false;
      }
    } catch (error) {
      this.logger.error(`[Chat] Error updating configuration: ${error.message}`);
      return false;
    }
  }
  
  processChat(username, message, channel, badges = {}) {
    // This method can be used to process chat messages if needed
    // For now, it's just a placeholder
    if (!this.enabled) return;
    
    // Apply any chat processing logic here
    // For example, filtering commands if filterCommands is enabled
    if (this.config.filterCommands && message.startsWith('!')) {
      // Skip command messages if filtering is enabled
      return;
    }
    
    // Additional chat processing can be added here
  }
  
  getCommands() {
    // Return any chat-related commands
    return [
      {
        name: 'chatconfig',
        description: 'Configure chat settings',
        usage: '!chatconfig [setting] [value]',
        modOnly: true,
        handler: this.handleChatConfigCommand.bind(this)
      }
    ];
  }
  
  async handleChatConfigCommand(client, target, context, args) {
    if (!args || args.length === 0) {
      // Display current configuration
      client.say(target, `Current chat configuration: ${JSON.stringify(this.config)}`);
      return;
    }
    
    const setting = args[0].toLowerCase();
    const value = args[1];
    
    switch (setting) {
      case 'maxtimestamps':
        if (value === 'on' || value === 'true') {
          this.config.showTimestamps = true;
          this.saveConfig();
          client.say(target, 'Chat timestamps enabled');
        } else if (value === 'off' || value === 'false') {
          this.config.showTimestamps = false;
          this.saveConfig();
          client.say(target, 'Chat timestamps disabled');
        }
        break;
        
      case 'badges':
        if (value === 'on' || value === 'true') {
          this.config.showBadges = true;
          this.saveConfig();
          client.say(target, 'Chat badges enabled');
        } else if (value === 'off' || value === 'false') {
          this.config.showBadges = false;
          this.saveConfig();
          client.say(target, 'Chat badges disabled');
        }
        break;
        
      case 'fontsize':
        if (['small', 'medium', 'large'].includes(value)) {
          this.config.fontSizeChat = value;
          this.saveConfig();
          client.say(target, `Chat font size set to ${value}`);
        } else {
          client.say(target, 'Invalid font size. Use small, medium, or large');
        }
        break;
        
      case 'filtercommands':
        if (value === 'on' || value === 'true') {
          this.config.filterCommands = true;
          this.saveConfig();
          client.say(target, 'Command filtering enabled');
        } else if (value === 'off' || value === 'false') {
          this.config.filterCommands = false;
          this.saveConfig();
          client.say(target, 'Command filtering disabled');
        }
        break;
        
      default:
        client.say(target, `Unknown setting: ${setting}. Available settings: timestamps, badges, fontsize, filtercommands`);
    }
  }
  
  getStatus() {
    return {
      enabled: this.enabled,
      config: {
        maxMessages: this.config.maxMessages,
        showTimestamps: this.config.showTimestamps,
        showBadges: this.config.showBadges,
        highlightMentions: this.config.highlightMentions,
        fontSizeChat: this.config.fontSizeChat,
        filterCommands: this.config.filterCommands,
        showNotifications: this.config.showNotifications
      }
    };
  }
}

module.exports = ChatPlugin; 