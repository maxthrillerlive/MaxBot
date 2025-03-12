module.exports = {
    name: 'hello',
    trigger: '!hello',
    description: 'Greets the user',
    enabled: true,
    modOnly: false,
    execute: async (client, target, context) => {
        await client.say(target, `Hello @${context.username}!`);
        return true;
    }
}; 