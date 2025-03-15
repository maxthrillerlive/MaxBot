require('dotenv').config();
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const commandManager = require('./commandManager');
const logger = require('./logger');
const { spawn } = require('child_process');
const twitchAuth = require('./twitch-auth'); // Import the new Twitch auth module
const PluginManager = require('./pluginManager'); // Import the plugin manager
const ConfigManager = require('./config-manager'); // Import the configuration manager

// Add this line to define startTime
const startTime = Date.now();

// Initialize configuration manager
const configManager = new ConfigManager(logger);

// Initialize plugin manager with logger and config manager
const pluginManager = new PluginManager(logger, configManager);

// Create WebSocket server with port from config
const wsPort = configManager.get('webcp.wsPort', process.env.PORT || 8080);
const wss = new WebSocket.Server({ port: wsPort });
console.log(`WebSocket server starting on port ${wsPort}`);

// Move lock file to project root directory
const lockFile = path.join(__dirname, '..', 'bot.lock');
console.log('Lock file location:', lockFile);

// Check for restart log to see if we were restarted
const restartLogPath = path.join(__dirname, '..', 'restart.log');
if (fs.existsSync(restartLogPath)) {
    console.log('Found restart log, bot was restarted by restart script');
    try {
        // Read the log to see when the restart happened
        const logContent = fs.readFileSync(restartLogPath, 'utf8');
        const lastLine = logContent.trim().split('\n').pop();
        console.log('Last restart log entry:', lastLine);
        
        // Don't delete the log file, it might be useful for debugging
    } catch (error) {
        console.error('Error reading restart log:', error);
    }
}

try {
    // Check if lock file exists and if the process is still running
    if (fs.existsSync(lockFile)) {
        const pid = fs.readFileSync(lockFile, 'utf8');
        console.log('Found existing lock file with PID:', pid);
        try {
            // Try to send a signal to the process to see if it's running
            process.kill(parseInt(pid), 0);
            console.error('Error: Bot is already running (PID: ' + pid + ')');
            console.error('Lock file location:', lockFile);
            console.error('If you\'re sure no other instance is running, delete the bot.lock file and try again');
            process.exit(1);
        } catch (e) {
            // Process not found, safe to continue
            console.log('Found stale lock file, removing...');
            fs.unlinkSync(lockFile);
        }
    }
    // Create lock file with current process ID
    fs.writeFileSync(lockFile, process.pid.toString());
    console.log('Created lock file with PID:', process.pid);
} catch (error) {
    console.error('Error checking/creating lock file:', error);
    process.exit(1);
}

// Clean up lock file on exit
function cleanupLockFile() {
    try {
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
        }
    } catch (error) {
        console.error('Error removing lock file:', error);
    }
}

// Register cleanup handlers
process.on('exit', () => {
    if (!isShuttingDown) {
        cleanupLockFile();
    }
});

// Handle different shutdown signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, () => {
        console.log(`\nReceived ${signal}`);
        shutdown(signal);
    });
});

// Remove any existing handlers for these signals
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');
process.removeAllListeners('SIGQUIT');

// Re-register our handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGQUIT', () => shutdown('SIGQUIT'));

// Validate environment variables
if (!process.env.BOT_USERNAME) {
    console.error('Error: BOT_USERNAME is not set in .env file');
    process.exit(1);
}
if (!process.env.CLIENT_TOKEN || !process.env.CLIENT_TOKEN.startsWith('oauth:')) {
    console.error('Error: CLIENT_TOKEN must start with "oauth:" in .env file');
    process.exit(1);
}
if (!process.env.CHANNEL_NAME) {
    console.error('Error: CHANNEL_NAME is not set in .env file');
    process.exit(1);
}

// Initialize the Twitch client using our new module
const client = twitchAuth.initializeTwitchClient();

// After creating the client but before using it
const originalSay = client.say;
client.say = async function(target, message) {
    // Create a message object for plugin processing
    const messageObj = {
        target,
        message
    };
    
    // Process the message through plugins (for outgoing translation)
    const processedMessages = await pluginManager.processOutgoingMessage(messageObj);
    
    // Send each processed message
    for (const msg of processedMessages) {
        await originalSay.call(client, msg.target, msg.message);
        
        // Broadcast the bot's message to all WebCP clients
        broadcastToAll({
            type: 'CHAT_FROM_TWITCH',
            username: process.env.BOT_USERNAME || 'MaxBot',
            message: msg.message,
            channel: msg.target,
            badges: {
                broadcaster: "0",
                moderator: "1",
                bot: "1"
            }
        });
    }
};

