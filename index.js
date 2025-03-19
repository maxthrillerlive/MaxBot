require('dotenv').config();
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { spawn } = require('child_process');
const fetch = require('node-fetch'); // Import fetch for Twitch API requests
const twitchAuth = require('./twitch-auth'); // Import the new Twitch auth module
const PluginManager = require('./pluginManager'); // Import the plugin manager
const ConfigManager = require('./configManager'); // Import the configuration manager
const EventEmitter = require('events');
const tmi = require('tmi.js');

// Add this line to define startTime
const startTime = Date.now();

// Initialize configuration manager
const configManager = new ConfigManager(logger);

// Initialize plugin manager with logger and config manager
const pluginManager = new PluginManager(logger, configManager);

// Get WebSocket port from config
const wsPort = configManager.get('webcp.wsPort', process.env.PORT || 8080);

// Declare WebSocket server variable in global scope
let wss;

// Add a helper function for consistent logging
function logInfo(message) {
    const time = new Date().toTimeString().substring(0, 8);
    console.log(`[${time}] \x1b[32minfo:\x1b[0m ${message}`);
}

// Move lock file to project root directory
const lockFile = path.join(__dirname, '..', 'bot.lock');
logInfo('Lock file location: ' + lockFile);

try {
    // Check if lock file exists and if the process is still running
    if (fs.existsSync(lockFile)) {
        const pid = fs.readFileSync(lockFile, 'utf8');
        logInfo('Found existing lock file with PID: ' + pid);
        try {
            // Try to send a signal to the process to see if it's running
            process.kill(parseInt(pid), 0);
            console.error('Error: Bot is already running (PID: ' + pid + ')');
            console.error('Lock file location:', lockFile);
            console.error('If you\'re sure no other instance is running, delete the bot.lock file and try again');
            process.exit(1);
        } catch (e) {
            // Process not found, safe to continue
            logInfo('Found stale lock file, removing...');
            fs.unlinkSync(lockFile);
        }
    }
    // Create lock file with current process ID
    fs.writeFileSync(lockFile, process.pid.toString());
    logInfo('Created lock file with PID: ' + process.pid);
    
    // Initialize WebSocket server here, after lock file check but before Twitch connection
    wss = new WebSocket.Server({ port: wsPort });
    logInfo(`WebSocket server starting on port ${wsPort}`);
    
    // WebSocket heartbeat implementation
    wss.on('connection', (ws) => {
        logInfo('Control panel connected');
        
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
                logInfo('Received message: ' + JSON.stringify(data));
                
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
            logInfo('Control panel disconnected');
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
        logInfo('Checking for stale connections...');
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                logInfo('Terminating stale connection');
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
    
} catch (error) {
    console.error('Error during initialization:', error);
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

// Direct plugin command handler - separate from the main message handler
client.on('message', async (channel, context, message, self) => {
    // Skip messages from the bot itself
    if (self) return;
    
    // Only process !plugin commands
    if (message.toLowerCase().startsWith('!plugin')) {
        logInfo(`Direct plugin handler: ${message}`);
        
        // Extract command parameters
        const params = message.trim().split(' ').slice(1);
        
        // Call the plugin command handler
        const result = await handlePluginCommand(client, channel, context, params);
        
        // Emit command completion event
        botObject.events.emit('command:after', {
            channel,
            tags: context,
            command: 'plugin',
            params,
            message,
            success: result !== false
        });
    }
});

// Direct message handler for Twitch chat
client.on('message', async (channel, tags, message, self) => {
    // Skip messages from the bot itself
    if (self) return;
    
    // Process commands (support both ! and ? prefixes)
    if (message.startsWith('!') || message.startsWith('?')) {
        // Skip if the message is already in cache (duplicate)
        if (!addToMessageCache(tags, message)) {
            return;
        }
        
        logInfo('DIRECT HANDLER: Processing command: ' + message);
        
        // Check if it's a help command first, since that's built-in
        if (message.toLowerCase().startsWith('!help') || message.toLowerCase().startsWith('?help')) {
            const params = message.trim().split(' ').slice(1);
            await handleHelpCommand(client, channel, tags, params);
            return;
        }
        
        // Use the plugin manager to handle other commands
        const result = await pluginManager.handleCommand(client, channel, tags, message);
        
        if (result) {
            logInfo('DIRECT HANDLER: Command executed successfully');
        } else {
            logInfo('DIRECT HANDLER: Command failed or not found');
        }
    } else {
        // Not a command, process through plugins
        const messageObj = {
            channel,
            tags,
            message,
            self
        };
        
        // Process the message through plugins
        await pluginManager.processIncomingMessage(messageObj);
    }
});

// Add a chat command handler for the bot
client.on('message', (channel, tags, message, self) => {
    // Ignore messages from the bot itself
    if (self) return;
    
    // Check if the message is a reload command - strip all invisible characters first
    const cleanMessage = message.replace(/\p{C}/gu, '').trim();
    
    if (cleanMessage === '!reload') {
        // Check if the user is the broadcaster or a moderator
        if (tags.badges && (tags.badges.broadcaster === '1' || tags.badges.moderator === '1')) {
            // Reload all plugins
            const results = pluginManager.reloadAllPlugins();
            
            if (results.success.length > 0) {
                client.say(channel, `Reloaded ${results.success.length} plugins successfully, ${results.failed.length} failed`);
            } else {
                client.say(channel, `Failed to reload any plugins`);
            }
        } else {
            // User doesn't have permission
            client.say(channel, `@${tags.username} You don't have permission to use this command`);
        }
        
        // Return here to prevent the message from being processed by the regular command handler
        return;
    }
    
    // Check if it's a reload command with a plugin name
    if (cleanMessage.startsWith('!reload ')) {
        // Check if the user is the broadcaster or a moderator
        if (tags.badges && (tags.badges.broadcaster === '1' || tags.badges.moderator === '1')) {
            // Get the plugin name - only keep alphanumeric characters, dashes, and underscores
            const parts = cleanMessage.split(' ');
            if (parts.length > 1) {
                const pluginName = parts[1].replace(/[^\w\-]/g, '').trim();
                
                if (pluginName && pluginName.length > 0) {
                    // Reload a specific plugin
                    const result = pluginManager.reloadPlugin(pluginName);
                    
                    if (result) {
                        client.say(channel, `Successfully reloaded plugin: ${pluginName}`);
                    } else {
                        client.say(channel, `Failed to reload plugin: ${pluginName}`);
                    }
                } else {
                    client.say(channel, `Invalid plugin name. Usage: !reload [pluginName]`);
                }
            }
        } else {
            // User doesn't have permission
            client.say(channel, `@${tags.username} You don't have permission to use this command`);
        }
        
        // Return here to prevent the message from being processed by the regular command handler
        return;
    }
});

// Create the bot object to share with plugins
const botObject = {
    client,
    pluginManager,
    logger,
    messageHandlers: [],
    events: new EventEmitter(), // Add event emitter for hooks
    onMessage: function(handler) {
        // Legacy handler - add to message handlers array
        this.messageHandlers.push(handler);
        
        // Log a deprecation warning
        logger.warn('onMessage is deprecated. Please use events.on("twitch:message") instead.');
        
        // Also register the handler with the event system for backward compatibility
        this.events.on('twitch:message', (data) => {
            try {
                handler(data.channel, data.tags, data.message, data.self);
            } catch (error) {
                logger.error('Error in message handler:', error);
            }
        });
    }
};

// Load plugins
pluginManager.loadPlugins();

// Set up event handlers for the Twitch client
client.on('connected', async (address, port) => {
  logger.info(`Connected to Twitch at ${address}:${port}`);
  
  // Create a properly configured bot object
  const fullBotObject = {
    ...botObject,
    client: client,  // Ensure the client is properly assigned
    pluginManager: pluginManager,
    logger: logger,
    configManager: configManager
  };
  
  // Initialize plugins with the bot object - now async
  try {
    await pluginManager.initPlugins(fullBotObject);
    logger.info('Plugin initialization complete');
    
    // Debug plugin status after initialization
    pluginManager.logPluginStatus();
    pluginManager.debugHelloPlugin();
    
    // Manually test the hello command (for debugging only)
    const helloPlugin = pluginManager.getPlugin('hello');
    if (helloPlugin) {
      logger.info('Found hello plugin, checking commands...');
      if (helloPlugin.commands && helloPlugin.commands.length > 0) {
        const helloCommand = helloPlugin.commands.find(cmd => cmd.name === 'hello');
        if (helloCommand) {
          logger.info('Found hello command, executing...');
          try {
            // Try executing with the plugin context for additional debug info
            const result = await helloCommand.execute.call(
              helloCommand, 
              client, 
              '#test', 
              { username: 'system_test', badges: { broadcaster: '1' } },
              '!hello'
            );
            logger.info(`Hello command test result: ${result}`);
    } catch (error) {
            logger.error('Error testing hello command:', error);
          }
        } else {
          logger.warn('Hello command not found in hello plugin');
        }
      } else {
        logger.warn('Hello plugin has no commands');
      }
    } else {
      logger.warn('Hello plugin not found');
    }
  } catch (error) {
    logger.error(`Error during plugin initialization: ${error.message}`);
  }
  
  // Emit connected event for plugins
  botObject.events.emit('twitch:connected', { address, port });
});

// Successfully joined channel
client.on('join', (channel, username, self) => {
  // Only handle events for our bot joining
  if (self) {
    const normalizedChannel = channel.toLowerCase();
    const targetChannel = '#' + process.env.CHANNEL_NAME.toLowerCase();
    
    logger.info(`Successfully joined channel ${channel}`);
    
    // Check if this is our target channel
    if (normalizedChannel === targetChannel) {
      logger.info(`Successfully joined channel #${process.env.CHANNEL_NAME}`);
      logger.info(`Bot connected and joined channel successfully.`);
      
      // Just emit the join event to notify plugins
      if (botObject && botObject.events) {
        botObject.events.emit('twitch:join', { channel, username, self });
      }
    }
  }
});

// Register onMessageHandler as the primary message handler
client.on('message', onMessageHandler);

// Emit events for various Twitch actions
client.on('subscription', (channel, username, method, message, userstate) => {
    botObject.events.emit('twitch:subscription', { 
        channel, username, method, message, userstate 
    });
});

client.on('resub', (channel, username, months, message, userstate, methods) => {
    botObject.events.emit('twitch:resub', { 
        channel, username, months, message, userstate, methods 
    });
});

client.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
    botObject.events.emit('twitch:subgift', { 
        channel, username, streakMonths, recipient, methods, userstate 
    });
});

client.on('cheer', (channel, userstate, message) => {
    botObject.events.emit('twitch:cheer', { 
        channel, userstate, message 
    });
});

client.on('raided', (channel, username, viewers) => {
    botObject.events.emit('twitch:raid', { 
        channel, username, viewers 
    });
});

client.on('part', (channel, username, self) => {
    if (self) {
        logger.info(`Left channel ${channel}`);
        botObject.events.emit('twitch:part', { channel, username, self });
    }
});

client.on('disconnected', (reason) => {
    logger.warn(`Disconnected from Twitch: ${reason}`);
    botObject.events.emit('twitch:disconnected', { reason });
});

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
        
        // Broadcast the bot's message to all WebCP clients if WebSocket server is initialized
        if (wss) {
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
    }
};

