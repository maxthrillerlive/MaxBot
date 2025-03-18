/**
 * Command to Plugin Migration Tool for MaxBot
 * 
 * This script converts standalone command modules into plugin format
 * and places them in the plugins directory.
 */

const fs = require('fs');
const path = require('path');

// Paths
const commandsDir = path.join(__dirname, '..', 'commands');
const pluginsDir = path.join(__dirname, '..', 'plugins');
const backupDir = path.join(__dirname, 'command_backups');

// Ensure directories exist
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Created backup directory: ${backupDir}`);
}

// Get all command files
const commandFiles = fs.readdirSync(commandsDir)
    .filter(file => file.endsWith('.js') && !file.endsWith('.bak'));

console.log(`Found ${commandFiles.length} command files to migrate.`);

// Process each command file
for (const commandFile of commandFiles) {
    try {
        console.log(`Processing ${commandFile}...`);
        
        // Read the command file
        const commandPath = path.join(commandsDir, commandFile);
        const commandCode = fs.readFileSync(commandPath, 'utf8');
        
        // Backup the command file
        const backupPath = path.join(backupDir, commandFile);
        fs.writeFileSync(backupPath, commandCode);
        console.log(`  Backed up to ${backupPath}`);
        
        // Load the command module
        const command = require(commandPath);
        
        if (!command.config || !command.execute) {
            console.log(`  Skipping ${commandFile}: does not have required config and execute properties`);
            continue;
        }
        
        // Get command info
        const commandName = command.config.name || path.basename(commandFile, '.js');
        const description = command.config.description || 'No description';
        const usage = command.config.usage || `!${commandName}`;
        const aliases = command.config.aliases || [];
        const cooldown = command.config.cooldown || 5;
        const modOnly = command.config.modOnly || false;
        
        // Create plugin content
        const pluginContent = `// Migrated from ${commandFile}
// ${description}

const plugin = {
    name: '${commandName}',
    version: '1.0.0',
    description: '${description}',
    author: 'MaxBot',
    
    // Plugin state
    enabled: true,
    client: null,
    logger: null,
    
    // Plugin configuration
    config: {
        enabled: true
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        
        this.logger.info('[${commandName}] Plugin initializing...');
        
        // Set up commands
        this.setupCommands();
        
        this.logger.info('[${commandName}] Plugin initialized successfully');
        return true;
    },
    
    // Set up commands
    setupCommands: function() {
        this.commands = [
            {
                name: '${commandName}',
                config: {
                    description: '${description}',
                    usage: '${usage}',
                    aliases: ${JSON.stringify(aliases)},
                    cooldown: ${cooldown},
                    modOnly: ${modOnly},
                    enabled: true
                },
                execute: ${command.execute.toString()}
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

module.exports = plugin;`;
        
        // Write the plugin file
        const pluginFile = `${commandName}.js`;
        const pluginPath = path.join(pluginsDir, pluginFile);
        
        // Check if plugin already exists
        if (fs.existsSync(pluginPath)) {
            console.log(`  Warning: Plugin ${pluginFile} already exists. Saving as ${commandName}_migrated.js instead.`);
            fs.writeFileSync(path.join(pluginsDir, `${commandName}_migrated.js`), pluginContent);
        } else {
            fs.writeFileSync(pluginPath, pluginContent);
        }
        
        console.log(`  ✓ Created plugin: ${pluginFile}`);
    } catch (error) {
        console.error(`  Error migrating ${commandFile}: ${error.message}`);
    }
}

console.log('\nMigration complete! Next steps:');
console.log('1. Review and test each migrated plugin');
console.log('2. Update index.js to use only the plugin manager');
console.log('3. Remove or comment out any old command loading code');
console.log('4. Once everything is working, you can remove the commands directory'); 