// WebSocket heartbeat implementation
wss.on('connection', (ws) => {
    console.log('Control panel connected');
    
    // Set up heartbeat for this connection
    ws.isAlive = true;
    ws.on('pong', () => {
        // Mark the connection as alive when pong is received
        ws.isAlive = true;
    });
    
    // Send initial status
    sendStatus(ws);
    
    // Set up a ping interval for this specific connection
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                // Send a ping frame (not a message)
                ws.ping();
            } catch (error) {
                console.error('Error sending ping:', error);
                clearInterval(pingInterval);
            }
        } else {
            clearInterval(pingInterval);
        }
    }, 30000);
    
    // Set up a status update interval for this specific connection
    const statusInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                sendStatus(ws);
            } catch (error) {
                console.error('Error sending status update:', error);
                clearInterval(statusInterval);
            }
        } else {
            clearInterval(statusInterval);
        }
    }, 10000); // Send status every 10 seconds
    
    // Handle messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Add logging to see what's being received
            console.log('Received message:', data);
            
            // Reset the isAlive flag on any message received
            ws.isAlive = true;
            
            // Make sure the message has a type
            if (!data.type) {
                console.error('Received message without type:', data);
                ws.send(JSON.stringify({ 
                    type: 'ERROR', 
                    error: 'Message missing type field' 
                }));
                return;
            }
            
            // Handle ping messages
            if (data.type === 'ping') {
                ws.isAlive = true; // Mark as alive
                ws.send(JSON.stringify({ 
                    type: 'pong',
                    timestamp: Date.now(),
                    client_id: data.client_id || 'unknown'
                }));
                return;
            }
            
            // Handle info requests
            if (data.type === 'info' || data.type === 'status_request' || data.type === 'GET_STATUS') {
                ws.isAlive = true; // Mark as alive
                sendStatus(ws);
                return;
            }
            
            // Handle other message types
            handleWebSocketMessage(ws, data);
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'ERROR',
                error: error.message
            }));
        }
    });
    
    // Handle close
    ws.on('close', () => {
        console.log('Control panel disconnected');
        clearInterval(pingInterval);
        clearInterval(statusInterval);
    });
    
    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clearInterval(pingInterval);
    });
});

// Global heartbeat interval to check for stale connections
const heartbeatInterval = setInterval(() => {
    console.log('Checking for stale connections...');
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Terminating stale connection');
            return ws.terminate();
        }
        
        ws.isAlive = false;
        try {
            ws.ping();
        } catch (e) {
            // If ping fails, terminate the connection
            console.error('Error sending ping, terminating connection:', e.message);
            ws.terminate();
        }
    });
}, 60000); // Check every 60 seconds instead of 30

// Clean up interval on server close
wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

function sendError(ws, message) {
    ws.send(JSON.stringify({
        type: 'ERROR',
        error: message
    }));
}

function sendCommandList(ws) {
    ws.send(JSON.stringify({
        type: 'COMMANDS',
        data: commandManager.listCommands()
    }));
}

// Add a function to periodically check the Twitch connection status
async function checkTwitchConnection() {
    // Connection check disabled - always return true
    console.log('Connection check disabled, assuming connected');
    return true;
    
    // Original code commented out
    /*
    if (!client) {
        console.log('Client not initialized, cannot check Twitch connection');
        return false;
    }
    
    try {
        // Check if we have an established connection to Twitch
        const isConnected = client.readyState === 'OPEN' || client.readyState === 1;
        
        // Log the current connection state
        console.log('Checking Twitch connection status:', 
            isConnected ? 'Connected' : 'Disconnected', 
            'ReadyState:', client.readyState);
        
        // If we think we're connected, verify by checking the actual network connection
        if (isConnected) {
            // Check if we have an active connection to any of the Twitch IRC servers
            const twitchConnections = await checkActiveTwitchConnections();
            console.log('Active Twitch connections:', twitchConnections ? 'Yes' : 'No');
            
            if (!twitchConnections) {
                console.log('No active Twitch connections found despite client reporting connected state');
                // Force reconnection if needed
                await handleTwitchReconnection();
                return false;
            }
            
            // If we have active connections, update the connection state
            broadcastToAll({
                type: 'CONNECTION_STATE',
                state: 'Connected',
                timestamp: Date.now()
            });
            
            return true;
        } else {
            // If we're not connected according to the client, try to reconnect
            console.log('Client reports disconnected state, attempting to reconnect');
            await handleTwitchReconnection();
            return false;
        }
    } catch (error) {
        console.error('Error checking Twitch connection:', error);
        return false;
    }
    */
}

