// Enhanced Shoutout command for MaxBot
// Allows moderators to give shoutouts to other streamers with Twitch API integration

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

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

// Path to the shoutout history file
const shoutoutHistoryPath = path.join(__dirname, '..', 'config', 'shoutout-history.json');

// Load shoutout history
let shoutoutHistory = {};
try {
    if (fs.existsSync(shoutoutHistoryPath)) {
        shoutoutHistory = JSON.parse(fs.readFileSync(shoutoutHistoryPath, 'utf8'));
        console.log(`Loaded shoutout history for ${Object.keys(shoutoutHistory).length} streamers`);
    } else {
        // Create the file if it doesn't exist
        fs.writeFileSync(shoutoutHistoryPath, JSON.stringify({}, null, 2));
        console.log('Created new shoutout history file');
    }
} catch (error) {
    console.error('Error loading shoutout history:', error);
    shoutoutHistory = {};
}

/**
 * Save a streamer to the shoutout history
 * @param {string} username - The username to save
 * @param {Object} channelInfo - The channel information
 */
function saveToShoutoutHistory(username, channelInfo) {
    try {
        // Always save the user to history, even if we couldn't get channel info
        // This ensures we can auto-shoutout them when they return
        shoutoutHistory[username.toLowerCase()] = {
            displayName: channelInfo ? channelInfo.displayName : username,
            lastShoutout: Date.now(),
            game: channelInfo ? (channelInfo.game || '') : '',
            url: channelInfo ? channelInfo.url : `https://twitch.tv/${username}`
        };
        
        // Save to file
        fs.writeFileSync(shoutoutHistoryPath, JSON.stringify(shoutoutHistory, null, 2));
        console.log(`Added ${username} to shoutout history`);
    } catch (error) {
        console.error('Error saving to shoutout history:', error);
    }
}

/**
 * Check if a user should receive an auto-shoutout
 * @param {string} username - The username to check
 * @returns {boolean} - Whether the user should receive an auto-shoutout
 */
function shouldAutoShoutout(username) {
    const lowerUsername = username.toLowerCase();
    return shoutoutHistory.hasOwnProperty(lowerUsername);
}

/**
 * Get channel information from Twitch API
 * @param {string} username - The username to look up
 * @returns {Promise<Object|null>} - Channel information or null if not found
 */
async function getChannelInfo(username) {
    try {
        // Check for required environment variables
        if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
            console.warn('CLIENT_ID or CLIENT_SECRET not set. Using basic shoutout.');
            return null;
        }
        
        // Get access token
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
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
                'Client-ID': process.env.CLIENT_ID,
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
                'Client-ID': process.env.CLIENT_ID,
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
                'Client-ID': process.env.CLIENT_ID,
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
    // Start with the announcement header
    let message = '📢 Announcement\n';
    
    // If we couldn't get channel info, create a community member shoutout
    if (!channelInfo) {
        // Use community member format instead of streamer format
        message += `💖 Shoutout to @${username} - Thanks for being an awesome part of our community! 💖`;
        
        // Add note about missing API credentials if appropriate
        console.log('Note: For game information and live status, set CLIENT_ID and CLIENT_SECRET in your .env file');
        
        return message;
    }
    
    // Check if they are a streamer (have game info or channel description)
    const isStreamer = channelInfo.game || channelInfo.description;
    
    if (isStreamer) {
        // Create a streamer shoutout message
        message += `🎮 Check out @${channelInfo.displayName} over at ${channelInfo.url}`;
        
        // Add game info if available
        if (channelInfo.game) {
            if (channelInfo.isLive) {
                message += ` - currently playing ${channelInfo.game} 👍`;
            } else {
                message += ` - They were last seen playing ${channelInfo.game} 👍`;
            }
        } else {
            message += ` 👍`;
        }
        
        // If custom message is provided, append it
        if (customMessage) {
            message += ` ${customMessage}`;
        }
    } else {
        // Create a non-streamer community member shoutout
        message += `💖 Shoutout to @${channelInfo.displayName} - Thanks for being an awesome part of our community! 💖`;
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
        
        // Only save to shoutout history if they're a confirmed streamer
        if (channelInfo && (channelInfo.game || channelInfo.description)) {
            console.log(`[COMMAND] Saving ${username} to shoutout history as a confirmed streamer`);
            saveToShoutoutHistory(username, channelInfo);
        } else {
            console.log(`[COMMAND] Not saving ${username} to shoutout history - not a confirmed streamer`);
        }
        
        console.log(`[COMMAND] Shoutout sent for: ${username}`);
        return true;
    } catch (error) {
        console.error(`[ERROR] Failed to send shoutout: ${error.message}`);
        await client.say(channel, `@${context.username} Failed to send shoutout. Please try again.`);
        return false;
    }
}

/**
 * Process an incoming message to check for auto-shoutouts
 * @param {Object} client - The TMI client
 * @param {string} channel - The channel where the message was sent
 * @param {Object} tags - The message tags (includes username)
 * @param {string} message - The message content
 * @param {boolean} self - Whether the message was sent by the bot
 * @returns {Promise<void>}
 */
async function processMessage(client, channel, tags, message, self) {
    // Skip messages from the bot itself
    if (self) return;
    
    // Skip messages that are commands
    if (message.startsWith('!')) return;
    
    const username = tags.username.toLowerCase();
    
    // Check if this user should receive an auto-shoutout
    if (shouldAutoShoutout(username)) {
        // Get the streamer info from history
        const streamerInfo = shoutoutHistory[username];
        
        // Check if it's been at least 24 hours since their last shoutout
        const hoursSinceLastShoutout = (Date.now() - streamerInfo.lastShoutout) / (1000 * 60 * 60);
        if (hoursSinceLastShoutout >= 24) {
            console.log(`[AUTO-SHOUTOUT] Checking returning user: ${username}`);
            
            // Get fresh channel info
            const channelInfo = await getChannelInfo(username);
            
            // Only auto-shoutout if they're a confirmed streamer (have game info or channel description)
            if (channelInfo && (channelInfo.game || channelInfo.description)) {
                console.log(`[AUTO-SHOUTOUT] Giving auto-shoutout to returning streamer: ${username}`);
                
                // Create and send the shoutout message
                const shoutoutMessage = createShoutoutMessage(username, channelInfo, 'Welcome back to the channel!');
                await client.say(channel, shoutoutMessage);
                
                // Update the last shoutout time
                saveToShoutoutHistory(username, channelInfo);
            } else {
                console.log(`[AUTO-SHOUTOUT] Skipping auto-shoutout for ${username} - not a confirmed streamer`);
            }
        }
    }
}

// Export the command
module.exports = {
    config,
    execute,
    processMessage
}; 