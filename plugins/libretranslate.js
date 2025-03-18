class LibreTranslatePlugin {
  constructor() {
    this.name = 'libretranslate';
    this.description = 'Provides translation functionality using LibreTranslate';
    this.enabled = true;
    this.client = null;
    this.pluginManager = null;
    this.bot = null;
    this.logger = null;
    this.configManager = null;
    this.config = null;
    this.commands = [];
  }

  init(bot) {
    this.client = bot.client;
    this.pluginManager = bot.pluginManager;
    this.bot = bot;
    this.logger = bot.logger;
    this.configManager = bot.pluginManager.configManager;
    
    // Load configuration
    this.loadConfig();
    
    // Register commands
    this.registerCommands();
    
    this.logger.info('[LibreTranslate] Plugin initialized successfully');
    return true;
  }
  
  loadConfig() {
    this.config = this.configManager.loadPluginConfigWithoutSaving(this.name, {
      apiUrl: 'https://libretranslate.com/translate',
      apiKey: '',
      defaultSourceLang: 'auto',
      defaultTargetLang: 'en',
      enabled: true
    });
    
    this.logger.info(`[LibreTranslate] Configuration loaded: ${JSON.stringify(this.config)}`);
  }
  
  registerCommands() {
    this.commands = [
      {
        name: 'translate',
        config: {
          description: 'Translate text to another language',
          usage: '!translate <target_lang> <text>',
          aliases: ['tr'],
          cooldown: 5,
          modOnly: false,
          enabled: true
        },
        execute: this.translateCommand.bind(this)
      },
      {
        name: 'langs',
        config: {
          description: 'List available languages',
          usage: '!langs',
          aliases: ['languages'],
          cooldown: 5,
          modOnly: false,
          enabled: true
        },
        execute: this.languagesCommand.bind(this)
      }
    ];
  }
  
  async translateCommand(client, channel, context, commandText) {
    // Parse parameters from command text
    const params = commandText.trim().split(' ').slice(1);
    
    if (!params || params.length < 2) {
      client.say(channel, `@${context.username}, please specify a target language and the text to translate. Example: !translate fr Hello, how are you?`);
      return false;
    }
    
    const targetLang = params[0].toLowerCase();
    const text = params.slice(1).join(' ');
    
    try {
      const translation = await this.translate(text, this.config.defaultSourceLang, targetLang);
      client.say(channel, `@${context.username}, translation (${targetLang}): ${translation}`);
      return true;
    } catch (error) {
      this.logger.error(`[LibreTranslate] Error translating text: ${error.message}`);
      client.say(channel, `@${context.username}, failed to translate text: ${error.message}`);
      return false;
    }
  }
  
  async languagesCommand(client, channel, context, commandText) {
    try {
      client.say(channel, `@${context.username}, available languages: ar (Arabic), de (German), en (English), es (Spanish), fr (French), it (Italian), ja (Japanese), ko (Korean), pt (Portuguese), ru (Russian), zh (Chinese)`);
      return true;
    } catch (error) {
      this.logger.error(`[LibreTranslate] Error listing languages: ${error.message}`);
      client.say(channel, `@${context.username}, failed to list languages.`);
      return false;
    }
  }
  
  async translate(text, sourceLang, targetLang) {
    try {
      // This is a placeholder. In a real implementation, you would:
      // 1. Make an HTTP request to this.config.apiUrl
      // 2. Pass the apiKey, q (text), source, and target parameters
      // 3. Get the translation from the response
      
      // Mock implementation for demo purposes
      return `[Translated: ${text}]`;
    } catch (error) {
      this.logger.error(`[LibreTranslate] Error in translate: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new LibreTranslatePlugin(); 