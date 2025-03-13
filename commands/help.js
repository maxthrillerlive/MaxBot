// Help command for MaxBot

// Command configuration
const config = {
    name: 'help',
    aliases: ['commands', 'cmds'],
    description: 'Shows available commands',
    usage: '!help [command]',
    cooldown: 5,
    modOnly: false,
    enabled: true
};

/**
 * Execute the help command
 */
async function execute(client, channel, context, commandText) {
    try {
        // Get the command manager to access all commands
        const commandManager = require('../commandManager');
        
        // Get all available commands
        const commands = commandManager.listCommands();
        
        // Parse arguments to see if user is asking for help with a specific command
        const args = commandText.trim().split(' ');
        const specificCommand = args.length > 1 ? args[1].toLowerCase() : null;
        
        if (specificCommand) {
            // User is asking for help with a specific command
            const command = commands.find(cmd => 
                cmd.name === specificCommand || 
                (cmd.aliases && cmd.aliases.includes(specificCommand))
            );
            
            if (command) {
                // Show detailed help for this command
                let helpText = `@${context.username} Command: !${command.name}`;
                
                if (command.aliases && command.aliases.length > 0) {
                    helpText += ` (aliases: ${command.aliases.map(a => '!' + a).join(', ')})`;
                }
                
                if (command.description) {
                    helpText += ` - ${command.description}`;
                }
                
                if (command.usage) {
                    helpText += ` - Usage: ${command.usage}`;
                }
                
                await client.say(channel, helpText);
            } else {
                await client.say(channel, `@${context.username} Command !${specificCommand} not found.`);
            }
        } else {
            // User wants to see all commands
            // Filter to only show enabled commands
            const enabledCommands = commands.filter(cmd => cmd.enabled !== false);
            
            // Format the command list
            const commandList = enabledCommands.map(cmd => cmd.name).join(', ');
            
            await client.say(channel, `@${context.username} Available commands: !${commandList}`);
        }
        
        return true;
    } catch (error) {
        console.error(`Error in help command:`, error);
        await client.say(channel, `@${context.username} Sorry, there was an error processing your command.`);
        return false;
    }
}

// Export the command
module.exports = {
    config,
    execute
}; 