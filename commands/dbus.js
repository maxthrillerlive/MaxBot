module.exports = {
    name: 'dbus',
    trigger: '!dbus',
    description: 'Send a D-Bus message or check D-Bus status',
    enabled: true,
    modOnly: false,
    execute: async (client, channel, tags, message, self, args) => {
        const dbusService = require('../dbus-service');
        
        if (!dbusService.initialized) {
            client.say(channel, `@${tags.username}, D-Bus service is not initialized.`);
            return;
        }
        
        if (args.length === 0) {
            client.say(channel, `@${tags.username}, D-Bus service is running. Use !dbus status or !dbus send <message>`);
            return;
        }
        
        const subCommand = args[0].toLowerCase();
        
        if (subCommand === 'status') {
            client.say(channel, `@${tags.username}, D-Bus service is active at ${dbusService.serviceName}`);
        } else if (subCommand === 'send' && args.length > 1) {
            const content = args.slice(1).join(' ');
            dbusService.sendSignal(tags.username, content);
            client.say(channel, `@${tags.username}, D-Bus message sent: "${content}"`);
        } else {
            client.say(channel, `@${tags.username}, Invalid command. Use !dbus status or !dbus send <message>`);
        }
    }
}; 