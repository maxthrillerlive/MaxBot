const axios = require('axios');

// Global flag to track language loading across reloads
// Use a module-level variable that's only initialized once
if (typeof global.LIBRETRANSLATE_LANGUAGES_LOADED === 'undefined') {
    global.LIBRETRANSLATE_LANGUAGES_LOADED = false;
    global.LIBRETRANSLATE_LOADING_IN_PROGRESS = false;
}

class LibreTranslatePlugin {
    constructor() {
        this.name = 'libretranslate';
        this.version = '1.0.0';
        this.description = 'Real-time chat translation using LibreTranslate';
        this.author = 'MaxBot';
        
        this.client = null;
        this.logger = null;
        this.bot = null;
        this.configManager = null;
        this.config = null;
        
        // Initialize commands as an array
        this.commands = [];
        
        // Available languages cache
        this.availableLanguages = [];
        this.languagesByCode = {};
        this.languagesByName = {};
        this.translationCache = new Map();
        
        // Store bound functions
        this._boundMessageHandler = null;
        
        // Initialize message tracking
        this._processedMessages = new Set();
    }
    
    init(bot) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = bot.logger;
        this.configManager = bot.configManager;
        
        this.logger.info(`[${this.name}] Plugin initializing...`);
        
        // Load configuration
        this.reloadConfig();
        
        // Register commands - must be done before returning from init
        this.registerCommands();
        
        // Debug the commands after registration
        this.logger.info(`[${this.name}] DEBUG: Registered ${this.commands.length} commands total:`);
        this.commands.forEach((cmd, index) => {
            this.logger.info(`[${this.name}] DEBUG: Command ${index + 1}: name=${cmd.name}, type=${typeof cmd.execute}`);
        });
        
        // Load available languages only if not already loaded globally
        if (!global.LIBRETRANSLATE_LANGUAGES_LOADED && !global.LIBRETRANSLATE_LOADING_IN_PROGRESS) {
            this.updateAvailableLanguages(true); // Force update
        } else {
            this.logger.debug(`[${this.name}] Skipping language loading - already loaded or in progress globally`);
        }
        
        // Remove any existing event listeners to prevent duplicates
        this.removeEventListeners();
        
        // Setup event listeners
        this.setupEventListeners();
        
        this.logger.info(`[${this.name}] Plugin initialized successfully with ${this.commands.length} commands`);
        
