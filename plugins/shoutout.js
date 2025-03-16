// Shoutout plugin for MaxBot

const fs = require('fs');
const path = require('path');

const plugin = {
    name: 'shoutout',
    version: '1.0.0',
    description: 'Shout out other streamers',
    author: 'MaxBot',
    
    // Plugin state
    enabled: true,
    client: null,
    logger: null,
    commandManager: null,
    
    // Plugin configuration
    config: {
        enabled: true,
        autoShoutout: true,
        cooldownMinutes: 60,
        excludedUsers: []
    },
    
    // Shoutout history
    history: {},
    
    // Commands provided by this plugin
    commands: [],
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.commandManager = bot.commandManager;
        
        this.logger.info('[Shoutout] Plugin initializing...');
        
        // Load configuration
        this.loadConfig();
        
        // Load history
        this.loadHistory();
        
        // Set up commands
        this.commands = [
            {
                name: 'shoutout',
                config: {
                    description: 'Shout out another streamer',
                    usage: '!shoutout [username]',
                    aliases: ['so'],
                    cooldown: 5,
                    modOnly: true,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        // Get the username from the message
                        const parts = commandText.trim().split(' ');
                        const username = parts.length > 1 ? parts[1].toLowerCase().replace('@', '') : null;
                        
                        if (!username) {
                            await client.say(channel, `@${context.username} Please specify a username to shout out.`);
                            return false;
                        }
                        
                        // Perform the shoutout
                        await this.doShoutout(client, channel, username);
                        return true;
                    } catch (error) {
                        this.logger.error(`[Shoutout] Error in shoutout command:`, error);
                        return false;
                    }
                }
            },
            {
                name: 'soconfig',
                config: {
                    description: 'Configure shoutout settings',
                    usage: '!soconfig [setting] [value]',
                    aliases: [],
                    cooldown: 5,
                    modOnly: true,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        // Parse the command
                        const parts = commandText.trim().split(' ');
                        
                        if (parts.length < 3) {
                            await client.say(channel, `@${context.username} Usage: !soconfig [setting] [value]`);
                            return false;
                        }
                        
                        const setting = parts[1].toLowerCase();
                        const value = parts[2].toLowerCase();
                        
                        // Handle different settings
                        switch (setting) {
                            case 'auto':
                                this.config.autoShoutout = value === 'on' || value === 'true' || value === 'enable';
                                await client.say(channel, `@${context.username} Auto-shoutout ${this.config.autoShoutout ? 'enabled' : 'disabled'}.`);
                                break;
                                
                            case 'cooldown':
                                const minutes = parseInt(value, 10);
                                if (isNaN(minutes) || minutes < 0) {
                                    await client.say(channel, `@${context.username} Invalid cooldown value. Please specify a positive number of minutes.`);
                                    return false;
                                }
                                this.config.cooldownMinutes = minutes;
                                await client.say(channel, `@${context.username} Shoutout cooldown set to ${minutes} minutes.`);
                                break;
                                
                            case 'exclude':
                                const username = value.replace('@', '');
                                if (!this.config.excludedUsers.includes(username)) {
                                    this.config.excludedUsers.push(username);
                                    await client.say(channel, `@${context.username} Added ${username} to excluded users.`);
                                } else {
                                    await client.say(channel, `@${context.username} ${username} is already excluded.`);
                                }
                                break;
                                
                            case 'include':
                                const user = value.replace('@', '');
                                const index = this.config.excludedUsers.indexOf(user);
                                if (index !== -1) {
                                    this.config.excludedUsers.splice(index, 1);
                                    await client.say(channel, `@${context.username} Removed ${user} from excluded users.`);
                                } else {
                                    await client.say(channel, `@${context.username} ${user} is not in the excluded list.`);
                                }
                                break;
                                
                            default:
                                await client.say(channel, `@${context.username} Unknown setting: ${setting}. Available settings: auto, cooldown, exclude, include`);
                                return false;
                        }
                        
                        // Save the configuration
                        this.saveConfig();
                        return true;
                    } catch (error) {
                        this.logger.error(`[Shoutout] Error in soconfig command:`, error);
                        return false;
                    }
                }
            }
        ];
        
        this.logger.info('[Shoutout] Plugin initialized successfully');
        return true;
    },
    
    // Process incoming messages for auto-shoutouts
    processIncomingMessage: async function(messageObj) {
        // Skip if auto-shoutout is disabled
        if (!this.config.autoShoutout) {
            return messageObj;
        }
        
        // Skip if this is a command or from the bot itself
        if (messageObj.message.startsWith('!') || messageObj.message.startsWith('?') || messageObj.self) {
            return messageObj;
        }
        
        // Check if this user should get a shoutout
        const username = messageObj.tags.username.toLowerCase();
        
        // Skip excluded users
        if (this.config.excludedUsers.includes(username)) {
            return messageObj;
        }
        
        // Check if we've already shouted out this user recently
        const now = Date.now();
        const lastShoutout = this.history[username] || 0;
        const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
        
        if (now - lastShoutout > cooldownMs) {
            // Perform the shoutout
            await this.doShoutout(this.client, messageObj.channel, username);
            
            // Update the history
            this.history[username] = now;
            this.saveHistory();
        }
        
        return messageObj;
    },
    
    // Perform a shoutout
    doShoutout: async function(client, channel, username) {
        try {
            // Send the shoutout message
            await client.say(channel, `Check out ${username} at https://twitch.tv/${username} - they're an awesome streamer!`);
            
            // Update the history
            this.history[username] = Date.now();
            this.saveHistory();
            
            return true;
        } catch (error) {
            this.logger.error(`[Shoutout] Error performing shoutout:`, error);
            return false;
        }
    },
    
    // Load configuration
    loadConfig: function() {
        try {
            const configPath = path.join(__dirname, '..', 'data', 'shoutout.json');
            
            if (fs.existsSync(configPath)) {
                const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                this.config = { ...this.config, ...configData };
                this.logger.info('Loaded shoutout configuration');
            } else {
                this.saveConfig();
            }
        } catch (error) {
            this.logger.error(`[Shoutout] Error loading configuration:`, error);
        }
    },
    
    // Save configuration
    saveConfig: function() {
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            
            // Create data directory if it doesn't exist
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }
            
            const configPath = path.join(dataDir, 'shoutout.json');
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
            this.logger.info('Saved shoutout configuration');
        } catch (error) {
            this.logger.error(`[Shoutout] Error saving configuration:`, error);
        }
    },
    
    // Load shoutout history
    loadHistory: function() {
        try {
            const historyPath = path.join(__dirname, '..', 'data', 'shoutout-history.json');
            
            if (fs.existsSync(historyPath)) {
                this.history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                const count = Object.keys(this.history).length;
                this.logger.info(`Loaded shoutout history for ${count} streamers`);
            } else {
                this.saveHistory();
            }
        } catch (error) {
            this.logger.error(`[Shoutout] Error loading history:`, error);
        }
    },
    
    // Save shoutout history
    saveHistory: function() {
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            
            // Create data directory if it doesn't exist
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir);
            }
            
            const historyPath = path.join(dataDir, 'shoutout-history.json');
            fs.writeFileSync(historyPath, JSON.stringify(this.history, null, 2));
        } catch (error) {
            this.logger.error(`[Shoutout] Error saving history:`, error);
        }
    },
    
    // Enable plugin
    enable: function() {
        this.config.enabled = true;
        this.saveConfig();
        return true;
    },
    
    // Disable plugin
    disable: function() {
        this.config.enabled = false;
        this.saveConfig();
        return true;
    }
};

module.exports = plugin; 