module.exports = {
    name: 'hello',
    trigger: '!hello',
    description: 'Greets the user',
    enabled: true,
    modOnly: false,
    execute: async (client, target, context) => {
        console.log('[DEBUG] Hello command executing...');
        console.log('[DEBUG] Target channel:', target);
        console.log('[DEBUG] User context:', context.username);
        try {
            await client.say(target, `Hello @${context.username}!`);
            console.log('[DEBUG] Hello message sent successfully');
            return true;
        } catch (error) {
            console.error('[ERROR] Failed to send hello message:', error);
            return false;
        }
    }
}; 