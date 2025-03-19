/**
 * Help Plugin for MaxBot
 * Provides help and command information functionality
 */

class HelpPlugin {
  constructor() {
    this.name = 'help';
    this.description = 'Provides help and command information';
    this.version = '1.0.0';
    this.author = 'MaxBot';
    this.logger = null;
    this.config = {};
    this.enabled = true;
    this.pluginManager = null;
  }
  
  init(bot) {
    this.logger = bot.logger;
    this.client = bot.client;
    this.pluginManager = bot.pluginManager;
    this.bot = bot;
    
    this.logger.info(`[${this.name}] Plugin initialized`);
    
    this.reloadConfig();
    this.registerCommands();
    
    return true;
  }
  
  reloadConfig() {
    // Load configuration from the config manager (if exists)
    this.config = this.pluginManager.configManager.loadPluginConfig(this.name, {
      showModCommands: true,
      enabled: true
    });
    
    this.logger.info(`[${this.name}] Configuration loaded`);
  }
  
  // Register commands
  registerCommands() {
    this.commands = [
      {
        name: 'help',
        config: {
          description: 'Get help on available commands',
          usage: '!help [command] or !help mod for moderator commands',
          aliases: [],
          cooldown: 5,
          modOnly: false,
          enabled: true
        },
        execute: this.handleHelpCommand.bind(this)
      }
    ];
  }
  
  // Handle the help command
  async handleHelpCommand(client, channel, context, commandText) {
    try {
      // Parse parameters (just remove the command itself)
      const params = commandText.trim().split(' ').slice(1);
      
      this.logger.info(`[${this.name}] Processing help command with params: ${JSON.stringify(params)}`);
      
      // If "mod" parameter is provided, show mod-only commands
      if (params.length > 0 && params[0].toLowerCase() === 'mod') {
        this.logger.info(`[${this.name}] Showing mod-only commands list`);
        const result = await this.listModCommands(client, channel, context);
        this.logger.info(`[${this.name}] Result of listModCommands: ${result}`);
        return result;
      }
      
      // If a specific command is requested, show help for that command
      if (params.length > 0) {
        const commandName = params[0].toLowerCase();
        this.logger.info(`[${this.name}] Showing help for specific command: ${commandName}`);
        const result = await this.showCommandHelp(client, channel, context, commandName);
        this.logger.info(`[${this.name}] Result of showCommandHelp: ${result}`);
        return result;
      }
      
      // Otherwise, show a list of all commands
      this.logger.info(`[${this.name}] Showing list of all commands`);
      const result = await this.listCommands(client, channel, context);
      this.logger.info(`[${this.name}] Result of listCommands: ${result}`);
      return result;
    } catch (error) {
      this.logger.error(`[${this.name}] Error in help command:`, error);
      await client.say(channel, `@${context.username} Sorry, there was an error processing the help command.`);
      return false;
    }
  }
  