// Check for active connections to Twitch IRC servers using /query command
function checkActiveTwitchConnections() {
    // Connection check disabled - always return true
    return Promise.resolve(true);
    
    // Original code commented out
    /*
    try {
        if (!client || (client.readyState !== 'OPEN' && client.readyState !== 1)) {
            console.log('Client not connected, cannot perform connection check');
            return false;
        }
        
        // Use the PRIVMSG command to send a message to the bot itself
        // This is a standard IRC command that will work with Twitch's IRC interface
        const botUsername = process.env.BOT_USERNAME;
        console.log(`Sending PRIVMSG to ${botUsername} to verify Twitch connection`);
        
        // We'll use a promise to handle the async nature of this check
        return new Promise((resolve) => {
            // Set up a temporary handler for the notice event
            const noticeHandler = (channel, msgid, message) => {
                console.log(`Received notice: ${msgid} - ${message}`);
                
                // If we get a "not connected" notice, we're not connected
                if (message.includes('Not connected to server')) {
                    console.log('Received "Not connected to server" notice, connection is down');
                    client.removeListener('notice', noticeHandler);
                    resolve(false);
                }
            };
            
            // Set up a temporary handler for any error events
            const errorHandler = (error) => {
                console.log(`Received error during connection check: ${error}`);
                client.removeListener('notice', noticeHandler);
                client.removeListener('error', errorHandler);
                resolve(false);
            };
            
            // Set up a handler for message responses (including our own message)
            const messageHandler = (channel, tags, message, self) => {
                // If we receive any message, including our own test message, we're connected
                console.log(`Received message during connection check: ${message} (self: ${self})`);
                client.removeListener('notice', noticeHandler);
                client.removeListener('error', errorHandler);
                client.removeListener('message', messageHandler);
                resolve(true);
            };
            
            // Add the temporary handlers
            client.on('notice', noticeHandler);
            client.on('error', errorHandler);
            client.on('message', messageHandler);
            
            // Send the PRIVMSG command
            // Format: PRIVMSG <target> :<message>
            const connectionTestMessage = `Connection test ${Date.now()}`;
            client.raw(`PRIVMSG ${botUsername} :${connectionTestMessage}`);
            
            // Set a timeout to resolve the promise if we don't get a response
            setTimeout(() => {
                console.log('No response to PRIVMSG command, assuming connection is down');
                client.removeListener('notice', noticeHandler);
                client.removeListener('error', errorHandler);
                client.removeListener('message', messageHandler);
                resolve(false);
            }, 5000);
        });
    } catch (error) {
        console.error('Error checking active Twitch connections:', error);
        return false;
    }
    */
}

// Handle reconnection to Twitch if needed
async function handleTwitchReconnection() {
    console.log('Attempting to reconnect to Twitch...');
    
    try {
        // Disconnect first if we're in a bad state
        await client.disconnect();
        console.log('Successfully disconnected, now reconnecting...');
        
        // Wait a moment before reconnecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Reconnect
        await client.connect();
        console.log('Successfully reconnected to Twitch');
        
        // Broadcast the updated connection state
        broadcastToAll({
            type: 'CONNECTION_STATE',
            state: 'Connected',
            timestamp: Date.now()
        });
        
        // Update all clients with the new status
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    sendStatus(client);
                } catch (error) {
                    console.error('Error sending status after reconnect:', error);
                }
            }
        });
        
        return true;
    } catch (error) {
        console.error('Error during reconnection:', error);
        
        // Broadcast the error
        broadcastToAll({
            type: 'ERROR',
            error: 'Failed to reconnect to Twitch: ' + error.message,
            timestamp: Date.now()
        });
        
        return false;
    }
}

// Set up periodic connection check (every minute)
// Disabled - we don't want to check the connection periodically
/*
const connectionCheckInterval = setInterval(() => {
    if (isShuttingDown) {
        clearInterval(connectionCheckInterval);
        return;
    }
    
    // Use async/await pattern with error handling
    (async () => {
        try {
            await checkTwitchConnection();
        } catch (error) {
            console.error('Error during periodic connection check:', error);
        }
    })();
}, 60000); // Check every minute
*/

// Update the sendStatus function to use the connection check
function sendStatus(ws) {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            // Get commands safely
            let commands = [];
            try {
                // Try listCommands first
                commands = commandManager.listCommands();
            } catch (cmdError) {
                console.error('Error getting commands:', cmdError);
                commands = [];
            }
            
            // Calculate uptime
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            
            // Get connection details from the Twitch auth module
            const connectionDetails = twitchAuth.getConnectionDetails();
            const twitchState = twitchAuth.getConnectionState();
            
            console.log('Current Twitch connection state:', twitchState, 'ReadyState:', connectionDetails.readyStateText);
            
            // Create a more comprehensive status object
            const status = {
                type: 'STATUS',
                data: {
                    connectionState: twitchState,
                    connectionDetails: connectionDetails,
                    username: process.env.BOT_USERNAME,
                    processId: process.pid,
                    channels: connectionDetails.channels,
                    uptime: uptime,
                    memory: process.memoryUsage(),
                    commands: commands,
                    timestamp: Date.now()
                }
            };
            
            console.log('Sending status update to control panel');
            ws.send(JSON.stringify(status));
            
            // Also send a separate connection state message for clarity
            ws.send(JSON.stringify({
                type: 'CONNECTION_STATE',
                state: twitchState,
                details: connectionDetails,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('Error sending status:', error);
        }
    }
}

function broadcastToAll(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Error broadcasting message:', error);
            }
        }
    });
}

