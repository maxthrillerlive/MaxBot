const axios = require('axios');

// Create the plugin object
const plugin = {
    name: 'libretranslate',
    version: '1.0.0',
    description: 'Real-time chat translation using LibreTranslate',
    author: 'MaxBot',
    
    // Plugin state
    enabled: false,
    client: null,
    logger: null,
    commandManager: null,
    commands: {},  // Store commands here
    config: {
        apiUrl: 'https://libretranslate.com',  // LibreTranslate server URL
        targetLang: 'en',                    // Default target language
        translateAll: false,                  // Whether to translate all messages
        sourceLang: 'auto',                  // Auto-detect source language
        maxRetries: 3,                       // Maximum number of retries for failed requests
        retryDelay: 1000                     // Delay between retries in milliseconds
    },
    
    // Available languages cache
    availableLanguages: [],
    
    // Language code to flag emoji mapping
    languageFlags: {
        'en': '🇺🇸',
        'es': '🇪🇸',
        'fr': '🇫🇷',
        'de': '🇩🇪',
        'it': '🇮🇹',
        'pt': '🇵🇹',
        'ru': '🇷🇺',
        'ja': '🇯🇵',
        'ko': '🇰🇷',
        'zh': '🇨🇳',
        'ar': '🇸🇦',
        'hi': '🇮🇳',
        'bn': '🇧🇩',
        'nl': '🇳🇱',
        'pl': '🇵🇱',
        'tr': '🇹🇷',
        'uk': '🇺🇦',
        'vi': '🇻🇳',
        'th': '🇹🇭',
        'sv': '🇸🇪',
        'da': '🇩🇰',
        'fi': '🇫🇮',
        'nb': '🇳🇴',
        'cs': '🇨🇿',
        'sk': '🇸🇰',
        'hu': '🇭🇺',
        'ro': '🇷🇴',
        'bg': '🇧🇬',
        'el': '🇬🇷',
        'id': '🇮🇩',
        'ms': '🇲🇾',
        'fa': '🇮🇷',
        'he': '🇮🇱',
        'ur': '🇵🇰',
        'tl': '🇵🇭'
    },
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.commandManager = bot.commandManager;
        
        this.logger.info('[LibreTranslate] Plugin initializing...');
        
        // Load available languages
        this.updateAvailableLanguages();

        // Store reference to plugin
        const self = this;

        // Set up commands
        this.commands = {
            translate: {
                name: 'translate',
                description: 'Translate text to a specified language',
                usage: '?translate [target_lang] [text]',
                enabled: true,
                modOnly: false,
                execute: async (client, target, context, msg) => {
                    const args = msg.split(' ').slice(1).join(' ');
                    return await self.handleTranslate(client, target, context, args);
                }
            },
            tr: {
                name: 'tr',
                description: 'Shorthand for translate command',
                usage: '?tr [target_lang] [text]',
                enabled: true,
                modOnly: false,
                execute: async (client, target, context, msg) => {
                    const args = msg.split(' ').slice(1).join(' ');
                    return await self.handleTranslate(client, target, context, args);
                }
            },
            trlang: {
                name: 'trlang',
                description: 'List available translation languages',
                usage: '?trlang',
                enabled: true,
                modOnly: false,
                execute: async (client, target, context, msg) => {
                    if (self.availableLanguages.length === 0) {
                        await self.updateAvailableLanguages();
                    }
                    const langs = self.availableLanguages.map(l => `${l.code} (${l.name})`).join(', ');
                    client.say(target, `@${context.username} Available languages: ${langs}`);
                    return true;
                }
            },
            trconfig: {
                name: 'trconfig',
                description: 'Configure translation settings (Mod only)',
                usage: '?trconfig [setting] [value]',
                enabled: true,
                modOnly: true,
                execute: async (client, target, context, msg) => {
                    const args = msg.split(' ').slice(1).join(' ');
                    return await self.handleConfig(client, target, context, args);
                }
            }
        };

        // Set up message handler for auto-translation
        if (this.client) {
            // Remove direct message handler to avoid duplication
            // Instead, we'll use the processIncomingMessage function
            this.logger.info('[LibreTranslate] Using processIncomingMessage for auto-translation');
        }

        this.logger.info('[LibreTranslate] Plugin initialized successfully');
        return true;
    },
    
    // Test API connection
    testApiConnection: async function() {
        try {
            const response = await axios.get(this.config.apiUrl);
            this.logger.info(`[LibreTranslate] Successfully connected to API server at ${this.config.apiUrl}`);
            return true;
        } catch (error) {
            this.logger.error(`[LibreTranslate] Failed to connect to API server at ${this.config.apiUrl}: ${error.message}`);
            if (error.code === 'ECONNREFUSED') {
                this.logger.error('[LibreTranslate] Make sure the LibreTranslate server is running and accessible');
            }
            return false;
        }
    },
    
    // Enable plugin
    enable: function() {
        this.enabled = true;
        this.logger.info('[LibreTranslate] Plugin enabled');
        return true;
    },
    
    // Disable plugin
    disable: function() {
        this.enabled = false;
        this.logger.info('LibreTranslate plugin disabled');
        return true;
    },
    
    // Update available languages from the server
    updateAvailableLanguages: async function() {
        try {
            const response = await axios.get(`${this.config.apiUrl}/languages`);
            if (response.data && Array.isArray(response.data)) {
                this.availableLanguages = response.data;
                this.logger.info(`[LibreTranslate] Loaded ${this.availableLanguages.length} languages`);
                return true;
            } else {
                throw new Error('Invalid response format from language endpoint');
            }
        } catch (error) {
            this.logger.error(`[LibreTranslate] Error loading languages: ${error.message}`);
            if (error.code === 'ECONNREFUSED') {
                this.logger.error('[LibreTranslate] Make sure the LibreTranslate server is running and accessible');
            } else if (error.response) {
                this.logger.error(`[LibreTranslate] Server response: ${JSON.stringify(error.response.data)}`);
            }
            return false;
        }
    },
    
    // Detect language
    detectLanguage: async function(text) {
        try {
            const response = await axios({
                method: 'post',
                url: `${this.config.apiUrl}/detect`,
                data: { q: text },
                headers: { 'Content-Type': 'application/json' }
            });

            this.logger.info(`[LibreTranslate] Detection response: ${JSON.stringify(response.data)}`);

            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                const detected = response.data[0];
                this.logger.info(`[LibreTranslate] Detected ${detected.language} with confidence ${detected.confidence}`);
                return detected.language;
            }
            return 'auto';
        } catch (error) {
            this.logger.error(`[LibreTranslate] Detection error: ${error.message}`);
            if (error.response) {
                this.logger.error(`[LibreTranslate] API Error: ${JSON.stringify(error.response.data)}`);
            }
            return 'auto';
        }
    },
    
    // Translate text
    translate: async function(text, sourceLang = 'auto', targetLang = this.config.targetLang) {
        try {
            // Skip translation if source and target languages are the same
            if (sourceLang === targetLang) {
                return text;
            }

            const response = await axios({
                method: 'post',
                url: `${this.config.apiUrl}/translate`,
                data: {
                    q: text,
                    source: sourceLang,
                    target: targetLang
                },
                headers: { 'Content-Type': 'application/json' }
            });

            this.logger.info(`[LibreTranslate] Translation API response: ${JSON.stringify(response.data)}`);

            if (response.data && response.data.translatedText) {
                return response.data.translatedText;
            }
            return null;
        } catch (error) {
            this.logger.error(`[LibreTranslate] Translation error: ${error.message}`);
            if (error.response) {
                this.logger.error(`[LibreTranslate] API Error: ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    },
    
    // Get flag emoji for language code
    getLanguageFlag: function(langCode) {
        return this.languageFlags[langCode] || '🌐';
    },
    
    // Process incoming messages (called by plugin manager)
    processIncomingMessage: async function(messageObj) {
        try {
            // Skip if plugin is disabled or translateAll is disabled
            if (!this.enabled || !this.config.translateAll) {
                return messageObj;
            }
            
            // Skip commands
            if (messageObj.message.startsWith('!') || messageObj.message.startsWith('?')) {
                return messageObj;
            }
            
            // Skip messages from the bot itself
            if (messageObj.self) {
                return messageObj;
            }
            
            // Process the message for translation
            await this.handleMessage(messageObj.target, messageObj.context, messageObj.message);
            
            // Return the original message object
            return messageObj;
        } catch (error) {
            this.logger.error(`[LibreTranslate] Error in processIncomingMessage: ${error.message}`);
            return messageObj;
        }
    },
    
    // Process outgoing messages
    processOutgoingMessage: async function(messageObj) {
        // Don't translate outgoing messages by default
        return [messageObj];
    },
    
    // Handle translate command
    handleTranslate: async function(client, target, context, args) {
        const argArray = args.split(' ');
        if (argArray.length < 2) {
            client.say(target, `@${context.username} Usage: ?translate [target_lang] [text]`);
            return false;
        }
        
        const targetLang = argArray[0].toLowerCase();
        const text = argArray.slice(1).join(' ');
        
        // Validate target language
        const validLang = this.availableLanguages.find(l => l.code === targetLang);
        if (!validLang) {
            client.say(target, `@${context.username} Invalid target language. Use ?trlang to see available languages.`);
            return false;
        }
        
        try {
            // Detect source language first
            const sourceLang = await this.detectLanguage(text);
            const translation = await this.translate(text, sourceLang, targetLang);
            
            if (translation) {
                const langName = this.availableLanguages.find(l => l.code === targetLang)?.name || targetLang;
                const sourceFlag = this.getLanguageFlag(sourceLang);
                const targetFlag = this.getLanguageFlag(targetLang);
                client.say(target, `@${context.username} ${sourceFlag} → ${targetFlag} ${translation}`);
                return true;
            } else {
                client.say(target, `@${context.username} Translation failed.`);
                return false;
            }
        } catch (error) {
            client.say(target, `@${context.username} Translation error: ${error.message}`);
            return false;
        }
    },
    
    // Handle config command
    handleConfig: async function(client, target, context, args) {
        if (!args || args.trim() === '') {
            client.say(target, `@${context.username} Usage: ?trconfig [setting] [value]\n` +
                'Available settings:\n' +
                '1. targetLang - Set default target language (e.g., ?trconfig targetLang es). Use ?trlang to see available languages\n' +
                '2. translateAll - Enable/disable auto-translation of all messages (e.g., ?trconfig translateAll enable)');
            return true;
        }
        
        const [setting, ...valueArray] = args.split(' ');
        const value = valueArray.join(' ');
        
        if (!value) {
            client.say(target, `@${context.username} Please provide a value for the setting. Example: ?trconfig targetLang es`);
            return false;
        }
        
        switch (setting.toLowerCase()) {
            case 'targetlang':
                const validLang = this.availableLanguages.find(l => l.code === value.toLowerCase());
                if (!validLang) {
                    client.say(target, `@${context.username} Invalid language code. Use ?trlang to see available languages.`);
                    return false;
                }
                this.config.targetLang = value.toLowerCase();
                const targetFlag = this.getLanguageFlag(value.toLowerCase());
                client.say(target, `@${context.username} Default target language set to: ${targetFlag} ${value.toLowerCase()} (${validLang.name}). Use ?tr or ?translate without specifying a language to use this default.`);
                return true;
                
            case 'translateall':
                const enableValue = value.toLowerCase() === 'true' || value.toLowerCase() === 'enable';
                this.config.translateAll = enableValue;
                this.logger.info(`[LibreTranslate] translateAll set to: ${enableValue}`);
                const targetLangFlag = this.getLanguageFlag(this.config.targetLang);
                client.say(target, `@${context.username} Auto-translate all messages: ${enableValue ? 'Enabled' : 'Disabled'}. ${enableValue ? `All messages will be translated to ${targetLangFlag} ${this.config.targetLang}` : ''}`);
                return true;
                
            default:
                client.say(target, `@${context.username} Unknown setting. Available settings:\n` +
                    '1. targetLang - Set default target language\n' +
                    '2. translateAll - Enable/disable auto-translation');
                return false;
        }
    },
    
    // Handle incoming messages
    handleMessage: async function(target, context, msg) {
        try {
            // Skip translation if message starts with a command
            if (msg.startsWith('!')) {
                console.log(`[LibreTranslate] Skipping command message: ${msg}`);
                this.logger.info(`[LibreTranslate] Skipping command message: ${msg}`);
                return;
            }

            // Skip empty messages
            if (!msg || msg.trim() === '') {
                console.log('[LibreTranslate] Skipping empty message');
                this.logger.info('[LibreTranslate] Skipping empty message');
                return;
            }

            console.log(`[LibreTranslate] Processing message for translation: ${msg}`);
            this.logger.info(`[LibreTranslate] Processing message for translation: ${msg}`);

            // Detect source language first
            const sourceLang = await this.detectLanguage(msg);
            console.log(`[LibreTranslate] Detected language: ${sourceLang}`);
            this.logger.info(`[LibreTranslate] Detected language: ${sourceLang}`);
            
            // Only translate if source language is different from target language
            if (sourceLang && sourceLang !== 'auto' && sourceLang !== this.config.targetLang) {
                console.log(`[LibreTranslate] Attempting translation from ${sourceLang} to ${this.config.targetLang}`);
                this.logger.info(`[LibreTranslate] Attempting translation from ${sourceLang} to ${this.config.targetLang}`);
                
                const translation = await this.translate(msg, sourceLang, this.config.targetLang);
                console.log(`[LibreTranslate] Translation result: ${translation}`);
                this.logger.info(`[LibreTranslate] Translation result: ${translation}`);
                
                if (translation && translation !== msg) {
                    const sourceFlag = this.getLanguageFlag(sourceLang);
                    // Format the response as "USERNAME FLAG says, '(translated text)'"
                    const response = `${context.username} ${sourceFlag} says, "${translation}"`;
                    console.log(`[LibreTranslate] Sending response: ${response}`);
                    this.logger.info(`[LibreTranslate] Sending response: ${response}`);
                    this.client.say(target, response);
                }
            } else {
                console.log(`[LibreTranslate] Skipping translation - same language or auto-detect failed`);
                this.logger.info(`[LibreTranslate] Skipping translation - same language or auto-detect failed`);
            }
        } catch (error) {
            console.error(`[LibreTranslate] Error processing message: ${error.message}`);
            this.logger.error(`[LibreTranslate] Error processing message: ${error.message}`);
            if (error.response) {
                console.error(`[LibreTranslate] API Error: ${JSON.stringify(error.response.data)}`);
                this.logger.error(`[LibreTranslate] API Error: ${JSON.stringify(error.response.data)}`);
            }
            throw error;  // Re-throw to be caught by the caller
        }
    }
};

// Export the plugin
module.exports = plugin; 