// Connect to Twitch and wait for channel join confirmation
twitchAuth.connectAndWaitForJoin()
    .then(() => {
        // Only proceed after we've successfully joined the channel
        logInfo('Bot connected and joined channel successfully.');
        
        // Now load and initialize plugins
        pluginManager.loadPlugins();
        
        // Create full bot object
        const fullBotObject = {
            ...botObject,
            client: client,
            pluginManager: pluginManager,
            logger: logger,
            configManager: configManager
        };
        
        // Initialize with the proper bot object
        pluginManager.initPlugins(fullBotObject)
            .then(() => {
                logger.info('Plugin initialization complete');
                pluginManager.logPluginStatus();
                pluginManager.debugHelloPlugin();
            })
            .catch(error => {
                logger.error(`Error during plugin initialization: ${error.message}`);
            });
        
        // Start periodic connection checking
        twitchAuth.startPeriodicConnectionCheck(60000); // Check every minute
        
        // Show the "safely stop" message after everything is loaded
        logInfo('\nTo safely stop the bot, press Ctrl+C');
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

// Update the onMessageHandler to emit events and handle legacy handlers
async function onMessageHandler(target, context, msg, self) {
    // Skip messages from the bot itself
    if (self) return;
    
    // Emit a raw message event for all messages
    botObject.events.emit('twitch:message', { 
        channel: target, 
        tags: context, 
        message: msg, 
        self 
    });
    
    // Process commands (support both ! and ? prefixes)
    if (msg.startsWith('!') || msg.startsWith('?')) {
        // Skip if the message is already in cache (duplicate)
        if (!addToMessageCache(context, msg)) {
            return;
        }
        
        // Extract command name and params
        const commandName = msg.trim().split(' ')[0].substring(1).toLowerCase();
        const params = msg.trim().split(' ').slice(1);
        
        logger.info(`Processing command '${commandName}' with params: ${params.join(', ')}`);
        
        // DIRECT HANDLER FOR HELLO - This bypasses all plugin systems
        if (commandName === 'hello' || commandName === 'hi' || commandName === 'hey') {
            logger.info(`DIRECT HANDLER: Executing hello command directly`);
            try {
                await client.say(target, `@${context.username} Hello there! (direct response)`);
                
                // Emit command completion event
                botObject.events.emit('command:after', { 
                    channel: target, 
                    tags: context, 
                    command: commandName, 
                    params,
                    message: msg,
                    success: true
                });
                
                return; // Stop further processing
            } catch (error) {
                logger.error(`Error in direct hello handler: ${error.message}`);
            }
        }
        
        // Emit command event before processing
        botObject.events.emit('command:before', { 
            channel: target, 
            tags: context, 
            command: commandName, 
            params,
            message: msg
        });
        
        // Handle help command
        if (commandName === 'help') {
            const result = await handleHelpCommand(client, target, context, params);
            
            // Emit command completion event
            botObject.events.emit('command:after', { 
                channel: target, 
                tags: context, 
                command: 'help', 
                params,
                message: msg,
                success: result
            });
            
        return;
    }

        // Handle plugin command
        if (commandName === 'plugin') {
            const result = await handlePluginCommand(client, target, context, params);
            
            // Emit command completion event
            botObject.events.emit('command:after', { 
                channel: target, 
                tags: context, 
                command: 'plugin', 
                params,
                message: msg,
                success: result
            });
            
            return;
        }
        
        // Handle debug command
        if (commandName === 'debug') {
            // Only moderators can use debug commands
            const isMod = context.mod || context.badges?.broadcaster === '1' || 
                      context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
            
            if (!isMod) {
                await client.say(target, `@${context.username} You need to be a moderator to use this command.`);
                
                // Emit command completion event
                botObject.events.emit('command:after', { 
                    channel: target, 
                    tags: context, 
                    command: 'debug', 
                    params,
                    message: msg,
                    success: false
                });
                
                return;
            }
            
            let result = true;
            const subCommand = params[0]?.toLowerCase();
            
            if (subCommand === 'plugins') {
                const plugins = pluginManager.getAllPlugins();
                if (!plugins || plugins.length === 0) {
                    await client.say(target, `@${context.username} No plugins are currently loaded.`);
                    return;
                }
                
                const pluginInfo = plugins.map(p => {
                    const commandCount = p.commands ? p.commands.length : 0;
                    const enabledStatus = p.config && p.config.enabled ? 'enabled' : 'disabled';
                    const errorStatus = p.config && p.config.errorState ? ' (ERROR)' : '';
                    return `${p.name}: ${enabledStatus}${errorStatus}, ${commandCount} commands`;
                }).join(', ');
                
                await client.say(target, `@${context.username} Loaded plugins: ${pluginInfo}`);
            } else if (subCommand === 'hello') {
                // Specific debugging for hello plugin
                const helloPlugin = pluginManager.getPlugin('hello');
                if (helloPlugin) {
                    const status = helloPlugin.config && helloPlugin.config.enabled ? 'enabled' : 'disabled';
                    const commandCount = helloPlugin.commands ? helloPlugin.commands.length : 0;
                    const commandNames = helloPlugin.commands ? helloPlugin.commands.map(c => c.name).join(', ') : 'none';
                    const errorState = helloPlugin.config && helloPlugin.config.errorState ? ' (ERROR: ' + helloPlugin.config.lastError + ')' : '';
                    
                    // Enable the plugin if it's not enabled
                    if (!helloPlugin.config || !helloPlugin.config.enabled) {
                        pluginManager.enablePlugin('hello');
                        await client.say(target, `@${context.username} Hello plugin was disabled, now enabled.`);
                    }
                    
                    await client.say(target, `@${context.username} Hello plugin: ${status}${errorState}, commands: ${commandCount} (${commandNames})`);
                    
                    // Test executing the hello command manually
                    if (commandCount > 0) {
                        const helloCommand = helloPlugin.commands.find(cmd => cmd.name === 'hello');
                        if (helloCommand) {
                            try {
                                const result = await helloCommand.execute.call(helloCommand, client, target, context, '!hello');
                                await client.say(target, `@${context.username} Manual hello command execution result: ${result}`);
                            } catch (error) {
                                logger.error('Error executing hello command manually:', error);
                                await client.say(target, `@${context.username} Error executing hello command manually: ${error.message}`);
                            }
                        }
                    }
                } else {
                    await client.say(target, `@${context.username} Hello plugin not found!`);
                }
            } else if (subCommand === 'errors') {
                const errorPlugins = pluginManager.getPluginsInErrorState();
                
                if (errorPlugins.length === 0) {
                    await client.say(target, `@${context.username} No plugins are currently in error state.`);
                } else {
                    const errorList = errorPlugins.map(p => `${p.name} (${p.error})`).join(', ');
                    await client.say(target, `@${context.username} Plugins in error state: ${errorList}`);
                }
            } else if (subCommand === 'reload') {
                // Attempt to reload all plugins
                logger.info(`Manually reloading all plugins through !debug reload command`);
                try {
                    // Reset the initialized flag if needed
                    pluginManager._initialized = false;
                    
                    // Recreate the full bot object
                    const fullBotObject = {
                        ...botObject,
                        client: client,
                        pluginManager: pluginManager,
                        logger: logger,
                        configManager: configManager
                    };
                    
                    // Reload the plugin files
                    pluginManager.loadPlugins();
                    pluginManager.logPluginStatus();
                    
                    // Reinitialize the plugins
                    await pluginManager.initPlugins(fullBotObject);
                    pluginManager.debugHelloPlugin();
                    
                    await client.say(target, `@${context.username} Reloaded and reinitialized all plugins`);
    } catch (error) {
                    logger.error(`Error reloading plugins:`, error);
                    await client.say(target, `@${context.username} Error reloading plugins: ${error.message}`);
                }
            } else if (subCommand === 'fixhello') {
                // Special command to fix hello plugin issues
                logger.info(`Attempting to fix hello plugin...`);
                
                try {
                    // Get the hello plugin
                    const helloPlugin = pluginManager.getPlugin('hello');
                    
                    if (!helloPlugin) {
                        await client.say(target, `@${context.username} Hello plugin not found!`);
                        return;
                    }
                    
                    // Reset its state
                    helloPlugin._initialized = false;
                    
                    // Recreate the bot object
                    const fullBotObject = {
                        ...botObject,
                        client: client,
                        pluginManager: pluginManager,
                        logger: logger,
                        configManager: configManager
                    };
                    
                    // Initialize just the hello plugin
                    helloPlugin.init(fullBotObject, logger);
                    
                    // Enable it
                    helloPlugin.config.enabled = true;
                    
                    // Log its state
                    pluginManager.debugHelloPlugin();
                    
                    await client.say(target, `@${context.username} Hello plugin has been reset and reinitialized`);
                } catch (error) {
                    logger.error(`Error fixing hello plugin:`, error);
                    await client.say(target, `@${context.username} Error fixing hello plugin: ${error.message}`);
                }
            } else {
                await client.say(target, `@${context.username} Debug commands: !debug plugins, !debug hello, !debug errors, !debug reload, !debug fixhello`);
                result = false;
            }
            
            // Emit command completion event
            botObject.events.emit('command:after', { 
                channel: target, 
                tags: context, 
                command: 'debug', 
                params,
                message: msg,
                success: result
            });
            
            return;
        }
        
        // If we reach here, it's not a built-in command, so try plugins
        logger.info(`Attempting to handle command ${commandName} via plugin manager`);
        const result = await pluginManager.handleCommand(client, target, context, msg);
        logger.info(`Plugin manager result for ${commandName}: ${result}`);
        
        // Emit command completion event
        botObject.events.emit('command:after', { 
            channel: target, 
            tags: context, 
            command: commandName, 
            params,
            message: msg,
            success: result
        });
        
        if (result) {
            logInfo('DIRECT HANDLER: Command executed successfully');
        } else {
            logInfo('DIRECT HANDLER: Command failed or not found');
        }
    } else {
        // Not a command, process through plugins
        const messageObj = {
            channel: target,
            tags: context,
            message: msg,
            self
        };
        
        // Process the message through plugins
        await pluginManager.processIncomingMessage(messageObj);
    }
}

async function handleExit() {
    logInfo('Exiting bot...');
    
    // Clean up resources
    if (wss) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.close();
            }
        });
        
        wss.close(() => {
            logInfo('WebSocket server closed');
        });
    }
    
    // Disconnect from Twitch
    if (client) {
        await client.disconnect();
        logInfo('Disconnected from Twitch');
    }
    
    // Remove lock file
    try {
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
            logInfo('Lock file removed');
        }
    } catch (err) {
        console.error('Error removing lock file:', err);
    }
    
    // Exit process
    process.exit(0);
}