async function handleWebSocketMessage(ws, data) {
    try {
        switch (data.type) {
            case 'GET_STATUS':
                sendStatus(ws);
                break;
            case 'GET_COMMANDS':
                ws.send(JSON.stringify({
                    type: 'COMMANDS',
                    data: commandManager.listCommands()
                }));
                break;
            case 'ENABLE_COMMAND':
                if (commandManager.enableCommand(data.command)) {
                    broadcastToAll({
                        type: 'COMMAND_ENABLED',
                        command: data.command
                    });
                }
                break;
            case 'DISABLE_COMMAND':
                if (commandManager.disableCommand(data.command)) {
                    broadcastToAll({
                        type: 'COMMAND_DISABLED',
                        command: data.command
                    });
                }
                break;
            // Add support for COMMAND message type from MaxBot-WebCP
            case 'COMMAND':
                if (data.command) {
                    console.log(`Received COMMAND message: ${data.command}`);
                    // Check if this is a command (starts with !) or a regular message
                    if (data.command.startsWith('!')) {
                        // This is a command, broadcast it first
                        const channel = data.channel || process.env.CHANNEL_NAME;
                        broadcastToAll({
                            type: 'CHAT_FROM_TWITCH',
                            username: process.env.BOT_USERNAME || 'MaxBot',
                            message: data.command,
                            channel: channel,
                            badges: {
                                broadcaster: "0",
                                moderator: "1",
                                bot: "1"
                            }
                        });
                        
                        // Then handle it normally
                        const result = await commandManager.handleCommand(
                            client,
                            channel,
                            { username: process.env.BOT_USERNAME },
                            data.command
                        );
                        ws.send(JSON.stringify({
                            type: 'COMMAND_RESULT',
                            success: result,
                            command: data.command
                        }));
                    } else {
                        // This is a regular chat message, send it directly
                        try {
                            const channel = data.channel || process.env.CHANNEL_NAME;
                            await client.say(channel, data.command);
                            ws.send(JSON.stringify({
                                type: 'COMMAND_RESULT',
                                success: true,
                                command: 'chat',
                                message: data.command
                            }));
                        } catch (error) {
                            console.error('Error sending chat message:', error);
                            ws.send(JSON.stringify({
                                type: 'COMMAND_RESULT',
                                success: false,
                                command: 'chat',
                                error: error.message
                            }));
                        }
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: 'Missing command for COMMAND message'
                    }));
                }
                break;
            // Add support for CHAT message type from MaxBot-WebCP
            case 'CHAT':
                if (data.message) {
                    console.log(`Received CHAT message: ${data.message}`);
                    try {
                        const channel = data.channel || process.env.CHANNEL_NAME;
                        // Check if this is a command (starts with !)
                        if (data.message.startsWith('!')) {
                            // This is a command, broadcast it first
                            broadcastToAll({
                                type: 'CHAT_FROM_TWITCH',
                                username: process.env.BOT_USERNAME || 'MaxBot',
                                message: data.message,
                                channel: channel,
                                badges: {
                                    broadcaster: "0",
                                    moderator: "1",
                                    bot: "1"
                                }
                            });
                            
                            // Then let the command manager handle it
                            console.log(`[CONTROL] Treating message as command: ${data.message}`);
                            
                            // Create a context object for the command
                            const context = {
                                username: process.env.BOT_USERNAME,
                                badges: {
                                    broadcaster: "0",
                                    moderator: "1",
                                    bot: "1"
                                }
                            };
                            
                            // Handle the command
                            const result = await commandManager.handleCommand(
                                client,
                                channel,
                                context,
                                data.message
                            );
                            
                            ws.send(JSON.stringify({
                                type: 'COMMAND_RESULT',
                                success: result,
                                command: data.message
                            }));
                        } else {
                            // This is a regular chat message, just send it
                            console.log(`[CONTROL] Sending chat message: ${data.message}`);
                            
                            await client.say(channel, data.message);
                            
                            ws.send(JSON.stringify({
                                type: 'COMMAND_RESULT',
                                success: true,
                                command: 'chat',
                                message: data.message
                            }));
                        }
                    } catch (error) {
                        console.error('Error handling chat message:', error);
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            error: 'Failed to process message: ' + error.message
                        }));
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: 'Missing message for CHAT message'
                    }));
                }
                break;
            // Add support for ADMIN_COMMAND message type from MaxBot-WebCP
            case 'ADMIN_COMMAND':
                console.log(`Received ADMIN_COMMAND: ${data.command}`);
                if (data.command === 'RESTART') {
                    // Send acknowledgment to the client
                    ws.send(JSON.stringify({
                        type: 'CONNECTION_STATE',
                        state: 'restarting'
                    }));
                    
                    // Broadcast to all clients
                    broadcastToAll({
                        type: 'CONNECTION_STATE',
                        state: 'restarting'
                    });
                    
                    console.log('Received restart command from control panel');
                    
                    // Call the restart function
                    await handleRestart();
                } else if (data.command === 'SHUTDOWN') {
                    // Send acknowledgment to the client
                    ws.send(JSON.stringify({
                        type: 'CONNECTION_STATE',
                        state: 'shutting_down'
                    }));
                    
                    // Broadcast to all clients
                    broadcastToAll({
                        type: 'CONNECTION_STATE',
                        state: 'shutting_down'
                    });
                    
                    console.log('Received shutdown command from control panel');
                    
                    // Call the exit function
                    await handleExit();
                } else {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: `Unknown admin command: ${data.command}`
                    }));
                }
                break;
            case 'EXECUTE_COMMAND':
                if (data.command && data.channel) {
                    // Check if this is a command (starts with !) or a regular message
                    if (data.command.startsWith('!')) {
                        // This is a command, handle it normally
                        const result = await commandManager.handleCommand(
                            client,
                            data.channel,
                            { username: process.env.BOT_USERNAME },
                            data.command
                        );
                        ws.send(JSON.stringify({
                            type: 'COMMAND_RESULT',
                            success: result,
                            command: data.command
                        }));
                    } else {
                        // This is a regular chat message, send it directly
                        try {
                            await client.say(data.channel, data.command);
                            ws.send(JSON.stringify({
                                type: 'COMMAND_RESULT',
                                success: true,
                                command: 'chat',
                                message: data.command
                            }));
                        } catch (error) {
                            console.error('Error sending chat message:', error);
                            ws.send(JSON.stringify({
                                type: 'COMMAND_RESULT',
                                success: false,
                                command: 'chat',
                                error: error.message
                            }));
                        }
                    }
                }
                break;
            case 'GET_PLUGINS':
                // Get plugin status and send it back
                const pluginStatus = pluginManager.getPluginStatus();
                ws.send(JSON.stringify({
                    type: 'PLUGINS',
                    data: pluginStatus
                }));
                break;
                
            case 'ENABLE_PLUGIN':
                if (data.plugin) {
                    const success = pluginManager.enablePlugin(data.plugin);
                    ws.send(JSON.stringify({
                        type: 'PLUGIN_ENABLED',
                        plugin: data.plugin,
                        success: success
                    }));
                    
                    if (success) {
                        // Broadcast to all clients
                        broadcastToAll({
                            type: 'PLUGIN_ENABLED',
                            plugin: data.plugin
                        });
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: 'Missing plugin name for ENABLE_PLUGIN message'
                    }));
                }
                break;
                
            case 'DISABLE_PLUGIN':
                if (data.plugin) {
                    const success = pluginManager.disablePlugin(data.plugin);
                    ws.send(JSON.stringify({
                        type: 'PLUGIN_DISABLED',
                        plugin: data.plugin,
                        success: success
                    }));
                    
                    if (success) {
                        // Broadcast to all clients
                        broadcastToAll({
                            type: 'PLUGIN_DISABLED',
                            plugin: data.plugin
                        });
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: 'Missing plugin name for DISABLE_PLUGIN message'
                    }));
                }
                break;
                
            case 'CONFIGURE_PLUGIN':
                if (data.plugin && data.config) {
                    try {
                        const plugin = pluginManager.getPlugin(data.plugin);
                        if (plugin) {
                            // Log the configuration update attempt
                            logger.info(`Configuring plugin: ${data.plugin}`);
                            
                            // Use the plugin manager's savePluginConfig method to update and save the configuration
                            const success = pluginManager.savePluginConfig(data.plugin, data.config);
                            
                            // Send response to the client
                            ws.send(JSON.stringify({
                                type: 'PLUGIN_CONFIGURED',
                                plugin: data.plugin,
                                success: success,
                                timestamp: Date.now()
                            }));
                            
                            // Broadcast the configuration change to all clients if successful
                            if (success) {
                                logger.info(`Plugin ${data.plugin} configuration updated successfully`);
                                broadcastToAll({
                                    type: 'PLUGIN_CONFIGURED',
                                    plugin: data.plugin,
                                    timestamp: Date.now()
                                });
                            } else {
                                logger.warn(`Failed to update configuration for plugin ${data.plugin}`);
                            }
                        } else {
                            logger.warn(`Plugin ${data.plugin} not found for configuration update`);
                            ws.send(JSON.stringify({
                                type: 'ERROR',
                                error: `Plugin ${data.plugin} not found`,
                                timestamp: Date.now()
                            }));
                        }
                    } catch (error) {
                        logger.error(`Error configuring plugin ${data.plugin}: ${error.message}`);
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            error: `Error configuring plugin: ${error.message}`,
                            timestamp: Date.now()
                        }));
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: 'Missing plugin name or configuration for CONFIGURE_PLUGIN message',
                        timestamp: Date.now()
                    }));
                }
                break;
            case 'GET_CONFIG':
                // Send the current configuration
                try {
                    const config = configManager.getAll();
                    ws.send(JSON.stringify({
                        type: 'CONFIG',
                        data: config,
                        timestamp: Date.now()
                    }));
                } catch (error) {
                    console.error('Error getting configuration:', error);
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: 'Error getting configuration: ' + error.message
                    }));
                }
                break;
                
            case 'UPDATE_CONFIG':
                // Update the configuration
                if (data.config) {
                    try {
                        const success = configManager.update(data.config);
                        ws.send(JSON.stringify({
                            type: 'CONFIG_UPDATED',
                            success: success,
                            timestamp: Date.now()
                        }));
                        
                        // Broadcast the configuration change to all clients
                        if (success) {
                            broadcastToAll({
                                type: 'CONFIG_UPDATED',
                                timestamp: Date.now()
                            });
                        }
                    } catch (error) {
                        console.error('Error updating configuration:', error);
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            error: 'Error updating configuration: ' + error.message
                        }));
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: 'Missing configuration data for UPDATE_CONFIG message'
                    }));
                }
                break;
                
            default:
                ws.send(JSON.stringify({ 
                    type: 'ERROR', 
                    error: `Unknown message type: ${data.type}` 
                }));
        }
    } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({
            type: 'ERROR',
            error: 'Error processing message: ' + error.message
        }));
    }
}

