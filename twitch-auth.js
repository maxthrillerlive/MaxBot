/**
 * Twitch Authentication and Connection Module
 * 
 * This module handles all Twitch-related authentication, connection management,
 * and status checking functionality.
 */

const tmi = require('tmi.js');
const logger = require('./logger');

// Module state
let client = null;
let connectionCheckInterval = null;
let isShuttingDown = false;
let eventHandlers = {
    onConnecting: null,
    onConnected: null,
    onDisconnected: null,
    onMessage: null
};

/**
 * Initialize the Twitch client with the provided configuration
 * @param {Object} config - Configuration options
 * @returns {Object} - The initialized Twitch client
 */
function initializeTwitchClient(config = {}) {
    // Default configuration options
    const defaultOpts = {
        options: { 
            debug: true,
            messagesLogLevel: "info",
            skipMembership: true,  // Skip membership events
            skipUpdatingEmotesets: true  // Skip updating emote sets
        },
        connection: {
            reconnect: false, // Disable built-in reconnect to use our custom reconnection logic
            secure: true,
            timeout: 60000,   // Increase timeout to 60 seconds
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

    // Merge provided config with defaults
    const opts = {
        ...defaultOpts,
        ...config,
        options: { ...defaultOpts.options, ...config.options },
        connection: { ...defaultOpts.connection, ...config.connection },
        identity: { ...defaultOpts.identity, ...config.identity }
    };

    // Ensure reconnect is disabled to prevent duplicate reconnection attempts
    opts.connection.reconnect = false;
    
    // Ensure timeout is set to 60 seconds
    opts.connection.timeout = 60000;

    // Validate required fields
    if (!opts.identity.username) {
        throw new Error('BOT_USERNAME is required for Twitch client initialization');
    }
    if (!opts.identity.password || !opts.identity.password.startsWith('oauth:')) {
        throw new Error('CLIENT_TOKEN must start with "oauth:" for Twitch client initialization');
    }
    if (!opts.channels || opts.channels.length === 0) {
        throw new Error('At least one channel is required for Twitch client initialization');
    }

    // Create a client with our options
    client = new tmi.client(opts);
    
    // Set up event handlers
    setupEventHandlers();
    
    return client;
}

/**
 * Set up event handlers for the Twitch client
 */
function setupEventHandlers() {
    if (!client) {
        throw new Error('Twitch client must be initialized before setting up event handlers');
    }

    // Handle connecting event
    client.on('connecting', () => {
        console.log('Connecting to Twitch...');
        if (eventHandlers.onConnecting) {
            eventHandlers.onConnecting();
        }
    });

    // Handle connected event
    client.on('connected', (address, port) => {
        console.log(`Connected to Twitch at ${address}:${port}`);
        if (eventHandlers.onConnected) {
            eventHandlers.onConnected(address, port);
        }
    });

    // Handle disconnected event
    client.on('disconnected', (reason) => {
        console.log(`Disconnected from Twitch: ${reason}`);
        logger.error(`Disconnected from Twitch: ${reason}`);
        
        if (eventHandlers.onDisconnected) {
            eventHandlers.onDisconnected(reason);
        }
    });

    // Handle message event
    client.on('message', (target, context, msg, self) => {
        if (eventHandlers.onMessage) {
            eventHandlers.onMessage(target, context, msg, self);
        }
    });
    
    // Handle PING messages from the server
    client.on('ping', () => {
        console.log('Received PING from Twitch IRC server, responding with PONG');
        // The tmi.js library should automatically respond with a PONG
        // But let's explicitly send a PONG to be sure
        try {
            if (client && client._connection && client._connection.ws && 
                client._connection.ws.readyState === 1) {
                client.raw('PONG :tmi.twitch.tv');
                console.log('Explicitly sent PONG response to Twitch');
            }
        } catch (error) {
            console.error('Error sending explicit PONG response:', error);
        }
    });
    
    // Handle PONG responses to our PINGs
    client.on('pong', () => {
        console.log('Received PONG response from Twitch IRC server');
    });
    
    // Add a raw message handler to catch and log all messages
    client.on('raw_message', (messageCloned, message) => {
        // Handle PING messages explicitly to ensure we respond
        if (message && message.command === 'PING') {
            console.log('Received raw PING message from server, sending PONG');
            try {
                if (client && client._connection && client._connection.ws && 
                    client._connection.ws.readyState === 1) {
                    // Send a PONG response with the same parameter as the PING
                    const pingParam = message.params && message.params.length > 0 ? message.params[0] : 'tmi.twitch.tv';
                    client.raw(`PONG :${pingParam}`);
                    console.log(`Sent PONG :${pingParam} in response to PING`);
                }
            } catch (error) {
                console.error('Error sending PONG response to PING:', error);
            }
        }
        // Log PONG messages
        else if (message && message.command === 'PONG') {
            console.log('Received raw PONG message from server - connection is active');
        }
    });
}

/**
 * Register event handlers for Twitch client events
 * @param {Object} handlers - Object containing event handler functions
 */
function registerEventHandlers(handlers = {}) {
    eventHandlers = {
        ...eventHandlers,
        ...handlers
    };
}

/**
 * Connect to Twitch
 * @returns {Promise} - Resolves when connected, rejects on error
 */
async function connect() {
    if (!client) {
        throw new Error('Twitch client must be initialized before connecting');
    }

    console.log('Connecting to Twitch...');
    console.log('Bot username:', process.env.BOT_USERNAME);
    console.log('Channel:', process.env.CHANNEL_NAME);
    
    try {
        await client.connect();
        console.log('Bot connected successfully.');
        
        // We're now relying on Twitch's own PING messages to keep the connection alive
        console.log('Relying on Twitch server PINGs to maintain connection');
        
        return true;
    } catch (err) {
        console.error('Connection failed:', err);
        if (err.message.includes('authentication failed')) {
            console.error('Please check your CLIENT_TOKEN in .env file and make sure it starts with "oauth:"');
            console.error('You can get a new token by running: npm run auth');
        }
        throw err;
    }
}

/**
 * Check if the Twitch client is connected
 * @returns {Promise<boolean>} - Resolves to true if connected, false otherwise
 */
async function checkTwitchConnection() {
    if (!client) {
        console.log('Client not initialized, cannot check Twitch connection');
        return false;
    }
    
    try {
        // Check if the client's socket is available
        if (client._connection && client._connection.ws) {
            const socketState = client._connection.ws.readyState;
            
            // WebSocket.OPEN = 1
            const isConnected = socketState === 1;
            
            // Log the current connection state
            console.log('Checking Twitch connection status:', 
                isConnected ? 'Connected' : 'Disconnected', 
                'WebSocket state:', 
                socketState === 0 ? 'CONNECTING' : 
                socketState === 1 ? 'OPEN' : 
                socketState === 2 ? 'CLOSING' : 
                socketState === 3 ? 'CLOSED' : 'UNKNOWN');
            
            return isConnected;
        } else {
            console.log('WebSocket connection not available');
            return false;
        }
    } catch (error) {
        console.error('Error checking Twitch connection:', error);
        return false;
    }
}

/**
 * Check for active connections to Twitch IRC servers using PING command
 * @returns {Promise<boolean>} - Resolves to true if connected, false otherwise
 */
function checkActiveTwitchConnections() {
    // Connection check disabled
    return Promise.resolve(true);
}

/**
 * Handle reconnection to Twitch if needed
 * @returns {Promise<boolean>} - Resolves to true if reconnected successfully, false otherwise
 */
async function handleTwitchReconnection() {
    console.log('Attempting to reconnect to Twitch...');
    
    try {
        // Check if client exists
        if (!client) {
            console.log('Client not initialized, cannot reconnect');
            return false;
        }
        
        // Check the WebSocket state directly
        let socketState = 3; // Default to CLOSED
        if (client._connection && client._connection.ws) {
            socketState = client._connection.ws.readyState;
            console.log('Current WebSocket state:', 
                socketState === 0 ? 'CONNECTING' : 
                socketState === 1 ? 'OPEN' : 
                socketState === 2 ? 'CLOSING' : 
                socketState === 3 ? 'CLOSED' : 'UNKNOWN');
        }
        
        // Only disconnect if we're not already disconnected
        // WebSocket.CLOSED = 3
        if (socketState !== 3) {
            try {
                // Disconnect first if we're in a bad state
                await client.disconnect();
                console.log('Successfully disconnected, now reconnecting...');
            } catch (disconnectError) {
                // If disconnect fails, log it but continue with reconnection attempt
                console.error('Error during disconnect:', disconnectError.message);
            }
        } else {
            console.log('WebSocket already CLOSED, proceeding to reconnect');
        }
        
        // Wait a moment before reconnecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Reconnect
        await client.connect();
        console.log('Successfully reconnected to Twitch');
        
        return true;
    } catch (error) {
        console.error('Error during reconnection:', error);
        return false;
    }
}

/**
 * Start periodic connection checking
 * @param {number} interval - Interval in milliseconds between checks
 */
function startPeriodicConnectionCheck(interval = 120000) { // Default to 2 minutes
    // Connection check disabled - this is now a no-op function
    console.log('Periodic connection check is disabled');
    return null;
}

/**
 * Stop periodic connection checking
 */
function stopPeriodicConnectionCheck() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
}

/**
 * Disconnect from Twitch
 * @returns {Promise} - Resolves when disconnected, rejects on error
 */
async function disconnect() {
    if (!client) {
        return;
    }
    
    try {
        await client.disconnect();
        console.log('Disconnected from Twitch');
        return true;
    } catch (error) {
        console.error('Error disconnecting from Twitch:', error);
        throw error;
    }
}

/**
 * Get the current Twitch client
 * @returns {Object} - The Twitch client
 */
function getClient() {
    return client;
}

/**
 * Get connection details for status reporting
 * @returns {Object} - Connection details
 */
function getConnectionDetails() {
    if (!client) {
        return {
            readyState: 'No client',
            readyStateText: 'No client',
            channels: [],
            lastConnectionCheck: Date.now()
        };
    }
    
    // Check the WebSocket state directly
    let socketState = 3; // Default to CLOSED
    let socketStateText = 'CLOSED';
    
    if (client._connection && client._connection.ws) {
        socketState = client._connection.ws.readyState;
        socketStateText = 
            socketState === 0 ? 'CONNECTING' : 
            socketState === 1 ? 'OPEN' : 
            socketState === 2 ? 'CLOSING' : 
            socketState === 3 ? 'CLOSED' : 'UNKNOWN';
        
        console.log('Current WebSocket state:', socketStateText);
    } else {
        console.log('WebSocket connection not available');
    }
    
    // Get channels safely
    let channels = [];
    try {
        channels = client.getChannels();
    } catch (e) {
        console.log('Error getting channels:', e.message);
    }
    
    return {
        readyState: socketState,
        readyStateText: socketStateText,
        channels: channels,
        lastConnectionCheck: Date.now()
    };
}

/**
 * Get the current connection state
 * @returns {string} - 'Connected' or 'Disconnected'
 */
function getConnectionState() {
    if (!client) {
        return 'Disconnected';
    }
    
    // Check the WebSocket state directly
    if (client._connection && client._connection.ws) {
        const socketState = client._connection.ws.readyState;
        // WebSocket.OPEN = 1
        return socketState === 1 ? 'Connected' : 'Disconnected';
    }
    
    return 'Disconnected';
}

/**
 * Set the shutdown flag
 * @param {boolean} value - The shutdown flag value
 */
function setShutdownFlag(value) {
    isShuttingDown = value;
}

// Export the module functions
module.exports = {
    initializeTwitchClient,
    registerEventHandlers,
    connect,
    disconnect,
    checkTwitchConnection,
    checkActiveTwitchConnections,
    handleTwitchReconnection,
    startPeriodicConnectionCheck,
    stopPeriodicConnectionCheck,
    getClient,
    getConnectionDetails,
    getConnectionState,
    setShutdownFlag
}; 