/**
 * Template for converting standalone commands to MaxBot plugins
 * 
 * Steps to migrate a command:
 * 1. Copy this template to the plugins directory with an appropriate name (e.g., commandName.js)
 * 2. Replace the placeholders with the functionality from your command
 * 3. Customize the plugin properties as needed
 */

// Command Plugin Template
const plugin = {
    // Basic Plugin Information
    name: 'commandName', // Replace with your command name
    version: '1.0.0',
    description: 'Description of what the command does', // Replace with your command description
    author: 'MaxBot',
    
    // Plugin State (don't modify)
    enabled: true,
    client: null,
    logger: null,
    
    // Plugin Configuration
    config: {
        enabled: true
        // Add any other configuration options here
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Initialize plugin (don't modify)
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        
        this.logger.info(`[${this.name}] Plugin initializing...`);
        
        // Set up commands
        this.setupCommands();
        
        this.logger.info(`[${this.name}] Plugin initialized successfully`);
        return true;
    },
    
    // Set up commands
    setupCommands: function() {
        this.commands = [
            {
                name: 'commandName', // Replace with your command name
                config: {
                    description: 'Description of what the command does', // Replace with your command description
                    usage: '!commandName [args]', // Replace with your command usage
                    aliases: [], // Add any aliases for your command
                    cooldown: 5, // Set an appropriate cooldown in seconds
                    modOnly: false, // Set to true if command should only be available to mods
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        // Insert your command logic here
                        
                        // Example: get command arguments
                        const args = commandText.trim().split(' ').slice(1);
                        
                        // Example: respond to the user
                        await client.say(channel, `@${context.username} Command response here!`);
                        
                        return true; // Return true if command executed successfully
                    } catch (error) {
                        this.logger.error(`[${this.name}] Error executing command:`, error);
                        return false;
                    }
                }
            }
            // Add additional commands if needed
        ];
    },
    
    // Enable plugin (don't modify)
    enable: function() {
        this.config.enabled = true;
        return true;
    },
    
    // Disable plugin (don't modify)
    disable: function() {
        this.config.enabled = false;
        return true;
    }
    
    // Add any additional helper methods here
};

module.exports = plugin; 