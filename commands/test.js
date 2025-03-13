// Test command for MaxBot

// Command configuration
const config = {
    name: 'test',
    aliases: [],
    description: 'Test command to verify command loading',
    usage: '!test',
    cooldown: 5,
    modOnly: false,
    enabled: true
};

/**
 * Execute the test command
 */
async function execute(client, channel, context, commandText) {
    try {
        await client.say(channel, `@${context.username} Test command works! Command system is functioning.`);
        return true;
    } catch (error) {
        console.error(`Error in test command:`, error);
        return false;
    }
}

// Export the command
module.exports = {
    config,
    execute
}; 