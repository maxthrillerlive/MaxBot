#!/usr/bin/env node

const dbus = require('dbus-next');

async function sendNotification() {
    try {
        const args = process.argv.slice(2);
        if (args.length < 2) {
            console.log('Usage: node send-dbus-notification.js <title> <body> [icon]');
            process.exit(1);
        }

        const title = args[0];
        const body = args[1];
        const icon = args[2] || '';

        // Connect to the session bus
        const bus = dbus.sessionBus();
        
        // Get the MaxBot service object
        const obj = await bus.getProxyObject('org.maxbot.Service', '/org/maxbot/Service');
        
        // Get the interface
        const iface = obj.getInterface('org.maxbot.Interface');
        
        // Call the SendNotification method
        const result = await iface.SendNotification(title, body, icon);
        
        console.log(`Notification sent successfully: ${result}`);
        process.exit(0);
    } catch (error) {
        console.error('Error sending D-Bus notification:', error);
        process.exit(1);
    }
}

sendNotification(); 