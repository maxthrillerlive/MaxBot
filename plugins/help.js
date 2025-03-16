// Help plugin for MaxBot

const plugin = {
    name: 'help',
    version: '1.0.0',
    description: 'Provides help information for commands',
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
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.commandManager = bot.commandManager;
        
        this.logger.info('[Help] Plugin initializing...');
        
        // Set up commands
        this.commands = [
            {
                name: 'help',
                config: {
                    description: 'Shows help information for commands',
                    usage: '!help [command]',
                    aliases: ['commands', 'cmds'],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        // Get the command name from the message and clean it
                        const parts = commandText.trim().split(' ');
                        
                        // Check if there's a second part and if it contains visible characters
                        let commandName = null;
                        if (parts.length > 1) {
                            // Remove invisible characters and trim
                            const cleanedCommand = parts[1].replace(/\s+/g, '').trim();
                            if (cleanedCommand.length > 0) {
                                commandName = cleanedCommand.toLowerCase();
                            }
                        }
                        
                        // Check if we have access to the command manager
                        if (!this.commandManager || !this.commandManager.listCommands) {
                            // Fallback to using the plugin manager directly
                            const pluginManager = this.bot.pluginManager;
                            if (pluginManager) {
                                const commands = pluginManager.listCommands();
                                
                                // If a specific command was requested, show help for that command
                                if (commandName) {
                                    const command = commands.find(cmd => 
                                        cmd.name === commandName || 
                                        (cmd.aliases && cmd.aliases.includes(commandName))
                                    );
                                    
                                    if (command) {
                                        await client.say(channel, `@${context.username} ${command.usage} - ${command.description}`);
                                    } else {
                                        await client.say(channel, `@${context.username} Command not found: ${commandName}`);
                                    }
                                } else {
                                    // Show a list of all commands
                                    const commandList = commands
                                        .filter(cmd => cmd.enabled !== false)
                                        .map(cmd => cmd.name)
                                        .join(', ');
                                    
                                    await client.say(channel, `@${context.username} Available commands: ${commandList}. Type !help [command] for more information.`);
                                }
                                
                                return true;
                            } else {
                                await client.say(channel, `@${context.username} Sorry, command information is not available.`);
                                this.logger.error('[Help] Cannot access plugin manager or command manager');
                                return false;
                            }
                        }
                        
                        // Get all commands from the command manager
                        const commands = this.commandManager.listCommands();
                        
                        // If a specific command was requested, show help for that command
                        if (commandName) {
                            const command = commands.find(cmd => 
                                cmd.name === commandName || 
                                (cmd.aliases && cmd.aliases.includes(commandName))
                            );
                            
                            if (command) {
                                await client.say(channel, `@${context.username} ${command.usage} - ${command.description}`);
                            } else {
                                await client.say(channel, `@${context.username} Command not found: ${commandName}`);
                            }
                        } else {
                            // Show a list of all commands
                            const commandList = commands
                                .filter(cmd => cmd.enabled !== false)
                                .map(cmd => cmd.name)
                                .join(', ');
                            
                            await client.say(channel, `@${context.username} Available commands: ${commandList}. Type !help [command] for more information.`);
                        }
                        
                        return true;
                    } catch (error) {
                        this.logger.error(`[Help] Error in help command:`, error);
                        return false;
                    }
                }
            }
        ];
        
        this.logger.info('[Help] Plugin initialized successfully');
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