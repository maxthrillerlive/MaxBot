// Hello command for MaxBot

// Command configuration
const config = {
    name: 'hello',
    aliases: ['hi'],
    description: 'Greets the user',
    usage: '!hello',
    cooldown: 5,
    modOnly: false,
    enabled: true
};

/**
 * Execute the hello command
 */
async function execute(client, channel, context, commandText) {
    try {
        await client.say(channel, `@${context.username} Hello there!`);
        return true;
    } catch (error) {
        console.error(`Error in hello command:`, error);
        return false;
    }
}

// Export the command
module.exports = {
    config,
    execute
}; 