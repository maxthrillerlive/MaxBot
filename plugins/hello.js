// Hello plugin for MaxBot

const plugin = {
    name: 'hello',
    version: '1.0.0',
    description: 'Greets the user',
    author: 'MaxBot',
    
    // Plugin state
    enabled: true,
    client: null,
    logger: null,
    
    // Plugin configuration
    config: {
        enabled: true
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        
        this.logger.info('[Hello] Plugin initializing...');
        
        // Set up commands
        this.commands = [
            {
                name: 'hello',
                config: {
                    description: 'Greets the user',
                    usage: '!hello',
                    aliases: ['hi'],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        await client.say(channel, `@${context.username} Hello there!`);
                        return true;
                    } catch (error) {
                        this.logger.error(`[Hello] Error in hello command:`, error);
                        return false;
                    }
                }
            }
        ];
        
        this.logger.info('[Hello] Plugin initialized successfully');
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