async function handleRestart() {
    logInfo('Received restart signal. Restarting bot...');
    
    // Notify all connected clients
    broadcastToAll({
        type: 'CONNECTION_STATE',
        state: 'restarting'
    });
    
    try {
        // Disconnect from Twitch
        if (client) {
            logInfo('Disconnecting from Twitch...');
            await client.disconnect();
            logInfo('Disconnected from Twitch');
        }
        
        // Close WebSocket server
        if (wss) {
            logInfo('Closing WebSocket server...');
            wss.close();
            logInfo('WebSocket server closed');
        }
        
        // Remove lock file
        if (fs.existsSync(lockFile)) {
            logInfo('Removing lock file...');
            fs.unlinkSync(lockFile);
            logInfo('Lock file removed');
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
        logInfo('Created restart script at: ' + restartScriptPath);
        
        // Execute the restart script
        const { spawn } = require('child_process');
        const nodePath = process.execPath; // Get the current Node executable path
        
        const restartProcess = spawn(nodePath, [restartScriptPath], {
            detached: true,
            stdio: 'ignore',
            env: process.env
        });
        
        restartProcess.unref();
        logInfo('Launched restart script with PID: ' + restartProcess.pid);
        
        logInfo('Exiting main process...');
        
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
    logInfo('Received RESTART_BOT event. Calling handleRestart()...');
    await handleRestart();
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
        data: pluginManager.listCommands()
    }));
}

