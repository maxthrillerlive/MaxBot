// Shoutout command for MaxBot
// Allows moderators to give shoutouts to other streamers

// Command configuration
const config = {
    name: 'shoutout',
    aliases: ['so'],
    description: 'Gives a shoutout to another streamer',
    usage: '!so <username> [custom message]',
    cooldown: 5,
    modOnly: true,
    enabled: true
};

/**
 * Execute the shoutout command
 * @param {Object} client - The TMI client
 * @param {string} channel - The channel where the command was used
 * @param {Object} context - The context of the message
 * @param {string} commandText - The full command text
 * @returns {Promise<boolean>} - Whether the command was executed successfully
 */
async function execute(client, channel, context, commandText) {
    try {
        // Parse the command text to get arguments
        const parts = commandText.trim().split(' ');
        
        // The first part is the command itself (e.g., !so or !shoutout)
        // We need to check if there are any arguments after the command
        if (parts.length < 2) {
            await client.say(channel, `@${context.username} Usage: !so <username> [custom message]`);
            return true;
        }
        
        // Get the username (second part of the command)
        const username = parts[1].replace(/^@/, '');
        
        // Get any custom message (everything after the username)
        const customMessage = parts.slice(2).join(' ');
        
        // Create the shoutout message
        let message = `Check out @${username} at https://twitch.tv/${username}`;
        
        // Add custom message if provided
        if (customMessage) {
            message += ` - ${customMessage}`;
        } else {
            message += ` - they're an awesome streamer!`;
        }
        
        // Send the shoutout message
        await client.say(channel, message);
        
        return true;
    } catch (error) {
        console.error(`Error in shoutout command:`, error);
        await client.say(channel, `@${context.username} Sorry, there was an error processing your command.`);
        return false;
    }
}

// Export the command
module.exports = {
    config,
    execute
}; 