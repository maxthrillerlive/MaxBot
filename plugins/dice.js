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
        
        this.logger.info('[Dice] Plugin initializing...');
        
        // Set up commands
        this.setupCommands();
        
        this.logger.info('[Dice] Plugin initialized successfully');
        return true;
    },
    
    // Set up commands
    setupCommands: function() {
        this.commands = [
            {
                name: 'roll',
                config: {
                    description: 'Roll dice (e.g. 2d6+3)',
                    usage: '!roll [dice expression]',
                    aliases: ['dice'],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        const parts = commandText.trim().split(' ');
                        let diceExpression = '1d6';
                        
                        if (parts.length > 1) {
                            diceExpression = parts[1];
                        }
                        
                        const result = this.rollDice(diceExpression);
                        await client.say(channel, `@${context.username} Rolled ${diceExpression}: ${result.total} ${result.details ? `[${result.details}]` : ''}`);
                        return true;
                    } catch (error) {
                        this.logger.error(`[Dice] Error rolling dice:`, error);
                        await client.say(channel, `@${context.username} Invalid dice expression. Try something like 2d6+3`);
                        return false;
                    }
                }
            }
        ];
    },
    
    // Roll dice
    rollDice: function(expression) {
        try {
            // Parse the dice expression (e.g., "2d6+3")
            const match = expression.match(/^(\d+)?d(\d+)(?:([+-])(\d+))?$/i);
            
            if (!match) {
                throw new Error('Invalid dice expression');
            }
            
            const numDice = match[1] ? parseInt(match[1], 10) : 1;
            const numSides = parseInt(match[2], 10);
            const modifier = match[3] ? match[3] : '';
            const modValue = match[4] ? parseInt(match[4], 10) : 0;
            
            // Validate dice parameters
            if (numDice < 1 || numDice > 100 || numSides < 1 || numSides > 1000) {
                throw new Error('Dice parameters out of range');
            }
            
            // Roll the dice
            let total = 0;
            const rolls = [];
            
            for (let i = 0; i < numDice; i++) {
                const roll = Math.floor(Math.random() * numSides) + 1;
                rolls.push(roll);
                total += roll;
            }
            
            // Apply modifier
            if (modifier === '+') {
                total += modValue;
            } else if (modifier === '-') {
                total -= modValue;
            }
            
            // Return the result
            return {
                total,
                details: numDice > 1 ? rolls.join(', ') : ''
            };
        } catch (error) {
            this.logger.error(`[Dice] Error parsing dice expression:`, error);
            throw error;
        }
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