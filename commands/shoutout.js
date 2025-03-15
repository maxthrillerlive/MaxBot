// Enhanced Shoutout command for MaxBot
// Allows moderators to give shoutouts to other streamers with Twitch API integration

const fetch = require('node-fetch');

// Command configuration
const config = {
    name: 'shoutout',
    aliases: ['so'],
    description: 'Gives a shoutout to another streamer with channel info',
    usage: '!so <username> [custom message]',
    cooldown: 5,
    modOnly: true,
    enabled: true
};

/**
 * Get channel information from Twitch API
 * @param {string} username - The username to look up
 * @returns {Promise<Object|null>} - Channel information or null if not found
 */
async function getChannelInfo(username) {
    try {
        // Check for required environment variables
        if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
            console.warn('TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not set. Using basic shoutout.');
            return null;
        }
        
        // Get access token
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            })
        });
        
        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            console.error('Failed to get Twitch access token');
            return null;
        }
        
        // Get user information
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });
        
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) {
            console.log(`User not found: ${username}`);
            return null;
        }
        
        const user = userData.data[0];
        
        // Get channel information
        const channelResponse = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${user.id}`, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });
        
        const channelData = await channelResponse.json();
        if (!channelData.data || channelData.data.length === 0) {
            console.log(`Channel not found for user: ${username}`);
            return null;
        }
        
        const channel = channelData.data[0];
        
        // Check if the channel is live
        const streamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_id=${user.id}`, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });
        
        const streamData = await streamResponse.json();
        const isLive = streamData.data && streamData.data.length > 0;
        
        // Return combined information
        return {
            id: user.id,
            name: user.login,
            displayName: user.display_name,
            description: channel.title,
            game: channel.game_name,
            isLive: isLive,
            url: `https://twitch.tv/${user.login}`
        };
    } catch (error) {
        console.error(`Error getting channel info for ${username}:`, error);
        return null;
    }
}

/**
 * Create a shoutout message based on channel information
 * @param {string} username - The username to shoutout
 * @param {Object|null} channelInfo - Channel information from Twitch API
 * @param {string} customMessage - Optional custom message
 * @returns {string} - The formatted shoutout message
 */
function createShoutoutMessage(username, channelInfo, customMessage = '') {
    // If we couldn't get channel info, create a basic shoutout
    if (!channelInfo) {
        let message = `Check out @${username} at https://twitch.tv/${username}`;
        
        // Add custom message if provided
        if (customMessage) {
            message += ` - ${customMessage}`;
        } else {
            message += ` - they're an awesome streamer!`;
        }
        
        return message;
    }
    
    // Create a more detailed shoutout message
    let message = `Check out @${channelInfo.displayName} at ${channelInfo.url}`;
    
    // Add game info if available
    if (channelInfo.game) {
        message += ` - they were last seen playing ${channelInfo.game}!`;
    } else {
        message += `!`;
    }
    
    // Add live status
    if (channelInfo.isLive) {
        message += ` They're LIVE right now!`;
    }
    
    // If custom message is provided, append it
    if (customMessage) {
        message += ` ${customMessage}`;
    }
    
    return message;
}

/**
 * Execute the shoutout command
 * @param {Object} client - The TMI client
 * @param {string} channel - The channel where the command was used
 * @param {Object} context - The context of the message
 * @param {string|Array} args - The arguments passed to the command
 * @returns {Promise<boolean>} - Whether the command was executed successfully
 */
async function execute(client, channel, context, args) {
    try {
        // Parse the command message to extract arguments
        let argsArray;
        if (typeof args === 'string') {
            // If args is the full message string (e.g. "!so username custom message")
            const commandParts = args.trim().split(' ');
            // Skip the command itself (e.g. "!so")
            argsArray = commandParts.slice(1);
        } else if (Array.isArray(args)) {
            argsArray = args;
        } else {
            argsArray = [];
        }
        
        // Check if a username was provided
        if (!argsArray || argsArray.length === 0) {
            await client.say(channel, `@${context.username} Usage: !so <username> [custom message]`);
            return false;
        }
        
        // Get the username to shoutout (remove @ if present)
        const username = argsArray[0].toLowerCase().replace('@', '');
        
        // Get optional custom message if provided
        const customMessage = argsArray.slice(1).join(' ');
        
        // Log the shoutout request
        console.log(`[COMMAND] Shoutout requested for: ${username} by ${context.username}`);
        
        // Try to get channel information
        const channelInfo = await getChannelInfo(username);
        
        // Create the shoutout message
        const shoutoutMessage = createShoutoutMessage(username, channelInfo, customMessage);
        
        // Send the shoutout message
        await client.say(channel, shoutoutMessage);
        
        console.log(`[COMMAND] Shoutout sent for: ${username}`);
        return true;
    } catch (error) {
        console.error(`[ERROR] Failed to send shoutout: ${error.message}`);
        await client.say(channel, `@${context.username} Failed to send shoutout. Please try again.`);
        return false;
    }
}

// Export the command
module.exports = {
    config,
    execute
}; 