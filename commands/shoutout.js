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
 * @param {Array} args - The arguments passed to the command
 * @returns {Promise<boolean>} - Whether the command was executed successfully
 */
async function execute(client, channel, context, args) {
    try {
        console.log('Shoutout command executed with args:', args);
        
        // Check if a username was provided
        if (!args || args.length === 0) {
            await client.say(channel, `@${context.username} Usage: !so <username> [custom message]`);
            return true; // Command executed successfully, just with usage info
        }
        
        // Get the username to shoutout (remove @ if present)
        const username = args[0].replace(/^@/, '');
        
        // Get optional custom message if provided
        const customMessage = args.slice(1).join(' ');
        
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
        
        console.log(`Shoutout sent for: ${username}`);
        return true;
    } catch (error) {
        console.error(`Error in shoutout command:`, error);
        try {
            await client.say(channel, `@${context.username} Sorry, there was an error processing your command.`);
        } catch (sayError) {
            console.error('Error sending error message:', sayError);
        }
        return false;
    }
}

// Export the command
module.exports = {
    config,
    execute
}; 