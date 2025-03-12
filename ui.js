const blessed = require('blessed');
const commandManager = require('./commandManager');

// Create a global message buffer
const messageBuffer = [];
const originalConsole = {
    log: console.log,
    error: console.error,
    info: console.info,
    warn: console.warn
};

// Set up early console capture
console.log = (...args) => {
    messageBuffer.push({ type: 'log', args });
    originalConsole.log.apply(console, args);
};
console.error = (...args) => {
    messageBuffer.push({ type: 'error', args });
    originalConsole.error.apply(console, args);
};
console.info = (...args) => {
    messageBuffer.push({ type: 'info', args });
    originalConsole.info.apply(console, args);
};
console.warn = (...args) => {
    messageBuffer.push({ type: 'warn', args });
    originalConsole.warn.apply(console, args);
};

class BotUI {
    constructor(client) {
        this.client = client;
        this.isShuttingDown = false;
        this.messageQueue = [];
        this.consoleInitialized = false;

        // Store original console methods
        this.originalConsole = originalConsole;

        // Common styles for UI elements
        this.commonBorder = {
            type: 'line',
            fg: 'cyan'
        };

        this.commonStyle = {
            border: {
                fg: 'cyan',
                bold: true
            },
            scrollbar: {
                bg: 'cyan',
                fg: 'black'
            },
            focus: {
                border: {
                    fg: 'white',
                    bold: true
                }
            }
        };

        // Set up console redirection immediately
        this.redirectConsole();
        
        // Set up the screen after console redirection
        this.setupScreen();
    }

    redirectConsole() {
        const redirect = (type, color, args) => {
            const formattedMessage = this.formatMessage(color, args);
            if (this.consoleInitialized && this.consoleBox) {
                this.consoleBox.log(formattedMessage);
                this.screen.render();
            } else {
                this.messageQueue.push(formattedMessage);
            }
            // Only call original console method for errors or if we're shutting down
            if (type === 'error' || this.isShuttingDown) {
                this.originalConsole[type].apply(console, args);
            }
        };

        console.log = (...args) => redirect('log', 'white', args);
        console.error = (...args) => redirect('error', 'red', args);
        console.info = (...args) => redirect('info', 'green', args);
        console.warn = (...args) => redirect('warn', 'yellow', args);
    }

    formatMessage(color, args) {
        const timestamp = new Date().toLocaleTimeString();
        const formattedArgs = args.map(arg => {
            if (Array.isArray(arg)) {
                return arg.map(item => this.formatArg(item)).join(', ');
            }
            return this.formatArg(arg);
        }).join(' ');
        return `{${color}-fg}[${timestamp}] ${formattedArgs}{/${color}-fg}`;
    }

