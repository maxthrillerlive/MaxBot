// Hello plugin for MaxBot

const plugin = {
    name: 'hello',
    version: '1.0.1',
    description: 'Simple greeting plugin',
    author: 'MaxBot',
    
    // Plugin state
    client: null,
    logger: null,
    
    // Plugin configuration with default values
    config: {
        enabled: true,
        greeting: 'Hello there!'
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Initialize plugin
    init: function(bot, logger) {
        // Basic validity checks
        if (!bot) throw new Error('Missing bot object');
        if (!bot.client) throw new Error('Missing bot.client');
        
        // Store references
        this.client = bot.client;
        this.logger = logger || console;
        this.bot = bot;
        
        this.logger.info('[Hello] Plugin initializing...');
        
        // Define commands
        this.commands = [
            {
                name: 'hello',
                config: {
                    description: 'Greet the user',
                    usage: '!hello',
                    aliases: ['hi', 'hey'],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                // Simplified execute function - no complex plugin references
                execute: function(client, channel, context, commandText) {
                    try {
                        // Simple greeting response
                        client.say(channel, `@${context.username} Hello there!`);
                        return true;
                    } catch (error) {
                        console.error('[Hello] Error:', error);
                        return false;
                    }
                }
            }
        ];
        
        this.logger.info(`[Hello] Registered ${this.commands.length} commands`);
        this.logger.info('[Hello] Plugin initialized successfully');
        return true;
    },
    
    // Enable plugin
    enable: function() {
        if (this.logger) this.logger.info('[Hello] Plugin enabled');
        this.config.enabled = true;
        return true;
    },
    
    // Disable plugin
    disable: function() {
        if (this.logger) this.logger.info('[Hello] Plugin disabled');
        this.config.enabled = false;
        return true;
    }
};

module.exports = plugin; 