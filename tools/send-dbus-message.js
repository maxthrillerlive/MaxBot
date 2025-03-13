#!/usr/bin/env node

const dbus = require('dbus-next');

async function sendMessage() {
    try {
        const args = process.argv.slice(2);
        if (args.length < 2) {
            console.log('Usage: node send-dbus-message.js <sender> <message>');
            process.exit(1);
        }

        const sender = args[0];
        const message = args.slice(1).join(' ');

        // Connect to the session bus
        const bus = dbus.sessionBus();
        
        // Get the MaxBot service object
        const obj = await bus.getProxyObject('org.maxbot.Service', '/org/maxbot/Service');
        
        // Get the interface
        const iface = obj.getInterface('org.maxbot.Interface');
        
        // Call the SendMessage method
        const result = await iface.SendMessage(sender, message);
        
        console.log(`Message sent successfully: ${result}`);
        process.exit(0);
    } catch (error) {
        console.error('Error sending D-Bus message:', error);
        process.exit(1);
    }
}

sendMessage(); 