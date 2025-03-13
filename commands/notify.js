const fedora = require('../fedora');

module.exports = {
    name: 'notify',
    trigger: '!notify',
    description: 'Send a desktop notification (Fedora only)',
    enabled: true,
    modOnly: true,
    execute: async (client, target, context, message) => {
        const args = message.trim().split(' ');
        args.shift(); // Remove the command itself
        
        if (args.length < 1) {
            await client.say(target, `@${context.username} Usage: !notify <message> [urgency]`);
            return false;
        }
        
        const urgency = ['low', 'normal', 'critical'].includes(args[args.length - 1]) 
            ? args.pop() 
            : 'normal';
        
        const notificationText = args.join(' ');
        
        const result = await fedora.sendNotification(
            'MaxBot Notification', 
            notificationText, 
            urgency
        );
        
        if (result) {
            await client.say(target, `@${context.username} Notification sent!`);
            return true;
        } else {
            await client.say(target, `@${context.username} Failed to send notification. This feature only works on Fedora Linux.`);
            return false;
        }
    }
}; 