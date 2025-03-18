# MaxBot: Migration from Command System to Plugin System

This directory contains tools and instructions to help you migrate your MaxBot from using the older command system to relying exclusively on the more powerful plugin system.

## Why Migrate?

The plugin system offers several advantages over the standalone command system:

1. **Better Organization**: Related commands can be grouped in a single plugin
2. **More Powerful**: Plugins can do more than just respond to commands
3. **Simplified Codebase**: Using one system makes maintenance easier
4. **Enhanced Modularity**: Easier to enable/disable features as a unit

## Migration Process

### Step 1: Prepare the Migration Environment

Ensure you have a backup of your MaxBot installation before proceeding. Then:

1. Create the migration directories if they don't exist:
   ```
   mkdir -p MaxBot/migration/command_backups
   ```

2. Copy the migration scripts from this directory to your MaxBot installation.

### Step 2: Convert Commands to Plugins

Use the provided migration script to automatically convert your command files to plugins:

```
node migration/migrateCommands.js
```

This script will:
- Convert each command file in the `commands` directory to a plugin format
- Place the new plugin files in the `plugins` directory
- Create backups of your original command files in `migration/command_backups`

### Step 3: Review and Test the Migrated Plugins

1. Check each migrated plugin to ensure it functions correctly
2. Test each command to verify it works as expected through the plugin system
3. Make any necessary adjustments to the plugin code

### Step 4: Update the Main Application Code

Replace your `index.js` file with the updated version that only uses the plugin system:

```
cp migration/index.js.new index.js
```

Or make the following changes manually:

1. Remove any code that loads commands directly from the `commands` directory
2. Update the message handling to use only the plugin manager's `handleCommand` method
3. Remove any references to a command manager if present

### Step 5: Clean Up

Once everything is working correctly:

1. Remove the `commands` directory or rename it (e.g., `commands.old`)
2. Remove any unused command-related code and files

## Migration Templates

This directory includes several templates to help with the migration:

- `commandToPlugin.js`: A template for manually converting commands to plugins
- `migrateCommands.js`: An automated script to convert all commands
- `index.js.new`: An updated main file that uses only the plugin system

## Plugin Structure

For reference, here's the basic structure of a MaxBot plugin:

```javascript
const plugin = {
    name: 'pluginName',
    version: '1.0.0',
    description: 'Description of the plugin',
    author: 'MaxBot',
    
    // Plugin state
    enabled: true,
    client: null,
    logger: null,
    
    // Plugin configuration
    config: {
        enabled: true
        // Other config options...
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        
        this.logger.info('[PluginName] Plugin initializing...');
        
        // Set up commands
        this.setupCommands();
        
        this.logger.info('[PluginName] Plugin initialized successfully');
        return true;
    },
    
    // Set up commands
    setupCommands: function() {
        this.commands = [
            {
                name: 'commandName',
                config: {
                    description: 'Description of the command',
                    usage: '!commandName [args]',
                    aliases: ['alias1', 'alias2'],
                    cooldown: 5,
                    modOnly: false,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    // Command implementation
                }
            }
        ];
    },
    
    // Enable plugin
    enable: function() {
        this.config.enabled = true;
        return true;
    },
    
    // Disable plugin
    disable: function() {
        this.config.enabled = false;
        return true;
    }
};

module.exports = plugin;
```

## Troubleshooting

### Command Not Found After Migration

If a command isn't working after migration:
- Check if the plugin is enabled
- Verify the command is correctly defined in the plugin's commands array
- Check for any errors in the plugin initialization

### Command Working Inconsistently

If a command works sometimes but not others:
- Check for duplicate command registrations across multiple plugins
- Look for conflicting command names or aliases
- Verify the command's enabled status

### Error in Plugin Initialization

If you see errors when the bot starts:
- Check the plugin's init function for errors
- Make sure all required properties and methods are defined
- Verify that dependencies between plugins are correctly handled 