    formatArg(arg) {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
            if (arg.trigger) return arg.trigger;
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return '[Object]';
            }
        }
        return String(arg);
    }

    setupScreen() {
        // Create a screen object
        this.screen = blessed.screen({
            smartCSR: true,
            title: '★ Twitch Bot Control Panel ★',
            dockBorders: true
        });

        // Create the menu panel (left side)
        this.menuList = blessed.list({
            parent: this.screen,
            width: '30%',
            height: '100%',
            left: 0,
            top: 0,
            border: this.commonBorder,
            style: {
                ...this.commonStyle,
                selected: {
                    bg: 'cyan',
                    fg: 'black',
                    bold: true
                },
                item: {
                    fg: 'white',
                    hover: {
                        bg: 'cyan',
                        fg: 'black'
                    }
                }
            },
            label: {
                text: ' Control Panel ',
                side: 'center'
            },
            keys: true,
            vi: true,
            mouse: true,
            padding: {
                left: 2,
                right: 2
            },
            items: [
                'Commands',
                'Enable Command',
                'Disable Command',
                'Bot Status',
                'Connected Channels',
                'Clear Console',
                'Restart Bot',
                'Exit Bot'
            ].map(item => `  ${item}  `),
            align: 'left'
        });

        // Create the results panel (top right)
        this.resultsBox = blessed.box({
            parent: this.screen,
            width: '70%',
            height: '60%',
            right: 0,
            top: 0,
            border: this.commonBorder,
            style: {
                ...this.commonStyle,
                fg: 'white'
            },
            label: {
                text: ' Status ',
                side: 'center'
            },
            content: '{center}Select an option from the Control Panel{/center}',
            scrollable: true,
            alwaysScroll: true,
            scrollbar: true,
            padding: 1,
            tags: true
        });

        // Create the console panel (bottom right)
        this.consoleBox = blessed.log({
            parent: this.screen,
            width: '70%',
            height: '40%',
            right: 0,
            bottom: 0,
            border: this.commonBorder,
            style: {
                ...this.commonStyle,
                fg: 'white'
            },
            label: {
                text: ' Console ',
                side: 'center'
            },
            scrollable: true,
            alwaysScroll: true,
            scrollbar: true,
            padding: 1,
            tags: true,
            mouse: true
        });

        // Process any buffered messages first
        while (messageBuffer.length > 0) {
            const msg = messageBuffer.shift();
            const color = msg.type === 'error' ? 'red' : 
                         msg.type === 'warn' ? 'yellow' : 
                         msg.type === 'info' ? 'green' : 'white';
            this.logToConsole(color, ...msg.args);
        }

        // Process any queued messages
        this.consoleInitialized = true;
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.consoleBox.log(message);
        }

        // Handle menu selection
        this.menuList.on('select', async (item) => {
            const selected = item.content;
            await this.handleMenuChoice(selected);
        });

        // Quit on Escape, q, or Control-C
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.confirmExit();
        });

        // Focus on the menu
        this.menuList.focus();

        // Draw box characters for borders
        this.screen.on('resize', () => {
            this.screen.render();
        });

        // Initial render
        this.screen.render();
    }

    logToConsole(color, ...args) {
        const formattedMessage = this.formatMessage(color, args);
        if (this.consoleBox) {
            this.consoleBox.log(formattedMessage);
            this.screen.render();
        } else {
            this.messageQueue.push(formattedMessage);
        }
    }

    showResult(content) {
        this.resultsBox.setContent(content);
        this.screen.render();
    }

    async handleMenuChoice(choice) {
        switch (choice.trim()) {
            case 'Commands':
                await this.viewCommands();
                break;
            case 'Enable Command':
                await this.enableCommand();
                break;
            case 'Disable Command':
                await this.disableCommand();
                break;
            case 'Bot Status':
                this.viewBotStatus();
                break;
            case 'Connected Channels':
                this.viewConnectedChannels();
                break;
            case 'Clear Console':
                this.consoleBox.setContent('');
                this.screen.render();
                break;
            case 'Restart Bot':
                await this.confirmRestart();
                break;
            case 'Exit Bot':
                await this.confirmExit();
                break;
        }
    }

    viewCommands() {
        const commands = commandManager.listCommands();
        let content = 'Available Commands:\n\n';
        commands.forEach(cmd => {
            const status = cmd.enabled ? 'Enabled' : 'Disabled';
            const modOnly = cmd.modOnly ? ' (Mod Only)' : '';
            content += `${cmd.trigger}: ${cmd.description}\n`;
            content += `Status: ${status}${modOnly}\n\n`;
        });
        this.showResult(content);
    }

    async enableCommand() {
        const commands = commandManager.listCommands();
        const disabledCommands = commands.filter(cmd => !cmd.enabled);
        
        if (disabledCommands.length === 0) {
            this.showResult('No disabled commands found.');
            return;
        }

        const promptBox = this.createPromptBox({
            items: disabledCommands.map(cmd => `${cmd.trigger}: ${cmd.description}`),
            label: ' Select Command to Enable (Esc to cancel) '
        });

        // Add escape key handler
        promptBox.key(['escape'], () => {
            promptBox.destroy();
            this.menuList.focus();
            this.screen.render();
        });

        promptBox.focus();
        this.screen.render();

        return new Promise((resolve) => {
            promptBox.once('select', (item) => {
                const commandName = item.content.split(':')[0].replace('!', '');
                if (commandManager.enableCommand(commandName)) {
                    this.showResult(`Enabled command: ${commandName}`);
                }
                promptBox.destroy();
                this.menuList.focus();
                this.screen.render();
                resolve();
            });
        });
    }

    async disableCommand() {
        const commands = commandManager.listCommands();
        const enabledCommands = commands.filter(cmd => cmd.enabled);
        
        if (enabledCommands.length === 0) {
            this.showResult('No enabled commands found.');
            return;
        }

        const promptBox = this.createPromptBox({
            items: enabledCommands.map(cmd => `${cmd.trigger}: ${cmd.description}`),
            label: ' Select Command to Disable (Esc to cancel) '
        });

        // Add escape key handler
        promptBox.key(['escape'], () => {
            promptBox.destroy();
            this.menuList.focus();
            this.screen.render();
        });

        promptBox.focus();
        this.screen.render();

        return new Promise((resolve) => {
            promptBox.once('select', (item) => {
                const commandName = item.content.split(':')[0].replace('!', '');
                if (commandManager.disableCommand(commandName)) {
                    this.showResult(`Disabled command: ${commandName}`);
                }
                promptBox.destroy();
                this.menuList.focus();
                this.screen.render();
                resolve();
            });
        });
    }

    viewBotStatus() {
        const status = this.client.readyState();
        const connectionState = status === 'OPEN' ? 'Connected' : 'Disconnected';
        let content = 'Bot Status:\n\n';
        content += `Connection State: ${connectionState}\n`;
        content += `Username: ${process.env.BOT_USERNAME}\n`;
        content += `Process ID: ${process.pid}`;
        this.showResult(content);
    }

    viewConnectedChannels() {
        const channels = this.client.getChannels();
        let content = 'Connected Channels:\n\n';
        channels.forEach(channel => {
            content += `${channel}\n`;
        });
        this.showResult(content);
    }

    async confirmRestart() {
        const confirm = await this.showConfirmDialog('Are you sure you want to restart the bot?');
        if (confirm) {
            this.isShuttingDown = true;
            try {
                await this.client.say(process.env.CHANNEL_NAME, 'Bot is restarting...');
                
                // Clean up the lock file before spawning new instance
                const fs = require('fs');
                const path = require('path');
                const lockFile = path.join(__dirname, '..', 'bot.lock');
                if (fs.existsSync(lockFile)) {
                    fs.unlinkSync(lockFile);
                }
                
                // Start a new instance of the bot
                const { spawn } = require('child_process');
                const scriptPath = path.join(__dirname, 'index.js');
                const child = spawn('node', [scriptPath], {
                    detached: true,
                    stdio: 'inherit'
                });
                
                // Unref the child process so the parent can exit
                child.unref();

                // Give the new instance time to start
                setTimeout(() => {
                    process.kill(process.pid, 'SIGTERM');
                }, 1000);
            } catch (err) {
                console.error('Error during restart:', err);
                this.isShuttingDown = false;
            }
        }
    }

    async confirmExit() {
        const confirm = await this.showConfirmDialog('Are you sure you want to exit?');
        if (confirm) {
            this.isShuttingDown = true;
            try {
                await this.client.say(process.env.CHANNEL_NAME, 'Bot is shutting down...');
            } catch (err) {
                console.error('Error sending shutdown message:', err);
            }
            setTimeout(() => {
                process.kill(process.pid, 'SIGTERM');
            }, 500);
        }
    }

    createPromptBox(options) {
        return blessed.list({
            parent: this.screen,
            width: '50%',
            height: '50%',
            top: 'center',
            left: 'center',
            border: this.commonBorder,
            style: {
                border: {
                    fg: 'cyan'
                },
                selected: {
                    bg: 'cyan',
                    fg: 'black',
                    bold: true
                },
                item: {
                    fg: 'white',
                    hover: {
                        bg: 'cyan',
                        fg: 'black'
                    }
                }
            },
            label: {
                text: options.label,
                side: 'center'
            },
            keys: true,
            vi: true,
            mouse: true,
            scrollbar: true,
            padding: 1,
            ...options
        });
    }

    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const dialog = blessed.box({
                parent: this.screen,
                border: this.commonBorder,
                height: 'shrink',
                width: '50%',
                top: 'center',
                left: 'center',
                label: {
                    text: ' * Confirm * ',
                    side: 'center'
                },
                style: {
                    border: {
                        fg: 'cyan'
                    },
                    fg: 'white'
                },
                padding: 1,
                tags: true,
                content: `{center}${message}{/center}\n\n{center}Press Y to confirm, N or Esc to cancel{/center}`
            });

            const cleanup = () => {
                dialog.destroy();
                this.menuList.focus();
                this.screen.render();
            };

            // Handle key events
            this.screen.key(['y', 'Y'], () => {
                cleanup();
                resolve(true);
            });

            this.screen.key(['escape', 'n', 'N'], () => {
                cleanup();
                resolve(false);
            });

            this.screen.render();
        });
    }
}

module.exports = BotUI; 