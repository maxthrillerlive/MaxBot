const fs = require('fs');
const path = require('path');

// Collections to store commands and aliases
const commands = new Map();
const aliases = new Map();
const commandStates = new Map();
const pluginCommands = new Map(); // Track which commands came from which plugins

// Load commands from the commands directory
function loadCommands() {
    const commandsDir = path.join(__dirname, 'commands');
    console.log('Loading commands from directory:', commandsDir);
    
    // Check if directory exists
    if (!fs.existsSync(commandsDir)) {
        console.error('Commands directory does not exist:', commandsDir);
        return;
    }
    
    // List all files in the directory
    const files = fs.readdirSync(commandsDir);
    console.log('Files in commands directory:', files);
    
    const commandFiles = files.filter(file => file.endsWith('.js'));
    console.log('Command files found:', commandFiles);
    
    // Clear existing commands and aliases (except plugin commands)
    // We'll keep plugin commands since they're managed by the plugin manager
    const pluginCommandEntries = Array.from(pluginCommands.entries());
    commands.clear();
    aliases.clear();
    
    // Restore plugin commands
    for (const [pluginName, cmdNames] of pluginCommandEntries) {
        pluginCommands.set(pluginName, []); // Reset the list for this plugin
    }
    
    for (const file of commandFiles) {
        try {
            const commandPath = path.join(commandsDir, file);
            // Clear the require cache to ensure we get fresh command code
            delete require.cache[require.resolve(commandPath)];
            const command = require(commandPath);
            
            // Skip files that don't export the expected structure
            if (!command.config || !command.execute) {
                console.warn(`Command file ${file} is missing required exports`);
                continue;
            }
            
            // Add the command to our commands collection
            commands.set(command.config.name, command);
            
            // Restore command state if it exists
            if (commandStates.has(command.config.name)) {
                command.config.enabled = commandStates.get(command.config.name);
            }
            
            // Register aliases
            if (command.config.aliases) {
                for (const alias of command.config.aliases) {
                    aliases.set(alias, command.config.name);
                }
            }
            
            console.log(`Loaded command: ${command.config.name}`);
        } catch (error) {
            console.error(`Error loading command from ${file}:`, error);
        }
    }
    
    console.log(`Loaded ${commands.size} commands with ${aliases.size} aliases`);
}

// Handle a command
async function handleCommand(client, target, context, commandText) {
    try {
        console.log('=== Command Manager: handleCommand Start ===');
        console.log('Input:', {
            target,
            context: JSON.stringify(context),
            commandText
        });
        
        // Extract the command name and prefix
        const parts = commandText.trim().split(' ');
        const prefix = parts[0].charAt(0);
        const commandName = parts[0].substring(1).toLowerCase();
        
        console.log('Command parsing:', {
            parts,
            prefix,
            commandName
        });
        
        console.log('Looking for command:', commandName, 'with prefix:', prefix);
        console.log('Available commands:', Array.from(commands.keys()));
        console.log('Available aliases:', Array.from(aliases.keys()));
        
        // Find the command
        let command = commands.get(commandName);
        console.log('Direct command lookup result:', command ? {
            name: command.config.name,
            enabled: command.config.enabled,
            modOnly: command.config.modOnly
        } : 'not found');
        
        // Check aliases if command not found directly
        if (!command && aliases.has(commandName)) {
            const aliasTarget = aliases.get(commandName);
            command = commands.get(aliasTarget);
            console.log('Found command via alias:', aliasTarget);
        }
        
        // If command not found, return
        if (!command) {
            console.log(`Command not found: ${commandName}`);
            return false;
        }
        
        // Check if prefix matches (plugins use ? or !, regular commands use !)
        const expectedPrefix = command.config?.prefix || '!';
        // Allow both ! and ? for all commands for better compatibility
        if (prefix !== '!' && prefix !== '?') {
            console.log(`Invalid prefix for command ${commandName}. Expected: ! or ?, got: ${prefix}`);
            return false;
        }
        
        // Check if command is enabled
        if (command.config && command.config.enabled === false) {
            console.log(`Command is disabled: ${commandName}`);
            return false;
        }
        
        // Check if command is mod-only
        if (command.config && command.config.modOnly) {
            const isMod = context.mod || context.badges?.broadcaster === '1' || 
                          context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
            console.log('Mod check:', {
                commandName,
                isMod,
                context: {
                    mod: context.mod,
                    badges: context.badges,
                    username: context.username
                }
            });
            if (!isMod) {
                console.log(`Non-mod tried to use mod-only command: ${commandName}`);
                return false;
            }
        }
        
        // Execute the command
        console.log(`Executing command: ${commandName}`);
        try {
            console.log('Command object:', {
                name: command.config.name,
                hasExecute: !!command.execute,
                config: command.config,
                source: getCommandSource(commandName)
            });
            const result = await command.execute(client, target, context, commandText);
            console.log(`Command ${commandName} execution completed with result:`, result);
            return result;
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            return false;
        }
    } catch (error) {
        console.error('Error handling command:', error);
        return false;
    } finally {
        console.log('=== Command Manager: handleCommand End ===');
    }
}