// Register event handlers for Twitch client events
twitchAuth.registerEventHandlers({
    onConnecting: () => {
        console.log('Connecting to Twitch...');
        broadcastToAll({
            type: 'CONNECTION_STATE',
            state: 'connecting',
            timestamp: Date.now()
        });
    },
    onConnected: (address, port) => {
        console.log(`Connected to Twitch at ${address}:${port}`);
        broadcastToAll({
            type: 'CONNECTION_STATE',
            state: 'Connected',
            address: address,
            port: port,
            timestamp: Date.now()
        });
        
        // Also send a full status update to all clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    sendStatus(client);
                } catch (error) {
                    console.error('Error sending status after connect:', error);
                }
            }
        });
    },
    onDisconnected: (reason) => {
        logger.error(`Disconnected from Twitch: ${reason}`);
        broadcastToAll({
            type: 'CONNECTION_STATE',
            state: 'Disconnected',
            reason: reason,
            timestamp: Date.now()
        });
        
        // Also send a full status update to all clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    sendStatus(client);
                } catch (error) {
                    console.error('Error sending status after disconnect:', error);
                }
            }
        });
    },
    onMessage: (channel, tags, message, self) => {
        // Handle message event
        if (self) return;

        // Log chat message
        logger.chat(tags.username, message, channel);

        // Broadcast to all clients
        broadcastToAll({
            type: 'CHAT_MESSAGE',
            data: {
                channel,
                username: tags.username,
                message,
                badges: tags.badges,
                timestamp: Date.now(),
                id: tags.id
            }
        });
        
        // Also process as a command if needed
        onMessageHandler(channel, tags, message, self);
    }
});

