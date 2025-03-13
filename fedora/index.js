const dbus = require('./dbus');
const os = require('os');

class FedoraService {
    constructor() {
        this.isLinux = os.platform() === 'linux';
        this.isFedora = false;
        this.initialized = false;
        this.checkFedora();
    }

    checkFedora() {
        if (!this.isLinux) {
            console.log('Not running on Linux, Fedora-specific features disabled');
            return false;
        }

        try {
            // Check if /etc/fedora-release exists
            const fs = require('fs');
            this.isFedora = fs.existsSync('/etc/fedora-release');
            
            if (this.isFedora) {
                console.log('Detected Fedora Linux, enabling Fedora-specific features');
                this.initialize();
            } else {
                console.log('Not running on Fedora, Fedora-specific features disabled');
            }
            
            return this.isFedora;
        } catch (error) {
            console.error('Error checking for Fedora:', error);
            return false;
        }
    }

    async initialize() {
        if (!this.isFedora) return false;
        
        try {
            await dbus.initialize();
            this.initialized = true;
            console.log('Fedora service initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Fedora service:', error);
            return false;
        }
    }

    async sendNotification(title, body, urgency = 'normal') {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (!this.isFedora) {
            console.log('Not running on Fedora, notification not sent');
            return false;
        }
        
        try {
            const notificationId = await dbus.sendNotification(title, body, urgency);
            console.log(`Notification sent with ID: ${notificationId}`);
            return notificationId;
        } catch (error) {
            console.error('Failed to send notification:', error);
            return false;
        }
    }

    async getSystemStatus() {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (!this.isFedora) {
            console.log('Not running on Fedora, system status not available');
            return null;
        }
        
        try {
            return await dbus.getSystemStatus();
        } catch (error) {
            console.error('Failed to get system status:', error);
            return null;
        }
    }

    async listServices() {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (!this.isFedora) {
            console.log('Not running on Fedora, services not available');
            return [];
        }
        
        try {
            const units = await dbus.listUnits();
            return units.filter(unit => unit.name.endsWith('.service'));
        } catch (error) {
            console.error('Failed to list services:', error);
            return [];
        }
    }

    async startService(serviceName) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (!this.isFedora) {
            console.log('Not running on Fedora, service not started');
            return false;
        }
        
        try {
            if (!serviceName.endsWith('.service')) {
                serviceName += '.service';
            }
            
            const job = await dbus.startUnit(serviceName);
            console.log(`Service ${serviceName} start job: ${job}`);
            return true;
        } catch (error) {
            console.error(`Failed to start service ${serviceName}:`, error);
            return false;
        }
    }

    async stopService(serviceName) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (!this.isFedora) {
            console.log('Not running on Fedora, service not stopped');
            return false;
        }
        
        try {
            if (!serviceName.endsWith('.service')) {
                serviceName += '.service';
            }
            
            const job = await dbus.stopUnit(serviceName);
            console.log(`Service ${serviceName} stop job: ${job}`);
            return true;
        } catch (error) {
            console.error(`Failed to stop service ${serviceName}:`, error);
            return false;
        }
    }

    async restartService(serviceName) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (!this.isFedora) {
            console.log('Not running on Fedora, service not restarted');
            return false;
        }
        
        try {
            if (!serviceName.endsWith('.service')) {
                serviceName += '.service';
            }
            
            const job = await dbus.restartUnit(serviceName);
            console.log(`Service ${serviceName} restart job: ${job}`);
            return true;
        } catch (error) {
            console.error(`Failed to restart service ${serviceName}:`, error);
            return false;
        }
    }
}

module.exports = new FedoraService(); 