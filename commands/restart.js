module.exports = {
    name: 'restart',
    description: 'Restart the bot (Moderators only)',
    enabled: true,
    trigger: '!restart',
    modOnly: true,
    execute: async (client, target, context) => {
        await client.say(target, `@${context.username} Restarting the bot...`);
        process.emit('SIGTERM');
        return true;
    }
}; 