// Graceful shutdown handling
let isShuttingDown = false;  // Add flag to prevent multiple shutdown attempts

async function shutdown(signal) {
    if (isShuttingDown) return;  // If already shutting down, ignore additional signals
    isShuttingDown = true;

    console.log(`\nReceived ${signal}. Disconnecting bot...`);
    try {
        // Set the shutdown flag in the Twitch auth module
        twitchAuth.setShutdownFlag(true);
        
        // No need to stop periodic connection checking anymore
        // twitchAuth.stopPeriodicConnectionCheck();
        
        // Save command states before disconnecting
        commandManager.saveState();
        
        // Clean up the lock file
        cleanupLockFile();
        
        // Disconnect from Twitch
        await twitchAuth.disconnect();
        
        console.log('Bot disconnected successfully.');
        
        // Force exit after a short delay if normal exit doesn't work
        setTimeout(() => {
            console.log('Force exiting...');
            process.exit(0);
        }, 1000);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Connect to Twitch
console.log('Connecting to Twitch...');
console.log('Bot username:', process.env.BOT_USERNAME);
console.log('Channel:', process.env.CHANNEL_NAME);
console.log('\nTo safely stop the bot, press Ctrl+C');

twitchAuth.connect()
    .then(() => {
        // Force reload commands to ensure they're all loaded
        commandManager.reloadAllCommands();
        console.log('Bot connected successfully.');
        
        // Start periodic connection checking
        twitchAuth.startPeriodicConnectionCheck(60000); // Check every minute
    })
    .catch(err => {
        console.error('Connection failed:', err);
        if (err.message.includes('authentication failed')) {
            console.error('Please check your CLIENT_TOKEN in .env file and make sure it starts with "oauth:"');
            console.error('You can get a new token by running: npm run auth');
        }
    });

// Message deduplication cache with message IDs
const messageCache = new Map();
const MESSAGE_CACHE_TTL = 2000; // 2 seconds TTL
const COMMAND_COOLDOWN = 1000; // 1 second cooldown between same commands

function addToMessageCache(context, commandText) {
    const now = Date.now();
    const key = `${context.username}-${commandText}`;
    const messageId = context['message-id'] || context.id;
    
    // Check for duplicate message ID
    if (messageCache.has(messageId)) {
        return false;
    }
    
    // Check for command spam
    const lastExecution = messageCache.get(key);
    if (lastExecution && (now - lastExecution.timestamp) < COMMAND_COOLDOWN) {
        return false;
    }
    
    // Add to cache with both message ID and timestamp
    messageCache.set(messageId, { timestamp: now });
    messageCache.set(key, { timestamp: now });
    
    // Cleanup old entries
    setTimeout(() => {
        messageCache.delete(messageId);
        messageCache.delete(key);
    }, MESSAGE_CACHE_TTL);
    
    return true;
}

// Called every time a message comes in
async function onMessageHandler(target, context, msg, self) {
    // Log all messages for debugging
    console.log(`[CHAT] ${self ? 'BOT' : context.username}: ${msg} (in ${target})`);
    
    // If it's a message from the bot, we don't need to process it as a command
    // The message will already be captured by our client.say wrapper
    if (self) return;

    // Create a message object for plugin processing
    const messageObj = {
        target,
        context,
        message: msg,
        self
    };

    // Process the message through plugins (for incoming translation)
    const processedMessage = await pluginManager.processIncomingMessage(messageObj);
    
    // Use the processed message
    const processedMsg = processedMessage.message;

    // Remove whitespace from chat message
    const commandText = processedMsg.trim().toLowerCase();
    
    // Check if the message is actually a command
    if (!commandText.startsWith('!')) {
        return; // Not a command, ignore
    }

    // Broadcast the command message to all WebCP clients before processing it
    broadcastToAll({
        type: 'CHAT_FROM_TWITCH',
        username: context.username,
        message: msg, // Use original message to preserve case
        channel: target,
        badges: context.badges || {}
    });

    // Check for duplicate messages and command spam
    if (!addToMessageCache(context, commandText)) {
        console.log(`[DEBUG] Duplicate or rate-limited command: ${commandText}`);
        return;
    }

    console.log(`[DEBUG] Processing command: ${commandText} from ${context.username}`);

    // Special commands for managing other commands
    const isBroadcaster = context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
    const isMod = context.mod || isBroadcaster || context.badges?.broadcaster === '1';

    // Handle mod commands first
    if (isMod) {
        // Add direct restart command handling
        if (commandText === '!restart') {
            await client.say(target, `@${context.username} Restarting the bot...`);
            console.log(`Restart command issued by ${context.username}`);
            
            // Wait a moment for the message to be sent before restarting
            setTimeout(async () => {
                await handleRestart();
            }, 1000);
            return; // Exit after handling restart command
        }
        
        if (commandText.startsWith('!enable ')) {
            const commandName = commandText.split(' ')[1];
            if (commandName.startsWith('plugin:')) {
                // Enable a plugin
                const pluginName = commandName.substring(7);
                if (pluginManager.enablePlugin(pluginName)) {
                    await client.say(target, `Enabled plugin: ${pluginName}`);
                } else {
                    await client.say(target, `Failed to enable plugin: ${pluginName}`);
                }
            } else {
                // Enable a regular command
                if (commandManager.enableCommand(commandName)) {
                    await client.say(target, `Enabled command: ${commandName}`);
                } else {
                    await client.say(target, `Failed to enable command: ${commandName}`);
                }
            }
            return; // Exit after handling mod command
        }
        
        if (commandText.startsWith('!disable ')) {
            const commandName = commandText.split(' ')[1];
            if (commandName.startsWith('plugin:')) {
                // Disable a plugin
                const pluginName = commandName.substring(7);
                if (pluginManager.disablePlugin(pluginName)) {
                    await client.say(target, `Disabled plugin: ${pluginName}`);
                } else {
                    await client.say(target, `Failed to disable plugin: ${pluginName}`);
                }
            } else {
                // Disable a regular command
                if (commandManager.disableCommand(commandName)) {
                    await client.say(target, `Disabled command: ${commandName}`);
                } else {
                    await client.say(target, `Failed to disable command: ${commandName}`);
                }
            }
            return; // Exit after handling mod command
        }
        
        // Add plugin list command
        if (commandText === '!plugins') {
            const plugins = pluginManager.getPluginStatus();
            if (plugins.length === 0) {
                await client.say(target, `@${context.username} No plugins loaded.`);
            } else {
                const pluginList = plugins.map(p => `${p.name} (${p.enabled ? 'enabled' : 'disabled'})`).join(', ');
                await client.say(target, `@${context.username} Loaded plugins: ${pluginList}`);
            }
            return; // Exit after handling mod command
        }
    }

    // Handle regular commands
    try {
        console.log(`[DEBUG] Attempting to handle command via CommandManager`);
        
        // Check for plugin commands first
        const pluginCommands = pluginManager.getPluginCommands();
        if (pluginCommands[commandText.split(' ')[0]]) {
            const command = pluginCommands[commandText.split(' ')[0]];
            const args = commandText.indexOf(' ') > -1 ? commandText.substring(commandText.indexOf(' ') + 1) : '';
            
            // Check if command is mod-only
            if (command.modOnly && !isMod) {
                await client.say(target, `@${context.username} This command is for moderators only.`);
                return;
            }
            
            // Execute the command
            await command.handler(client, target, context, args);
            console.log(`[DEBUG] Handled plugin command: ${commandText.split(' ')[0]}`);
            return;
        }
        
        // If not a plugin command, try regular commands
        const handled = await commandManager.handleCommand(client, target, context, commandText);
        console.log(`[DEBUG] Command handled: ${handled}`);
    } catch (error) {
        console.error('Error handling command:', error);
        await client.say(target, `@${context.username} Sorry, there was an error processing your command.`);
    }
}

async function handleExit() {
    console.log('Exiting bot...');
    
    // Clean up resources
    if (wss) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.close();
            }
        });
        
        wss.close(() => {
            console.log('WebSocket server closed');
        });
    }
    
    // Disconnect from Twitch
    if (client) {
        await client.disconnect();
        console.log('Disconnected from Twitch');
    }
    
    // Remove lock file
    try {
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
            console.log('Lock file removed');
        }
    } catch (err) {
        console.error('Error removing lock file:', err);
    }
    
    // Exit process
    process.exit(0);
}

