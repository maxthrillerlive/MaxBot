class ShoutoutPlugin {
  constructor() {
    this.name = 'shoutout';
    this.description = 'Provides shoutout functionality';
    this.enabled = true;
    this.client = null;
    this.pluginManager = null;
    this.bot = null;
    this.logger = null;
    this.configManager = null;
    this.config = null;
    this.knownStreamers = [];
    this.recentlyProcessedMessages = [];
    this.commands = [];
  }

  init(bot) {
    this.client = bot.client;
    this.pluginManager = bot.pluginManager;
    this.bot = bot;
    this.logger = bot.logger;
    this.configManager = bot.pluginManager.configManager;
    
    // Load the configuration
    this.reloadConfig();
    
    // Register commands
    this.registerCommands();
    
    // Register message handler
    bot.onMessage(this.processIncomingMessage.bind(this));
  }
  
  reloadConfig() {
    this.config = this.configManager.loadPluginConfigWithoutSaving(this.name, {
      streamerMessageTemplate: 'Check out {displayName} at https://twitch.tv/{username} - they were last playing {game}!',
      nonStreamerMessageTemplate: 'Check out {displayName} at https://twitch.tv/{username}!',
      knownStreamers: [],
      knownNonStreamers: [],
      enabled: true
    });
    
    this.logger.info(`[Shoutout] Configuration loaded: ${JSON.stringify(this.config)}`);
  }
  
  registerCommands() {
    this.commands = [
      {
        name: 'so',
        config: {
          description: 'Give a shoutout to a user',
          usage: '!so <username>',
          aliases: ['shoutout'],
          cooldown: 5,
          modOnly: true,
          enabled: true
        },
        execute: this.doShoutout.bind(this)
      }
    ];
  }
  
  async doShoutout(client, channel, context, commandText) {
    // Parse parameters from command text
    const params = commandText.trim().split(' ').slice(1);
    
    if (!params || params.length === 0) {
      client.say(channel, `@${context.username}, please specify a username to shout out.`);
      return false;
    }
    
    let username = params[0].toLowerCase();
    if (username.startsWith('@')) {
      username = username.substring(1);
    }

    this.logger.info(`[Shoutout] Current config: ${JSON.stringify(this.config)}`);
    const isStreamer = await this.isStreamer(username);
    this.logger.info(`[Shoutout] Is ${username} a streamer? ${isStreamer}`);
    
    try {
      let message;
      if (isStreamer) {
        const channelInfo = await this.getChannelInfo(username);
        const displayName = channelInfo?.display_name || username;
        const game = channelInfo?.game_name || 'Unknown';
        
        message = this.config.streamerMessageTemplate
          .replace(/{username}/g, username)
          .replace(/{displayName}/g, displayName)
          .replace(/{game}/g, game);
          
        this.logger.info(`[Shoutout] Using streamer template for ${username}: ${message}`);
      } else {
        message = this.config.nonStreamerMessageTemplate
          .replace(/{username}/g, username)
          .replace(/{displayName}/g, username);
          
        this.logger.info(`[Shoutout] Using non-streamer template for ${username}: ${message}`);
      }
      
      client.say(channel, message);
      return true;
    } catch (error) {
      this.logger.error(`[Shoutout] Error giving shoutout: ${error.message}`);
      client.say(channel, `@${context.username}, failed to give shoutout to ${username}.`);
      return false;
    }
  }
  
  async isStreamer(username) {
    // Check known lists first
    if (this.config.knownStreamers.includes(username.toLowerCase())) {
      return true;
    }
    
    if (this.config.knownNonStreamers.includes(username.toLowerCase())) {
      return false;
    }
    
    try {
      const channelInfo = await this.getChannelInfo(username);
      return !!channelInfo;
    } catch (error) {
      this.logger.error(`[Shoutout] Error checking if user is streamer: ${error.message}`);
      return false;
    }
  }
  
  async getChannelInfo(username) {
    try {
      // This is a placeholder. In practice, you would use Twitch API to get channel info
      // For now, we'll simulate successful API call if the user is in known streamers
      if (this.config.knownStreamers.includes(username.toLowerCase())) {
        return {
          display_name: username,
          game_name: 'Just Chatting'
        };
      }
      
      // In real implementation, you would call Twitch API here
      return null;
    } catch (error) {
      this.logger.error(`[Shoutout] Error fetching channel info: ${error.message}`);
      return null;
    }
  }
  
  async processIncomingMessage(target, context, message, self) {
    // Example: Add message processing logic if needed
  }
}

module.exports = new ShoutoutPlugin(); 