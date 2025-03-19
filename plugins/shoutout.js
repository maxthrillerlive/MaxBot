class ShoutoutPlugin {
  constructor() {
    this.name = 'shoutout';
    this.description = 'Provides shoutout functionality with Twitch integration and auto-shoutouts';
    this.enabled = true;
    this.client = null;
    this.pluginManager = null;
    this.bot = null;
    this.logger = null;
    this.configManager = null;
    this.config = null;
    this.shoutoutHistory = {};
    this.recentlyProcessedMessages = [];
    this._commands = [];
    
    // Help information
    this.help = {
      title: 'Shoutout Plugin',
      description: 'Provides shoutout commands for streamers with Twitch API integration',
      commands: [
        {
          name: 'so',
          usage: '!so <username> [custom message]',
          description: 'Gives a shoutout to a streamer with their channel info'
        }
      ],
      config: {
        description: 'Configure shoutout settings using !plugin shoutout config',
        settings: [
          {
            name: 'autoShoutout.enabled',
            type: 'boolean',
            description: 'Enable/disable automatic shoutouts for returning chatters'
          },
          {
            name: 'autoShoutout.cooldownHours',
            type: 'number',
            description: 'Hours between auto-shoutouts for the same user'
          },
          {
            name: 'autoShoutout.welcomeMessage',
            type: 'string',
            description: 'Message to send when a known streamer returns'
          },
          {
            name: 'autoShoutout.message',
            type: 'string',
            description: 'Message template for auto-shoutouts'
          },
          {
            name: 'streamerMessageTemplate',
            type: 'string',
            description: 'Message template for manual shoutouts to streamers'
          },
          {
            name: 'nonStreamerMessageTemplate',
            type: 'string',
            description: 'Message template for manual shoutouts to non-streamers'
          },
          {
            name: 'announcementPrefix',
            type: 'string',
            description: 'Prefix for shoutout announcements'
          }
        ]
      }
    };
  }

  // Getter for commands to ensure plugin manager can access them
  get commands() {
    return this._commands;
  }
  
  // Setter for commands to ensure plugin manager can set them
  set commands(cmds) {
    this._commands = cmds;
  }

  init(bot) {
    this.client = bot.client;
    this.pluginManager = bot.pluginManager;
    this.bot = bot;
    this.logger = bot.logger;
    this.configManager = bot.pluginManager.configManager;
    
    // Load the configuration
    this.reloadConfig();
    
    // Set enabled state from config
    this.enabled = this.config.enabled;
    
    // Register commands
    this.registerCommands();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Always load shoutout history
    this.loadShoutoutHistory();
    this.logger.info(`[${this.name}] Loaded shoutout history with ${Object.keys(this.shoutoutHistory).length} entries`);
    
    this.logger.info(`[${this.name}] Plugin initialized successfully`);
  }
  
  setupEventListeners() {
    // Listen for channel joins to potentially trigger auto-shoutouts
    this.bot.events.on('twitch:join', this.onChannelJoin.bind(this));
    
    // Listen for messages to process auto-shoutouts
    this.bot.events.on('twitch:message', this.onTwitchMessage.bind(this));
  }
  
  reloadConfig() {
    this.logger.info(`[${this.name}] Reloading configuration`);
    
    // Create a default configuration with all necessary settings
    const defaultConfig = {
      enabled: true,
      cooldownMinutes: 60,
      streamerMessageTemplate: '🎮 Check out @{displayName} over at https://twitch.tv/{username} - they were last seen playing {gameInfo} 👍',
      nonStreamerMessageTemplate: '💖 Shoutout to @{displayName} - Thanks for being an awesome part of our community!!! 💖',
      announcementPrefix: '📢 Announcement:',
      autoShoutout: {
        enabled: false,
        cooldownHours: 24,
        message: "🎮 Look who it is, @{displayName}! Check them out over at https://twitch.tv/{username}!!! 👍"
      },
      commands: {
        so: {
          trigger: 'shoutout',
          aliases: ['so'],
          description: 'Give a shoutout to a streamer',
          usage: '!shoutout <username> [custom message]',
          cooldown: 5,
          modOnly: true,
          enabled: true
        }
      }
    };
    
    // Check if the config file exists, and if not, create it with defaults
    const configExists = this.checkConfigExists();
    if (!configExists) {
      this.logger.info(`[${this.name}] No config file found, creating default configuration`);
      
      // Save the default configuration to file
      this.configManager.savePluginConfig(this.name, defaultConfig);
      this.logger.info(`[${this.name}] Created new configuration file with the following settings:`);
      this.logger.info(`[${this.name}] - Plugin enabled: ${defaultConfig.enabled}`);
      this.logger.info(`[${this.name}] - Announcement prefix: "${defaultConfig.announcementPrefix}"`);
      this.logger.info(`[${this.name}] - Streamer message template: "${defaultConfig.streamerMessageTemplate}"`);
      this.logger.info(`[${this.name}] - Non-streamer message template: "${defaultConfig.nonStreamerMessageTemplate}"`);
      this.logger.info(`[${this.name}] - Auto-shoutout enabled: ${defaultConfig.autoShoutout.enabled}`);
      this.logger.info(`[${this.name}] - Cooldown minutes: ${defaultConfig.cooldownMinutes}`);
      
      // Use the default config directly
      this.config = defaultConfig;
    } else {
      // Load the existing config
      this.config = this.configManager.loadPluginConfig(this.name);
      this.logger.info(`[${this.name}] Loaded existing configuration file`);
      
      // Check if the loaded config is missing any required properties and add them from defaults
      let configUpdated = false;
      
      // Check for required root properties
      for (const key of Object.keys(defaultConfig)) {
        if (this.config[key] === undefined) {
          this.config[key] = defaultConfig[key];
          configUpdated = true;
          this.logger.info(`[${this.name}] Added missing property ${key} to config`);
        }
      }
      
      // Specifically check for message templates
      if (!this.config.streamerMessageTemplate) {
        this.config.streamerMessageTemplate = defaultConfig.streamerMessageTemplate;
        configUpdated = true;
        this.logger.info(`[${this.name}] Added missing streamerMessageTemplate to config`);
      }
      
      if (!this.config.nonStreamerMessageTemplate) {
        this.config.nonStreamerMessageTemplate = defaultConfig.nonStreamerMessageTemplate;
        configUpdated = true;
        this.logger.info(`[${this.name}] Added missing nonStreamerMessageTemplate to config`);
      }
      
      // Save the config if we updated it
      if (configUpdated) {
        this.configManager.savePluginConfig(this.name, this.config);
        this.logger.info(`[${this.name}] Updated configuration file with missing properties`);
      }
    }
    
    // If the legacy messages structure exists, upgrade to the root-level properties and remove it
    if (this.config.messages) {
      // Upgrade the templates if not already set
      if (this.config.messages.streamer && !this.config.streamerMessageTemplate) {
        this.config.streamerMessageTemplate = this.config.messages.streamer;
        this.logger.info(`[${this.name}] Upgraded streamer template from legacy messages object`);
      }
      
      if (this.config.messages.nonStreamer && !this.config.nonStreamerMessageTemplate) {
        this.config.nonStreamerMessageTemplate = this.config.messages.nonStreamer;
        this.logger.info(`[${this.name}] Upgraded non-streamer template from legacy messages object`);
      }
      
      // Remove the messages object to prevent duplication
      delete this.config.messages;
      this.logger.info(`[${this.name}] Removed legacy messages object from config`);
      
      // Save the cleaned up config
      this.configManager.savePluginConfig(this.name, this.config);
    }
    
    // Normalize legacy config properties that might have different casing
    let configUpdated = false;
    
    // Handle the case where 'autoshoutout' (lowercase) exists instead of autoShoutout (camelCase)
    if (this.config.autoshoutout !== undefined) {
      // Convert string values to the proper autoShoutout.enabled boolean
      if (typeof this.config.autoshoutout === 'string') {
        const normalizedValue = this.config.autoshoutout.toLowerCase();
        const isEnabled = normalizedValue === 'enable' || normalizedValue === 'enabled' || normalizedValue === 'true';
        
        if (!this.config.autoShoutout) {
          this.config.autoShoutout = {
            enabled: isEnabled,
            cooldownHours: 24,
            message: "🎮 Look who it is, @{displayName}! Check them out over at https://twitch.tv/{username}!!! 👍"
          };
        } else {
          // Update just the enabled property if object already exists
          this.config.autoShoutout.enabled = isEnabled;
        }
        
        configUpdated = true;
        this.logger.info(`[${this.name}] Normalized legacy 'autoshoutout' string value "${this.config.autoshoutout}" to boolean: ${isEnabled}`);
      } else if (typeof this.config.autoshoutout === 'object') {
        // If someone has accidentally created an 'autoshoutout' (lowercase) object, convert it
        this.config.autoShoutout = {...this.config.autoshoutout};
        configUpdated = true;
        this.logger.info(`[${this.name}] Converted legacy 'autoshoutout' object to 'autoShoutOut'`);
      }
      
      // Remove the legacy property
      delete this.config.autoshoutout;
      configUpdated = true;
    }
    
    // Fix any "They're an awesome streamer" text that might still be in the template
    if (this.config.streamerMessageTemplate && this.config.streamerMessageTemplate.includes("They're an awesome streamer")) {
      this.config.streamerMessageTemplate = this.config.streamerMessageTemplate.replace(
        "They're an awesome streamer", 
        "they were last seen playing {gameInfo}"
      );
      this.logger.info(`[${this.name}] Fixed streamer template text to use game info`);
      configUpdated = true;
    }
    
    // Remove legacy arrays if they exist
    if (this.config.knownStreamers !== undefined) {
      delete this.config.knownStreamers;
      configUpdated = true;
      this.logger.info(`[${this.name}] Removed legacy knownStreamers array`);
    }
    
    if (this.config.knownNonStreamers !== undefined) {
      delete this.config.knownNonStreamers;
      configUpdated = true;
      this.logger.info(`[${this.name}] Removed legacy knownNonStreamers array`);
    }
    
    if (this.config.excludedUsers !== undefined) {
      delete this.config.excludedUsers;
      configUpdated = true;
      this.logger.info(`[${this.name}] Removed legacy excludedUsers array`);
    }
    
    // If we've updated the config, save it
    if (configUpdated) {
      this.configManager.savePluginConfig(this.name, this.config);
      this.logger.info(`[${this.name}] Saved normalized configuration`);
    }
    
    // Check if the message templates exist and log them
    this.logger.info(`[${this.name}] Loaded message templates:`);
    this.logger.info(`[${this.name}] streamerMessageTemplate: "${this.config.streamerMessageTemplate}"`);
    this.logger.info(`[${this.name}] nonStreamerMessageTemplate: "${this.config.nonStreamerMessageTemplate}"`);
    
    this.logger.info(`[${this.name}] Configuration loaded: autoShoutout.enabled = ${this.config.autoShoutout?.enabled === true ? 'enabled' : 'disabled'}`);
  }
  
  registerCommands() {
    // Generate commands from config
    
    // Build the commands array for plugin manager compatibility
    this._commands = [];
    
    if (this.config.commands) {
      for (const [cmdKey, cmdConfig] of Object.entries(this.config.commands)) {
        if (cmdConfig.enabled !== false) {
          this._commands.push({
            name: cmdConfig.trigger || cmdKey,
            config: {
              description: cmdConfig.description || `${this.name} ${cmdKey} command`,
              usage: cmdConfig.usage || `!${cmdKey} [args]`,
              aliases: cmdConfig.aliases || [],
              cooldown: cmdConfig.cooldown || 5,
              modOnly: cmdConfig.modOnly !== undefined ? cmdConfig.modOnly : true,
              enabled: cmdConfig.enabled !== undefined ? cmdConfig.enabled : true
            },
            execute: (client, channel, tags, commandText) => {
              // Parse command and arguments
              // commandText is the full command string like "!shoutout @username"
              // We need to extract the command without the prefix and the arguments
              const cmdParts = commandText.trim().split(/\s+/);
              
              // Get the command without the prefix
              let cmd = cmdParts[0];
              if (cmd.startsWith('!')) {
                cmd = cmd.substring(1); // Remove the ! prefix
              }
              
              // Get the arguments (everything after the command)
              const args = cmdParts.slice(1);
              
              return this.handlePluginCommand(cmd, args, commandText, (msg) => client.say(channel, msg), tags);
            }
          });
        }
      }
    }
    
    this.logger.info(`[${this.name}] Plugin ready to handle commands via plugin manager`);
  }
  
  // Event handlers
  onChannelJoin(data) {
    // Auto-shoutout happens when someone sends a message, not on join
    this.logger.debug(`[${this.name}] Channel join detected: ${data.channel} by ${data.username}`);
  }
  
  onTwitchMessage(data) {
    if (this.config.autoShoutout.enabled && !data.self) {
      this.checkAutoShoutout(data.tags.username, data.channel);
    }
  }
  
  async checkAutoShoutout(username, channel) {
    const lowerUsername = username.toLowerCase();
    
    // Check if we've already given a shoutout recently
    if (this.shouldAutoShoutout(lowerUsername)) {
      try {
        // Get channel info to determine if this is a streamer
        const channelInfo = await this.getChannelInfo(lowerUsername);
        
        // Skip auto-shoutout if not a streamer
        if (!channelInfo) {
          return;
        }
        
        // Create auto-shoutout message
        let shoutoutMessage = this.config.autoShoutout.message
          .replace(/{username}/g, lowerUsername)
          .replace(/{displayName}/g, channelInfo?.display_name || username);
          
        // Add game info if available
        if (channelInfo && channelInfo.game_name) {
          shoutoutMessage += ` They were last seen playing ${channelInfo.game_name}!`;
        }
        
        // Save to history to prevent repeated shoutouts
        this.saveToShoutoutHistory(lowerUsername, channelInfo);
        
        // Send the message using the bot's say method
        this.bot.say(channel, shoutoutMessage);
        
        this.logger.info(`[${this.name}] Auto-shoutout given to ${username}`);
      } catch (error) {
        this.logger.error(`[${this.name}] Error giving auto-shoutout: ${error.message}`);
      }
    }
  }
  
  shouldAutoShoutout(username) {
    const lowerUsername = username.toLowerCase();
    
    // If not in history, definitely give a shoutout
    if (!this.shoutoutHistory[lowerUsername]) {
      return true;
    }
    
    // Check cooldown
    const lastShoutout = this.shoutoutHistory[lowerUsername].lastShoutout;
    const cooldownMs = this.config.autoShoutout.cooldownHours * 60 * 60 * 1000;
    const now = Date.now();
    
    return (now - lastShoutout) > cooldownMs;
  }
  
  loadShoutoutHistory() {
    try {
      // First try to use the configManager's loadDataFile method if available
      if (typeof this.configManager.loadDataFile === 'function') {
        this.logger.info(`[${this.name}] Using configManager.loadDataFile to load shoutout history`);
        this.shoutoutHistory = this.configManager.loadDataFile('shoutoutHistory', {});
      } else {
        // Fallback to trying to load directly from the filesystem
        const fs = require('fs');
        const path = require('path');
        const dataDir = path.join(process.cwd(), 'data');
        const dataFilePath = path.join(dataDir, 'shoutoutHistory.json');
        
        this.logger.info(`[${this.name}] Looking for shoutout history at: ${dataFilePath}`);
        
        if (fs.existsSync(dataFilePath)) {
          this.logger.info(`[${this.name}] Found existing shoutout history file, loading it`);
          
          try {
            const fileContent = fs.readFileSync(dataFilePath, 'utf8');
            this.shoutoutHistory = JSON.parse(fileContent);
          } catch (parseError) {
            this.logger.error(`[${this.name}] Error parsing shoutout history file: ${parseError.message}`);
            this.logger.info(`[${this.name}] Creating new empty shoutout history`);
            this.shoutoutHistory = {};
          }
        } else {
          // Create an empty history file if it doesn't exist
          this.logger.info(`[${this.name}] No shoutout history file found, creating empty one`);
          this.shoutoutHistory = {};
          
          // Create the data directory if it doesn't exist
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
          }
          
          // Save empty history file
          fs.writeFileSync(dataFilePath, JSON.stringify({}, null, 2), 'utf8');
          this.logger.info(`[${this.name}] Created empty shoutout history file`);
        }
      }
      
      // Safety check - if anything went wrong and somehow we got data, empty it
      if (Object.keys(this.shoutoutHistory).length > 0) {
        this.logger.info(`[${this.name}] Loaded shoutout history for ${Object.keys(this.shoutoutHistory).length} streamers`);
        
        // Filter out any entries for maxthriller
        if (this.shoutoutHistory.maxthriller) {
          delete this.shoutoutHistory.maxthriller;
          this.logger.info(`[${this.name}] Removed maxthriller from shoutout history`);
          this.saveShoutoutHistory();
        }
      } else {
        this.logger.info(`[${this.name}] Starting with empty shoutout history`);
      }
    } catch (error) {
      this.logger.error(`[${this.name}] Error loading shoutout history: ${error.message}`);
      this.shoutoutHistory = {};
    }
  }
  
  saveShoutoutHistory() {
    try {
      // First try to use the configManager's saveDataFile method if available
      if (typeof this.configManager.saveDataFile === 'function') {
        this.configManager.saveDataFile('shoutoutHistory', this.shoutoutHistory);
      } else {
        // Fallback to saving directly to the filesystem
        const fs = require('fs');
        const path = require('path');
        const dataDir = path.join(process.cwd(), 'data');
        const dataFilePath = path.join(dataDir, 'shoutoutHistory.json');
        
        // Create the data directory if it doesn't exist
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Save the file
        fs.writeFileSync(dataFilePath, JSON.stringify(this.shoutoutHistory, null, 2), 'utf8');
      }
      
      this.logger.debug(`[${this.name}] Saved shoutout history for ${Object.keys(this.shoutoutHistory).length} streamers`);
    } catch (error) {
      this.logger.error(`[${this.name}] Error saving shoutout history: ${error.message}`);
    }
  }
  
  saveToShoutoutHistory(username, channelInfo) {
    // Only save streamers to the history
    if (!channelInfo) {
      this.logger.debug(`[${this.name}] Not saving ${username} to shoutout history as they are not a streamer`);
      return;
    }
    
    const lowerUsername = username.toLowerCase();
    
    this.shoutoutHistory[lowerUsername] = {
      displayName: channelInfo?.display_name || username,
      lastShoutout: Date.now(),
      game: channelInfo?.game_name || '',
      url: `https://twitch.tv/${lowerUsername}`
    };
    
    this.saveShoutoutHistory();
    this.logger.debug(`[${this.name}] Updated shoutout history for streamer ${username}`);
  }
  
  createShoutoutMessage(username, channelInfo, customMessage = '') {
    try {
      // Start with the announcement prefix
      let message = `${this.config.announcementPrefix} `;
      
      // Log whether this is a streamer or non-streamer shoutout
      if (!channelInfo) {
        // USE NON-STREAMER FORMAT
        this.logger.info(`[${this.name}] Using NON-STREAMER format for ${username}`);
        
        // Use the non-streamer template from the root level only
        const template = this.config.nonStreamerMessageTemplate || 
                        '💖 Shoutout to @{displayName} - Thanks for being an awesome part of our community!!! 💖';
        
        this.logger.info(`[${this.name}] Using non-streamer template: "${template}"`);
        message += template
          .replace(/{username}/g, username)
          .replace(/{displayName}/g, username);
      } else {
        // USE STREAMER FORMAT
        this.logger.info(`[${this.name}] Using STREAMER format for ${username}`);
        
        // Prepare game info
        let gameInfo = '';
        if (channelInfo.game_name) {
          gameInfo = channelInfo.game_name;
          this.logger.info(`[${this.name}] Game info for ${username}: "${gameInfo}"`);
        } else {
          gameInfo = 'something awesome';
          this.logger.info(`[${this.name}] No game info available for ${username}, using default`);
        }
        
        // Use the streamer template from the root level only
        const template = this.config.streamerMessageTemplate ||
                        '🎮 Check out @{displayName} over at https://twitch.tv/{username} - they were last seen playing {gameInfo} 👍';
        
        this.logger.info(`[${this.name}] Using streamer template: "${template}"`);
        message += template
          .replace(/{username}/g, username)
          .replace(/{displayName}/g, channelInfo.display_name || username)
          .replace(/{gameInfo}/g, gameInfo);
      }
      
      // Add custom message if provided
      if (customMessage) {
        message += ` ${customMessage}`;
      }
      
      this.logger.info(`[${this.name}] Final shoutout message: ${message}`);
      return message;
    } catch (error) {
      this.logger.error(`[${this.name}] Error creating shoutout message: ${error.message}`);
      // Provide a simple fallback in case of error
      return `${this.config.announcementPrefix} Shoutout to @${username}!`;
    }
  }
  
  async getChannelInfo(username) {
    try {
      const lowerUsername = username.toLowerCase();
      
      // Use a promise to handle the API request via event system
      return new Promise((resolve, reject) => {
        const requestId = `twitch-channel-${username}-${Date.now()}`;
        
        // Set up a listener for the API response
        const responseHandler = (data) => {
          if (data.requestId === requestId) {
            // Clean up listener
            this.bot.events.removeListener('twitch:api:channelInfo:response', responseHandler);
            
            // Check if we got valid channel info
            if (data.error) {
              this.logger.warn(`[${this.name}] Error getting channel info: ${data.error}`);
              // Treat as non-streamer on error
              this.logger.info(`[${this.name}] Treating ${username} as non-streamer due to API error`);
              resolve(null);
            } else if (!data.channelInfo || Object.keys(data.channelInfo).length === 0) {
              // No channel info means not a streamer
              this.logger.info(`[${this.name}] No channel info for ${username}, treating as non-streamer`);
              resolve(null);
            } else {
              // Got valid channel info
              this.logger.info(`[${this.name}] Got channel info for ${username}: ${JSON.stringify(data.channelInfo)}`);
              
              // Check if they have game info (current or recent)
              if (data.channelInfo.game_name) {
                this.logger.info(`[${this.name}] ${username} has game info (${data.channelInfo.game_name}), treating as streamer`);
                resolve(data.channelInfo);
              } else if (data.channelInfo.broadcaster_type && data.channelInfo.broadcaster_type !== '') {
                // They have a broadcaster type, so they've streamed before
                this.logger.info(`[${this.name}] ${username} has broadcaster type (${data.channelInfo.broadcaster_type}), treating as streamer`);
                resolve(data.channelInfo);
              } else {
                // No game info or broadcaster type, treat as non-streamer
                this.logger.info(`[${this.name}] ${username} has no game info or broadcaster type, treating as non-streamer`);
                resolve(null);
              }
            }
          }
        };
        
        // Register the listener
        this.bot.events.on('twitch:api:channelInfo:response', responseHandler);
        
        // Set a timeout to prevent hanging
        setTimeout(() => {
          // Clean up the listener if it's still around
          this.bot.events.removeListener('twitch:api:channelInfo:response', responseHandler);
          
          // Treat as non-streamer on timeout
          this.logger.info(`[${this.name}] Timeout getting channel info for ${username}, treating as non-streamer`);
          resolve(null);
        }, 5000);
        
        // Emit the event to request channel info
        this.logger.info(`[${this.name}] Requesting channel info for ${username} (request ID: ${requestId})`);
        this.bot.events.emit('twitch:api:channelInfo:request', {
          requestId,
          username,
          requestor: this.name
        });
      });
    } catch (error) {
      this.logger.error(`[${this.name}] Error in getChannelInfo: ${error.message}`);
      return null;
    }
  }
  
  onConfigUpdate(key, value) {
    this.logger.info(`[${this.name}] Configuration update requested: key=${key}, value=${JSON.stringify(value)}`);
    
    // Convert the key to lowercase for case-insensitive matching
    const normalizedKey = key.toLowerCase();
    
    // Special handling for specific config keys
    switch(normalizedKey) {
      case 'enabled':
        // Update plugin enabled state
        this.enabled = value === true || value === 'true' || value === 'enabled';
        this.logger.info(`[${this.name}] Plugin ${this.enabled ? 'enabled' : 'disabled'}`);
        break;
        
      case 'autoshoutout':
      case 'autoshoutout.enabled':
      case 'autoShoutout':
      case 'autoShoutout.enabled':
        // Handle auto-shoutout configuration changes
        let isEnabled = false;
        
        // Normalize the input value to a boolean
        if (typeof value === 'string') {
          const normalizedValue = value.toLowerCase();
          isEnabled = normalizedValue === 'enable' || normalizedValue === 'enabled' || 
                     normalizedValue === 'true' || normalizedValue === 'on' || normalizedValue === '1';
        } else {
          isEnabled = Boolean(value);
        }
        
        this.logger.debug(`[${this.name}] Setting autoShoutout.enabled to ${isEnabled} (from input: ${value})`);
        
        // Ensure we have an autoShoutout object
        if (!this.config.autoShoutout) {
          this.config.autoShoutout = {
            enabled: isEnabled,
            cooldownHours: 24,
            message: "🎮 Look who it is, @{displayName}! Check them out over at https://twitch.tv/{username}!!! 👍"
          };
        } else {
          this.config.autoShoutout.enabled = isEnabled;
        }
        
        // Remove the legacy property if it exists
        if (this.config.autoshoutout !== undefined) {
          delete this.config.autoshoutout;
        }
        
        // Log the configuration change
        this.logger.info(`[${this.name}] AutoShoutout ${isEnabled ? 'enabled' : 'disabled'}`);
        
        // Force update the config file to ensure changes are saved
        const result = this.configManager.savePluginConfig(this.name, this.config);
        this.logger.debug(`[${this.name}] Config save result: ${result ? 'success' : 'failed'}`);
        
        // Verify the configuration was updated
        const updatedConfig = this.configManager.loadPluginConfig(this.name);
        this.logger.debug(`[${this.name}] Config after update: autoShoutout.enabled = ${updatedConfig.autoShoutout?.enabled}`);
        break;
        
      // Handle message template updates
      case 'streamermessagetemplate':
      case 'nonstreamermessagetemplate':
        // Force reload to ensure we get the latest templates
        this.reloadConfig();
        this.logger.info(`[${this.name}] Message templates reloaded after config update`);
        break;
    }
  }
  
  // Update enable/disable methods to save state to config
  enable() {
    this.enabled = true;
    this.config.enabled = true;
    this.configManager.savePluginConfig(this.name, this.config);
    this.logger.info(`[${this.name}] Plugin enabled`);
    return true;
  }
  
  disable() {
    // Set this plugin to disabled
    this.enabled = false;
    
    // Update the config
    this.config.enabled = false;
    this.configManager.savePluginConfig(this.name, this.config);
    this.logger.info(`[${this.name}] Plugin disabled`);
    return true;
  }

  // This is the ONLY method that should handle plugin commands
  async handlePluginCommand(command, args, message, replyFn, userInfo) {
    this.logger.info(`[${this.name}] Handling plugin command: ${command} with args: ${args?.join(' ') || ''}`);
    
    // Get all possible command triggers and aliases
    const commandMap = new Map();
    
    if (this.config.commands) {
      for (const [cmdKey, cmdConfig] of Object.entries(this.config.commands)) {
        if (cmdConfig.enabled !== false) {
          const trigger = cmdConfig.trigger || cmdKey;
          commandMap.set(trigger.toLowerCase(), true);
          
          // Add all aliases
          const aliases = cmdConfig.aliases || [];
          for (const alias of aliases) {
            commandMap.set(alias.toLowerCase(), true);
          }
        }
      }
    }
    
    // Normalize command to lowercase for matching
    const cmd = (command || '').toLowerCase();
    this.logger.debug(`[${this.name}] Looking for command match: ${cmd}`);
    this.logger.debug(`[${this.name}] Available commands: ${Array.from(commandMap.keys()).join(', ')}`);
    
    if (commandMap.has(cmd)) {
      this.logger.info(`[${this.name}] Command match found: ${cmd}`);
      
      // Handle the shoutout command
      if (!args || args.length === 0) {
        replyFn(`Please specify a username to shout out.`);
        return false;
      }
      
      let username = args[0].toLowerCase();
      if (username.startsWith('@')) {
        username = username.substring(1);
      }
      
      // Get any custom message
      const customMessage = args.slice(1).join(' ');
      
      this.logger.info(`[${this.name}] Shoutout requested for ${username} by ${userInfo?.username || 'unknown'}`);
  
      try {
        // Get channel info through the Twitch API
        this.logger.info(`[${this.name}] Getting channel info for ${username}`);
        const channelInfo = await this.getChannelInfo(username);
        
        // Log the channelInfo result
        if (channelInfo) {
          this.logger.info(`[${this.name}] Channel info received for ${username}, treating as streamer`);
          this.logger.debug(`[${this.name}] Channel info: ${JSON.stringify(channelInfo)}`);
          if (channelInfo.game_name) {
            this.logger.info(`[${this.name}] ${username} has game info: ${channelInfo.game_name}`);
          }
          if (channelInfo.broadcaster_type) {
            this.logger.info(`[${this.name}] ${username} broadcaster type: ${channelInfo.broadcaster_type}`);
          }
          if (channelInfo.is_live) {
            this.logger.info(`[${this.name}] ${username} is currently LIVE!`);
          }
        } else {
          this.logger.info(`[${this.name}] No channel info for ${username}, treating as non-streamer`);
        }
        
        // Create the shoutout message
        const message = this.createShoutoutMessage(username, channelInfo, customMessage);
        
        // Save to shoutout history (only if they're a streamer)
        if (channelInfo) {
          this.saveToShoutoutHistory(username, channelInfo);
        }
        
        // Log this status to discord if available
        try {
          if (this.bot.events) {
            const statusMsg = channelInfo ? 
              `Gave streamer shoutout to ${username}${channelInfo.game_name ? ` (game: ${channelInfo.game_name})` : ''}` :
              `Gave non-streamer shoutout to ${username}`;
            
            this.bot.events.emit('discord:log', {
              plugin: this.name,
              message: statusMsg
            });
          }
        } catch (err) {
          this.logger.debug(`[${this.name}] Error sending discord log: ${err.message}`);
        }
        
        // Send the message
        this.logger.info(`[${this.name}] Sending shoutout message: ${message}`);
        replyFn(message);
        return true;
      } catch (error) {
        this.logger.error(`[${this.name}] Error giving shoutout: ${error.message}`);
        this.logger.error(`[${this.name}] Error stack: ${error.stack}`);
        replyFn(`Failed to give shoutout to ${username}.`);
        return false;
      }
    }
    
    this.logger.info(`[${this.name}] No command match found for: ${cmd}`);
    return false;
  }
  
  checkConfigExists() {
    try {
      // Try to load the plugin config without defaults - if it returns null, the config doesn't exist
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'config', `${this.name}.json`);
      
      return fs.existsSync(configPath);
    } catch (error) {
      this.logger.error(`[${this.name}] Error checking config existence: ${error.message}`);
      return false;
    }
  }
}

module.exports = new ShoutoutPlugin(); 