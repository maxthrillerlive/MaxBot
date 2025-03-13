require('dotenv').config();
const tmi = require('tmi.js');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const commandManager = require('./commandManager');
const logger = require('./logger');
const { spawn } = require('child_process');

// Add this line to define startTime
const startTime = Date.now();

// Create WebSocket server
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

// Move lock file to project root directory
const lockFile = path.join(__dirname, '..', 'bot.lock');
console.log('Lock file location:', lockFile);

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

// Define configuration options
const opts = {
    options: { 
        debug: true,
        messagesLogLevel: "info",
        skipMembership: true,  // Skip membership events
        skipUpdatingEmotesets: true  // Skip updating emote sets
    },
    connection: {
        reconnect: true,
        secure: true,
        timeout: 30000,
        reconnectDecay: 1.4,
        reconnectInterval: 1000,
        maxReconnectAttempts: 2
    },
    channels: [
        process.env.CHANNEL_NAME
    ],
    identity: {
        username: process.env.BOT_USERNAME,
        password: process.env.CLIENT_TOKEN
    }
};

// Create a client with our options
const client = new tmi.client(opts);

// After creating the client but before using it
const originalSay = client.say;
client.say = async function(channel, message) {
    // Call the original method
    await originalSay.call(this, channel, message);
    
    // Only broadcast if this isn't a duplicate (use a simple cache)
    const cacheKey = `${channel}-${message}-${Date.now()}`;
    if (!messageCache.has(cacheKey)) {
        messageCache.set(cacheKey, { timestamp: Date.now() });
        
        // Clean up after a short delay
        setTimeout(() => {
            messageCache.delete(cacheKey);
        }, 1000);
        
        console.log(`[BOT] Sending message to ${channel}: ${message}`);
        
        // Broadcast the message to all connected clients
        broadcastToAll({
            type: 'CHAT_MESSAGE',
            data: {
                channel: channel,
                username: process.env.BOT_USERNAME,
                message: message,
                badges: { bot: '1' },  // Add a bot badge
                timestamp: Date.now(),
                id: 'bot-response-' + Date.now()
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
            
            const status = {
                type: 'STATUS',
                data: {
                    connectionState: client ? 'OPEN' : 'CLOSED',
                    username: process.env.BOT_USERNAME,
                    processId: process.pid,
                    channels: client ? client.getChannels() : [],
                    uptime: Math.floor((Date.now() - startTime) / 1000),
                    memory: process.memoryUsage(),
                    commands: commands
                }
            };
            
            ws.send(JSON.stringify(status));
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
            case 'RESTART_BOT':
                // Only the client that sent the restart command will be affected
                ws.send(JSON.stringify({
                    type: 'CONNECTION_STATE',
                    state: 'restarting'
                }));
                await handleRestart();
                break;
            case 'EXIT_BOT':
                // Only exit if explicitly requested
                ws.send(JSON.stringify({
                    type: 'CONNECTION_STATE',
                    state: 'shutting_down'
                }));
                await handleExit();
                break;
            case 'CHAT_COMMAND':
                if (data.message && data.channel) {
                    try {
                        // Check if this is a command (starts with !)
                        if (data.message.startsWith('!')) {
                            // This is a command, let the command manager handle it
                            console.log(`[CONTROL] Treating message as command: ${data.message}`);
                            
                            // We don't need to broadcast here - the command response will be 
                            // captured by our client.say wrapper
                            
                            const result = await commandManager.handleCommand(
                                client,
                                data.channel,
                                { username: process.env.BOT_USERNAME },
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
                            
                            // The message will be broadcast by our client.say wrapper
                            await client.say(data.channel, data.message);
                            
                            ws.send(JSON.stringify({
                                type: 'COMMAND_RESULT',
                                success: true,
                                command: 'chat',
                                message: data.message
                            }));
                        }
                    } catch (error) {
                        console.error('Error handling chat message/command:', error);
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            error: 'Failed to process message: ' + error.message
                        }));
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        error: 'Missing message or channel for CHAT_COMMAND'
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
        ws.send(JSON.stringify({ type: 'ERROR', error: error.message }));
    }
}

// Add chat message broadcasting
client.on('message', (channel, tags, message, self) => {
    if (self) return;

    // Log chat message
    logger.chat(tags.username, message, channel);

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
});

// Broadcast connection state changes
client.on('connecting', () => {
    broadcastToAll({
        type: 'CONNECTION_STATE',
        state: 'connecting'
    });
});

client.on('connected', () => {
    broadcastToAll({
        type: 'CONNECTION_STATE',
        state: 'connected'
    });
});

client.on('disconnected', (reason) => {
    logger.error(`Disconnected: ${reason}`);
    broadcastToAll({
        type: 'CONNECTION_STATE',
        state: 'disconnected'
    });
});

// Graceful shutdown handling
let isShuttingDown = false;  // Add flag to prevent multiple shutdown attempts

async function shutdown(signal) {
    if (isShuttingDown) return;  // If already shutting down, ignore additional signals
    isShuttingDown = true;

    console.log(`\nReceived ${signal}. Disconnecting bot...`);
    try {
        // Save command states before disconnecting
        commandManager.saveState();
        // Clean up the lock file
        cleanupLockFile();
        // Disconnect from Twitch
        await client.disconnect();
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

client.connect()
    .catch(err => {
        console.error('Connection failed:', err);
        if (err.message.includes('authentication failed')) {
            console.error('Please check your CLIENT_TOKEN in .env file and make sure it starts with "oauth:"');
            console.error('You can get a new token by running: npm run auth');
        }
    });

// Register event handlers
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

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

    // Remove whitespace from chat message
    const commandText = msg.trim().toLowerCase();
    
    // Check if the message is actually a command
    if (!commandText.startsWith('!')) {
        return; // Not a command, ignore
    }

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
        if (commandText.startsWith('!enable ')) {
            const commandName = commandText.split(' ')[1];
            if (commandManager.enableCommand(commandName)) {
                await client.say(target, `Enabled command: ${commandName}`);
            }
            return; // Exit after handling mod command
        }

        if (commandText.startsWith('!disable ')) {
            const commandName = commandText.split(' ')[1];
            if (commandManager.disableCommand(commandName)) {
                await client.say(target, `Disabled command: ${commandName}`);
            }
            return; // Exit after handling mod command
        }
    }

    // Handle regular commands
    try {
        console.log(`[DEBUG] Attempting to handle command via CommandManager`);
        const handled = await commandManager.handleCommand(client, target, context, commandText);
        console.log(`[DEBUG] Command handled: ${handled}`);
    } catch (error) {
        console.error('Error handling command:', error);
        await client.say(target, `@${context.username} Sorry, there was an error processing your command.`);
    }
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, port) {
    logger.info(`Connected to ${addr}:${port}`);
    const commands = commandManager.listCommands();
    console.log('Available commands:', commands.map(cmd => ({ name: cmd.name, trigger: cmd.trigger, enabled: cmd.enabled })));
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
        
        console.log('Spawning new process...');
        
        // Get the current script path
        const scriptPath = path.resolve(__dirname, 'index.js');
        
        // Spawn a new process with the same arguments
        const child = spawn('node', [scriptPath], {
            detached: true,
            stdio: 'inherit',
            env: process.env
        });
        
        // Unref the child to allow the parent to exit
        child.unref();
        
        console.log('New process spawned. Exiting...');
        
        // Exit after a short delay to allow messages to be sent
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    } catch (error) {
        console.error('Error during restart:', error);
        process.exit(1);
    }
}

process.on('RESTART_BOT', async () => {
    console.log('Received restart signal. Restarting bot...');
    
    // Notify all connected clients
    broadcastToAll({
        type: 'CONNECTION_STATE',
        state: 'restarting'
    });
    
    try {
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
        
        console.log('Spawning new process...');
        
        // Get the current script path
        const scriptPath = path.resolve(__dirname, 'index.js');
        
        // Spawn a new process with the same arguments
        const child = spawn('node', [scriptPath], {
            detached: true,
            stdio: 'inherit',
            env: process.env
        });
        
        // Unref the child to allow the parent to exit
        child.unref();
        
        console.log('New process spawned. Exiting...');
        
        // Exit after a short delay to allow messages to be sent
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    } catch (error) {
        console.error('Error during restart:', error);
        process.exit(1);
    }
}); 