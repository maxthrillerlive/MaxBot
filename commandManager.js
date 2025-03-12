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
        if (!fs.existsSync(commandsDir)) {
            fs.mkdirSync(commandsDir);
        }

        // Load built-in commands
        this.registerCommand({
            name: 'help',
            description: 'Show available commands',
            enabled: true,
            trigger: '!help',
            modOnly: false,
            execute: async (client, target, context) => {
                console.log('[DEBUG] Help command executing...');
                const commands = this.listCommands()
                    .filter(cmd => cmd.enabled)
                    .map(cmd => cmd.trigger)
                    .join(', ');
                console.log('[DEBUG] Available commands to show:', commands);
                try {
                    await client.say(target, `Available commands: ${commands}`);
                    console.log('[DEBUG] Help message sent successfully');
                    return true;
                } catch (error) {
                    console.error('[ERROR] Failed to send help message:', error);
                    return false;
                }
            }
        });

        // Load command files from the commands directory
        if (fs.existsSync(commandsDir)) {
            fs.readdirSync(commandsDir)
                .filter(file => file.endsWith('.js'))
                .forEach(file => {
                    try {
                        const command = require(path.join(commandsDir, file));
                        this.registerCommand(command);
                    } catch (error) {
                        console.error(`Error loading command from ${file}:`, error);
                    }
                });
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
        const commandName = msg.trim().toLowerCase().split(' ')[0].substring(1);
        const command = this.getCommand(commandName);
        
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
            console.error(`Error executing command ${commandName}:`, error);
            return false;
        }
    }
}

module.exports = new CommandManager(); 