async function handleRestart() {
    console.log('Received restart signal. Restarting bot...');
    
    // Notify all connected clients
    broadcastToAll({
        type: 'CONNECTION_STATE',
        state: 'restarting'
    });
    
    try {
        // Save command states before disconnecting
        commandManager.saveState();
        
        // Disconnect from Twitch
        if (client) {
            console.log('Disconnecting from Twitch...');
            await client.disconnect();
            console.log('Disconnected from Twitch');
        }
        
        // Close WebSocket server
        if (wss) {
            console.log('Closing WebSocket server...');
            wss.close();
            console.log('WebSocket server closed');
        }
        
        // Remove lock file
        if (fs.existsSync(lockFile)) {
            console.log('Removing lock file...');
            fs.unlinkSync(lockFile);
            console.log('Lock file removed');
        }
        
        // Create a restart script that will run independently
        const restartScriptPath = path.join(__dirname, '..', 'restart-bot.js');
        const scriptContent = `
        const { spawn } = require('child_process');
        const path = require('path');
        const fs = require('fs');
        
        // Log function
        function log(message) {
            console.log(new Date().toISOString() + ' - ' + message);
            fs.appendFileSync(path.join(__dirname, 'restart.log'), new Date().toISOString() + ' - ' + message + '\\n');
        }
        
        // Wait a moment to ensure the main process has exited
        setTimeout(() => {
            try {
                log('Restart script running...');
                
                // Path to the bot script
                const botPath = path.join(__dirname, 'MaxBot', 'index.js');
                log('Bot path: ' + botPath);
                
                // Check if the file exists
                if (!fs.existsSync(botPath)) {
                    log('ERROR: Bot file not found: ' + botPath);
                    process.exit(1);
                }
                
                // Get the current Node executable path
                const nodePath = process.execPath;
                log('Node executable: ' + nodePath);
                
                // Spawn the bot process
                const child = spawn(nodePath, [botPath], {
                    detached: true,
                    stdio: 'inherit',
                    env: process.env,
                    cwd: path.dirname(path.dirname(botPath)) // Set working directory to project root
                });
                
                child.on('error', (err) => {
                    log('ERROR: Failed to start bot: ' + err.message);
                });
                
                // Unref the child to allow this script to exit
                child.unref();
                
                log('Bot restarted with PID: ' + child.pid);
                
                // Exit this script
                setTimeout(() => {
                    process.exit(0);
                }, 1000);
            } catch (error) {
                log('ERROR: Error in restart script: ' + error.message);
                process.exit(1);
            }
        }, 2000);
        `;
        
        fs.writeFileSync(restartScriptPath, scriptContent);
        console.log('Created restart script at:', restartScriptPath);
        
        // Execute the restart script
        const { spawn } = require('child_process');
        const nodePath = process.execPath; // Get the current Node executable path
        
        const restartProcess = spawn(nodePath, [restartScriptPath], {
            detached: true,
            stdio: 'ignore',
            env: process.env
        });
        
        restartProcess.unref();
        console.log('Launched restart script with PID:', restartProcess.pid);
        
        console.log('Exiting main process...');
        
        // Exit after a short delay
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    } catch (error) {
        console.error('Error during restart:', error);
        process.exit(1);
    }
}

