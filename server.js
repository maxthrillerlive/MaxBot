require('dotenv').config();
const tmi = require('tmi.js');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Global variables
let isShuttingDown = false;
const startTime = Date.now();

// Validate environment variables first
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

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Create Twitch client
const client = new tmi.Client({
    options: { debug: true },
    connection: {
        secure: true,
        reconnect: true
    },
    identity: {
        username: process.env.BOT_USERNAME,
        password: process.env.CLIENT_TOKEN
    },
    channels: [process.env.CHANNEL_NAME]
});

// Set up heartbeat interval to keep connections alive
function heartbeat() {
    this.isAlive = true;
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('Control panel connected');
    
    // Set up heartbeat for this connection
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    
    // Send initial status
    sendStatus(ws);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data.type);
            
            switch (data.type) {
                case 'GET_STATUS':
                case 'status_request':
                    sendStatus(ws);
                    break;
                case 'CHAT_COMMAND':
                    await client.say(data.channel, data.message);
                    break;
                case 'RESTART_BOT':
                    console.log('Received restart command from control panel');
                    ws.send(JSON.stringify({
                        type: 'CONNECTION_STATE',
                        state: 'restarting'
                    }));
                    await handleRestart();
                    break;
                case 'EXIT_BOT':
                    console.log('Received shutdown command from control panel');
                    ws.send(JSON.stringify({
                        type: 'CONNECTION_STATE',
                        state: 'shutting_down'
                    }));
                    await handleExit();
                    break;
                case 'ping':
                    // Respond to ping with pong
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now(),
                        client_id: data.client_id || 'unknown'
                    }));
                    break;
                case 'register':
                    // Acknowledge registration
                    console.log(`Client registered: ${data.client_id || 'unknown'} (${data.client_type || 'unknown'})`);
                    ws.send(JSON.stringify({
                        type: 'register_ack',
                        timestamp: Date.now(),
                        client_id: data.client_id || 'unknown'
                    }));
                    break;
                case 'disconnect':
                    console.log(`Client disconnecting: ${data.client_id || 'unknown'}`);
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
            try {
                ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
            } catch (sendErr) {
                console.error('Error sending error response:', sendErr);
            }
        }
    });

    ws.on('close', () => {
        console.log('Control panel disconnected');
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

// Set up a periodic ping to check for dead connections
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
            console.log('Terminating inactive connection');
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000); // Check every 30 seconds

// Clean up the interval when the server closes
wss.on('close', function close() {
    clearInterval(interval);
});

// Connect to Twitch
client.connect().catch(console.error);

// Handle chat messages
client.on('message', (channel, tags, message, self) => {
    if (self) return;

    // Broadcast to all connected control panels
    const chatMessage = {
        type: 'CHAT_MESSAGE',
        data: {
            channel,
            username: tags.username,
            message,
            badges: tags.badges
        }
    };

    broadcastToAll(chatMessage);
});

function sendStatus(ws) {
    try {
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const uptimeStr = formatUptime(uptime);
        
        const status = {
            type: 'STATUS',
            data: {
                connectionState: client.readyState(),
                username: process.env.BOT_USERNAME,
                processId: process.pid,
                channels: client.getChannels(),
                uptime: uptimeStr,
                connected: client.readyState() === 'OPEN'
            }
        };
        ws.send(JSON.stringify(status));
    } catch (err) {
        console.error('Error sending status:', err);
    }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0 || days > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
    result += `${seconds}s`;
    
    return result;
}

function broadcastToAll(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (err) {
                console.error('Error broadcasting message:', err);
            }
        }
    });
}

async function handleRestart() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    try {
        await client.say(process.env.CHANNEL_NAME, 'Bot is restarting...');
        
        // Clean up the lock file
        const lockFile = path.join(__dirname, '..', 'bot.lock');
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
        }
        
        // Start a new instance
        const { spawn } = require('child_process');
        const scriptPath = path.join(__dirname, 'server.js');
        const child = spawn('node', [scriptPath], {
            detached: true,
            stdio: 'inherit'
        });
        
        child.unref();
        
        // Notify all clients
        broadcastToAll({ type: 'RESTARTING' });
        
        // Exit current instance
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    } catch (err) {
        console.error('Error during restart:', err);
        broadcastToAll({ type: 'ERROR', error: 'Restart failed: ' + err.message });
        isShuttingDown = false;
    }
}

async function handleExit() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    try {
        await client.say(process.env.CHANNEL_NAME, 'Bot is shutting down...');
        broadcastToAll({ type: 'SHUTTING_DOWN' });
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    } catch (err) {
        console.error('Error during shutdown:', err);
        broadcastToAll({ type: 'ERROR', error: 'Shutdown failed: ' + err.message });
        isShuttingDown = false;
    }
}

// Handle process signals
process.on('SIGINT', () => {
    if (!isShuttingDown) {
        handleExit();
    }
});

process.on('SIGTERM', () => {
    if (!isShuttingDown) {
        handleExit();
    }
});

// Handle Twitch events
client.on('connected', () => {
    console.log('Connected to Twitch');
    broadcastToAll({ type: 'CONNECTED' });
});

client.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    broadcastToAll({ type: 'DISCONNECTED', reason });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    broadcastToAll({ type: 'ERROR', error: 'Server error: ' + err.message });
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    broadcastToAll({ type: 'ERROR', error: 'Server promise rejection: ' + reason });
});

console.log(`MaxBot server started on port 8080`); 