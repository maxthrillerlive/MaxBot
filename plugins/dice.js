// Dice plugin for MaxBot

const plugin = {
    name: 'dice',
    version: '1.0.0',
    description: 'Roll dice and get random numbers',
    author: 'MaxBot',
    
    // Plugin state
    enabled: true,
    client: null,
    logger: null,
    commandManager: null,
    
    // Plugin configuration
    config: {
        enabled: true,
        maxDice: 10,
        maxSides: 100
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.commandManager = bot.commandManager;
        
        this.logger.info('[Dice] Plugin initializing...');
        
        // Set up commands
        this.commands = [
            {
                name: 'dice',
                config: {
                    description: 'Roll dice and get random numbers',
                    usage: '!dice [number]d[sides] (e.g. !dice 2d6)',
                    aliases: ['roll', 'r'],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        // Parse the command
                        const parts = commandText.trim().split(' ');
                        let diceNotation = parts.length > 1 ? parts[1].toLowerCase() : '1d6';
                        
                        // Default to 1d6 if no dice notation provided
                        if (!diceNotation.includes('d')) {
                            diceNotation = '1d6';
                        }
                        
                        // Parse the dice notation (e.g. 2d6)
                        const [numDice, numSides] = diceNotation.split('d').map(n => parseInt(n, 10));
                        
                        // Validate input
                        if (isNaN(numDice) || isNaN(numSides) || numDice < 1 || numSides < 1) {
                            await client.say(channel, `@${context.username} Invalid dice notation. Use format: !dice [number]d[sides] (e.g. !dice 2d6)`);
                            return false;
                        }
                        
                        // Enforce limits
                        if (numDice > this.config.maxDice) {
                            await client.say(channel, `@${context.username} Too many dice! Maximum is ${this.config.maxDice}.`);
                            return false;
                        }
                        
                        if (numSides > this.config.maxSides) {
                            await client.say(channel, `@${context.username} Too many sides! Maximum is ${this.config.maxSides}.`);
                            return false;
                        }
                        
                        // Roll the dice
                        const rolls = [];
                        let total = 0;
                        
                        for (let i = 0; i < numDice; i++) {
                            const roll = Math.floor(Math.random() * numSides) + 1;
                            rolls.push(roll);
                            total += roll;
                        }
                        
                        // Format the result
                        const result = numDice > 1 
                            ? `@${context.username} rolled ${diceNotation}: ${rolls.join(', ')} (Total: ${total})`
                            : `@${context.username} rolled ${diceNotation}: ${total}`;
                        
                        await client.say(channel, result);
                        return true;
                    } catch (error) {
                        this.logger.error(`[Dice] Error in dice command:`, error);
                        return false;
                    }
                }
            }
        ];
        
        this.logger.info('[Dice] Plugin initialized successfully');
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