  // List all moderator-only commands
  async listModCommands(client, channel, context) {
    try {
      // Check if user is a mod - only mods should see mod commands
      const isMod = context.mod || context.badges?.broadcaster === '1' || 
                   context.username.toLowerCase() === process.env.CHANNEL_NAME.toLowerCase();
      
      if (!isMod) {
        await client.say(channel, `@${context.username} You need to be a moderator to view mod-only commands.`);
        return false;
      }
      
      // Get all commands from the plugin manager
      const commands = this.pluginManager.listCommands();
      
      // Filter for mod-only commands
      const modCommands = commands.filter(cmd => cmd.config && cmd.config.modOnly === true);
      
      // Group by plugin
      const commandsByPlugin = {};
      
      // Add built-in mod commands
      commandsByPlugin['system'] = ['plugin', 'debug', 'reload'];
      
      // Group plugin mod commands
      for (const command of modCommands) {
        const pluginName = command.pluginName || 'unknown';
        if (!commandsByPlugin[pluginName]) {
          commandsByPlugin[pluginName] = [];
        }
        commandsByPlugin[pluginName].push(command.name);
      }
      
      // Build the message
      let message = `@${context.username} Moderator commands:\n`;
      
      // Add each plugin's commands to the message
      const pluginNames = Object.keys(commandsByPlugin).sort();
      
      for (let i = 0; i < pluginNames.length; i++) {
        // Skip plugins with no commands
        if (commandsByPlugin[pluginNames[i]].length === 0) {
          continue;
        }
        
        const pluginName = pluginNames[i];
        const pluginCommands = commandsByPlugin[pluginName].sort();
        
        // Capitalize the first letter of the plugin name
        const displayName = pluginName.charAt(0).toUpperCase() + pluginName.slice(1);
        
        // Add plugin name and its commands
        message += `${displayName}: ${pluginCommands.map(cmd => `!${cmd}`).join(', ')}`;
        
        // Add a newline if not the last plugin
        if (i < pluginNames.length - 1) {
          message += '\n';
        }
      }
      
      // Send the message
      await client.say(channel, message);
      this.logger.info(`[${this.name}] Displayed mod command list to ${context.username}`);
      return true;
    } catch (error) {
      this.logger.error(`[${this.name}] Error listing mod commands:`, error);
      await client.say(channel, `@${context.username} Error listing mod commands.`);
      return false;
    }
  }
  
  // List all available commands
  async listCommands(client, channel, context) {
    try {
      // Get all commands from the plugin manager
      const commands = this.pluginManager.listCommands();
      
      if (!commands || commands.length === 0) {
        await client.say(channel, `@${context.username} No commands are currently available.`);
        this.logger.warn(`[${this.name}] No commands returned from plugin manager`);
        return false;
      }
      
      // Group commands by plugin
      const commandsByPlugin = {};
      
      // Add built-in commands
      commandsByPlugin['system'] = ['help', 'plugin', 'debug'];
      
      // Group plugin commands
      for (const command of commands) {
        // Skip commands that aren't enabled
        if (command.config && command.config.enabled === false) {
          continue;
        }
        
        const pluginName = command.pluginName || 'unknown';
        if (!commandsByPlugin[pluginName]) {
          commandsByPlugin[pluginName] = [];
        }
        commandsByPlugin[pluginName].push(command.name);
      }
      
      // Add the built-in help command
      if (!commandsByPlugin['Core']) {
        commandsByPlugin['Core'] = [];
      }
      
      if (!commandsByPlugin['Core'].includes('help')) {
        commandsByPlugin['Core'].push('help');
      }
      
      // Add plugin command if not included
      if (!commandsByPlugin['Core'].includes('plugin')) {
        commandsByPlugin['Core'].push('plugin');
      }
      
      // Build the message
      let message = `@${context.username} Available commands:\n`;
      
      // Add commands from each plugin
      const pluginNames = Object.keys(commandsByPlugin).sort();
      for (let i = 0; i < pluginNames.length; i++) {
        const pluginName = pluginNames[i];
        const pluginCommands = commandsByPlugin[pluginName].sort();
        
        // Capitalize the first letter of the plugin name
        const displayName = pluginName.charAt(0).toUpperCase() + pluginName.slice(1);
        
        // Add plugin name and its commands
        message += `${displayName}: ${pluginCommands.map(cmd => `!${cmd}`).join(', ')}`;
        
        // Add a newline if not the last plugin
        if (i < pluginNames.length - 1) {
          message += '\n';
        }
      }
      
      // Add help text
      message += '\nUse !help [command] for more information on a specific command.';
      
      // Send the message
      await client.say(channel, message);
      this.logger.info(`[${this.name}] Displayed command list to ${context.username}`);
      return true;
    } catch (error) {
      this.logger.error(`[${this.name}] Error listing commands:`, error);
      await client.say(channel, `@${context.username} Error listing commands.`);
      return false;
    }
  }
  
