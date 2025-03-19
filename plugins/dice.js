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
                            // Sanitize the input to remove invisible or special characters
                            const sanitizedExpression = parts[1].replace(/[^\w\d+\-]/g, '');
                            
                            // Only use the provided expression if it's not empty after sanitization
                            if (sanitizedExpression && sanitizedExpression.length > 0) {
                                diceExpression = sanitizedExpression;
                            } else {
                                this.logger.info(`[Dice] Using default expression after sanitizing input: "${parts[1]}"`);
                            }
                        }

                        this.logger.info(`[Dice] Rolling dice with expression: ${diceExpression}`);
                        const result = this.rollDice(diceExpression);
                        
                        // Create a prettier message with dice emoji and formatting
                        let message = `@${context.username} 🎲 Rolled ${diceExpression}: `;
                        
                        // Highlight the total with formatting
                        message += `[ ${result.total} ]`;
                        
                        // Show individual dice rolls with formatting
                        if (result.details) {
                            message += ` ⟹ ${result.details}`;
                        }
                        
                        // Add special messages for critical rolls
                        const match = diceExpression.match(/^(\d+)?d(\d+)/i);
                        const numSides = match ? parseInt(match[2], 10) : 6;
                        
                        if (result.total === numSides && diceExpression.toLowerCase() === '1d20') {
                            message += " ✨ Critical hit! ✨";
                        } else if (result.total === 1 && diceExpression.toLowerCase() === '1d20') {
                            message += " 💥 Critical fail! 💥";
                        } else if (result.total === numSides * (match && match[1] ? parseInt(match[1], 10) : 1)) {
                            message += " 🔥 Perfect roll! 🔥";
                        } else if (result.total === (match && match[1] ? parseInt(match[1], 10) : 1)) {
                            message += " 😢 Minimum roll... 😢";
                        }
                        
                        await client.say(channel, message);
                        return true;
                    } catch (error) {
                        this.logger.error(`[Dice] Error rolling dice:`, error);
                        
                        // Provide more specific error messages
                        let errorMessage = `@${context.username} ❌ Invalid dice expression. Try something like 2d6+3`;
                        
                        if (error.message.includes('out of range')) {
                            errorMessage = `@${context.username} ❌ Dice parameters out of range. Max 100d1000 dice allowed.`;
                        } else if (error.message.includes('empty')) {
                            errorMessage = `@${context.username} ❌ Empty dice expression. Try something like 2d6+3`;
                        }
                        
                        await client.say(channel, errorMessage);
                        return false;
                    }
                }
            }
        ];
    },
    
    // Roll dice
    rollDice: function(expression) {
        try {
            // Sanitize the expression again just to be safe
            const sanitizedExpression = expression.replace(/[^\w\d+\-]/g, '');
            
            if (!sanitizedExpression || sanitizedExpression.length === 0) {
                throw new Error('Empty dice expression after sanitization');
            }
            
            // Parse the dice expression (e.g., "2d6+3")
            const match = sanitizedExpression.match(/^(\d+)?d(\d+)(?:([+-])(\d+))?$/i);

            if (!match) {
                this.logger.warn(`[Dice] Invalid dice expression format: "${sanitizedExpression}"`);
                throw new Error('Invalid dice expression');
            }

            const numDice = match[1] ? parseInt(match[1], 10) : 1;
            const numSides = parseInt(match[2], 10);
            const modifier = match[3] ? match[3] : '';
            const modValue = match[4] ? parseInt(match[4], 10) : 0;

            // Validate dice parameters
            if (numDice < 1 || numDice > 100 || numSides < 1 || numSides > 1000) {
                this.logger.warn(`[Dice] Dice parameters out of range: ${numDice}d${numSides}`);
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
            let modifiedTotal = total;
            if (modifier === '+') {
                modifiedTotal += modValue;
            } else if (modifier === '-') {
                modifiedTotal -= modValue;
            }
            
            // Generate a more detailed output
            let details = '';
            if (numDice > 1) {
                details = rolls.join(' + ');
                if (modifier) {
                    details += ` ${modifier} ${modValue} = ${modifiedTotal}`;
                }
            } else if (modifier) {
                details = `${rolls[0]} ${modifier} ${modValue} = ${modifiedTotal}`;
            }
            
            // Return the result
            return {
                total: modifiedTotal,
                details: details
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