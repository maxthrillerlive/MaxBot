# MaxBot

A customizable Twitch chat bot with WebSocket API support and plugin system.

## Features

- Twitch chat integration using `tmi.js`
- WebSocket API for external control
- Plugin system for extending functionality
- Custom command system with hot-reloading
- Secure OAuth2 authentication
- Configuration management with JSON files
- Mod-only command support

## Setup

1. Install dependencies:
```bash
npm install dotenv
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
├── twitch-auth.js     # Twitch authentication module
├── auth-server.js     # Authentication server
├── pluginManager.js   # Plugin management system
├── config-manager.js  # Configuration management
├── logger.js          # Logging utility
├── plugins/           # Bot plugins
│   ├── help.js        # Help command plugin
│   ├── dice.js        # Dice rolling plugin
│   └── ...            # Other plugins
└── config/            # Configuration files
    ├── maxbot.json    # Main bot configuration
    ├── help.json      # Help plugin configuration
    └── ...            # Other plugin configs
```

## Configuration System

MaxBot uses a configuration system with JSON files stored in the `config/` directory:

- `maxbot.json`: Main bot configuration
- `[plugin-name].json`: Plugin-specific configuration files

Configuration files are automatically created and loaded when the bot starts.

## Plugin System

MaxBot uses a plugin system for extending functionality. Plugins are loaded from the `plugins/` directory.

### Creating a Plugin

1. Create a new file in the `plugins/` directory:

```javascript
// hello.js - Example plugin
const plugin = {
    name: 'hello',
    version: '1.0.0',
    description: 'Greets users in chat',
    author: 'Your Name',
    
    // Plugin configuration
    config: {
        enabled: true,
        greetingMessage: 'Hello {username}!'
    },
    
    // Commands provided by this plugin
    commands: [
        {
            name: 'hello',
            config: {
                description: 'Greets the user',
                usage: '!hello',
                aliases: ['hi'],
                cooldown: 5,
                modOnly: false,
                enabled: true
            },
            execute: async (client, channel, context, commandText) => {
                const message = plugin.config.greetingMessage.replace('{username}', context.username);
                await client.say(channel, message);
                return true;
            }
        }
    ],
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.logger = logger;
        this.logger.info('[Hello] Plugin initialized successfully');
        return true;
    }
};

module.exports = plugin;
```

2. The plugin will be automatically loaded by the plugin manager when the bot starts.

### Plugin Commands

Plugins can provide commands that are automatically registered with the bot. Each command should have:

- `name`: The command name (without prefix)
- `config`: Command configuration (description, usage, aliases, etc.)
- `execute`: Function to execute when the command is triggered

### Plugin Lifecycle

- `init(bot, logger)`: Called when the plugin is initialized
- `enable()`: Called when the plugin is enabled
- `disable()`: Called when the plugin is disabled
- `processIncomingMessage(messageObj)`: Process incoming chat messages
- `processOutgoingMessage(messageObj)`: Process outgoing chat messages

## Chat Commands

The bot includes several built-in commands:

- `!help`: Shows available commands
- `!reload`: Reloads all plugins (mod only)
- `!enable [plugin]`: Enables a plugin (mod only)
- `!disable [plugin]`: Disables a plugin (mod only)

## WebSocket API

The bot exposes a WebSocket server on port 8080 with the following message types:

### Incoming Messages
- `GET_STATUS`: Request bot status
- `GET_PLUGINS`: Request plugin list
- `GET_COMMANDS`: Request command list
- `ENABLE_PLUGIN`: Enable a plugin
- `DISABLE_PLUGIN`: Disable a plugin
- `RESTART_BOT`: Restart the bot
- `EXIT_BOT`: Shutdown the bot

### Outgoing Messages
- `STATUS`: Current bot status
- `PLUGINS`: List of available plugins
- `COMMANDS`: List of available commands
- `CHAT_MESSAGE`: New chat message
- `ERROR`: Error message
- `CONNECTED`: Bot connected to Twitch
- `DISCONNECTED`: Bot disconnected from Twitch

## Related Projects

- [MaxBot-tui](https://github.com/maxthrillerlive/MaxBot-tui) - Terminal User Interface client

## License

MIT 