  // Show help for a specific command
  async showCommandHelp(client, channel, context, commandName) {
    try {
      // Handle built-in help command
      if (commandName === 'help') {
        await client.say(channel, `@${context.username} Help for !help: List available commands or get help for a specific command. Usage: !help [command]`);
        return true;
      }
      
      // Handle built-in plugin command
      if (commandName === 'plugin') {
        await client.say(channel, `@${context.username} Help for !plugin: Manage bot plugins. Usage: !plugin <plugin-name> <list|info|enable|disable|reload|recover> or !plugin reload to reload all plugins`);
        return true;
      }
      
      // Handle built-in debug command
      if (commandName === 'debug') {
        await client.say(channel, `@${context.username} Help for !debug: Debug commands for moderators. Usage: !debug <plugins|hello|errors|reload|fixhello>`);
        return true;
      }
      
      // Handle special mod command
      if (commandName === 'mod') {
        await client.say(channel, `@${context.username} Help for !help mod: Display a list of all moderator-only commands available in the bot. Usage: !help mod`);
        return true;
      }
      
      // Get all commands
      const commands = this.pluginManager.listCommands();
      
      // Find the command
      const command = commands.find(cmd => 
        cmd.name === commandName || 
        (cmd.config && cmd.config.aliases && Array.isArray(cmd.config.aliases) && cmd.config.aliases.includes(commandName))
      );
      
      if (!command) {
        // If command not found, check if it's a plugin name
        const plugin = this.pluginManager.getPlugin(commandName);
        if (plugin && plugin.help) {
          return await this.showPluginHelp(client, channel, context, plugin);
        }
        
        await client.say(channel, `@${context.username} Command not found: ${commandName}`);
        return false;
      }
      
      // Build the help message
      let message = `@${context.username} Help for !${command.name}: ${command.config?.description || 'No description'}`;
      
      // Add usage
      if (command.config?.usage) {
        message += `. Usage: ${command.config.usage}`;
      }
      
      // Add aliases
      if (command.config?.aliases && Array.isArray(command.config.aliases) && command.config.aliases.length > 0) {
        message += `. Aliases: ${command.config.aliases.map(alias => `!${alias}`).join(', ')}`;
      }
      
      // Add cooldown
      if (command.config?.cooldown) {
        message += `. Cooldown: ${command.config.cooldown}s`;
      }
      
      // Add mod only
      if (command.config?.modOnly) {
        message += `. Mod only: Yes`;
      }
      
      // Send the message
      await client.say(channel, message);
      return true;
    } catch (error) {
      this.logger.error(`[${this.name}] Error showing command help:`, error);
      await client.say(channel, `@${context.username} Error showing command help.`);
      return false;
    }
  }
  
  // Show help for a plugin
  async showPluginHelp(client, channel, context, plugin) {
    try {
      if (!plugin.help) {
        await client.say(channel, `@${context.username} No help information available for plugin: ${plugin.name}`);
        return false;
      }
      
      // Send plugin description
      await client.say(channel, `@${context.username} Plugin: ${plugin.name} - ${plugin.help.description}`);
      
      // If plugin has command help information, list the commands
      if (plugin.help.commands && plugin.help.commands.length > 0) {
        await client.say(channel, `@${context.username} Commands in ${plugin.name}:`);
        
        // Send help for each command
        for (const cmd of plugin.help.commands) {
          let cmdHelp = `!${cmd.name}: ${cmd.description}`;
          if (cmd.usage) {
            cmdHelp += `. Usage: ${cmd.usage}`;
          }
          await client.say(channel, cmdHelp);
          
          // If there are examples, send them too (up to 3)
          if (cmd.examples && cmd.examples.length > 0) {
            const examples = cmd.examples.slice(0, 3);
            await client.say(channel, `@${context.username} Examples: ${examples.join(' | ')}`);
          }
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error(`[${this.name}] Error showing plugin help:`, error);
      await client.say(channel, `@${context.username} Error showing plugin help.`);
      return false;
    }
  }
  
  // Required plugin methods
  enable() {
    this.enabled = true;
    return true;
  }
  
  disable() {
    this.enabled = false;
    return true;
  }
  
  onConfigUpdate(key, value) {
    this.logger.info(`[${this.name}] Configuration updated: ${key} = ${JSON.stringify(value)}`);
  }
}

module.exports = HelpPlugin; 