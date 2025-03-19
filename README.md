# MaxBot

A modular Twitch chat bot built with Node.js, featuring a plugin system, custom commands, and event-driven architecture.

## Installation Instructions

1. **Prerequisites**
   - [Node.js](https://nodejs.org/) (v14.0.0 or newer)
   - [npm](https://www.npmjs.com/) (usually comes with Node.js)
   - A Twitch account for your bot
   - Twitch OAuth credentials (see below for setup)

2. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/MaxBot.git
   cd MaxBot
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```
   
   This will install the following key dependencies:
   - `tmi.js`: Twitch Messaging Interface for chat interactions
   - `ws`: WebSocket library for the API server
   - `fs-extra`: Enhanced file system operations
   - `chalk`: Terminal text styling
   - `express`: Web server for the control panel (if enabled)
   - `winston`: Logging framework
   
   You can also install optional development dependencies:
   ```bash
   npm install --save-dev nodemon
   ```
   
   This installs:
   - `nodemon`: Monitors for changes and automatically restarts the bot during development

4. **Set up Twitch OAuth credentials**
   
   To connect to Twitch, you'll need to:
   
   a. Visit the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
   
   b. Create a new application with the following details:
      - Name: MaxBot (or your preferred name)
      - OAuth Redirect URLs: http://localhost:3000/callback
      - Category: Chat Bot
   
   c. Note your Client ID and generate a Client Secret
   
   d. Generate an OAuth token using one of these methods:
   
      **Option 1: Use the built-in auth server (Recommended)**
      ```bash
      # Set your environment variables first
      set CLIENT_ID=your_client_id
      set CLIENT_SECRET=your_client_secret
      set BOT_USERNAME=your_bot_username
      
      # Start the auth server
      node auth-server.js
      ```
      
      Then visit `http://localhost:3000` in your browser and follow the on-screen instructions to authenticate. The token will be automatically saved to the appropriate configuration file.
      
      **Option 2: Use an alternative token generator**
      
      Visit [Twitch Token Generator](https://twitchtokengenerator.com/) by swiftyspiffy and generate a chat token.
      The token will look like: `oauth:1234567890abcdefghijklmn`
      
      Note: For production applications, it's recommended to implement your own OAuth flow rather than using third-party token generators.

5. **Configure the bot**
   - Edit the following configuration files in the `config` directory:
   
     - `maxbot.json`: Core bot settings
       ```json
       {
         "bot": {
           "username": "YourBotUsername",
           "channels": ["YourChannelName"],
           "autoReconnect": true,
           "reconnectInterval": 5000,
           "maxReconnectAttempts": 10
         },
         "webcp": {
           "port": 3000,
           "wsPort": 8080
         }
       }
       ```
     
     - `commands.json`: Command prefix and cooldown settings
       ```json
       {
         "prefix": "!",
         "cooldown": 1000
       }
       ```
     
     - `features.json`: Logging and chat history settings
       ```json
       {
         "enableLogging": true,
         "enableChatHistory": true,
         "maxChatHistory": 100,
         "maxLogEntries": 1000
       }
       ```

6. **Start the bot**
   
   Regular operation:
   ```bash
   node index.js
   ```
   
   For development with auto-restart:
   ```bash
   npx nodemon index.js
   ```
   
   To run in the background (Linux/macOS):
   ```bash
   nohup node index.js > output.log 2>&1 &
   ```
   
   To run as a Windows service, consider using [pm2](https://pm2.keymetrics.io/):
   ```bash
   npm install -g pm2
   pm2 start index.js --name maxbot
   ```

7. **Verify the installation**
   
   - Visit `http://localhost:8080` in your browser to access the web control panel (if enabled)
   - The bot should connect to your specified Twitch channel(s)
   - Try typing `!help` in your Twitch chat to see available commands

## Project Structure

```
├── index.js           # Main bot entry point
├── pluginManager.js   # Plugin management system
├── configManager.js   # Configuration management
├── logger.js          # Logging utility
├── plugins/           # Bot plugins
│   ├── help.js        # Help command plugin
│   ├── dice.js        # Dice rolling plugin
│   └── ...            # Other plugins
└── config/            # Configuration files
    ├── maxbot.json    # Main bot configuration
    ├── commands.json  # Command settings
    ├── features.json  # Feature settings
    └── *.json         # Plugin-specific configs
```

## Features

- Twitch chat integration using `tmi.js`
- WebSocket API for external control
- Plugin system for extending functionality
- Configuration management with JSON files
- Event-driven architecture with hooks
- Automatic plugin loading and configuration
- Mod-only command support

## Core API Components

- **Bot**: Main bot instance providing access to Twitch connections and events
- **ConfigManager**: Manages configuration files for the bot and plugins
- **PluginManager**: Loads, initializes, and manages plugins
- **Logger**: Provides logging functionality throughout the application

## Plugin System

### Creating a Plugin

Plugins can be created either as an object or a class:

#### Class-based Plugin

```javascript
module.exports = class ExamplePlugin {
  constructor(bot) {
    this.bot = bot;                        // Main bot instance
    this.name = 'example';                 // Unique plugin name
    this.description = 'Example plugin';   // Plugin description
    this.version = '1.0.0';                // Plugin version
    this.author = 'MaxBot';                // Plugin author
    
    this.configManager = bot.configManager; // Access to configuration
    this.logger = bot.logger;              // Access to logging system
    this.commands = {};                    // Plugin commands
  }
  
  init() {
    // Plugin initialization code
    this.reloadConfig();                   // Load plugin configuration
    this.registerCommands();               // Register plugin commands
    this.setupEventListeners();            // Set up event listeners
    return true;
  }
  
  // Required plugin methods
  reloadConfig() { /* Load plugin-specific configuration */ }
  registerCommands() { /* Register plugin commands */ }
  setupEventListeners() { /* Set up event listeners */ }
}
```

#### Object-based Plugin

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
        greetingMessage: 'Hello {displayName}!'
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
                const message = plugin.config.greetingMessage.replace('{displayName}', context.displayName);
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

### Plugin Lifecycle Methods

- `init(bot, logger)`: Called when the plugin is initialized
- `enable()`: Called when the plugin is enabled
- `disable()`: Called when the plugin is disabled
- `reloadConfig()`: Load the plugin's configuration

### Adding Help Information

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
        }
    ]
}
```

## Event Hooks System

MaxBot uses an event-driven architecture that allows plugins to respond to various events.

### Core Events

- **twitch:connected**: Fired when the bot connects to Twitch
- **twitch:disconnected**: Fired when the bot disconnects from Twitch
- **twitch:message**: Fired when a message is received in chat
- **twitch:command**: Fired when a command is triggered
- **twitch:join**: Fired when a user joins the channel
- **twitch:part**: Fired when a user leaves the channel
- **twitch:sub/resub/subgift**: Fired for subscription events
- **twitch:cheer**: Fired when a cheer event occurs
- **twitch:raid**: Fired when a raid event occurs
- **command:before/after**: Fired before/after command processing
- **timer:minute/hour**: Fired on timer intervals
- **plugin:enabled/disabled/loaded/unload/reloaded**: Plugin lifecycle events

### Using Hooks in Plugins

```javascript
setupEventListeners() {
  // Listen for chat messages
  this.bot.events.on('twitch:message', this.onTwitchMessage.bind(this));
  
  // Listen for channel joins
  this.bot.events.on('twitch:join', this.onChannelJoin.bind(this));
  
  // Listen for command triggers
  this.bot.events.on('twitch:command', this.onCommand.bind(this));
}

onTwitchMessage(data) {
  // Handle message data
  const { channel, sender, message, isMod } = data;
  // Process the message
}

onChannelJoin(data) {
  // Handle join data
  const { channel, username } = data;
  // Process the join event
}

onCommand(data) {
  // Handle command data
  const { channel, sender, command, args } = data;
  // Process the command
}
```

### Emitting Custom Events

```javascript
// Emit a custom event
this.bot.emitEvent('myCustomEvent', { 
  plugin: this.name,
  timestamp: Date.now(),
  someData: 'Custom data'
});
```

## Configuration System

MaxBot uses JSON configuration files in the `config/` directory:

- `maxbot.json`: Main bot configuration
- `commands.json`: Command settings
- `features.json`: Feature settings
- `[plugin-name].json`: Plugin-specific configuration

Plugin configuration files are automatically created with defaults when a plugin is first loaded.

## Built-in Commands

- `!help`: Shows available commands
- `!help <command>`: Shows help for a specific command
- `!help <plugin>`: Shows help for a specific plugin
- `!plugin list`: Lists all available plugins and their status
- `!plugin <name> enable/disable/reload`: Manages plugins (mod only)

## WebSocket API

The bot exposes a WebSocket server with the following message types:

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

## Error Handling

MaxBot includes error handling for plugins to prevent individual plugin failures from affecting the entire bot:

```javascript
// Good practice for initialization
init: function(bot, logger) {
  try {
    // Initialization code here
    return true;
  } catch (error) {
    logger.error(`[${this.name}] Initialization failed: ${error.message}`);
    throw error; // Rethrow to inform plugin manager
  }
}

// Good practice for command execution
async executeCommand(client, channel, context, commandText) {
  try {
    // Command logic here
    return true;
  } catch (error) {
    this.logger.error(`[${this.name}] Command error: ${error.message}`);
    return false; // Return false to indicate failure
  }
}
```

## Related Projects

- [MaxBot-tui](https://github.com/maxthrillerlive/MaxBot-tui) - Terminal User Interface client

## License

MIT 