// Add a function to periodically check the Twitch connection status
async function checkTwitchConnection() {
    // Connection check disabled - always return true
    logInfo('Connection check disabled, assuming connected');
    return true;
    
    // Original code commented out
    /*
    if (!client) {
        logInfo('Client not initialized, cannot check Twitch connection');
        return false;
    }
    
    try {
        // Check if we have an established connection to Twitch
        const isConnected = client.readyState === 'OPEN' || client.readyState === 1;
        
        // Log the current connection state
        logInfo('Checking Twitch connection status: ' + 
            (isConnected ? 'Connected' : 'Disconnected') + 
            ' ReadyState: ' + client.readyState);
        
        // If we think we're connected, verify by checking the actual network connection
        if (isConnected) {
            // Check if we have an active connection to any of the Twitch IRC servers
            const twitchConnections = await checkActiveTwitchConnections();
            logInfo('Active Twitch connections: ' + (twitchConnections ? 'Yes' : 'No'));
            
            if (!twitchConnections) {
                logInfo('No active Twitch connections found despite client reporting connected state');
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
            logInfo('Client reports disconnected state, attempting to reconnect');
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
client.on('message', messageHandler);
            
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
    logInfo('Attempting to reconnect to Twitch...');
    
    try {
        // Disconnect first if we're in a bad state
        await client.disconnect();
        logInfo('Successfully disconnected, now reconnecting...');
        
        // Wait a moment before reconnecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Reconnect
        await client.connect();
        logInfo('Successfully reconnected to Twitch');
        
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
        await checkTwitchConnection();
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
                commands = pluginManager.listCommands();
            } catch (cmdError) {
                console.error('Error getting commands:', cmdError);
                commands = [];
            }
            
            // Calculate uptime
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            
            // Get connection details from the Twitch auth module
            const connectionDetails = twitchAuth.getConnectionDetails();
            const twitchState = twitchAuth.getConnectionState();
            
            logInfo('Current Twitch connection state: ' + twitchState + ' ReadyState: ' + connectionDetails.readyStateText);
            
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
            
            logInfo('Sending status update to control panel');
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
    // Check if WebSocket server exists before trying to broadcast
    if (!wss) {
        logInfo('WebSocket server not initialized yet, cannot broadcast: ' + data.type);
        return;
    }
    
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
                    data: pluginManager.listCommands()
                }));
                break;
            case 'ENABLE_COMMAND':
                if (pluginManager.enableCommand(data.command)) {
                    broadcastToAll({
                        type: 'COMMAND_ENABLED',
                        command: data.command
                    });
                }
                break;
            case 'DISABLE_COMMAND':
                if (pluginManager.disableCommand(data.command)) {
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
                    // Check if this is a command (starts with ! or ?) or a regular message
                    if (data.command.startsWith('!') || data.command.startsWith('?')) {
                        // Create a mock context for the command
                        const mockContext = {
                            username: 'WebCP',
                            mod: true,
                            badges: { broadcaster: '1' },
                            'message-type': 'chat'
                        };
                        
                        // Use the plugin manager to handle the command
                        const result = await pluginManager.handleCommand(
                            client, 
                            `#${process.env.CHANNEL_NAME}`, 
                            mockContext, 
                            data.command
                        );
                        
                        // Send the result back to the WebCP
                        ws.send(JSON.stringify({
                            type: 'COMMAND_RESULT',
                            success: !!result,
                            command: data.command
                        }));
                    } else {
                        // This is a regular message, send it to the channel
                        client.say(process.env.CHANNEL_NAME, data.command);
                        
                        // Send confirmation back to WebCP
                        ws.send(JSON.stringify({
                            type: 'MESSAGE_SENT',
                            message: data.command
                        }));
                    }
                }
                break;
            // Add support for CHAT message type from MaxBot-WebCP
            case 'CHAT':
                if (data.message) {
                    console.log(`Received CHAT message: ${data.message}`);
                    try {
                        const channel = data.channel || process.env.CHANNEL_NAME;
                        // Check if this is a command
                        console.log(`[CONTROL] Checking if message is a command: ${data.message}`);
                        
                        // Check if this is a command (starts with ! or ?)
                        if (data.message.startsWith('!') || data.message.startsWith('?')) {
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
                            const result = await pluginManager.handleCommand(
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
                    // Check if this is a command (starts with ! or ?) or a regular message
                    if (data.command.startsWith('!') || data.command.startsWith('?')) {
                        // Create a mock context for the command
                        const mockContext = {
                            username: 'WebCP',
                            mod: true,
                            badges: { broadcaster: '1' },
                            'message-type': 'chat'
                        };
                        
                        // This is a command, handle it normally
                        const result = await pluginManager.handleCommand(
                            client,
                            data.channel,
                            mockContext,
                            data.command
                        );
                        
                        ws.send(JSON.stringify({
                            type: 'COMMAND_RESULT',
                            success: !!result,
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
                
            case 'reload_plugin':
                if (data.pluginName) {
                    const result = pluginManager.reloadPlugin(data.pluginName);
                    ws.send(JSON.stringify({
                        type: 'reload_result',
                        success: result,
                        pluginName: data.pluginName
                    }));
                } else {
                    const results = pluginManager.reloadAllPlugins();
                    ws.send(JSON.stringify({
                        type: 'reload_all_result',
                        success: results.success.length > 0,
                        results: results
                    }));
                }
                break;
                
            case 'get_plugins':
                const plugins = pluginManager.getAllPlugins();
                ws.send(JSON.stringify({
                    type: 'plugins_list',
                    plugins: plugins
                }));
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
        // Don't log here - it's already logged in the connect function
        broadcastToAll({
            type: 'CONNECTION_STATE',
            state: 'connecting',
            timestamp: Date.now()
        });
    },
    onConnected: (address, port) => {
        // Don't log here - it's already logged in the connect function
        broadcastToAll({
            type: 'CONNECTION_STATE',
            state: 'Connected',
            address: address,
            port: port,
            timestamp: Date.now()
        });
        
        // Also send a full status update to all clients
        if (wss) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    try {
                        sendStatus(client);
                    } catch (error) {
                        console.error('Error sending status after connect:', error);
                    }
                }
            });
        }
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
        if (wss) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    try {
                        sendStatus(client);
                    } catch (error) {
                        console.error('Error sending status after disconnect:', error);
                    }
                }
            });
        }
    },
    onMessage: async (channel, tags, message, self) => {
        // Ignore messages from the bot itself
        if (self) {
            console.log('Ignoring message from self:', message);
            return;
        }

        // Log chat message
        logger.chat(tags.username, message, channel);
        console.log('Received message:', {
            channel,
            username: tags.username,
            message,
            self
        });

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
        
        // Skip command processing here since we're handling it in the direct handler
        
        // Process message through plugin manager
        await pluginManager.processIncomingMessage({
            target: channel,
            context: tags,
            message: message,
            self: self
        });
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

// Add the help command handlers after the existing message handler

// Handle help command
async function handleHelpCommand(client, channel, context, params) {
  try {
    logger.info(`[Help] Processing help command with params: ${JSON.stringify(params)}`);
    
    // If "mod" parameter is provided, show mod-only commands
    if (params.length > 0 && params[0].toLowerCase() === 'mod') {
      logger.info(`[Help] Showing mod-only commands list`);
      const result = await listModCommands(client, channel, context);
      logger.info(`[Help] Result of listModCommands: ${result}`);
      return result;
    }
    
    // If a specific command is requested, show help for that command
    if (params.length > 0) {
      const commandName = params[0].toLowerCase();
      logger.info(`[Help] Showing help for specific command: ${commandName}`);
      const result = await showCommandHelp(client, channel, context, commandName);
      logger.info(`[Help] Result of showCommandHelp: ${result}`);
      return result; // Ensure we're returning the result
    }
    
    // Otherwise, show a list of all commands
    logger.info(`[Help] Showing list of all commands`);
    const result = await listCommands(client, channel, context);
    logger.info(`[Help] Result of listCommands: ${result}`);
    return result; // Ensure we're returning the result
  } catch (error) {
    logger.error(`Error in help command:`, error);
    await client.say(channel, `@${context.username} Sorry, there was an error processing the help command.`);
    return false;
  }
}

// List all moderator-only commands
async function listModCommands(client, channel, context) {
  try {
    // Check if user is a mod - only mods should see mod commands
    const isMod = context.mod || context.badges?.broadcaster === '1' || 
                 context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
    
    if (!isMod) {
      await client.say(channel, `@${context.username} You need to be a moderator to view mod-only commands.`);
      return false;
    }
    
    // Get all commands from the plugin manager
    const commands = pluginManager.listCommands();
    
    // Filter for mod-only commands
    const modCommands = commands.filter(cmd => cmd.config && cmd.config.modOnly === true);
    
    // Group by plugin
    const commandsByPlugin = {};
    
    // Add built-in mod commands
    commandsByPlugin['system'] = ['plugin', 'debug', 'reload'];
    
    // Group plugin mod commands
    for (const command of modCommands) {
      const pluginName = command.pluginName || 'unknown';
      if (!commandsByPlugin[pluginName]) {
        commandsByPlugin[pluginName] = [];
      }
      commandsByPlugin[pluginName].push(command.name);
    }
    
    // Build the message
    let message = `@${context.username} Moderator commands:\n`;
    
    // Add each plugin's commands to the message
    const pluginNames = Object.keys(commandsByPlugin).sort();
    
    for (let i = 0; i < pluginNames.length; i++) {
      // Skip plugins with no commands
      if (commandsByPlugin[pluginNames[i]].length === 0) {
        continue;
      }
      
      const pluginName = pluginNames[i];
      const pluginCommands = commandsByPlugin[pluginName].sort();
      
      // Capitalize the first letter of the plugin name
      const displayName = pluginName.charAt(0).toUpperCase() + pluginName.slice(1);
      
      // Add plugin name and its commands
      message += `${displayName}: ${pluginCommands.map(cmd => `!${cmd}`).join(', ')}`;
      
      // Add a newline if not the last plugin
      if (i < pluginNames.length - 1) {
        message += '\n';
      }
    }
    
    // Send the message
    await client.say(channel, message);
    logger.info(`[Help] Displayed mod command list to ${context.username}`);
    return true;
  } catch (error) {
    logger.error(`Error listing mod commands:`, error);
    await client.say(channel, `@${context.username} Error listing mod commands.`);
    return false;
  }
}

// List all available commands
async function listCommands(client, channel, context) {
  try {
    // Get all commands from the plugin manager
    const commands = pluginManager.listCommands();
    
    if (!commands || commands.length === 0) {
      await client.say(channel, `@${context.username} No commands are currently available.`);
      logger.warn(`[Help] No commands returned from plugin manager`);
      return false;
    }
    
    // Group commands by plugin
    const commandsByPlugin = {};
    
    // Add built-in commands
    commandsByPlugin['system'] = ['help', 'plugin', 'debug'];
    
    // Group plugin commands
    for (const command of commands) {
      // Skip commands that aren't enabled
      if (command.config && command.config.enabled === false) {
        continue;
      }
      
      const pluginName = command.pluginName || 'unknown';
      if (!commandsByPlugin[pluginName]) {
        commandsByPlugin[pluginName] = [];
      }
      commandsByPlugin[pluginName].push(command.name);
    }
    
    // Add the built-in help command
    if (!commandsByPlugin['Core']) {
      commandsByPlugin['Core'] = [];
    }
    
    if (!commandsByPlugin['Core'].includes('help')) {
      commandsByPlugin['Core'].push('help');
    }
    
    // Add plugin command if not included
    if (!commandsByPlugin['Core'].includes('plugin')) {
      commandsByPlugin['Core'].push('plugin');
    }
    
    // Build the message
    let message = `@${context.username} Available commands:\n`;
    
    // Add commands from each plugin
    const pluginNames = Object.keys(commandsByPlugin).sort();
    for (let i = 0; i < pluginNames.length; i++) {
      const pluginName = pluginNames[i];
      const pluginCommands = commandsByPlugin[pluginName].sort();
      
      // Capitalize the first letter of the plugin name
      const displayName = pluginName.charAt(0).toUpperCase() + pluginName.slice(1);
      
      // Add plugin name and its commands
      message += `${displayName}: ${pluginCommands.map(cmd => `!${cmd}`).join(', ')}`;
      
      // Add a newline if not the last plugin
      if (i < pluginNames.length - 1) {
        message += '\n';
      }
    }
    
    // Add help text
    message += '\nUse !help [command] for more information on a specific command.';
    
    // Send the message
    await client.say(channel, message);
    logger.info(`[Help] Displayed command list to ${context.username}`);
    return true;
  } catch (error) {
    logger.error(`Error listing commands:`, error);
    await client.say(channel, `@${context.username} Error listing commands.`);
    return false;
  }
}

// Show help for a specific command
async function showCommandHelp(client, channel, context, commandName) {
  try {
    // Handle built-in help command
    if (commandName === 'help') {
      await client.say(channel, `@${context.username} Help for !help: List available commands or get help for a specific command. Usage: !help [command]`);
      return true;
    }
    
    // Handle built-in plugin command
    if (commandName === 'plugin') {
      await client.say(channel, `@${context.username} Help for !plugin: Manage bot plugins. Usage: !plugin <plugin-name> <list|info|enable|disable|reload|recover> or !plugin reload to reload all plugins`);
      return true;
    }
    
    // Handle built-in debug command
    if (commandName === 'debug') {
      await client.say(channel, `@${context.username} Help for !debug: Debug commands for moderators. Usage: !debug <plugins|hello|errors|reload|fixhello>`);
      return true;
    }
    
    // Handle special mod command
    if (commandName === 'mod') {
      await client.say(channel, `@${context.username} Help for !help mod: Display a list of all moderator-only commands available in the bot. Usage: !help mod`);
      return true;
    }
    
    // Get all commands
    const commands = pluginManager.listCommands();
    
    // Find the command
    const command = commands.find(cmd => 
      cmd.name === commandName || 
      (cmd.config && cmd.config.aliases && Array.isArray(cmd.config.aliases) && cmd.config.aliases.includes(commandName))
    );
    
    if (!command) {
      // If command not found, check if it's a plugin name
      const plugin = pluginManager.getPlugin(commandName);
      if (plugin && plugin.help) {
        return await showPluginHelp(client, channel, context, plugin);
      }
      
      await client.say(channel, `@${context.username} Command not found: ${commandName}`);
      return false;
    }
    
    // Build the help message
    let message = `@${context.username} Help for !${command.name}: ${command.config?.description || 'No description'}`;
    
    // Add usage
    if (command.config?.usage) {
      message += `. Usage: ${command.config.usage}`;
    }
    
    // Add aliases
    if (command.config?.aliases && Array.isArray(command.config.aliases) && command.config.aliases.length > 0) {
      message += `. Aliases: ${command.config.aliases.map(alias => `!${alias}`).join(', ')}`;
    }
    
    // Add cooldown
    if (command.config?.cooldown) {
      message += `. Cooldown: ${command.config.cooldown}s`;
    }
    
    // Add mod only
    if (command.config?.modOnly) {
      message += `. Mod only: Yes`;
    }
    
    // Send the message
    await client.say(channel, message);
    return true;
  } catch (error) {
    logger.error(`Error showing command help:`, error);
    await client.say(channel, `@${context.username} Error showing command help.`);
    return false;
  }
}

// Show help for a plugin
async function showPluginHelp(client, channel, context, plugin) {
  try {
    if (!plugin.help) {
      await client.say(channel, `@${context.username} No help information available for plugin: ${plugin.name}`);
      return false;
    }
    
    // Send plugin description
    await client.say(channel, `@${context.username} Plugin: ${plugin.name} - ${plugin.help.description}`);
    
    // If plugin has command help information, list the commands
    if (plugin.help.commands && plugin.help.commands.length > 0) {
      await client.say(channel, `@${context.username} Commands in ${plugin.name}:`);
      
      // Send help for each command
      for (const cmd of plugin.help.commands) {
        let cmdHelp = `!${cmd.name}: ${cmd.description}`;
        if (cmd.usage) {
          cmdHelp += `. Usage: ${cmd.usage}`;
        }
        await client.say(channel, cmdHelp);
        
        // If there are examples, send them too (up to 3)
        if (cmd.examples && cmd.examples.length > 0) {
          const examples = cmd.examples.slice(0, 3);
          await client.say(channel, `@${context.username} Examples: ${examples.join(' | ')}`);
        }
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`Error showing plugin help:`, error);
    await client.say(channel, `@${context.username} Error showing plugin help.`);
    return false;
  }
}

// Handle plugin command 
async function handlePluginCommand(client, channel, context, params) {
  // Check if the user is a moderator
  const isMod = context.mod || context.badges?.broadcaster === '1' || 
               context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
  
  if (!isMod) {
    await client.say(channel, `@${context.username}, you need to be a moderator to use this command.`);
    return false;
  }
  
  // If no parameters, show usage
  if (params.length === 0) {
    await client.say(channel, `@${context.username}, usage: !plugin <plugin-name> <action> or !plugin <action> for global actions`);
    return true;
  }
  
  // Handle special case - !plugin reload to reload all plugins
  if (params[0].toLowerCase() === 'reload' && params.length === 1) {
    // Reload all plugins
    const results = pluginManager.reloadAllPlugins();
    
    if (results.success.length > 0) {
      await client.say(channel, `@${context.username}, reloaded ${results.success.length} plugins successfully, ${results.failed.length} failed`);
    } else {
      await client.say(channel, `@${context.username}, failed to reload any plugins`);
    }
    return true;
  }
    
  // Handle special case - !plugin list to list all plugins
  if (params[0].toLowerCase() === 'list' && params.length === 1) {
    await listPlugins(client, channel, context);
    return true;
  }
  
  // Handle special case - !plugin errors to list plugins in error state
  if (params[0].toLowerCase() === 'errors' && params.length === 1) {
    const errorPlugins = pluginManager.getPluginsInErrorState();
    
    if (errorPlugins.length === 0) {
      await client.say(channel, `@${context.username}, no plugins are currently in error state.`);
      return true;
    }
    
    const errorList = errorPlugins.map(p => `${p.name} (${p.error})`).join(', ');
    await client.say(channel, `@${context.username}, plugins in error state: ${errorList}`);
    return true;
  }
  
  // Get the plugin name first, then the action
  // New syntax: !plugin <plugin-name> <action>
  const pluginName = params[0];
  
  // If only the plugin name is provided, show info about it
  if (params.length === 1) {
    const plugin = pluginManager.getPlugin(pluginName);
    if (!plugin) {
      await client.say(channel, `@${context.username}, plugin "${pluginName}" not found.`);
      return false;
    }
    
    const status = plugin.config?.enabled ? 'enabled' : 'disabled';
    const errorStatus = plugin.config?.errorState ? ` (ERROR: ${plugin.config.lastError})` : '';
    const commandList = plugin.commands ? plugin.commands.map(cmd => cmd.name).join(', ') : 'None';
    
    await client.say(channel, `@${context.username}, plugin "${pluginName}" is ${status}${errorStatus}. Commands: ${commandList}`);
    return true;
  }
  
  // Get the action (second parameter)
  const action = params[1].toLowerCase();
  
  const plugin = pluginManager.getPlugin(pluginName);
  
  // If the plugin doesn't exist, show an error
  if (!plugin && action !== 'recover') {
    await client.say(channel, `@${context.username}, plugin "${pluginName}" not found.`);
    return false;
  }
  
  // Handle the different actions
  let result = false;
  switch (action) {
    case 'info':
      const status = plugin.config?.enabled ? 'enabled' : 'disabled';
      const errorStatus = plugin.config?.errorState ? ` (ERROR: ${plugin.config.lastError})` : '';
      const commandList = plugin.commands ? plugin.commands.map(cmd => cmd.name).join(', ') : 'None';
      
      await client.say(channel, `@${context.username}, plugin "${pluginName}" is ${status}${errorStatus}. Commands: ${commandList}`);
      result = true;
      break;
      
    case 'enable':
      if (plugin.config?.errorState) {
        await client.say(channel, `@${context.username}, plugin "${pluginName}" is in error state and cannot be enabled. Use "!plugin ${pluginName} recover" first.`);
        return false;
      }
      
      result = pluginManager.enablePlugin(pluginName);
      if (result) {
        await client.say(channel, `@${context.username}, plugin "${pluginName}" has been enabled.`);
      } else {
        await client.say(channel, `@${context.username}, failed to enable plugin "${pluginName}".`);
      }
      break;
      
    case 'disable':
      result = pluginManager.disablePlugin(pluginName);
      if (result) {
        await client.say(channel, `@${context.username}, plugin "${pluginName}" has been disabled.`);
      } else {
        await client.say(channel, `@${context.username}, failed to disable plugin "${pluginName}".`);
      }
      break;
      
    case 'reload':
      result = pluginManager.reloadPlugin(pluginName);
      if (result) {
        await client.say(channel, `@${context.username}, plugin "${pluginName}" has been reloaded.`);
      } else {
        await client.say(channel, `@${context.username}, failed to reload plugin "${pluginName}".`);
      }
      break;
      
    case 'recover':
      result = pluginManager.recoverPlugin(pluginName);
      if (result) {
        await client.say(channel, `@${context.username}, plugin "${pluginName}" has been recovered from error state.`);
      } else {
        await client.say(channel, `@${context.username}, failed to recover plugin "${pluginName}" from error state.`);
      }
      break;

    case 'config':
      // Handle plugin configuration
      if (params.length < 3) {
        // If no setting is provided, show current config
        try {
          const configData = configManager.loadPluginConfig(pluginName, {});
          const configKeys = Object.keys(configData);
          
          if (configKeys.length === 0) {
            await client.say(channel, `@${context.username}, plugin "${pluginName}" has no configuration settings.`);
          } else {
            // Filter out complex objects for nicer display
            const outputParts = [];
            
            // Add header
            outputParts.push(`📝 ${pluginName} Configuration:`);
            
            // Add simple key/values first
            const simpleKeys = configKeys.filter(key => 
              typeof configData[key] !== 'object' || configData[key] === null
            ).sort();
            
            if (simpleKeys.length > 0) {
              for (const key of simpleKeys) {
                const value = configData[key];
                // Format boolean values with emojis for clarity
                if (typeof value === 'boolean') {
                  const statusEmoji = value ? '✅' : '❌';
                  outputParts.push(`${statusEmoji} ${key}: ${value}`);
                } else {
                  outputParts.push(`• ${key}: ${value}`);
                }
              }
            }
            
            // Add array values with count
            const arrayKeys = configKeys.filter(key => 
              Array.isArray(configData[key])
            ).sort();
            
            if (arrayKeys.length > 0) {
              for (const key of arrayKeys) {
                const arr = configData[key];
                outputParts.push(`📋 ${key}: [${arr.length} items]`);
                
                // For small arrays (3 or fewer), show the items
                if (arr.length > 0 && arr.length <= 3) {
                  outputParts.push(`   ${arr.join(', ')}`);
                }
              }
            }
            
            // Add object values last (excluding arrays)
            const objectKeys = configKeys.filter(key => 
              typeof configData[key] === 'object' && 
              configData[key] !== null && 
              !Array.isArray(configData[key])
            ).sort();
            
            if (objectKeys.length > 0) {
              for (const key of objectKeys) {
                const obj = configData[key];
                const objKeys = Object.keys(obj);
                outputParts.push(`🔧 ${key}: {${objKeys.length} settings}`);
                
                // For small objects (3 or fewer properties), show them
                if (objKeys.length > 0 && objKeys.length <= 3) {
                  for (const subKey of objKeys) {
                    const value = obj[subKey];
                    if (typeof value === 'boolean') {
                      const statusEmoji = value ? '✅' : '❌';
                      outputParts.push(`   ${statusEmoji} ${subKey}: ${value}`);
                    } else {
                      outputParts.push(`   • ${subKey}: ${value}`);
                    }
                  }
                }
              }
            }
            
            // Format the final message with newlines
            const message = outputParts.join(' | ');
            await client.say(channel, `@${context.username}, ${message}`);
          }
        } catch (error) {
          logger.error(`Error loading ${pluginName} config:`, error);
          await client.say(channel, `@${context.username}, error loading config for plugin "${pluginName}": ${error.message}`);
          return false;
        }
        return true;
      }
      
      // Handle specific configuration setting
      const configKey = params[2].toLowerCase();
      
      // If no value provided, it's a get operation
      if (params.length === 3) {
        try {
          const configData = configManager.loadPluginConfig(pluginName, {});
          
          if (configData[configKey] === undefined) {
            await client.say(channel, `@${context.username}, setting "${configKey}" not found in ${pluginName} config.`);
            return false;
          }
          
          const value = configData[configKey];
          if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              // Format arrays nicely
              const countMsg = value.length === 0 ? "empty" : `${value.length} items`;
              if (value.length <= 5) {
                // Show all items for small arrays
                await client.say(channel, `@${context.username}, 📋 ${pluginName}.${configKey} = [${countMsg}]: ${value.join(', ')}`);
              } else {
                // Show only the first few for larger arrays
                await client.say(channel, `@${context.username}, 📋 ${pluginName}.${configKey} = [${countMsg}]: ${value.slice(0, 3).join(', ')}... and ${value.length - 3} more`);
              }
            } else {
              // Format objects nicely
              const objKeys = Object.keys(value);
              const countMsg = objKeys.length === 0 ? "empty" : `${objKeys.length} properties`;
              
              const keyValuePairs = [];
              for (const key of objKeys.slice(0, 3)) {
                keyValuePairs.push(`${key}: ${value[key]}`);
              }
              
              if (objKeys.length <= 3) {
                await client.say(channel, `@${context.username}, 🔧 ${pluginName}.${configKey} = {${countMsg}}: ${keyValuePairs.join(', ')}`);
              } else {
                await client.say(channel, `@${context.username}, 🔧 ${pluginName}.${configKey} = {${countMsg}}: ${keyValuePairs.join(', ')}... and ${objKeys.length - 3} more`);
              }
            }
          } else if (typeof value === 'boolean') {
            // Add emoji to boolean values
            const statusEmoji = value ? '✅' : '❌';
            await client.say(channel, `@${context.username}, ${statusEmoji} ${pluginName}.${configKey} = ${value}`);
          } else if (typeof value === 'string') {
            // Show strings
            await client.say(channel, `@${context.username}, 📝 ${pluginName}.${configKey} = "${value}"`);
          } else {
            // Numbers and other types
            await client.say(channel, `@${context.username}, 📊 ${pluginName}.${configKey} = ${value}`);
          }
        } catch (error) {
          logger.error(`Error reading ${pluginName} config:`, error);
          await client.say(channel, `@${context.username}, error reading config for plugin "${pluginName}": ${error.message}`);
          return false;
        }
        return true;
      }
      
      // Set operation - params[3] and beyond form the value
      const configValue = params.slice(3).join(' ');
      
      try {
        // Load current config
        const configData = configManager.loadPluginConfig(pluginName, {});
        
        // Special handling for problematic keys that need direct plugin interaction
        const specialKeys = ['autoShoutout', 'autoshoutout', 'autoShoutout.enabled', 'autoshoutout.enabled'];
        const lowerConfigKey = configKey.toLowerCase();
        
        if (plugin && specialKeys.includes(lowerConfigKey)) {
          logger.info(`Special handling for ${configKey} in ${pluginName}`);
          
          // Let the plugin handle this special case directly if it has the method
          if (typeof plugin.setAutoShoutoutEnabled === 'function') {
            logger.info(`Using plugin.setAutoShoutoutEnabled for ${pluginName}`);
            const result = plugin.setAutoShoutoutEnabled(configValue);
            await client.say(channel, `@${context.username}, updated ${pluginName} auto-shoutout setting to ${result ? 'enabled' : 'disabled'}`);
            return true;
          }
        }
        
        // Parse the value based on type
        let parsedValue;
        
        // Try to detect if it's a boolean, number, or string
        if (configValue.toLowerCase() === 'true' || configValue.toLowerCase() === 'enable' || configValue.toLowerCase() === 'enabled') {
          parsedValue = true;
        } else if (configValue.toLowerCase() === 'false' || configValue.toLowerCase() === 'disable' || configValue.toLowerCase() === 'disabled') {
          parsedValue = false;
        } else if (!isNaN(Number(configValue))) {
          parsedValue = Number(configValue);
        } else if (configValue.startsWith('[') && configValue.endsWith(']')) {
          try {
            // Try to parse as array
            parsedValue = JSON.parse(configValue);
          } catch (e) {
            parsedValue = configValue;
          }
        } else if (configValue.startsWith('{') && configValue.endsWith('}')) {
          try {
            // Try to parse as object
            parsedValue = JSON.parse(configValue);
          } catch (e) {
            parsedValue = configValue;
          }
        } else {
          parsedValue = configValue;
        }
        
        // Handle updating nested properties (e.g., autoShoutout.enabled)
        if (configKey.includes('.')) {
          const keyParts = configKey.split('.');
          let currentObj = configData;
          
          // Normalize key parts for case consistency (important for non-nested property names too)
          const normalizedKeyParts = keyParts.map(part => {
            // Check if a similar key (case-insensitive) already exists in the current object
            if (part.toLowerCase() !== part) {
              // For nested properties, we need to find if a similar key exists
              const existingKeys = Object.keys(currentObj);
              const existingKey = existingKeys.find(k => k.toLowerCase() === part.toLowerCase());
              
              // If a key with different casing exists, use that existing key
              if (existingKey && existingKey !== part) {
                logger.info(`Normalizing config key: ${part} → ${existingKey} to avoid duplicates`);
                return existingKey;
              }
            }
            return part;
          });
          
          // Navigate to the parent object
          for (let i = 0; i < normalizedKeyParts.length - 1; i++) {
            const part = normalizedKeyParts[i];
            // Create the object path if it doesn't exist
            if (!currentObj[part] || typeof currentObj[part] !== 'object') {
              currentObj[part] = {};
            }
            currentObj = currentObj[part];
          }
          
          // Set the property on the parent object
          const lastKey = normalizedKeyParts[normalizedKeyParts.length - 1];
          currentObj[lastKey] = parsedValue;
          
          // Check for possibly duplicate keys with different casing at all levels
          // This prevents issues like having both autoShoutout and autoshoutout
          cleanupDuplicateKeys(configData);
        } else {
          // Check for case-insensitive duplicates at the root level
          const existingKeys = Object.keys(configData);
          let keyToUse = configKey;
          
          // See if there's already a key with different casing
          const existingKey = existingKeys.find(k => k.toLowerCase() === configKey.toLowerCase() && k !== configKey);
          
          if (existingKey) {
            // Use the existing key to avoid duplicates
            keyToUse = existingKey;
            logger.info(`Using existing config key: ${existingKey} instead of ${configKey} to avoid duplicates`);
          }
          
          // Direct property update
          configData[keyToUse] = parsedValue;
          
          // Remove any duplicate keys with different casing
          cleanupDuplicateKeys(configData);
        }
        
        // Helper function to remove duplicate keys with different casing
        function cleanupDuplicateKeys(obj) {
          if (!obj || typeof obj !== 'object') return;
          
          // Get all keys grouped by their lowercase version
          const keysByLowercase = {};
          Object.keys(obj).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (!keysByLowercase[lowerKey]) {
              keysByLowercase[lowerKey] = [];
            }
            keysByLowercase[lowerKey].push(key);
          });
          
          // For each group of keys with the same lowercase version
          Object.values(keysByLowercase).forEach(keys => {
            if (keys.length > 1) {
              // Keep the first key, remove others
              const keyToKeep = keys[0];
              keys.slice(1).forEach(keyToRemove => {
                logger.info(`Removing duplicate config key: ${keyToRemove} (keeping ${keyToKeep})`);
                delete obj[keyToRemove];
              });
            }
          });
          
          // Recursively clean nested objects
          Object.values(obj).forEach(val => {
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              cleanupDuplicateKeys(val);
            }
          });
        }
        
        // Save the updated config
        configManager.savePluginConfig(pluginName, configData);
        
        // Get the plugin and notify it of config changes
        if (plugin && typeof plugin.onConfigUpdate === 'function') {
          plugin.onConfigUpdate(configKey, parsedValue);
        }
        
        await client.say(channel, `@${context.username}, updated ${pluginName}.${configKey} = ${JSON.stringify(parsedValue)}`);
        result = true;
      } catch (error) {
        logger.error(`Error setting ${pluginName} config:`, error);
        await client.say(channel, `@${context.username}, error setting config for plugin "${pluginName}": ${error.message}`);
        result = false;
      }
      break;
      
    default:
      await client.say(channel, `@${context.username}, unknown action "${action}". Available actions: info, config, enable, disable, reload, recover`);
      result = false;
      break;
  }
  
  return result;
}

// List all plugins
async function listPlugins(client, channel, context) {
  try {
    const plugins = pluginManager.getAllPlugins();
    
    if (plugins.length === 0) {
      await client.say(channel, `@${context.username} No plugins loaded.`);
      return true;
    }
    
    // Group plugins by status
    const enabledPlugins = [];
    const disabledPlugins = [];
    
    for (const plugin of plugins) {
      if (plugin.config && plugin.config.enabled) {
        enabledPlugins.push(plugin.name);
      } else {
        disabledPlugins.push(plugin.name);
      }
    }
    
    // Show enabled plugins
    if (enabledPlugins.length > 0) {
      await client.say(channel, `@${context.username} Enabled plugins: ${enabledPlugins.join(', ')}`);
    }
    
    // Show disabled plugins
    if (disabledPlugins.length > 0) {
      await client.say(channel, `@${context.username} Disabled plugins: ${disabledPlugins.join(', ')}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error listing plugins:`, error);
    await client.say(channel, `@${context.username} Error listing plugins.`);
    return false;
  }
}

// Set up a timer to emit regular events for plugins
let minuteCounter = 0;
const MINUTE = 60 * 1000;
setInterval(() => {
  // Emit a minute tick event
  minuteCounter++;
  
  // Emit timer events
  botObject.events.emit('timer:minute', { count: minuteCounter });
  
  // Emit hourly event
  if (minuteCounter % 60 === 0) {
    botObject.events.emit('timer:hour', { count: Math.floor(minuteCounter / 60) });
  }
  
  // Emit events for the uptime
  const uptime = Date.now() - startTime;
  botObject.events.emit('bot:uptime', { 
    startTime,
    uptime,
    uptimeMinutes: Math.floor(uptime / MINUTE),
    uptimeHours: Math.floor(uptime / (MINUTE * 60)),
    uptimeDays: Math.floor(uptime / (MINUTE * 60 * 24))
  });
}, MINUTE);

// Expose a method to allow plugins to emit events
botObject.emitEvent = function(eventName, data) {
  if (typeof eventName !== 'string' || !eventName) {
    logger.warn('Invalid event name provided to emitEvent');
    return false;
  }
  
  try {
    // Add plugin name to custom events if it comes from a plugin
    if (data && data.plugin) {
      botObject.events.emit(`plugin:${data.plugin}:${eventName}`, data);
    }
    
    // Also emit the general event
    botObject.events.emit(`custom:${eventName}`, data);
    return true;
  } catch (error) {
    logger.error(`Error emitting custom event ${eventName}:`, error);
    return false;
  }
};

// Add Twitch API event handling for plugins
botObject.events.on('twitch:api:channelInfo:request', async (data) => {
  try {
    logger.info(`[TwitchAPI] Channel info requested for ${data.username} by plugin ${data.requestor}`);
    
    // Check for required environment variables
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
      logger.warn('[TwitchAPI] CLIENT_ID or CLIENT_SECRET not set. Cannot fetch channel info.');
      
      // Send back error response
      botObject.events.emit('twitch:api:channelInfo:response', {
        requestId: data.requestId,
        error: 'CLIENT_ID or CLIENT_SECRET not set',
        username: data.username
      });
      return;
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
      logger.error('[TwitchAPI] Failed to get Twitch access token');
      
      // Send back error response
      botObject.events.emit('twitch:api:channelInfo:response', {
        requestId: data.requestId,
        error: 'Failed to get Twitch access token',
        username: data.username
      });
      return;
    }
    
    // Get user information
    const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${data.username}`, {
      headers: {
        'Client-ID': process.env.CLIENT_ID,
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    const userData = await userResponse.json();
    if (!userData.data || userData.data.length === 0) {
      logger.info(`[TwitchAPI] User not found: ${data.username}`);
      
      // Send back error response
      botObject.events.emit('twitch:api:channelInfo:response', {
        requestId: data.requestId,
        error: 'User not found',
        username: data.username
      });
      return;
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
      logger.info(`[TwitchAPI] Channel not found for user: ${data.username}`);
      
      // Send back partial response with just user data
      botObject.events.emit('twitch:api:channelInfo:response', {
        requestId: data.requestId,
        channelInfo: {
          id: user.id,
          name: user.login,
          display_name: user.display_name,
          description: user.description,
          profile_image_url: user.profile_image_url,
          is_live: false
        },
        username: data.username
      });
      return;
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
    
    // Create combined response object
    const channelInfo = {
      id: user.id,
      name: user.login,
      display_name: user.display_name,
      description: channel.title,
      game_name: channel.game_name,
      game_id: channel.game_id,
      broadcaster_language: channel.broadcaster_language,
      profile_image_url: user.profile_image_url,
      offline_image_url: user.offline_image_url,
      is_live: isLive,
      url: `https://twitch.tv/${user.login}`
    };
    
    // If live, add stream data
    if (isLive && streamData.data && streamData.data.length > 0) {
      const stream = streamData.data[0];
      channelInfo.stream = {
        id: stream.id,
        title: stream.title,
        viewer_count: stream.viewer_count,
        started_at: stream.started_at,
        thumbnail_url: stream.thumbnail_url
      };
    }
    
    logger.info(`[TwitchAPI] Successfully fetched channel info for ${data.username}`);
    
    // Send back successful response
    botObject.events.emit('twitch:api:channelInfo:response', {
      requestId: data.requestId,
      channelInfo,
      username: data.username
    });
    
  } catch (error) {
    logger.error(`[TwitchAPI] Error fetching channel info for ${data.username}:`, error);
    
    // Send back error response
    botObject.events.emit('twitch:api:channelInfo:response', {
      requestId: data.requestId,
      error: `Error fetching channel info: ${error.message}`,
      username: data.username
    });
  }
}); 

// Periodically check if we're still connected
setInterval(() => {
  // Use async/await pattern with error handling
  (async () => {
    try {
      await checkTwitchConnection();
    } catch (error) {
      console.error('Error during periodic connection check:', error);
    }
  })();
}, 60000); // Check every minute 

// Process chat message for commands
async function processCommands(client, channel, context, message) {
  // Skip processing if the message doesn't start with the command prefix
  if (!message.startsWith('!')) {
    return false;
  }
  
  // Extract the command name and parameters
  const parts = message.trim().substring(1).split(' ');
  const command = parts[0].toLowerCase();
  const params = parts.slice(1);
  
  // Log the command
  logger.info(`Received command: ${command} from ${context.username}`);
  
  // Check for built-in commands
  let result = false;
  switch (command) {
    case 'debug':
      // Debug commands are mod-only
      const isModForDebug = context.mod || context.badges?.broadcaster === '1' || 
                          context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
      
      if (!isModForDebug) {
        await client.say(channel, `@${context.username}, you need to be a moderator to use debug commands.`);
        return false;
      }
      
      result = await handleDebugCommand(client, channel, context, params);
      break;
      
    case 'plugin':
      // Handle plugin management
      result = await handlePluginCommand(client, channel, context, params);
      break;
      
    default:
      // Try to find a plugin that handles this command
      result = await pluginManager.executeCommand(command, client, channel, context, message);
      break;
  }
  
  return result;
} 