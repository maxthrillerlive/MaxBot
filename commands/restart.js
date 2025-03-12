module.exports = {
    name: 'restart',
    trigger: '!restart',
    description: 'Restart the bot',
    enabled: true,
    modOnly: true,
    execute: async (client, target, context) => {
        await client.say(target, `@${context.username} Restarting the bot...`);
        
        // Signal to restart the bot
        process.emit('RESTART_BOT');
        
        return true;
    }
}; 