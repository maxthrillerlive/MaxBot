/**
 * Timer Plugin for MaxBot
 * 
 * This plugin allows users to create, list, and delete stream timers.
 * Timers will periodically send messages to the chat.
 * 
 * @version 1.0.0
 * @author External Developer
 */

const plugin = {
    // Required properties
    name: 'timer',
    version: '1.0.0',
    description: 'Create, list, and delete stream timers',
    author: 'External Developer',
    
    // Plugin state
    enabled: true,
    client: null,
    logger: null,
    bot: null,
    
    // Timer data
    timers: {},
    timerIntervals: {},
    
    // Help information for the plugin
    help: {
        description: 'Creates and manages chat timers that post messages at specified intervals',
        commands: [
            {
                name: 'timer add',
                description: 'Add a new timer',
                usage: '!timer add <name> <interval_minutes> <message>',
                examples: [
                    '!timer add welcome 15 Welcome to the stream everyone!',
                    '!timer add follow 10 Don\'t forget to follow!'
                ]
            },
            {
                name: 'timer list',
                description: 'List all active timers',
                usage: '!timer list',
                examples: [
                    '!timer list'
                ]
            },
            {
                name: 'timer remove',
                description: 'Remove a timer',
                usage: '!timer remove <name>',
                examples: [
                    '!timer remove welcome'
                ]
            },
            {
                name: 'timer start',
                description: 'Start a timer',
                usage: '!timer start <name>',
                examples: [
                    '!timer start welcome'
                ]
            },
            {
                name: 'timer stop',
                description: 'Stop a timer',
                usage: '!timer stop <name>',
                examples: [
                    '!timer stop welcome'
                ]
            }
        ]
    },
    
    // Default configuration
    config: {
        enabled: true,
        defaultInterval: 15, // Default interval in minutes
        maxTimers: 5,        // Maximum number of timers allowed
        minInterval: 5,      // Minimum interval in minutes
        maxInterval: 60      // Maximum interval in minutes
    },
    
    // Commands provided by this plugin
    commands: [],
    
    // Called when the plugin is loaded and enabled
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.configManager = bot.pluginManager.configManager;
        
        this.logger.info(`[${this.name}] Plugin initializing...`);
        
        // Load configuration and timers
        this.loadConfig();
        
        // Set up commands
        this.setupCommands();
        
        // Start all active timers
        this.startAllTimers();
        
        this.logger.info(`[${this.name}] Plugin initialized successfully`);
        return true;
    },
    
    // Load plugin configuration
    loadConfig: function() {
        // Load the plugin's configuration
        if (this.configManager) {
            const config = this.configManager.loadPluginConfigWithoutSaving(this.name, this.config);
            
            // Keep default settings if not overridden
            this.config = { 
                ...this.config, 
                ...config 
            };
            
            // Load timers from config
            if (config.timers) {
                this.timers = config.timers;
            }
            
            this.logger.info(`[${this.name}] Configuration loaded: ${JSON.stringify(this.config)}`);
        }
    },
    
    // Save plugin configuration
    saveConfig: function() {
        if (this.configManager) {
            // Clone the config to avoid modifying the original
            const configToSave = { ...this.config };
            
            // Add timers to the config
            configToSave.timers = this.timers;
            
            // Save the config
            this.configManager.savePluginConfig(this.name, configToSave);
            this.logger.info(`[${this.name}] Configuration saved`);
        }
    },
    
    // Set up commands
    setupCommands: function() {
        this.commands = [
            {
                name: 'timer',
                config: {
                    description: 'Manage stream timers',
                    usage: '!timer add <name> <interval> <message> | !timer list | !timer remove <name> | !timer start <name> | !timer stop <name>',
                    aliases: ['timers'],
                    cooldown: 5,
                    modOnly: true,
                    enabled: true
                },
                execute: async (client, channel, context, commandText) => {
                    try {
                        const params = commandText.trim().split(' ').slice(1);
                        
                        if (params.length === 0) {
                            await client.say(channel, `@${context.username} Please specify a timer action. Use !timer list to see available timers.`);
                            return true;
                        }
                        
                        const action = params[0].toLowerCase();
                        
                        switch (action) {
                            case 'add':
                            case 'create':
                                return await this.addTimer(client, channel, context, params.slice(1));
                            case 'list':
                                return await this.listTimers(client, channel, context);
                            case 'remove':
                            case 'delete':
                                return await this.removeTimer(client, channel, context, params.slice(1));
                            case 'start':
                                return await this.startTimer(client, channel, context, params.slice(1));
                            case 'stop':
                                return await this.stopTimer(client, channel, context, params.slice(1));
                            default:
                                await client.say(channel, `@${context.username} Unknown timer action: ${action}. Available actions: add, list, remove, start, stop`);
                        return true;
                        }
                    } catch (error) {
                        this.logger.error(`[${this.name}] Error in timer command:`, error);
                        return false;
                    }
                }
            }
        ];
    },
    
    // Add a new timer
    async addTimer(client, channel, context, params) {
        if (params.length < 3) {
            await client.say(channel, `@${context.username} Usage: !timer add <name> <interval_in_minutes> <message>`);
            return true;
        }
        
        const timerName = params[0].toLowerCase();
        
        // Validate timer name
        if (this.timers[timerName]) {
            await client.say(channel, `@${context.username} A timer with the name '${timerName}' already exists.`);
            return true;
        }
        
        // Check if max timers reached
        const timerCount = Object.keys(this.timers).length;
        if (timerCount >= this.config.maxTimers) {
            await client.say(channel, `@${context.username} Maximum number of timers (${this.config.maxTimers}) reached. Remove a timer first.`);
            return true;
        }
        
        // Parse interval
        let interval = parseInt(params[1]);
        if (isNaN(interval)) {
            interval = this.config.defaultInterval;
        }
        
        // Validate interval
        if (interval < this.config.minInterval) interval = this.config.minInterval;
        if (interval > this.config.maxInterval) interval = this.config.maxInterval;
        
        // Get timer message
        const message = params.slice(2).join(' ');
        
        // Add the timer
        this.timers[timerName] = {
            name: timerName,
            interval: interval,
            message: message,
            active: true,
            createdBy: context.username,
            createdAt: new Date().toISOString()
        };
        
        // Start the timer
        this.startTimerByName(timerName);
        
        // Save the configuration
        this.saveConfig();
        
        await client.say(channel, `@${context.username} Timer '${timerName}' added with interval of ${interval} minutes.`);
        return true;
    },
    
    // List all timers
    async listTimers(client, channel, context) {
        const timerCount = Object.keys(this.timers).length;
        
        if (timerCount === 0) {
            await client.say(channel, `@${context.username} No timers configured.`);
            return true;
        }
        
        let timersList = `@${context.username} Timers (${timerCount}/${this.config.maxTimers}): `;
        
        for (const [name, timer] of Object.entries(this.timers)) {
            const status = timer.active ? 'active' : 'inactive';
            timersList += `${name} (${timer.interval}m, ${status}), `;
        }
        
        // Remove trailing comma and space
        timersList = timersList.slice(0, -2);
        
        await client.say(channel, timersList);
        return true;
    },
    
    // Remove a timer
    async removeTimer(client, channel, context, params) {
        if (params.length < 1) {
            await client.say(channel, `@${context.username} Usage: !timer remove <name>`);
            return true;
        }
        
        const timerName = params[0].toLowerCase();
        
        // Check if timer exists
        if (!this.timers[timerName]) {
            await client.say(channel, `@${context.username} Timer '${timerName}' not found.`);
            return true;
        }
        
        // Stop the timer if it's running
        this.stopTimerByName(timerName);
        
        // Remove the timer
        delete this.timers[timerName];
        
        // Save the configuration
        this.saveConfig();
        
        await client.say(channel, `@${context.username} Timer '${timerName}' removed.`);
        return true;
    },
    
    // Start a timer
    async startTimer(client, channel, context, params) {
        if (params.length < 1) {
            await client.say(channel, `@${context.username} Usage: !timer start <name>`);
            return true;
        }
        
        const timerName = params[0].toLowerCase();
        
        // Check if timer exists
        if (!this.timers[timerName]) {
            await client.say(channel, `@${context.username} Timer '${timerName}' not found.`);
            return true;
        }
        
        // Check if timer is already active
        if (this.timers[timerName].active) {
            await client.say(channel, `@${context.username} Timer '${timerName}' is already active.`);
            return true;
        }
        
        // Start the timer
        this.timers[timerName].active = true;
        this.startTimerByName(timerName);
        
        // Save the configuration
        this.saveConfig();
        
        await client.say(channel, `@${context.username} Timer '${timerName}' started.`);
        return true;
    },
    
    // Stop a timer
    async stopTimer(client, channel, context, params) {
        if (params.length < 1) {
            await client.say(channel, `@${context.username} Usage: !timer stop <name>`);
            return true;
        }
        
        const timerName = params[0].toLowerCase();
        
        // Check if timer exists
        if (!this.timers[timerName]) {
            await client.say(channel, `@${context.username} Timer '${timerName}' not found.`);
            return true;
        }
        
        // Check if timer is already inactive
        if (!this.timers[timerName].active) {
            await client.say(channel, `@${context.username} Timer '${timerName}' is already inactive.`);
            return true;
        }
        
        // Stop the timer
        this.timers[timerName].active = false;
        this.stopTimerByName(timerName);
        
        // Save the configuration
        this.saveConfig();
        
        await client.say(channel, `@${context.username} Timer '${timerName}' stopped.`);
        return true;
    },
    
    // Start all active timers
    startAllTimers: function() {
        for (const [name, timer] of Object.entries(this.timers)) {
            if (timer.active) {
                this.startTimerByName(name);
            }
        }
    },
    
    // Start a specific timer
    startTimerByName: function(timerName) {
        // Stop timer if it's already running
        this.stopTimerByName(timerName);
        
        const timer = this.timers[timerName];
        if (!timer) return;
        
        // Convert minutes to milliseconds
        const intervalMs = timer.interval * 60 * 1000;
        
        // Create a new interval
        this.timerIntervals[timerName] = setInterval(() => {
            if (timer.active && this.client && this.config.enabled) {
                // Send the timer message to all channels the bot is connected to
                const channels = process.env.CHANNEL_NAME.split(',');
                for (const channel of channels) {
                    this.client.say(`#${channel.trim().toLowerCase()}`, timer.message);
                }
                
                this.logger.info(`[${this.name}] Timer '${timerName}' fired`);
            }
        }, intervalMs);
        
        this.logger.info(`[${this.name}] Timer '${timerName}' started with interval of ${timer.interval} minutes`);
    },
    
    // Stop a specific timer
    stopTimerByName: function(timerName) {
        if (this.timerIntervals[timerName]) {
            clearInterval(this.timerIntervals[timerName]);
            delete this.timerIntervals[timerName];
            this.logger.info(`[${this.name}] Timer '${timerName}' stopped`);
        }
    },
    
    // Stop all timers
    stopAllTimers: function() {
        for (const timerName in this.timerIntervals) {
            this.stopTimerByName(timerName);
        }
    },
    
    // Called when the plugin is enabled
    enable: function() {
        this.config.enabled = true;
        this.startAllTimers();
        this.logger.info(`[${this.name}] Plugin enabled`);
        return true;
    },
    
    // Called when the plugin is disabled
    disable: function() {
        this.config.enabled = false;
        this.stopAllTimers();
        this.logger.info(`[${this.name}] Plugin disabled`);
        return true;
    }
};

// Export the plugin
module.exports = plugin; 