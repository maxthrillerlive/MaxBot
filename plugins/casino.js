class CasinoPlugin {
    constructor() {
        this.name = 'casino';
        this.version = '1.0.0';
        this.description = 'Casino games using channel points';
        this.author = 'MaxBot';
        
        this.client = null;
        this.logger = null;
        this.bot = null;
        this.configManager = null;
        this.config = null;
        
        // Initialize commands as an array
        this.commands = [];
        
        // Store active games and user balances
        this.activeGames = new Map();
        this.userBalances = new Map();
        
        // Blackjack active games
        this.blackjackGames = new Map();
        
        // Cooldowns for commands
        this.cooldowns = new Map();
    }
    
    init(bot) {
        try {
            this.bot = bot;
            this.client = bot.client;
            this.logger = bot.logger;
            this.configManager = bot.configManager;
            
            // Add more verbose logging
            this.logger.info(`[${this.name}] =============================================`);
            this.logger.info(`[${this.name}] Plugin initializing... (${Date.now()})`);
            this.logger.info(`[${this.name}] Bot object provided: ${!!bot}`);
            this.logger.info(`[${this.name}] Client object provided: ${!!bot.client}`);
            this.logger.info(`[${this.name}] Logger object provided: ${!!bot.logger}`);
            this.logger.info(`[${this.name}] ConfigManager object provided: ${!!bot.configManager}`);
            
            // Load configuration
            this.reloadConfig();
            
            // Register commands
            this.registerCommands();
            
            // Add help property for the help system to use
            this.help = {
                name: this.name,
                description: this.description
            };
            
            // Log commands in detail
            this.logger.info(`[${this.name}] Commands registered: ${this.commands.length}`);
            this.commands.forEach(cmd => {
                this.logger.info(`[${this.name}] Command: ${cmd.name}, Enabled: ${cmd.enabled}, Aliases: ${cmd.aliases?.join(', ') || 'none'}`);
            });
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Set up game cleanup interval
            this.setupGameCleanupInterval();
            
            this.logger.info(`[${this.name}] Plugin initialized successfully`);
            this.logger.info(`[${this.name}] =============================================`);
            return true;
        } catch (error) {
            if (this.logger) {
                this.logger.error(`[${this.name}] Error initializing plugin:`, error);
            } else {
                console.error(`[${this.name}] Error initializing plugin:`, error);
            }
            return false;
        }
    }
    
    reloadConfig() {
        // Default configuration
        const defaultConfig = {
            enabled: true,
            minBet: 100,
            maxBet: 10000,
            startingBalance: 1000,
            gameTimeoutMinutes: 5,
            games: {
                slots: {
                    enabled: true,
                    cooldown: 30,
                    multiplier: 2.5
                },
                roulette: {
                    enabled: true,
                    cooldown: 60,
                    multiplier: 2
                },
                blackjack: {
                    enabled: true,
                    cooldown: 120,
                    multiplier: 2,
                    blackjackPayout: 2.5
                }
            },
            commands: {
                casino: {
                    trigger: 'casino',
                    aliases: [],
                    description: 'Play casino games with channel points',
                    usage: '!casino <game> <bet> OR !casino balance OR !casino games',
                    cooldown: 0,
                    modOnly: false,
                    enabled: true
                },
                hit: {
                    trigger: 'hit',
                    description: 'Hit in blackjack to get another card',
                    usage: '!hit',
                    cooldown: 0,
                    modOnly: false,
                    enabled: true
                },
                stay: {
                    trigger: 'stay',
                    aliases: ['stand'],
                    description: 'Stay with your current cards in blackjack',
                    usage: '!stay',
                    cooldown: 0,
                    modOnly: false,
                    enabled: true
                }
            },
            help: {
                description: 'Casino games using channel points',
                commands: [
                    {
                        name: 'casino',
                        description: 'Play various casino games with channel points',
                        usage: '!casino <game> <bet> OR !casino balance OR !casino games',
                        examples: [
                            '!casino games',
                            '!casino balance',
                            '!casino slots 100',
                            '!casino roulette 200',
                            '!casino blackjack 500'
                        ],
                        details: 'The casino plugin allows users to bet channel points on various games of chance.'
                    },
                    {
                        name: 'hit',
                        description: 'Draw another card in blackjack',
                        usage: '!hit',
                        examples: ['!hit'],
                        details: 'Use this after starting a blackjack game to draw another card.'
                    },
                    {
                        name: 'stay',
                        description: 'Hold your current hand in blackjack',
                        usage: '!stay',
                        examples: ['!stay', '!stand'],
                        details: 'Use this after starting a blackjack game to keep your current hand and let the dealer play.'
                    }
                ],
                generalHelp: "Casino Games:\n1. !casino games - Show available games\n2. !casino balance - Check your points balance\n3. !casino slots <bet> - Play slots (match 3 symbols to win)\n4. !casino roulette <bet> - Play roulette (win on 0)\n5. !casino blackjack <bet> - Play blackjack (start a game)\n   - !hit - Draw another card\n   - !stay or !stand - Hold your hand and let dealer play"
            }
        };
        
        // Load config or create default if it doesn't exist
        this.config = this.configManager.loadPluginConfig(this.name, defaultConfig);
        this.logger.info(`[${this.name}] Configuration loaded`);
        return this.config;
    }
    
    registerCommands() {
        try {
            // Clear existing commands
            this.commands = [];
            
            // Register main casino command
            this.registerMainCommand();
            
            // Register hit and stay commands for blackjack
            this.registerBlackjackCommands();
            
            this.logger.info(`[${this.name}] Registered ${this.commands.length} commands`);
        } catch (error) {
            this.logger.error(`[${this.name}] Error registering commands: ${error.message}`);
        }
    }
    
    registerMainCommand() {
        const cmdConfig = this.config.commands.casino;
        
        // Create the main command object
        const mainCommand = {
            name: cmdConfig.trigger,
            description: cmdConfig.description,
            usage: cmdConfig.usage,
            aliases: cmdConfig.aliases || [],
            cooldown: cmdConfig.cooldown || 0,
            modOnly: cmdConfig.modOnly || false,
            enabled: cmdConfig.enabled !== false,
            execute: this.handleCasinoCommand.bind(this)
        };
        
        // Add the main command
        this.commands.push(mainCommand);
        
        // Register aliases
        if (cmdConfig.aliases && Array.isArray(cmdConfig.aliases)) {
            for (const alias of cmdConfig.aliases) {
                const aliasCommand = {
                    name: alias,
                    description: `Alias for !${cmdConfig.trigger}`,
                    usage: cmdConfig.usage.replace(`!${cmdConfig.trigger}`, `!${alias}`),
                    aliases: [],
                    cooldown: cmdConfig.cooldown || 0,
                    modOnly: cmdConfig.modOnly || false,
                    enabled: cmdConfig.enabled !== false,
                    execute: this.handleCasinoCommand.bind(this)
                };
                this.commands.push(aliasCommand);
            }
        }
    }
    
    registerBlackjackCommands() {
        // Register hit command
        const hitConfig = this.config.commands.hit;
        const hitCommand = {
            name: hitConfig.trigger,
            description: hitConfig.description,
            usage: hitConfig.usage,
            aliases: hitConfig.aliases || [],
            cooldown: hitConfig.cooldown || 0,
            modOnly: hitConfig.modOnly || false,
            enabled: hitConfig.enabled !== false,
            execute: this.handleHitCommand.bind(this)
        };
        this.commands.push(hitCommand);
        
        // Register stay command
        const stayConfig = this.config.commands.stay;
        const stayCommand = {
            name: stayConfig.trigger,
            description: stayConfig.description,
            usage: stayConfig.usage,
            aliases: stayConfig.aliases || [],
            cooldown: stayConfig.cooldown || 0,
            modOnly: stayConfig.modOnly || false,
            enabled: stayConfig.enabled !== false,
            execute: this.handleStayCommand.bind(this)
        };
        this.commands.push(stayCommand);
        
        // Register stay aliases
        if (stayConfig.aliases && Array.isArray(stayConfig.aliases)) {
            for (const alias of stayConfig.aliases) {
                const aliasCommand = {
                    name: alias,
                    description: `Alias for !${stayConfig.trigger}`,
                    usage: stayConfig.usage.replace(`!${stayConfig.trigger}`, `!${alias}`),
                    aliases: [],
                    cooldown: stayConfig.cooldown || 0,
                    modOnly: stayConfig.modOnly || false,
                    enabled: stayConfig.enabled !== false,
                    execute: this.handleStayCommand.bind(this)
                };
                this.commands.push(aliasCommand);
            }
        }
    }
    
    setupEventListeners() {
        this.logger.info(`[${this.name}] Setting up event listeners`);
        
        // Listen for plugin lifecycle events
        this.bot.events.on('plugin:enabled', this.onPluginEnabled.bind(this));
        this.bot.events.on('plugin:disabled', this.onPluginDisabled.bind(this));
        this.bot.events.on('plugin:reloaded', this.onPluginReloaded.bind(this));
        
        this.logger.info(`[${this.name}] Event listeners set up successfully`);
    }
    
    setupGameCleanupInterval() {
        // Clean up abandoned games every minute
        setInterval(() => {
            this.cleanupAbandonedGames();
        }, 60000);
    }
    
    cleanupAbandonedGames() {
        const now = Date.now();
        const timeoutMs = this.config.gameTimeoutMinutes * 60 * 1000;
        
        // Clean up blackjack games
        for (const [userId, game] of this.blackjackGames.entries()) {
            if (now - game.lastActivity > timeoutMs) {
                // Refund bet for abandoned games
                this.updateUserBalance(userId, game.bet);
                this.blackjackGames.delete(userId);
                this.logger.info(`[${this.name}] Cleaned up abandoned blackjack game for ${userId}`);
            }
        }
    }
    
    onPluginEnabled(data) {
        if (data.plugin === this.name) {
            this.logger.info(`[${this.name}] Plugin enabled`);
        }
    }
    
    onPluginDisabled(data) {
        if (data.plugin === this.name) {
            this.logger.info(`[${this.name}] Plugin disabled`);
        }
    }
    
    onPluginReloaded(data) {
        if (data.plugin === this.name) {
            this.logger.info(`[${this.name}] Plugin reloaded, updating configuration`);
            this.reloadConfig();
        }
    }
    
    async handleCasinoCommand(client, channel, userstate, args) {
        try {
            this.logger.info(`[${this.name}] Processing casino command with args: ${args}`);
            
            // Extract actual arguments by removing the command itself
            // The args parameter includes the full command text, so we need to extract just the arguments
            const commandParts = args.trim().split(' ');
            // Remove the command part (e.g., "!casino")
            commandParts.shift(); 
            // Join the rest as the actual arguments
            const actualArgs = commandParts.join(' ');
            
            this.logger.info(`[${this.name}] Actual arguments: "${actualArgs}"`);
            
            // Split arguments, handling empty strings
            const argArray = actualArgs.split(' ').filter(arg => arg.length > 0);
            
            if (argArray.length < 1) {
                client.say(channel, `@${userstate.username} Usage: ${this.config.commands.casino.usage}`);
                return;
            }
            
            const firstArg = argArray[0].toLowerCase();
            this.logger.info(`[${this.name}] First argument: "${firstArg}"`);
            
            // Handle balance check
            if (firstArg === 'balance') {
                const balance = this.getUserBalance(userstate.username);
                client.say(channel, `@${userstate.username} Your current balance: ${balance} points`);
                return;
            }
            
            // Handle games list
            if (firstArg === 'games') {
                this.logger.info(`[${this.name}] Processing games command for user ${userstate.username}`);
                
                // Get list of enabled games
                const enabledGames = Object.entries(this.config.games)
                    .filter(([_, config]) => config.enabled)
                    .map(([game, config]) => `${game} (${config.multiplier}x)`)
                    .join(', ');
                
                const message = `@${userstate.username} Available games: ${enabledGames}`;
                this.logger.info(`[${this.name}] Games list response: ${message}`);
                client.say(channel, message);
                return;
            }
            
            // Handle active game check
            if (firstArg === 'status') {
                if (this.blackjackGames.has(userstate.username)) {
                    const game = this.blackjackGames.get(userstate.username);
                    client.say(channel, `@${userstate.username} You have an active blackjack game. Your hand: ${this.formatHand(game.playerHand)} (${this.calculateHandValue(game.playerHand)})`);
                } else {
                    client.say(channel, `@${userstate.username} You don't have any active games.`);
                }
                return;
            }
            
            // Handle game selection
            if (argArray.length < 2) {
                // This is a sub-command with no arguments (e.g., games, balance, status)
                // We'll only reach here if the sub-command wasn't matched above
                // So this is an invalid sub-command or a game name without a bet amount
                client.say(channel, `@${userstate.username} Please specify a game and bet amount. Use !casino games to see available games.`);
                return;
            }
            
            const game = firstArg;
            const betAmount = parseInt(argArray[1]);
            
            // Validate game
            if (!this.config.games[game] || !this.config.games[game].enabled) {
                client.say(channel, `@${userstate.username} Invalid game. Use !casino games to see available games.`);
                return;
            }
            
            // Validate bet amount
            if (isNaN(betAmount) || betAmount < this.config.minBet || betAmount > this.config.maxBet) {
                client.say(channel, `@${userstate.username} Bet amount must be between ${this.config.minBet} and ${this.config.maxBet} points.`);
                return;
            }
            
            // Check if player has an active blackjack game
            if (this.blackjackGames.has(userstate.username)) {
                client.say(channel, `@${userstate.username} You already have an active blackjack game. Use !hit, !stay, or !casino status.`);
                return;
            }
            
            // Check cooldown (except for blackjack which uses a different approach)
            if (game !== 'blackjack') {
                const cooldownKey = `${userstate.username}:${game}`;
                const now = Date.now();
                const lastPlay = this.cooldowns.get(cooldownKey) || 0;
                const cooldownTime = this.config.games[game].cooldown * 1000;
                
                if (now - lastPlay < cooldownTime) {
                    const remainingTime = Math.ceil((cooldownTime - (now - lastPlay)) / 1000);
                    client.say(channel, `@${userstate.username} Please wait ${remainingTime} seconds before playing ${game} again.`);
                    return;
                }
            }
            
            // Check balance
            const balance = this.getUserBalance(userstate.username);
            if (balance < betAmount) {
                client.say(channel, `@${userstate.username} You don't have enough points. Your balance: ${balance}`);
                return;
            }
            
            // Deduct bet amount
            this.updateUserBalance(userstate.username, -betAmount);
            
            // Play the game
            if (game === 'blackjack') {
                // Start a blackjack game
                const gameResult = this.startBlackjackGame(userstate.username, betAmount, channel);
                client.say(channel, `@${userstate.username} ${gameResult.message}`);
            } else {
                // Play other games immediately
                const result = await this.playGame(game, betAmount);
                
                // Update balance and cooldown
                this.updateUserBalance(userstate.username, result.winnings);
                this.cooldowns.set(`${userstate.username}:${game}`, Date.now());
                
                // Send result
                client.say(channel, `@${userstate.username} ${result.message}`);
            }
            
        } catch (error) {
            this.logger.error(`[${this.name}] Command error:`, error);
            client.say(channel, `@${userstate.username} An error occurred processing your command.`);
        }
    }
    
    async handleHitCommand(client, channel, userstate, args) {
        try {
            // Check if player has an active blackjack game
            if (!this.blackjackGames.has(userstate.username)) {
                client.say(channel, `@${userstate.username} You don't have an active blackjack game. Start one with !casino blackjack <bet>.`);
                return;
            }
            
            const game = this.blackjackGames.get(userstate.username);
            game.lastActivity = Date.now();
            
            // Deal a card to the player
            const card = this.drawCard(game.deck);
            game.playerHand.push(card);
            
            // Calculate hand value
            const playerValue = this.calculateHandValue(game.playerHand);
            
            // Check for bust
            if (playerValue > 21) {
                // Player busts, game over
                this.blackjackGames.delete(userstate.username);
                client.say(channel, `@${userstate.username} 🃏 Bust with ${this.formatHand(game.playerHand)} (${playerValue}). Dealer had ${this.formatHand(game.dealerHand)} (${this.calculateHandValue(game.dealerHand)}). You lost ${game.bet} points!`);
                return;
            }
            
            // Check for five-card charlie (automatic win with 5 cards without busting)
            if (game.playerHand.length >= 5) {
                // Player wins with five-card charlie
                const winnings = Math.floor(game.bet * this.config.games.blackjack.multiplier);
                this.updateUserBalance(userstate.username, winnings);
                this.blackjackGames.delete(userstate.username);
                client.say(channel, `@${userstate.username} 🃏 Five-Card Charlie! Your hand: ${this.formatHand(game.playerHand)} (${playerValue}). You won ${winnings} points!`);
                return;
            }
            
            // Game continues
            client.say(channel, `@${userstate.username} 🃏 Hit! Your hand: ${this.formatHand(game.playerHand)} (${playerValue}). Dealer shows: ${game.dealerHand[0].value}${game.dealerHand[0].suit}. Type !hit for another card or !stay to hold.`);
            
        } catch (error) {
            this.logger.error(`[${this.name}] Hit command error:`, error);
            client.say(channel, `@${userstate.username} An error occurred processing your command.`);
        }
    }
    
    async handleStayCommand(client, channel, userstate, args) {
        try {
            // Check if player has an active blackjack game
            if (!this.blackjackGames.has(userstate.username)) {
                client.say(channel, `@${userstate.username} You don't have an active blackjack game. Start one with !casino blackjack <bet>.`);
                return;
            }
            
            const game = this.blackjackGames.get(userstate.username);
            game.lastActivity = Date.now();
            
            // Calculate player's final hand value
            const playerValue = this.calculateHandValue(game.playerHand);
            
            // Dealer plays their hand
            let dealerValue = this.calculateHandValue(game.dealerHand);
            while (dealerValue < 17) {
                const card = this.drawCard(game.deck);
                game.dealerHand.push(card);
                dealerValue = this.calculateHandValue(game.dealerHand);
            }
            
            // Determine result
            let result;
            if (dealerValue > 21) {
                // Dealer busts, player wins
                result = {
                    win: true,
                    message: `🃏 Dealer busts with ${this.formatHand(game.dealerHand)} (${dealerValue})! Your hand: ${this.formatHand(game.playerHand)} (${playerValue}). You won ${Math.floor(game.bet * this.config.games.blackjack.multiplier)} points!`
                };
            } else if (playerValue > dealerValue) {
                // Player has higher hand, player wins
                result = {
                    win: true,
                    message: `🃏 You win with ${this.formatHand(game.playerHand)} (${playerValue}) vs. Dealer's ${this.formatHand(game.dealerHand)} (${dealerValue}). You won ${Math.floor(game.bet * this.config.games.blackjack.multiplier)} points!`
                };
            } else if (dealerValue > playerValue) {
                // Dealer has higher hand, player loses
                result = {
                    win: false,
                    message: `🃏 Dealer wins with ${this.formatHand(game.dealerHand)} (${dealerValue}) vs. your ${this.formatHand(game.playerHand)} (${playerValue}). You lost ${game.bet} points.`
                };
            } else {
                // Push (tie)
                result = {
                    push: true,
                    message: `🃏 Push! Your hand: ${this.formatHand(game.playerHand)} (${playerValue}) ties with Dealer's ${this.formatHand(game.dealerHand)} (${dealerValue}). Your bet of ${game.bet} points has been returned.`
                };
            }
            
            // Update player's balance
            if (result.win) {
                this.updateUserBalance(userstate.username, Math.floor(game.bet * this.config.games.blackjack.multiplier));
            } else if (result.push) {
                this.updateUserBalance(userstate.username, game.bet);
            }
            
            // Remove the game
            this.blackjackGames.delete(userstate.username);
            
            // Send result
            client.say(channel, `@${userstate.username} ${result.message}`);
            
        } catch (error) {
            this.logger.error(`[${this.name}] Stay command error:`, error);
            client.say(channel, `@${userstate.username} An error occurred processing your command.`);
        }
    }
    
    getUserBalance(username) {
        if (!this.userBalances.has(username)) {
            this.userBalances.set(username, this.config.startingBalance);
        }
        return this.userBalances.get(username);
    }
    
    updateUserBalance(username, amount) {
        const currentBalance = this.getUserBalance(username);
        this.userBalances.set(username, Math.max(0, currentBalance + amount));
    }
    
    async playGame(game, betAmount) {
        switch (game) {
            case 'slots':
                return this.playSlots(betAmount);
            case 'roulette':
                return this.playRoulette(betAmount);
            default:
                throw new Error('Invalid game');
        }
    }
    
    playSlots(betAmount) {
        const symbols = ['🍒', '🍋', '🍊', '💎', '7️⃣'];
        const reels = [
            symbols[Math.floor(Math.random() * symbols.length)],
            symbols[Math.floor(Math.random() * symbols.length)],
            symbols[Math.floor(Math.random() * symbols.length)]
        ];
        
        const isWin = reels[0] === reels[1] && reels[1] === reels[2];
        const winnings = isWin ? Math.floor(betAmount * this.config.games.slots.multiplier) : 0;
        
        return {
            message: `🎰 [${reels.join(' ')}] ${isWin ? `You won ${winnings} points!` : 'Better luck next time!'}`,
            winnings: winnings
        };
    }
    
    playRoulette(betAmount) {
        const number = Math.floor(Math.random() * 37); // 0-36
        const isWin = number === 0; // Only win on 0 for simplicity
        const winnings = isWin ? Math.floor(betAmount * this.config.games.roulette.multiplier) : 0;
        
        return {
            message: `🎲 Roulette: ${number} ${isWin ? `You won ${winnings} points!` : 'Better luck next time!'}`,
            winnings: winnings
        };
    }
    
    startBlackjackGame(username, betAmount, channel) {
        // Create a deck of cards
        const deck = this.createDeck();
        this.shuffleDeck(deck);
        
        // Deal initial cards
        const playerHand = [this.drawCard(deck), this.drawCard(deck)];
        const dealerHand = [this.drawCard(deck), this.drawCard(deck)];
        
        // Calculate initial scores
        const playerScore = this.calculateHandValue(playerHand);
        const dealerScore = this.calculateHandValue(dealerHand);
        
        // Check for player blackjack
        if (playerScore === 21) {
            // Natural blackjack
            const winnings = Math.floor(betAmount * this.config.games.blackjack.blackjackPayout);
            this.updateUserBalance(username, winnings);
            
            return {
                message: `🃏 Natural Blackjack! Your hand: ${this.formatHand(playerHand)} (21). Dealer had: ${this.formatHand(dealerHand)} (${dealerScore}). You won ${winnings} points!`,
                winnings: winnings
            };
        }
        
        // Check for dealer blackjack
        if (dealerScore === 21) {
            return {
                message: `🃏 Dealer has Blackjack! ${this.formatHand(dealerHand)} (21). Your hand: ${this.formatHand(playerHand)} (${playerScore}). You lost ${betAmount} points.`,
                winnings: 0
            };
        }
        
        // No blackjack, create an active game
        this.blackjackGames.set(username, {
            playerHand,
            dealerHand,
            deck,
            bet: betAmount,
            channel,
            lastActivity: Date.now()
        });
        
        return {
            message: `🃏 Your hand: ${this.formatHand(playerHand)} (${playerScore}). Dealer shows: ${dealerHand[0].value}${dealerHand[0].suit}. Type !hit for another card or !stay to hold.`,
            active: true
        };
    }
    
    // Create a standard 52-card deck
    createDeck() {
        const suits = ['♠️', '♥️', '♦️', '♣️'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const deck = [];
        
        for (const suit of suits) {
            for (const value of values) {
                deck.push({ value, suit });
            }
        }
        
        return deck;
    }
    
    // Shuffle the deck using the Fisher-Yates algorithm
    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }
    
    // Draw a card from the deck
    drawCard(deck) {
        if (deck.length === 0) {
            throw new Error('Deck is empty');
        }
        return deck.pop();
    }
    
    // Calculate the value of a blackjack hand
    calculateHandValue(hand) {
        let value = 0;
        let aceCount = 0;
        
        for (const card of hand) {
            if (card.value === 'A') {
                aceCount++;
                value += 11;
            } else if (['K', 'Q', 'J'].includes(card.value)) {
                value += 10;
            } else {
                value += parseInt(card.value);
            }
        }
        
        // Adjust for aces
        while (value > 21 && aceCount > 0) {
            value -= 10;
            aceCount--;
        }
        
        return value;
    }
    
    // Format a hand for display
    formatHand(hand) {
        return hand.map(card => `${card.value}${card.suit}`).join(' ');
    }
}

// Create and export a plugin instance
const plugin = new CasinoPlugin();
module.exports = plugin;