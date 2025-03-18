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

// Plugin command configuration
const pluginCommand = {
    name: 'plugin',
    description: 'Control plugin settings',
    usage: '!plugin <plugin> <action> [options]',
    cooldown: 3,
    modOnly: true,
    enabled: true
};

// Path to the shoutout history file
const shoutoutHistoryPath = path.join(__dirname, '..', 'config', 'shoutout-history.json');
const shoutoutConfigPath = path.join(__dirname, '..', 'config', 'shoutout.json');

// Default configuration
let shoutoutConfig = {
    autoShoutout: {
        enabled: true,
        cooldownHours: 24,
        welcomeMessage: "Welcome back to the channel!",
        message: "🎮 Look who it is, @{username}! Check them out over over at https://twitch.tv/{username}!!! 👍"
    },
    messages: {
        streamer: "🎮 Check out @{displayName} over at {url} - {gameInfo} 👍",
        nonStreamer: "💖 Shoutout to @{displayName} - Thanks for being an awesome part of our community! 💖",
        announcement: "📢 Announcement"
    }
};

// Load shoutout configuration
try {
    if (fs.existsSync(shoutoutConfigPath)) {
        const loadedConfig = JSON.parse(fs.readFileSync(shoutoutConfigPath, 'utf8'));
        shoutoutConfig = { ...shoutoutConfig, ...loadedConfig };
        console.log('Loaded shoutout configuration');
    } else {
        // Create the config file if it doesn't exist
        fs.writeFileSync(shoutoutConfigPath, JSON.stringify(shoutoutConfig, null, 2));
        console.log('Created new shoutout configuration file');
    }
} catch (error) {
    console.error('Error loading shoutout configuration:', error);
}

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
    // If auto-shoutouts are disabled, always return false
    if (!shoutoutConfig.autoShoutout.enabled) {
        return false;
    }
    
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
    let message = `${shoutoutConfig.messages.announcement}\n`;
    
    // If we couldn't get channel info, create a community member shoutout
    if (!channelInfo) {
        // Use community member format instead of streamer format
        message += shoutoutConfig.messages.nonStreamer.replace('{displayName}', username);
        
        // Add note about missing API credentials if appropriate
        console.log('Note: For game information and live status, set CLIENT_ID and CLIENT_SECRET in your .env file');
        
        return message;
    }
    
    // Check if they are a streamer (have game info or channel description)
    const isStreamer = channelInfo.game || channelInfo.description;
    
    if (isStreamer) {
        // Create a streamer shoutout message
        let gameInfo = '';
        if (channelInfo.game) {
            if (channelInfo.isLive) {
                gameInfo = `currently playing ${channelInfo.game}`;
            } else {
                gameInfo = `They were last seen playing ${channelInfo.game}`;
            }
        }
        
        message += shoutoutConfig.messages.streamer
            .replace('{displayName}', channelInfo.displayName)
            .replace('{url}', channelInfo.url)
            .replace('{gameInfo}', gameInfo);
        
        // If custom message is provided, append it
        if (customMessage) {
            message += ` ${customMessage}`;
        }
    } else {
        // Create a non-streamer community member shoutout
        message += shoutoutConfig.messages.nonStreamer.replace('{displayName}', channelInfo.displayName);
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
        
        // Check for configuration commands
        if (argsArray.length > 0 && argsArray[0].toLowerCase() === 'config') {
            return await handleConfigCommand(client, channel, context, argsArray.slice(1));
        }
        
        // Check if a username was provided
        if (!argsArray || argsArray.length === 0) {
            await client.say(channel, `@${context.username} Usage: !so <username> [custom message] or !so config [setting] [value]`);
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
 * Handle configuration commands for the shoutout command
 * @param {Object} client - The TMI client
 * @param {string} channel - The channel where the command was used
 * @param {Object} context - The context of the message
 * @param {Array} args - The arguments passed to the command
 * @returns {Promise<boolean>} - Whether the command was executed successfully
 */
async function handleConfigCommand(client, channel, context, args) {
    // Only allow moderators to use this command
    if (!context.mod && context.username.toLowerCase() !== channel.replace('#', '').toLowerCase()) {
        return;
    }

    if (args.length < 2) {
        await client.say(channel, `@${context.username} Usage: !soconfig [message|streamer|nonstreamer|auto] [value]`);
        return;
    }

    const subCommand = args[1].toLowerCase();
    
    // Handle auto-shoutout toggle
    if (subCommand === 'auto' || subCommand === 'autoshoutout') {
        if (args.length < 3) {
            const status = shoutoutConfig.autoShoutout.enabled ? 'enabled' : 'disabled';
            await client.say(channel, `@${context.username} Auto-shoutout is currently ${status}.`);
            return;
        }
        
        const toggle = args[2].toLowerCase();
        if (toggle === 'on' || toggle === 'enable' || toggle === 'true') {
            shoutoutConfig.autoShoutout.enabled = true;
            await client.say(channel, `@${context.username} Auto-shoutout has been enabled.`);
        } else if (toggle === 'off' || toggle === 'disable' || toggle === 'false') {
            shoutoutConfig.autoShoutout.enabled = false;
            await client.say(channel, `@${context.username} Auto-shoutout has been disabled.`);
        } else {
            await client.say(channel, `@${context.username} Invalid option. Use 'on' or 'off'.`);
            return;
        }
        
        // Save the updated configuration
        fs.writeFileSync(shoutoutConfigPath, JSON.stringify(shoutoutConfig, null, 2));
        return;
    }

    // Handle message configuration
    if (subCommand === 'message' || subCommand === 'streamer' || subCommand === 'nonstreamer') {
        if (args.length < 3) {
            await client.say(channel, `@${context.username} Please provide a message template.`);
            return;
        }

        // Join the remaining arguments to form the message
        const messageTemplate = args.slice(2).join(' ');

        // Update the appropriate message template
        if (subCommand === 'message') {
            shoutoutConfig.messages.streamer = messageTemplate;
            await client.say(channel, `@${context.username} Updated streamer message template.`);
        } else if (subCommand === 'streamer') {
            shoutoutConfig.messages.streamer = messageTemplate;
            await client.say(channel, `@${context.username} Updated streamer message template.`);
        } else if (subCommand === 'nonstreamer') {
            shoutoutConfig.messages.nonStreamer = messageTemplate;
            await client.say(channel, `@${context.username} Updated non-streamer message template.`);
        }

        // Save the updated configuration
        fs.writeFileSync(shoutoutConfigPath, JSON.stringify(shoutoutConfig, null, 2));
    } else {
        await client.say(channel, `@${context.username} Unknown configuration option. Available options: message, streamer, nonstreamer, auto`);
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
    
    // Skip if auto-shoutouts are disabled
    if (!shoutoutConfig.autoShoutout.enabled) {
        return;
    }
    
    const username = tags.username.toLowerCase();
    
    // Check if this user should receive an auto-shoutout
    if (shouldAutoShoutout(username)) {
        // Get the streamer info from history
        const streamerInfo = shoutoutHistory[username];
        
        // Check if it's been at least the configured cooldown hours since their last shoutout
        const hoursSinceLastShoutout = (Date.now() - streamerInfo.lastShoutout) / (1000 * 60 * 60);
        if (hoursSinceLastShoutout >= shoutoutConfig.autoShoutout.cooldownHours) {
            console.log(`[AUTO-SHOUTOUT] Checking returning user: ${username}`);
            
            // Get fresh channel info
            const channelInfo = await getChannelInfo(username);
            
            // Only auto-shoutout if they're a confirmed streamer (have game info or channel description)
            if (channelInfo && (channelInfo.game || channelInfo.description)) {
                console.log(`[AUTO-SHOUTOUT] Giving auto-shoutout to returning streamer: ${username}`);
                
                // Create and send the shoutout message
                const shoutoutMessage = createShoutoutMessage(username, channelInfo, shoutoutConfig.autoShoutout.welcomeMessage);
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
    pluginCommand,
    execute,
    handleConfigCommand,
    processMessage,
    handlePluginCommand
};

/**
 * Handle plugin commands for shoutout
 * @param {Object} client - The Twitch client
 * @param {string} channel - The channel name
 * @param {Object} context - The message context
 * @param {Array} args - The command arguments
 * @returns {boolean} - Whether the command was handled
 */
async function handlePluginCommand(client, channel, context, args) {
    // Only allow moderators to use this command
    if (!context.mod && context.username.toLowerCase() !== channel.replace('#', '').toLowerCase()) {
        return false;
    }

    // Check if this is a shoutout plugin command
    if (args.length < 2 || args[1].toLowerCase() !== 'shoutout') {
        return false;
    }

    // Handle shoutout plugin commands
    if (args.length < 3) {
        await client.say(channel, `@${context.username} Usage: !plugin shoutout [autoshoutout] [on|off]`);
        return true;
    }

    const subCommand = args[2].toLowerCase();
    
    // Handle auto-shoutout toggle
    if (subCommand === 'auto' || subCommand === 'autoshoutout') {
        if (args.length < 4) {
            const status = shoutoutConfig.autoShoutout.enabled ? 'enabled' : 'disabled';
            await client.say(channel, `@${context.username} Auto-shoutout is currently ${status}.`);
            return true;
        }
        
        const toggle = args[3].toLowerCase();
        if (toggle === 'on' || toggle === 'enable' || toggle === 'true') {
            shoutoutConfig.autoShoutout.enabled = true;
            await client.say(channel, `@${context.username} Auto-shoutout has been enabled.`);
        } else if (toggle === 'off' || toggle === 'disable' || toggle === 'false') {
            shoutoutConfig.autoShoutout.enabled = false;
            await client.say(channel, `@${context.username} Auto-shoutout has been disabled.`);
        } else {
            await client.say(channel, `@${context.username} Invalid option. Use 'on' or 'off'.`);
            return true;
        }
        
        // Save the updated configuration
        fs.writeFileSync(shoutoutConfigPath, JSON.stringify(shoutoutConfig, null, 2));
        return true;
    }

    // If we get here, the subcommand wasn't recognized
    await client.say(channel, `@${context.username} Unknown shoutout plugin command. Available commands: autoshoutout`);
    return true;
} 