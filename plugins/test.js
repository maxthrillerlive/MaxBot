// Test plugin for MaxBot

const plugin = {
    name: 'test',
    version: '1.0.0',
    description: 'Test if the bot is working',
    author: 'MaxBot',
    
    // Plugin state
    enabled: true,
    client: null,
    logger: null,
    commandManager: null,
    
    // Plugin configuration
    config: {
        enabled: true
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Custom logging function with timestamp and green info
    logInfo: function(message) {
        const time = new Date().toTimeString().substring(0, 8);
        console.log(`[${time}] \x1b[32minfo:\x1b[0m ${message}`);
    },
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.commandManager = bot.commandManager;
        
        this.logInfo('[Test] Plugin initializing...');
        
        // Set up commands
        this.commands = [
            {
                name: 'test',
                config: {
                    description: 'Test if the bot is working',
                    usage: '!test',
                    aliases: [],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        await client.say(channel, `@${context.username} Bot is working!`);
                        return true;
                    } catch (error) {
                        this.logInfo(`[Test] Error in test command: ${error.message}`);
                        return false;
                    }
                }
            }
        ];
        
        this.logInfo('[Test] Plugin initialized successfully');
        return true;
    },
    
    // Enable plugin
    enable: function() {
        this.config.enabled = true;
        return true;
    },
    
    // Disable plugin
    disable: function() {
        this.config.enabled = false;
        return true;
    }
};

module.exports = plugin; 