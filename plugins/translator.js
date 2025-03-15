/**
 * MaxBot Translator Plugin
 * 
 * This plugin provides real-time translation capabilities for chat messages.
 * It can translate incoming messages to a target language and outgoing messages
 * from the bot to multiple languages.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class TranslatorPlugin {
  constructor() {
    this.name = 'translator';
    this.description = 'Real-time chat message translator';
    this.version = '1.0.0';
    this.enabled = false;
    
    // Define the config path
    this.configDir = path.join(__dirname, '..', 'config');
    this.configPath = path.join(this.configDir, 'translator.json');
    
    // Default configuration
    this.config = {
      apiKey: process.env.TRANSLATOR_API_KEY || '',
      defaultTargetLanguage: 'en', // Default target language
      translateIncoming: false,    // Translate incoming messages
      translateOutgoing: false,    // Translate outgoing messages
      supportedLanguages: {
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'ja': 'Japanese',
        'ko': 'Korean',
        'zh': 'Chinese'
      },
      // Languages to translate outgoing messages to
      outgoingLanguages: ['es', 'fr']
    };
    
    // Cache to avoid translating the same message multiple times
    this.translationCache = new Map();
    
    // Load config from file if exists
    this.loadConfig();
    
    // Bind methods
    this.translateMessage = this.translateMessage.bind(this);
    this.processIncomingMessage = this.processIncomingMessage.bind(this);
    this.processOutgoingMessage = this.processOutgoingMessage.bind(this);
  }
  
  /**
   * Initialize the plugin
   * @param {Object} bot - The bot instance
   * @param {Object} logger - The logger instance
   */
  init(bot, logger) {
    this.bot = bot;
    this.logger = logger;
    
    this.logger.info(`[Translator] Plugin initialized (v${this.version})`);
    
    // Check if API key is set
    if (!this.config.apiKey) {
      this.logger.warn('[Translator] No API key set. Translation functionality will be limited.');
    }
    
    return true;
  }
  
  /**
   * Enable the plugin
   */
  enable() {
    this.enabled = true;
    this.logger.info('[Translator] Plugin enabled');
    return true;
  }
  
  /**
   * Disable the plugin
   */
  disable() {
    this.enabled = false;
    this.logger.info('[Translator] Plugin disabled');
    return true;
  }
  
  /**
   * Load configuration from file
   */
  loadConfig() {
    try {
      // Ensure config directory exists
      this.ensureConfigDir();
      
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const savedConfig = JSON.parse(configData);
        this.config = { ...this.config, ...savedConfig };
        
        if (this.logger) {
          this.logger.info(`[Translator] Configuration loaded from ${this.configPath}`);
        }
      } else {
        // If the config file doesn't exist, create it with default values
        this.saveConfig();
        if (this.logger) {
          this.logger.info(`[Translator] Created default configuration at ${this.configPath}`);
        }
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error(`[Translator] Error loading configuration: ${error.message}`);
      } else {
        console.error(`[Translator] Error loading configuration: ${error.message}`);
      }
    }
  }
  
  /**
   * Ensure the config directory exists
   * @private
   */
  ensureConfigDir() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        if (this.logger) {
          this.logger.info(`[Translator] Created configuration directory at ${this.configDir}`);
        }
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error(`[Translator] Error creating config directory: ${error.message}`);
      } else {
        console.error(`[Translator] Error creating config directory: ${error.message}`);
      }
    }
  }
  
  /**
   * Save configuration to file
   */
  saveConfig() {
    try {
      // Ensure config directory exists
      this.ensureConfigDir();
      
      // Create a copy of the config without the supportedLanguages property
      // to keep the file smaller (since supportedLanguages is static)
      const configToSave = { ...this.config };
      
      fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2), 'utf8');
      
      if (this.logger) {
        this.logger.info(`[Translator] Configuration saved to ${this.configPath}`);
      }
      
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error(`[Translator] Error saving configuration: ${error.message}`);
      } else {
        console.error(`[Translator] Error saving configuration: ${error.message}`);
      }
      
      return false;
    }
  }
  
  /**
   * Update plugin configuration
   * @param {Object} newConfig - New configuration options
   * @returns {boolean} - Whether the update was successful
   */
  updateConfig(newConfig) {
    try {
      // Create a deep copy of the new config to avoid reference issues
      const configCopy = JSON.parse(JSON.stringify(newConfig));
      
      // Preserve the supportedLanguages property since it's not typically included in updates
      if (!configCopy.supportedLanguages && this.config.supportedLanguages) {
        configCopy.supportedLanguages = this.config.supportedLanguages;
      }
      
      // Merge the new config with the existing config
      this.config = { ...this.config, ...configCopy };
      
      // Save to file
      const saveResult = this.saveConfig();
      
      if (this.logger) {
        if (saveResult) {
          this.logger.info('[Translator] Configuration updated successfully');
        } else {
          this.logger.warn('[Translator] Configuration updated in memory but failed to save to file');
        }
      }
      
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error(`[Translator] Error updating configuration: ${error.message}`);
      } else {
        console.error(`[Translator] Error updating configuration: ${error.message}`);
      }
      
      return false;
    }
  }
  
  /**
   * Translate a message using the translation API
   * @param {string} text - Text to translate
   * @param {string} targetLang - Target language code
   * @returns {Promise<string>} - Translated text
   */
  async translateMessage(text, targetLang) {
    // Skip translation if the plugin is disabled
    if (!this.enabled) {
      return text;
    }
    
    // Skip empty messages
    if (!text || text.trim() === '') {
      return text;
    }
    
    // Create a cache key from the text and target language
    const cacheKey = `${text}|${targetLang}`;
    
    // Check if we have this translation cached
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }
    
    // If no API key is set, return the original text
    if (!this.config.apiKey) {
      if (this.logger) {
        this.logger.warn('[Translator] No API key set, skipping translation');
      }
      return text;
    }
    
    try {
      // For this example, we'll use a mock translation
      // In a real implementation, you would call an actual translation API
      // like Google Translate, DeepL, or Microsoft Translator
      
      // Mock translation for demonstration purposes
      const translatedText = await this.mockTranslate(text, targetLang);
      
      // Cache the result
      this.translationCache.set(cacheKey, translatedText);
      
      // Limit cache size to prevent memory issues
      if (this.translationCache.size > 1000) {
        // Remove the oldest entry
        const firstKey = this.translationCache.keys().next().value;
        this.translationCache.delete(firstKey);
      }
      
      return translatedText;
    } catch (error) {
      if (this.logger) {
        this.logger.error(`[Translator] Translation error: ${error.message}`);
      }
      return text; // Return original text on error
    }
  }
  
  /**
   * Mock translation function (for demonstration)
   * In a real implementation, this would call an actual translation API
   * @param {string} text - Text to translate
   * @param {string} targetLang - Target language code
   * @returns {Promise<string>} - Translated text
   */
  async mockTranslate(text, targetLang) {
    // This is just a mock function for demonstration
    // In a real implementation, you would call an actual translation API
    
    // Simple prefixes to simulate translation
    const langPrefixes = {
      'es': '[ES] ',
      'fr': '[FR] ',
      'de': '[DE] ',
      'it': '[IT] ',
      'pt': '[PT] ',
      'ru': '[RU] ',
      'ja': '[JA] ',
      'ko': '[KO] ',
      'zh': '[ZH] ',
      'en': '[EN] '
    };
    
    // Add a delay to simulate API call
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return "translated" text with language prefix
    return `${langPrefixes[targetLang] || ''}${text}`;
  }
  
  /**
   * Process an incoming chat message
   * @param {Object} message - The chat message object
   * @returns {Promise<Object>} - The processed message
   */
  async processIncomingMessage(message) {
    // Skip processing if the plugin is disabled or incoming translation is disabled
    if (!this.enabled || !this.config.translateIncoming) {
      return message;
    }
    
    try {
      // Translate the message text
      const translatedText = await this.translateMessage(
        message.message,
        this.config.defaultTargetLanguage
      );
      
      // Create a new message object with the translated text
      return {
        ...message,
        originalMessage: message.message, // Store the original message
        message: translatedText,          // Replace with translated message
        translated: true                  // Mark as translated
      };
    } catch (error) {
      if (this.logger) {
        this.logger.error(`[Translator] Error processing incoming message: ${error.message}`);
      }
      return message; // Return original message on error
    }
  }
  
  /**
   * Process an outgoing chat message
   * @param {Object} message - The chat message object
   * @returns {Promise<Array<Object>>} - Array of processed messages (original + translations)
   */
  async processOutgoingMessage(message) {
    // Skip processing if the plugin is disabled or outgoing translation is disabled
    if (!this.enabled || !this.config.translateOutgoing) {
      return [message]; // Return original message only
    }
    
    try {
      // Start with the original message
      const messages = [message];
      
      // Translate the message to each target language
      for (const lang of this.config.outgoingLanguages) {
        const translatedText = await this.translateMessage(message.message, lang);
        
        // Only add if translation is different from original
        if (translatedText !== message.message) {
          messages.push({
            ...message,
            message: translatedText,
            translated: true,
            language: lang
          });
        }
      }
      
      return messages;
    } catch (error) {
      if (this.logger) {
        this.logger.error(`[Translator] Error processing outgoing message: ${error.message}`);
      }
      return [message]; // Return original message only on error
    }
  }
  
  /**
   * Get the plugin's command handlers
   * @returns {Object} - Command handlers
   */
  getCommands() {
    return {
      '!translate': {
        handler: this.handleTranslateCommand.bind(this),
        help: 'Translate a message to a specific language. Usage: !translate <lang> <message>',
        modOnly: false
      },
      '!translator': {
        handler: this.handleTranslatorCommand.bind(this),
        help: 'Control the translator plugin. Usage: !translator <on|off|status|config>',
        modOnly: true
      }
    };
  }
  
  /**
   * Handle the !translate command
   * @param {Object} client - The Twitch client
   * @param {string} target - The target channel
   * @param {Object} context - The command context
   * @param {string} args - Command arguments
   */
  async handleTranslateCommand(client, target, context, args) {
    if (!this.enabled) {
      await client.say(target, `@${context.username} The translator plugin is currently disabled.`);
      return;
    }
    
    const parts = args.split(' ');
    
    if (parts.length < 2) {
      await client.say(target, `@${context.username} Usage: !translate <lang> <message>`);
      return;
    }
    
    const lang = parts[0].toLowerCase();
    const message = parts.slice(1).join(' ');
    
    // Check if the language is supported
    if (!this.config.supportedLanguages[lang]) {
      const supportedLangs = Object.keys(this.config.supportedLanguages).join(', ');
      await client.say(target, `@${context.username} Unsupported language. Supported languages: ${supportedLangs}`);
      return;
    }
    
    try {
      const translatedText = await this.translateMessage(message, lang);
      await client.say(target, `@${context.username} [${this.config.supportedLanguages[lang]}] ${translatedText}`);
    } catch (error) {
      if (this.logger) {
        this.logger.error(`[Translator] Translation command error: ${error.message}`);
      }
      await client.say(target, `@${context.username} Error translating message: ${error.message}`);
    }
  }
  
  /**
   * Handle the !translator command
   * @param {Object} client - The Twitch client
   * @param {string} target - The target channel
   * @param {Object} context - The command context
   * @param {string} args - Command arguments
   */
  async handleTranslatorCommand(client, target, context, args) {
    const parts = args.split(' ');
    const subCommand = parts[0]?.toLowerCase();
    
    switch (subCommand) {
      case 'on':
        this.enable();
        await client.say(target, `@${context.username} Translator plugin enabled.`);
        break;
        
      case 'off':
        this.disable();
        await client.say(target, `@${context.username} Translator plugin disabled.`);
        break;
        
      case 'status':
        const status = this.enabled ? 'enabled' : 'disabled';
        const incomingStatus = this.config.translateIncoming ? 'enabled' : 'disabled';
        const outgoingStatus = this.config.translateOutgoing ? 'enabled' : 'disabled';
        
        await client.say(target, 
          `@${context.username} Translator plugin is ${status}. ` +
          `Incoming translation: ${incomingStatus}. ` +
          `Outgoing translation: ${outgoingStatus}. ` +
          `Default language: ${this.config.supportedLanguages[this.config.defaultTargetLanguage]}.`
        );
        break;
        
      case 'incoming':
        if (parts[1] === 'on') {
          this.updateConfig({ translateIncoming: true });
          await client.say(target, `@${context.username} Incoming message translation enabled.`);
        } else if (parts[1] === 'off') {
          this.updateConfig({ translateIncoming: false });
          await client.say(target, `@${context.username} Incoming message translation disabled.`);
        } else {
          await client.say(target, `@${context.username} Usage: !translator incoming <on|off>`);
        }
        break;
        
      case 'outgoing':
        if (parts[1] === 'on') {
          this.updateConfig({ translateOutgoing: true });
          await client.say(target, `@${context.username} Outgoing message translation enabled.`);
        } else if (parts[1] === 'off') {
          this.updateConfig({ translateOutgoing: false });
          await client.say(target, `@${context.username} Outgoing message translation disabled.`);
        } else {
          await client.say(target, `@${context.username} Usage: !translator outgoing <on|off>`);
        }
        break;
        
      case 'language':
        if (parts[1] && this.config.supportedLanguages[parts[1]]) {
          this.updateConfig({ defaultTargetLanguage: parts[1] });
          await client.say(target, 
            `@${context.username} Default language set to ${this.config.supportedLanguages[parts[1]]}.`
          );
        } else {
          const supportedLangs = Object.entries(this.config.supportedLanguages)
            .map(([code, name]) => `${code} (${name})`)
            .join(', ');
            
          await client.say(target, 
            `@${context.username} Usage: !translator language <lang>. ` +
            `Supported languages: ${supportedLangs}`
          );
        }
        break;
        
      case 'help':
      default:
        await client.say(target, 
          `@${context.username} Translator commands: ` +
          `!translator <on|off|status|incoming|outgoing|language|help>`
        );
        break;
    }
  }
  
  /**
   * Get plugin status for the API
   * @returns {Object} - Plugin status
   */
  getStatus() {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      enabled: this.enabled,
      config: {
        defaultTargetLanguage: this.config.defaultTargetLanguage,
        translateIncoming: this.config.translateIncoming,
        translateOutgoing: this.config.translateOutgoing,
        supportedLanguages: this.config.supportedLanguages,
        outgoingLanguages: this.config.outgoingLanguages
      }
    };
  }
}

module.exports = new TranslatorPlugin(); 