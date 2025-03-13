const fedora = require('../fedora');

module.exports = {
    name: 'services',
    trigger: '!services',
    description: 'List, start, stop, or restart system services (Fedora only)',
    enabled: true,
    modOnly: true,
    execute: async (client, target, context, message) => {
        const args = message.trim().split(' ');
        
        // Check if we have enough arguments
        if (args.length < 2) {
            await client.say(target, `@${context.username} Usage: !services list | !services start/stop/restart <service>`);
            return false;
        }
        
        const action = args[1].toLowerCase();
        
        if (action === 'list') {
            const services = await fedora.listServices();
            
            if (services.length === 0) {
                await client.say(target, `@${context.username} No services found or not running on Fedora Linux.`);
                return false;
            }
            
            // Get the first 5 services
            const serviceList = services.slice(0, 5).map(s => `${s.name} (${s.activeState})`).join(', ');
            await client.say(target, `@${context.username} First 5 services: ${serviceList}`);
            return true;
        } else if (['start', 'stop', 'restart'].includes(action)) {
            if (args.length < 3) {
                await client.say(target, `@${context.username} Please specify a service name.`);
                return false;
            }
            
            const serviceName = args[2];
            let result = false;
            
            if (action === 'start') {
                result = await fedora.startService(serviceName);
            } else if (action === 'stop') {
                result = await fedora.stopService(serviceName);
            } else if (action === 'restart') {
                result = await fedora.restartService(serviceName);
            }
            
            if (result) {
                await client.say(target, `@${context.username} Service ${serviceName} ${action}ed successfully.`);
                return true;
            } else {
                await client.say(target, `@${context.username} Failed to ${action} service ${serviceName}. This feature only works on Fedora Linux.`);
                return false;
            }
        } else {
            await client.say(target, `@${context.username} Unknown action. Use list, start, stop, or restart.`);
            return false;
        }
    }
}; 