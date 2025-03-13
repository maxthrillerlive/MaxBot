const fs = require('fs');
const path = require('path');

class CommandManager {
    constructor() {
        this.commands = new Map();
        this.stateFile = path.join(__dirname, 'commands.json');
        this.loadCommands();
        this.loadState();
    }

    loadCommands() {
        const commandsDir = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            try {
                const commandPath = path.join(commandsDir, file);
                const command = require(commandPath);
                
                // Skip files that don't export the expected structure
                if (!command.config || !command.execute) {
                    console.warn(`Command file ${file} is missing required exports`);
                    continue;
                }
                
                // Add the command to our commands collection
                this.commands.set(command.config.name, command);
                
                // Register aliases
                if (command.config.aliases) {
                    for (const alias of command.config.aliases) {
                        this.commands.set(alias, command);
                    }
                }
                
                console.log(`Loaded command: ${command.config.name}`);
            } catch (error) {
                console.error(`Error loading command from ${file}:`, error);
            }
        }
    }

    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const states = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                // Apply saved states to commands
                for (const [name, enabled] of Object.entries(states)) {
                    const command = this.commands.get(name);
                    if (command) {
                        command.enabled = enabled;
                    }
                }
            }
        } catch (error) {
            console.error('Error loading command states:', error);
        }
    }

    saveState() {
        try {
            const states = {};
            this.commands.forEach((command, name) => {
                states[name] = command.enabled;
            });
            fs.writeFileSync(this.stateFile, JSON.stringify(states, null, 2));
        } catch (error) {
            console.error('Error saving command states:', error);
        }
    }

    registerCommand(command) {
        if (!command.name || !command.trigger || typeof command.execute !== 'function') {
            console.error('Invalid command format:', command);
            return false;
        }
        this.commands.set(command.name, command);
        return true;
    }

    enableCommand(name) {
        const command = this.commands.get(name);
        if (command) {
            command.enabled = true;
            this.saveState();
            return true;
        }
        return false;
    }

    disableCommand(name) {
        const command = this.commands.get(name);
        if (command) {
            command.enabled = false;
            this.saveState();
            return true;
        }
        return false;
    }

    listCommands() {
        return Array.from(this.commands.values());
    }

    getCommand(name) {
        return this.commands.get(name);
    }

    handleCommand(client, target, context, msg) {
        const commandTrigger = msg.trim().toLowerCase().split(' ')[0];
        
        // Find command by trigger instead of name
        const command = Array.from(this.commands.values()).find(cmd => 
            cmd.trigger.toLowerCase() === commandTrigger
        );
        
        if (!command || !command.enabled) {
            return false;
        }

        if (command.modOnly) {
            const isBroadcaster = context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
            const isMod = context.mod || isBroadcaster || context.badges?.broadcaster === '1';
            if (!isMod) {
                return false;
            }
        }

        try {
            return command.execute(client, target, context, msg);
        } catch (error) {
            console.error(`Error executing command ${command.name}:`, error);
            return false;
        }
    }
}

module.exports = new CommandManager(); 