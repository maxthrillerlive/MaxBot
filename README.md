# MaxBot

A customizable Twitch chat bot with WebSocket API support.

## Features

- Twitch chat integration using `tmi.js`
- WebSocket API for external control
- Custom command system with hot-reloading
- Secure OAuth2 authentication
- Command state persistence
- Mod-only command support

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure the bot:
   - Go to [Twitch Developer Console](https://dev.twitch.tv/console)
   - Create a new application
   - Set OAuth Redirect URL to: `http://localhost:3000/callback`
   - Copy Client ID and Client Secret
   - Create a `.env` file with:

```env
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
BOT_USERNAME=your_bot_username
CHANNEL_NAME=your_channel_name
PORT=8080
AUTH_PORT=3000
NODE_ENV=development
```

3. Authenticate the bot:
```bash
npm run auth
```

4. Start the bot:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Project Structure

```
├── index.js           # Main bot entry point
├── server.js          # WebSocket server
├── auth-server.js     # Authentication server
├── commandManager.js  # Command handling system
└── commands/         # Bot commands
    ├── restart.js    # Example commands
    └── ...
```

## Adding Commands

1. Create a new file in `commands/` directory:

```javascript
module.exports = {
    name: 'hello',
    trigger: '!hello',
    description: 'Greets the user',
    enabled: true,
    modOnly: false,
    execute: async (client, target, context) => {
        await client.say(target, `Hello @${context.username}!`);
        return true;
    }
};
```

2. The command will be automatically loaded by the command manager.

## WebSocket API

The bot exposes a WebSocket server on port 8080 with the following message types:

### Incoming Messages
- `GET_STATUS`: Request bot status
- `GET_COMMANDS`: Request command list
- `ENABLE_COMMAND`: Enable a command
- `DISABLE_COMMAND`: Disable a command
- `RESTART_BOT`: Restart the bot
- `EXIT_BOT`: Shutdown the bot

### Outgoing Messages
- `STATUS`: Current bot status
- `COMMANDS`: List of available commands
- `CHAT_MESSAGE`: New chat message
- `ERROR`: Error message
- `CONNECTED`: Bot connected to Twitch
- `DISCONNECTED`: Bot disconnected from Twitch

## Related Projects

- [MaxBot-tui](https://github.com/maxthrillerlive/MaxBot-tui) - Terminal User Interface client

## License

MIT 