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
├── configManager.js   # Configuration management
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

### Adding Help Information

To make your plugin's commands discoverable and usable by others, you should add help information to your plugin. This information will be used by the `!help` command to display usage instructions.

Add a `help` property to your plugin with a structure like this:

```javascript
// Help information for the plugin
help: {
    description: 'Short description of what your plugin does',
    commands: [
        {
            name: 'commandname',
            description: 'What this command does',
            usage: '!commandname <param1> <param2>',
            examples: [
                '!commandname value1 value2',
                '!commandname other example'
            ]
        },
        // Add more command help entries as needed
    ]
}
```

Users can then get help for your plugin using:
- `!help pluginname` - Shows general help for your plugin
- `!help commandname` - Shows help for a specific command

The help system will automatically display your plugin's description, list available commands, and show usage examples.

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

## Creating Third-Party Plugins

MaxBot is designed to be extended with plugins. You can create your own plugins without direct access to the MaxBot source code. This section explains how to create and distribute third-party plugins.

### Plugin Structure

A MaxBot plugin is a JavaScript file with a specific structure. The file should export an object (or a class instance) with the following properties and methods:

```javascript
// Example plugin structure
const plugin = {
    // Required properties
    name: 'myplugin',                  // Unique name for your plugin
    version: '1.0.0',                  // Version of your plugin
    description: 'Does something cool', // Description of what your plugin does
    author: 'Your Name',               // Your name or organization
    
    // Plugin state
    enabled: true,                     // Whether the plugin is enabled by default
    client: null,                      // Will be set to the Twitch client
    logger: null,                      // Will be set to the logger
    
    // Default configuration
    config: {
        enabled: true,                 // Whether the plugin is enabled (required)
        // Your custom configuration options
        option1: 'default value',
        option2: 123
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Required methods
    
    // Called when the plugin is loaded and enabled
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.configManager = bot.pluginManager.configManager;
        
        this.logger.info(`[${this.name}] Plugin initializing...`);
        
        // Set up commands
        this.commands = [
            {
                name: 'mycommand',
                config: {
                    description: 'Does something cool',
                    usage: '!mycommand [options]',
                    aliases: ['mc'],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        // Your command logic here
                        await client.say(channel, `@${context.username} Command executed!`);
                        return true;
                    } catch (error) {
                        this.logger.error(`[${this.name}] Error in command:`, error);
                        return false;
                    }
                }
            }
        ];
        
        // Register message handlers if needed
        bot.onMessage(this.handleMessage.bind(this));
        
        this.logger.info(`[${this.name}] Plugin initialized successfully`);
        return true;
    },
    
    // Optional methods
    
    // Called when a message is received (if registered)
    handleMessage: function(channel, user, message, self) {
        // Your message handling logic here
    },
    
    // Called when the plugin is enabled
    enable: function() {
        this.config.enabled = true;
        return true;
    },
    
    // Called when the plugin is disabled
    disable: function() {
        this.config.enabled = false;
        return true;
    }
};

module.exports = plugin;
```

### Installation

To install a third-party plugin:

1. Place the plugin file in the `plugins` directory of your MaxBot installation.
2. Restart MaxBot or use the `!reload` command to load the new plugin.
3. Configure the plugin using the appropriate configuration file in the `config` directory.

### Plugin Configuration

Plugins can have their own configuration files. MaxBot will automatically create a configuration file for your plugin in the `config` directory based on the default values in your plugin's `config` object.

The configuration file will be named after your plugin (e.g., `myplugin.json`) and will contain the settings for your plugin.

Users can edit this file to customize your plugin's behavior without having to modify your plugin code.

### Creating Commands

Commands are defined in the `commands` array. Each command should have:

1. A unique name
2. A configuration object with:
   - `description`: Description of what the command does
   - `usage`: How to use the command
   - `aliases`: Alternative names for the command (array)
   - `cooldown`: Time in seconds between uses
   - `modOnly`: Whether the command is restricted to moderators
   - `enabled`: Whether the command is enabled
3. An `execute` function that handles the command

The `execute` function should accept:
- `client`: The Twitch client
- `channel`: The channel the command was used in
- `context`: The user context
- `commandText`: The full command text

### Accessing MaxBot Features

Your plugin has access to:

1. **Twitch Client**: Use `this.client` to interact with Twitch chat
2. **Logger**: Use `this.logger` for logging
3. **Configuration Manager**: Use `this.configManager` to load and save settings
4. **Plugin Manager**: Use `this.bot.pluginManager` to interact with other plugins

### Distribution

To distribute your plugin:

1. Package your plugin file(s)
2. Include installation instructions
3. Document any configuration options
4. Share with other MaxBot users

Remember to respect the MaxBot license when distributing plugins.

### Examples

You'll find these template files in the `plugins` directory that you can use as a starting point:

1. **template.js** - An object-based template plugin with detailed comments
2. **template-class.js** - A class-based template plugin with detailed comments and TypeScript-style JSDoc comments

These templates include all the required methods and properties for a MaxBot plugin along with examples of command handling, message handling, and configuration management.

Check out the existing plugins in the `plugins` directory for additional examples of how to create plugins for MaxBot.

## Built-in Commands

MaxBot comes with the following built-in commands:

### Help Command

The `!help` command is built directly into MaxBot and provides information about available commands and plugins.

Usage:
- `!help` - Lists all available commands
- `!help <command>` - Shows help for a specific command
- `!help <plugin>` - Shows help for a specific plugin

When a plugin provides detailed help information, the help command will display that information, including command descriptions, usage details, and examples.

### Plugin Management

The `!plugin` command allows moderators to manage plugins at runtime.

Usage:
- `!plugin list` - Lists all available plugins and their status
- `!plugin <name> enable` - Enables a plugin
- `!plugin <name> disable` - Disables a plugin
- `!plugin <name> reload` - Reloads a plugin from disk

Only moderators can use the plugin management commands. 