// Replace the existing RESTART_BOT event handler with this one
process.on('RESTART_BOT', async () => {
    console.log('Received RESTART_BOT event. Calling handleRestart()...');
    await handleRestart();
});

// Initialize the bot
async function initializeBot() {
    try {
        // ... existing initialization code ...
        
        // Load and initialize plugins
        pluginManager.setBot(client);
        pluginManager.loadPlugins();
        pluginManager.initPlugins();
        
        // Enable the translator plugin by default
        const translatorPlugin = pluginManager.getPlugin('translator');
        if (translatorPlugin) {
            logger.info('Enabling translator plugin by default');
            translatorPlugin.enable();
            logger.info('Translator plugin enabled by default');
        } else {
            logger.error('Translator plugin not found! Check if the plugin file exists in the plugins directory.');
            logger.info(`Available plugins: ${Array.from(pluginManager.getAllPlugins().map(p => p.name)).join(', ')}`);
        }
        
        // ... rest of initialization code ...
    } catch (error) {
        console.error('Error initializing bot:', error);
        logger.error(`Error initializing bot: ${error.message}`);
        logger.error(`Error stack: ${error.stack}`);
    }
}

// Add this code at the end of the file, after the initializeBot function
// Explicitly load and enable the translator plugin
try {
    const translatorPath = path.join(__dirname, 'plugins', 'translator.js');
    logger.info(`Loading translator plugin from: ${translatorPath}`);
    
    if (fs.existsSync(translatorPath)) {
        // Clear require cache to ensure we get fresh plugin code
        delete require.cache[require.resolve(translatorPath)];
        
        // Load the plugin
        const translatorPlugin = require(translatorPath);
        logger.info(`Translator plugin loaded: ${translatorPlugin.name} v${translatorPlugin.version}`);
        
        // Add the plugin to the plugin manager
        pluginManager.plugins.set(translatorPlugin.name, translatorPlugin);
        
        // Initialize the plugin
        if (typeof translatorPlugin.init === 'function') {
            translatorPlugin.init(client, logger);
            logger.info('Translator plugin initialized');
        }
        
        // Enable the plugin
        if (typeof translatorPlugin.enable === 'function') {
            translatorPlugin.enable();
            logger.info('Translator plugin enabled');
        }
        
        logger.info('Translator plugin setup complete');
    } else {
        logger.error(`Translator plugin file not found at: ${translatorPath}`);
    }
} catch (error) {
    logger.error(`Error setting up translator plugin: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
} 