module.exports = {
    name: 'dice',
    trigger: '!roll',
    description: 'Roll a 12-sided die',
    enabled: true,
    modOnly: false,
    execute: async (client, target, context) => {
        const roll = Math.floor(Math.random() * 12) + 1;
        await client.say(target, `@${context.username} rolled a ${roll} on a d12! 🎲`);
        return true;
    }
}; 