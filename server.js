require('dotenv').config();
const tmi = require('tmi.js');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Global variables
let isShuttingDown = false;

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

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('Control panel connected');
    
    // Send initial status
    sendStatus(ws);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'GET_STATUS':
                    sendStatus(ws);
                    break;
                case 'CHAT_COMMAND':
                    await client.say(data.channel, data.message);
                    break;
                case 'RESTART_BOT':
                    await handleRestart();
                    break;
                case 'EXIT_BOT':
                    await handleExit();
                    break;
            }
        } catch (err) {
            console.error('Error:', err);
            ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
        }
    });

    ws.on('close', () => {
        console.log('Control panel disconnected');
    });
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

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(chatMessage));
        }
    });
});

function sendStatus(ws) {
    const status = {
        type: 'STATUS',
        data: {
            connectionState: client.readyState(),
            username: process.env.BOT_USERNAME,
            processId: process.pid,
            channels: client.getChannels()
        }
    };
    ws.send(JSON.stringify(status));
}

function broadcastToAll(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
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