        // Return true to indicate successful initialization
        return true;
    }
    
    removeEventListeners() {
        // Find and remove all listeners for this plugin's methods
        if (this.bot && this.bot.events) {
            // Get all listeners for each event type
            const listenerCount = this.bot.events.listenerCount('twitch:message');
            if (listenerCount > 0) {
                this.logger.debug(`[${this.name}] Found ${listenerCount} existing 'twitch:message' listeners`);
                
                // Get the raw listeners array
                const listeners = this.bot.events.rawListeners('twitch:message');
                
                // Look for listeners that might be from this plugin
                listeners.forEach(listener => {
                    if (listener.name.includes('bound onTwitchMessage')) {
                        this.logger.debug(`[${this.name}] Removing existing message listener`);
                        this.bot.events.removeListener('twitch:message', listener);
                    }
                });
            }
        }
    }
    
    reloadConfig() {
        // Default configuration
        const defaultConfig = {
            enabled: true,
            server: "localhost",
            port: 5000,
            useHttps: false,
            apiPath: "/translate",
            apiUrl: "http://localhost:5000/translate",
            apiKey: '',
            defaultSourceLang: 'auto',
            defaultTargetLang: 'en',
            translateAll: false, // Set to false by default to avoid unexpected behavior
            commands: {
                translate: {
                    trigger: 'libretranslate',
                    aliases: ['lt', 'tr'],
                    description: 'Translate text to another language or list available languages',
                    usage: '!libretranslate <target_lang> <text> OR !libretranslate languages OR !libretranslate config translateall true/false',
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                }
            }
        };
        
        // Load config or create default if it doesn't exist
        this.config = this.configManager.loadPluginConfig(this.name, defaultConfig);
        
        // Construct apiUrl from server, port, useHttps, and apiPath if they're present
        if (this.config.server && this.config.apiPath) {
            const protocol = this.config.useHttps ? 'https' : 'http';
            const port = this.config.port ? (
                // Only include port in URL if it's non-standard
                (protocol === 'https' && this.config.port !== 443) ||
                (protocol === 'http' && this.config.port !== 80)
                    ? `:${this.config.port}`
                    : ''
            ) : '';
            
            this.config.apiUrl = `${protocol}://${this.config.server}${port}${this.config.apiPath}`;
            this.logger.info(`[${this.name}] Constructed API URL: ${this.config.apiUrl}`);
            
            // Check if using default server
            if (this.config.server === "localhost") {
                this.logger.warn(`[${this.name}] Using default server (localhost). Plugin will only work if you have LibreTranslate running locally.`);
            }
        }
        
        this.logger.info(`[${this.name}] Configuration loaded`);
        return this.config;
    }
    
    registerCommands() {
        try {
            const cmdConfig = this.config.commands.translate;
            
            // Clear existing commands
            this.commands = [];
            
            // Create an execute function once that we'll use for all commands
            const executeFunction = async (client, channel, userstate, args) => {
                try {
                    // Log the raw args for debugging
                    this.logger.debug(`[${this.name}] Raw command args: "${args}"`);
                    
                    // Handle the case where args might start with the command name
                    let cleanedArgs = args;
                    const commandTriggers = [cmdConfig.trigger, ...cmdConfig.aliases].map(t => `!${t}`);
                    
                    // Remove the command trigger if it's included in the args
                    for (const trigger of commandTriggers) {
                        if (args.startsWith(trigger)) {
                            cleanedArgs = args.substring(trigger.length).trim();
                            this.logger.debug(`[${this.name}] Removed command prefix "${trigger}", cleaned args: "${cleanedArgs}"`);
                            break;
                        }
                    }
                    
                    const argArray = cleanedArgs.split(' ');
                    const firstArg = argArray[0] ? argArray[0].toLowerCase() : '';
                    
                    this.logger.debug(`[${this.name}] Processing command with first arg: "${firstArg}"`);
                    
                    if (firstArg === 'languages' || firstArg === 'langs') {
                        await this.handleLanguagesCommand(client, channel, userstate);
                    } else {
                        await this.handleTranslateCommand(client, channel, userstate, cleanedArgs);
                    }
                    return true;
                } catch (error) {
                    this.logger.error(`[${this.name}] Command execution error: ${error.message}`);
                    return false;
                }
            };
            
            // Create the main command object based on plugin system expectations
            const mainCommand = {
                name: cmdConfig.trigger,
                description: cmdConfig.description,
                usage: cmdConfig.usage,
                aliases: cmdConfig.aliases || [],
                cooldown: cmdConfig.cooldown || 5,
                modOnly: cmdConfig.modOnly || false,
                enabled: cmdConfig.enabled !== false,
                execute: executeFunction
            };
            
            // Add the main command to the commands array
            this.commands.push(mainCommand);
            
            // Also register each alias as a separate command for the plugin manager
            if (cmdConfig.aliases && Array.isArray(cmdConfig.aliases)) {
                for (const alias of cmdConfig.aliases) {
                    const aliasCommand = {
                        name: alias,
                        description: `Alias for !${cmdConfig.trigger}`,
                        usage: cmdConfig.usage.replace(`!${cmdConfig.trigger}`, `!${alias}`),
                        aliases: [],  // Empty aliases array since this is already an alias
                        cooldown: cmdConfig.cooldown || 5,
                        modOnly: cmdConfig.modOnly || false,
                        enabled: cmdConfig.enabled !== false,
                        execute: executeFunction  // Use the same execute function
                    };
                    this.commands.push(aliasCommand);
                }
            }
            
            this.logger.info(`[${this.name}] Registered ${this.commands.length} commands: main=${mainCommand.name}, aliases=${cmdConfig.aliases.join(', ')}`);
        } catch (error) {
            this.logger.error(`[${this.name}] Error registering commands: ${error.message}`);
        }
    }
    
    setupEventListeners() {
        this.logger.info(`[${this.name}] Setting up event listeners`);
        
        // Create a permanent bound handler we can reference later
        this._boundMessageHandler = this.onTwitchMessage.bind(this);
        
        // Listen for chat messages for auto-translation
        this.bot.events.on('twitch:message', this._boundMessageHandler);
        
        // Listen for plugin lifecycle events
        this.bot.events.on('plugin:enabled', this.onPluginEnabled.bind(this));
        this.bot.events.on('plugin:disabled', this.onPluginDisabled.bind(this));
        this.bot.events.on('plugin:reloaded', this.onPluginReloaded.bind(this));
        
        this.logger.info(`[${this.name}] Event listeners set up successfully`);
    }
    
    onPluginEnabled(data) {
        if (data.plugin === this.name) {
            this.logger.info(`[${this.name}] Plugin enabled`);
        }
    }
    
    onPluginDisabled(data) {
        if (data.plugin === this.name) {
            this.logger.info(`[${this.name}] Plugin disabled`);
        }
    }
    
    onPluginReloaded(data) {
        if (data.plugin === this.name) {
            this.logger.info(`[${this.name}] Plugin reloaded, updating configuration`);
            this.reloadConfig();
            
            // Do not reload languages on plugin reload to avoid duplicate loading
            this.logger.debug(`[${this.name}] Skipping language update on plugin reload`);
        }
    }
    
    async onTwitchMessage(messageData) {
        // Safety check - make sure we have required properties
        if (!this.bot || !this.config) {
            this.logger.error(`[${this.name}] Cannot process message: Bot or config is not initialized`);
            return;
        }
        
        // Skip if plugin or auto-translation is disabled
        if (!this.config.enabled || !this.config.translateAll) {
            return;
        }
        
        try {
            // Skip if message is empty
            if (!messageData.message || messageData.message.trim() === '') {
                return;
            }
            
            // Skip if message is a command
            if (messageData.message.startsWith('!') || messageData.message.startsWith('?')) {
                this.logger.debug(`[${this.name}] Skipping command message: ${messageData.message.substring(0, 20)}...`);
                return;
            }
            
            // Skip bot's own messages - check both username and self flag
            if (messageData.self === true || 
                (messageData.tags && messageData.tags.username && 
                 this.bot.config && this.bot.config.bot && 
                 messageData.tags.username.toLowerCase() === this.bot.config.bot.username.toLowerCase())) {
                this.logger.debug(`[${this.name}] Skipping bot's own message: ${messageData.message.substring(0, 20)}...`);
                return;
            }
            
            // Create a unique ID for the message that includes timestamp to ensure uniqueness
            const messageId = `${messageData.channel}:${messageData.tags?.username || 'unknown'}:${messageData.message}:${Date.now()}`;
            
            // Check if we've already processed this message in the last second
            if (this._processedMessages.has(messageId)) {
                this.logger.debug(`[${this.name}] Skipping already processed message: ${messageData.message.substring(0, 20)}...`);
                return;
            }
            
            // Add to processed messages and clean up old entries (limit to 100 messages)
            this._processedMessages.add(messageId);
            if (this._processedMessages.size > 100) {
                // Convert to array, remove oldest entries, convert back to set
                const messageArray = Array.from(this._processedMessages);
                this._processedMessages = new Set(messageArray.slice(-50)); // Keep only the 50 most recent
            }
            
            // Add debug logging
            this.logger.debug(`[${this.name}] Processing message for translation: ${messageData.message.substring(0, 20)}... from ${messageData.tags?.username || 'unknown'}`);
            
            // Safely emit pre-translate event
            if (this.bot && this.bot.events) {
                this.bot.events.emit('libretranslate:pre-translate', {
                    plugin: this.name,
                    message: messageData.message,
                    tags: messageData.tags
                });
            }
            
            const sourceLang = await this.detectLanguage(messageData.message);
            
            // Skip if source language is the same as target language
            if (sourceLang === this.config.defaultTargetLang) {
                this.logger.debug(`[${this.name}] Skipping translation - source language (${sourceLang}) matches target language (${this.config.defaultTargetLang})`);
                return;
            }
            
            // Skip if source language couldn't be detected
            if (!sourceLang) {
                this.logger.debug(`[${this.name}] Skipping translation - could not detect source language`);
                return;
            }
            
            const translation = await this.translate(
                messageData.message, 
                sourceLang || 'auto', 
                this.config.defaultTargetLang
            );
            
            if (translation && translation !== messageData.message) {
                // Get language display information for source language
                const sourceLanguageInfo = this.getLanguageInfo(sourceLang || 'auto');
                const sourceLanguageName = sourceLanguageInfo ? sourceLanguageInfo.name : 'Unknown';
                const sourceLanguageFlag = this.getLanguageFlag(sourceLang || 'auto');
                
                // Safely emit translation event
                if (this.bot && this.bot.events) {
                    this.bot.events.emit('libretranslate:translation', {
                        plugin: this.name,
                        originalMessage: messageData.message,
                        translation: translation,
                        sourceLang: sourceLang || 'auto',
                        targetLang: this.config.defaultTargetLang,
                        tags: messageData.tags
                    });
                }
                
                // Send translation to chat with the correct format
                if (this.client && messageData.tags && messageData.tags['display-name']) {
                    const displayName = messageData.tags['display-name'];
                    const response = `${displayName} ${sourceLanguageFlag} said, "${translation}"`;
                    
                    // Add to processed messages before sending to avoid handling our own message again
                    const ourMessageId = `${messageData.channel}:${this.bot?.config?.bot?.username || 'bot'}:${response}:${Date.now()}`;
                    this._processedMessages.add(ourMessageId);
                    
                    this.client.say(messageData.channel, response);
                    this.logger.debug(`[${this.name}] Sent translation to chat: ${response}`);
                } else if (this.client) {
                    const response = `${sourceLanguageFlag} ${translation}`;
                    
                    // Add to processed messages before sending to avoid handling our own message again
                    const ourMessageId = `${messageData.channel}:${this.bot?.config?.bot?.username || 'bot'}:${response}:${Date.now()}`;
                    this._processedMessages.add(ourMessageId);
                    
                    this.client.say(messageData.channel, response);
                    this.logger.debug(`[${this.name}] Sent translation to chat without display name: ${response}`);
                }
            }
        } catch (error) {
            this.logger.error(`[${this.name}] Error processing message: ${error.message}`);
            
            // Safely emit error event
            if (this.bot && this.bot.events) {
                this.bot.events.emit('libretranslate:error', {
                    plugin: this.name,
                    error: error.message,
                    context: 'auto-translation'
                });
            }
        }
    }
    
    // Add helper function to get language flag
    getLanguageFlag(langCode) {
        // Convert language code to flag emoji
        const languageFlags = {
            'auto': '🌐',
            'en': '🇬🇧',
            'ar': '🇸🇦',
            'az': '🇦🇿',
            'cs': '🇨🇿',
            'da': '🇩🇰',
            'de': '🇩🇪',
            'el': '🇬🇷',
            'es': '🇪🇸',
            'fa': '🇮🇷',
            'fi': '🇫🇮',
            'fr': '🇫🇷',
            'ga': '🇮🇪',
            'he': '🇮🇱',
            'hi': '🇮🇳',
            'hu': '🇭🇺',
            'id': '🇮🇩',
            'it': '🇮🇹',
            'ja': '🇯🇵',
            'ko': '🇰🇷',
            'nl': '🇳🇱',
            'no': '🇳🇴',
            'pl': '🇵🇱',
            'pt': '🇵🇹',
            'ro': '🇷🇴',
            'ru': '🇷🇺',
            'sk': '🇸🇰',
            'sv': '🇸🇪',
            'th': '🇹🇭',
            'tr': '🇹🇷',
            'uk': '🇺🇦',
            'vi': '🇻🇳',
            'zh': '🇨🇳'
        };
        
        return languageFlags[langCode] || '🌐';
    }
    
    // Helper method to get language info by code
    getLanguageInfo(langCode) {
        // Check if we need to load languages
        if (this.availableLanguages.length === 0) {
            return null;
        }
        
        // Find language by code (case-insensitive)
        return this.availableLanguages.find(lang => lang.code.toLowerCase() === langCode.toLowerCase());
    }
    
    async updateAvailableLanguages(forceUpdate = false) {
        try {
            // Use global flags to prevent multiple loading
            if (global.LIBRETRANSLATE_LANGUAGES_LOADED && !forceUpdate) {
                this.logger.debug(`[${this.name}] Languages already loaded globally, skipping load`);
                return this.availableLanguages;
            }
            
            if (global.LIBRETRANSLATE_LOADING_IN_PROGRESS) {
                this.logger.debug(`[${this.name}] Languages already being loaded globally, skipping duplicate request`);
                return this.availableLanguages;
            }
            
            global.LIBRETRANSLATE_LOADING_IN_PROGRESS = true;
            
            const baseUrl = this.config.apiUrl.replace(/\/translate$/, '');
            this.logger.info(`[${this.name}] Requesting languages from: ${baseUrl}/languages`);
            
            // Set a timeout for the request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            let response;
            try {
                response = await axios.get(`${baseUrl}/languages`, {
                    signal: controller.signal,
                    validateStatus: status => status < 500 // Accept any status code less than 500
                });
                clearTimeout(timeoutId);
            } catch (apiError) {
                this.logger.warn(`[${this.name}] First attempt to load languages failed: ${apiError.message}`);
                clearTimeout(timeoutId);
                
                // Try fallback - server might require API key in languages request
                if (this.config.apiKey) {
                    try {
                        this.logger.info(`[${this.name}] Trying fallback with API key for languages request`);
                        response = await axios.get(`${baseUrl}/languages?api_key=${this.config.apiKey}`, {
                            validateStatus: status => status < 500
                        });
                    } catch (fallbackError) {
                        this.logger.error(`[${this.name}] Fallback languages request also failed: ${fallbackError.message}`);
                        throw fallbackError;
                    }
                } else {
                    throw apiError;
                }
            }
            
            if (response && response.data && Array.isArray(response.data)) {
                this.availableLanguages = response.data;
                this.logger.info(`[${this.name}] Loaded ${this.availableLanguages.length} languages`);
                
                // Log all language codes for debugging
                const allCodes = this.availableLanguages.map(l => l.code).join(', ');
                this.logger.debug(`[${this.name}] Available language codes: ${allCodes}`);
                
                // Build lookup tables for faster access
                this.languagesByCode = {};
                this.availableLanguages.forEach(lang => {
                    this.languagesByCode[lang.code.toLowerCase()] = lang;
                });
                
                // Mark languages as loaded globally
                global.LIBRETRANSLATE_LANGUAGES_LOADED = true;
                
                // Emit languages updated event
                if (this.bot && this.bot.events) {
                    this.bot.events.emit('libretranslate:languages-updated', {
                        plugin: this.name,
                        languages: this.availableLanguages
                    });
                }
                
                global.LIBRETRANSLATE_LOADING_IN_PROGRESS = false;
                return this.availableLanguages;
            } else {
                throw new Error('Invalid response format from language API');
            }
        } catch (error) {
            this.logger.error(`[${this.name}] Error loading languages: ${error.message}`);
            
            // Set up fallback languages
            this.availableLanguages = [
                { code: 'en', name: 'English' },
                { code: 'ar', name: 'Arabic' },
                { code: 'zh', name: 'Chinese' },
                { code: 'fr', name: 'French' },
                { code: 'de', name: 'German' },
                { code: 'hi', name: 'Hindi' },
                { code: 'it', name: 'Italian' },
                { code: 'ja', name: 'Japanese' },
                { code: 'ko', name: 'Korean' },
                { code: 'pt', name: 'Portuguese' },
                { code: 'ru', name: 'Russian' },
                { code: 'es', name: 'Spanish' }
            ];
            
            this.logger.warn(`[${this.name}] Using fallback language list with ${this.availableLanguages.length} languages`);
            
            // Build lookup tables for faster access even with fallback data
            this.languagesByCode = {};
            this.availableLanguages.forEach(lang => {
                this.languagesByCode[lang.code.toLowerCase()] = lang;
            });
            
            global.LIBRETRANSLATE_LOADING_IN_PROGRESS = false;
            
            // Mark as loaded even with fallback data
            global.LIBRETRANSLATE_LANGUAGES_LOADED = true;
            
            return this.availableLanguages;
        }
    }
    
    async detectLanguage(text) {
        try {
            const baseUrl = this.config.apiUrl.replace(/\/translate$/, '');
            const payload = { q: text };
            
            if (this.config.apiKey) {
                payload.api_key = this.config.apiKey;
            }
            
            // Emit pre-detect event - safely check for bot and events
            if (this.bot && this.bot.events) {
                this.bot.events.emit('libretranslate:pre-detect', {
                    plugin: this.name,
                    text: text
                });
            }
            
            const response = await axios.post(`${baseUrl}/detect`, payload);
            
            if (response.data && response.data.length > 0) {
                const detected = response.data[0];
                
                // Emit language detected event - safely check for bot and events
                if (this.bot && this.bot.events) {
                    this.bot.events.emit('libretranslate:language-detected', {
                        plugin: this.name,
                        text: text,
                        language: detected.language,
                        confidence: detected.confidence
                    });
                }
                
                return detected.language;
            }
            return null;
        } catch (error) {
            this.logger.error(`[${this.name}] Error detecting language: ${error.message}`);
            return null;
        }
    }
    
    async translate(text, sourceLang = 'auto', targetLang) {
        if (!targetLang) {
            targetLang = this.config.defaultTargetLang;
        }
        
        try {
            const payload = {
                q: text,
                source: sourceLang,
                target: targetLang
            };
            
            if (this.config.apiKey) {
                payload.api_key = this.config.apiKey;
            }
            
            // Emit pre-translate event - safely check for bot and events
            if (this.bot && this.bot.events) {
                this.bot.events.emit('libretranslate:pre-translate-text', {
                    plugin: this.name,
                    text: text,
                    sourceLang: sourceLang,
                    targetLang: targetLang
                });
            }
            
            const response = await axios.post(this.config.apiUrl, payload);
            
            // Emit text translated event - safely check for bot and events
            if (this.bot && this.bot.events) {
                this.bot.events.emit('libretranslate:text-translated', {
                    plugin: this.name,
                    originalText: text,
                    translatedText: response.data.translatedText,
                    sourceLang: sourceLang,
                    targetLang: targetLang
                });
            }
            
            return response.data.translatedText;
        } catch (error) {
            this.logger.error(`[${this.name}] Error translating text: ${error.message}`);
            return null;
        }
    }
    
    async handleTranslateCommand(client, channel, userstate, args) {
        try {
            const argArray = args.split(' ');
            
            if (argArray.length < 1) {
                client.say(channel, `@${userstate.username} Usage: ${this.config.commands.translate.usage}`);
                return;
            }
            
            const firstArg = argArray[0].toLowerCase();
            
            // Add a config command to toggle translateAll
            if (firstArg === 'config' && (userstate.mod || userstate.badges?.broadcaster)) {
                if (argArray.length < 3) {
                    client.say(channel, `@${userstate.username} Usage: !libretranslate config [setting] [value]. Available settings: translateAll`);
                    return;
                }
                
                const setting = argArray[1].toLowerCase();
                const value = argArray[2].toLowerCase();
                
                if (setting === 'translateall') {
                    if (value !== 'true' && value !== 'false') {
                        client.say(channel, `@${userstate.username} Value must be 'true' or 'false'`);
                        return;
                    }
                    
                    this.config.translateAll = value === 'true';
                    this.configManager.savePluginConfig(this.name, this.config);
                    
                    client.say(channel, `@${userstate.username} Auto-translate all messages set to: ${this.config.translateAll}`);
                    this.logger.info(`[${this.name}] translateAll set to: ${this.config.translateAll} by ${userstate.username}`);
                    return;
                } else {
                    client.say(channel, `@${userstate.username} Unknown setting. Available settings: translateAll`);
                    return;
                }
            }
            
            // Handle the languages command
            if (firstArg === 'languages' || firstArg === 'langs') {
                await this.handleLanguagesCommand(client, channel, userstate);
                return;
            }
            
            // Handle regular translation
            if (argArray.length < 2) {
                client.say(channel, `@${userstate.username} Usage: ${this.config.commands.translate.usage}`);
                return;
            }
            
            const targetLang = firstArg;
            const text = argArray.slice(1).join(' ');
            
            // Make sure we have languages loaded - force update if not loaded yet
            if (this.availableLanguages.length === 0) {
                this.logger.info(`[${this.name}] No languages loaded for command, fetching now...`);
                await this.updateAvailableLanguages(true);
                
                // Double check if languages were loaded successfully
                if (this.availableLanguages.length === 0) {
                    this.logger.error(`[${this.name}] Failed to load languages for translation command`);
                    client.say(channel, `@${userstate.username} Unable to connect to LibreTranslate server. Please check your server configuration.`);
                    return;
                }
            }
            
            // Debug available languages
            this.logger.debug(`[${this.name}] Available languages count: ${this.availableLanguages.length}`);
            
            // Enhanced validation with better debugging
            let isValidLanguage = false;
            let matchedLanguage = null;
            
            for (const lang of this.availableLanguages) {
                if (lang.code.toLowerCase() === targetLang.toLowerCase()) {
                    isValidLanguage = true;
                    matchedLanguage = lang;
                    this.logger.debug(`[${this.name}] Found matching language: ${lang.code} (${lang.name})`);
                    break;
                }
            }
            
            if (!isValidLanguage) {
                const allCodes = this.availableLanguages.map(l => l.code).join(', ');
                this.logger.warn(`[${this.name}] Invalid language requested: '${targetLang}'. Available codes: ${allCodes}`);
                client.say(channel, `@${userstate.username} Invalid target language '${targetLang}'. Use !libretranslate languages to see available languages.`);
                return;
            }
            
            // Get language display information for a nicer response
            const languageName = matchedLanguage ? matchedLanguage.name : targetLang.toUpperCase();
            const languageFlag = this.getLanguageFlag(targetLang.toLowerCase());
            
            try {
                const translation = await this.translate(text, 'auto', targetLang);
                if (translation) {
                    client.say(channel, `@${userstate.username} [${languageName}] ${languageFlag} ${translation}`);
                } else {
                    client.say(channel, `@${userstate.username} Sorry, translation failed.`);
                }
            } catch (error) {
                this.logger.error(`[${this.name}] Translation error:`, error);
                client.say(channel, `@${userstate.username} Error translating text: ${error.message}`);
            }
        } catch (error) {
            this.logger.error(`[${this.name}] Command error:`, error);
            client.say(channel, `@${userstate.username} An error occurred processing your command.`);
        }
    }
    
    async handleLanguagesCommand(client, channel, userstate) {
        try {
            // Emit command event
            this.bot.events.emit('libretranslate:command', {
                plugin: this.name,
                command: 'languages',
                sender: userstate.username,
                channel: channel
            });
            
            // Update languages if we don't have them yet
            if (this.availableLanguages.length === 0) {
                await this.updateAvailableLanguages();
            }
            
            this.logger.debug(`[${this.name}] Languages command - available languages: ${this.availableLanguages.length}`);
            
            if (this.availableLanguages.length === 0) {
                client.say(channel, `@${userstate.username} Unable to connect to LibreTranslate server. Please check your server configuration and ensure the service is running.`);
                return;
            }
            
            // Get language codes and names
            const langs = this.availableLanguages.map(l => `${l.code} (${l.name})`).join(', ');
            client.say(channel, `@${userstate.username} Available languages: ${langs}`);
        } catch (error) {
            this.logger.error(`[${this.name}] Error in languages command: ${error.message}`);
            client.say(channel, `@${userstate.username} Error listing languages: ${error.message}`);
        }
    }
}

// Create a plugin instance
const plugin = new LibreTranslatePlugin();

// Export the plugin instance
module.exports = plugin; 