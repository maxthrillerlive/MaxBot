const dbus = require('dbus-next');
const { EventEmitter } = require('events');

class DBusService extends EventEmitter {
    constructor() {
        super();
        this.bus = dbus.sessionBus();
        this.systemBus = dbus.systemBus();
        this.initialized = false;
        this.notificationId = 0;
    }

    async initialize() {
        try {
            // Get notification service for desktop notifications
            this.notifyInterface = await this.getInterface(
                'org.freedesktop.Notifications',
                '/org/freedesktop/Notifications',
                'org.freedesktop.Notifications'
            );
            
            // Get systemd service for system management
            this.systemdInterface = await this.getSystemInterface(
                'org.freedesktop.systemd1',
                '/org/freedesktop/systemd1',
                'org.freedesktop.systemd1.Manager'
            );
            
            this.initialized = true;
            this.emit('initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize D-Bus service:', error);
            this.emit('error', error);
            return false;
        }
    }

    async getInterface(serviceName, objectPath, interfaceName) {
        try {
            const obj = await this.bus.getProxyObject(serviceName, objectPath);
            return obj.getInterface(interfaceName);
        } catch (error) {
            console.error(`Failed to get interface ${interfaceName}:`, error);
            throw error;
        }
    }

    async getSystemInterface(serviceName, objectPath, interfaceName) {
        try {
            const obj = await this.systemBus.getProxyObject(serviceName, objectPath);
            return obj.getInterface(interfaceName);
        } catch (error) {
            console.error(`Failed to get system interface ${interfaceName}:`, error);
            throw error;
        }
    }

    async sendNotification(title, body, urgency = 'normal') {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const urgencyLevel = {
                'low': 0,
                'normal': 1,
                'critical': 2
            }[urgency] || 1;

            const hints = {
                'urgency': new dbus.Variant('y', urgencyLevel)
            };

            this.notificationId = await this.notifyInterface.Notify(
                'MaxBot',                 // App name
                this.notificationId,      // Replace previous notification
                'dialog-information',     // Icon
                title,                    // Summary
                body,                     // Body
                [],                       // Actions
                hints,                    // Hints
                5000                      // Timeout (ms)
            );

            return this.notificationId;
        } catch (error) {
            console.error('Failed to send notification:', error);
            throw error;
        }
    }

    async getSystemStatus() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const systemState = await this.systemdInterface.GetSystemState();
            return {
                state: systemState[0],
                units: systemState[1],
                jobs: systemState[2]
            };
        } catch (error) {
            console.error('Failed to get system status:', error);
            throw error;
        }
    }

    async listUnits() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const units = await this.systemdInterface.ListUnits();
            return units.map(unit => ({
                name: unit[0],
                description: unit[1],
                loadState: unit[2],
                activeState: unit[3],
                subState: unit[4],
                following: unit[5],
                path: unit[6],
                jobId: unit[7],
                jobType: unit[8],
                jobPath: unit[9]
            }));
        } catch (error) {
            console.error('Failed to list units:', error);
            throw error;
        }
    }

    async startUnit(unitName) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const job = await this.systemdInterface.StartUnit(unitName, 'replace');
            return job;
        } catch (error) {
            console.error(`Failed to start unit ${unitName}:`, error);
            throw error;
        }
    }

    async stopUnit(unitName) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const job = await this.systemdInterface.StopUnit(unitName, 'replace');
            return job;
        } catch (error) {
            console.error(`Failed to stop unit ${unitName}:`, error);
            throw error;
        }
    }

    async restartUnit(unitName) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const job = await this.systemdInterface.RestartUnit(unitName, 'replace');
            return job;
        } catch (error) {
            console.error(`Failed to restart unit ${unitName}:`, error);
            throw error;
        }
    }
}

module.exports = new DBusService(); 