// Get the source of a command (core or plugin name)
function getCommandSource(commandName) {
    for (const [pluginName, cmdNames] of pluginCommands.entries()) {
        if (cmdNames.includes(commandName)) {
            return `plugin:${pluginName}`;
        }
    }
    return 'core';
}

// Enable a command
function enableCommand(commandName) {
    const command = commands.get(commandName);
    if (command) {
        command.config.enabled = true;
        commandStates.set(commandName, true);
        console.log(`Enabled command: ${commandName}`);
        return true;
    }
    return false;
}

// Disable a command
function disableCommand(commandName) {
    const command = commands.get(commandName);
    if (command) {
        command.config.enabled = false;
        commandStates.set(commandName, false);
        console.log(`Disabled command: ${commandName}`);
        return true;
    }
    return false;
}

// List all commands
function listCommands() {
    const commandList = [];
    
    // Convert the Map to an array of command objects
    commands.forEach((command, name) => {
        if (command.config) {
            commandList.push({
                name: command.config.name,
                aliases: command.config.aliases || [],
                description: command.config.description || '',
                usage: command.config.usage || `!${command.config.name}`,
                enabled: command.config.enabled !== false,
                modOnly: command.config.modOnly || false,
                source: getCommandSource(name)
            });
        }
    });
    
    return commandList;
}

// Save command states
function saveState() {
    try {
        const stateObj = {};
        commandStates.forEach((enabled, name) => {
            stateObj[name] = enabled;
        });
        
        fs.writeFileSync(
            path.join(__dirname, 'data', 'commandStates.json'),
            JSON.stringify(stateObj, null, 2)
        );
        console.log('Command states saved');
    } catch (error) {
        console.error('Error saving command states:', error);
    }
}

// Load command states
function loadState() {
    try {
        const statePath = path.join(__dirname, 'data', 'commandStates.json');
        if (fs.existsSync(statePath)) {
            const stateObj = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            Object.entries(stateObj).forEach(([name, enabled]) => {
                commandStates.set(name, enabled);
            });
            console.log('Command states loaded');
        }
    } catch (error) {
        console.error('Error loading command states:', error);
    }
}

// Initialize
function init() {
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }
    
    // Load command states
    loadState();
    
    // Load commands
    loadCommands();
}

// Initialize on module load
init();

// Add this function
function reloadAllCommands() {
    console.log('Forcing reload of all commands...');
    loadCommands();
    console.log('Commands reloaded. Current commands:');
    console.log(Array.from(commands.keys()));
    console.log('Current aliases:');
    console.log(Array.from(aliases.entries()));
}

// Add command function
function addCommand(command, pluginName = null) {
    try {
        // Validate command structure
        if (!command.name || !command.execute) {
            console.error('Invalid command format - missing name or execute function');
            return false;
        }

        // Format the command object
        const commandObj = {
            config: {
                name: command.name,
                description: command.config?.description || 'No description',
                usage: command.config?.usage || `!${command.name}`,
                enabled: command.config?.enabled !== false,
                modOnly: command.config?.modOnly || false,
                prefix: command.config?.prefix || '!'
            },
            execute: command.execute
        };
        
        // Add the command using the lowercase name as key
        const commandName = command.name.toLowerCase();
        commands.set(commandName, commandObj);
        
        // If this is a plugin command, track it
        if (pluginName) {
            if (!pluginCommands.has(pluginName)) {
                pluginCommands.set(pluginName, []);
            }
            pluginCommands.get(pluginName).push(commandName);
            console.log(`Added plugin command: ${commandName} from plugin: ${pluginName}`);
        } else {
            console.log(`Added core command: ${commandName}`);
        }
        
        // Register aliases if any
        if (command.config?.aliases) {
            for (const alias of command.config.aliases) {
                aliases.set(alias, commandName);
                console.log(`Registered alias: ${alias} for command: ${commandName}`);
            }
        }
        
        // Log current commands for debugging
        console.log('Current commands:', Array.from(commands.keys()));
        return true;
    } catch (error) {
        console.error(`Error adding command:`, error);
        return false;
    }
}

// Remove commands from a plugin
function removePluginCommands(pluginName) {
    if (!pluginCommands.has(pluginName)) {
        return false;
    }
    
    const cmdNames = pluginCommands.get(pluginName);
    for (const cmdName of cmdNames) {
        const command = commands.get(cmdName);
        
        // Remove aliases for this command
        if (command && command.config && command.config.aliases) {
            for (const alias of command.config.aliases) {
                aliases.delete(alias);
            }
        }
        
        // Remove the command
        commands.delete(cmdName);
        console.log(`Removed plugin command: ${cmdName} from plugin: ${pluginName}`);
    }
    
    // Clear the plugin's command list
    pluginCommands.delete(pluginName);
    return true;
}

// Export it
module.exports = {
    handleCommand,
    enableCommand,
    disableCommand,
    listCommands,
    loadCommands,
    saveState,
    reloadAllCommands,
    addCommand,
    removePluginCommands,
    // Export the commands map for debugging
    getCommands: () => Array.from(commands.entries()),
    getAliases: () => Array.from(aliases.entries()),
    getPluginCommands: () => Array.from(pluginCommands.entries())
}; 