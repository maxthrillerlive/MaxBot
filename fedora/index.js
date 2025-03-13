const fs = require('fs');
const path = require('path');
const os = require('os');
let dbusService;

// Try to require the D-Bus service, but fall back to simple version if it fails
try {
  dbusService = require('./dbus-service');
} catch (error) {
  console.log('Full D-Bus module could not be loaded:', error.message);
  console.log('Falling back to simple D-Bus implementation');
  dbusService = require('./simple-dbus');
}

class FedoraIntegration {
  constructor() {
    this.isEnabled = false;
    this.isFedora = false;
    this.dbusService = dbusService;
    this.commands = [];
    this.hasDisplay = process.env.DISPLAY || process.env.WAYLAND_DISPLAY;
  }

  async initialize() {
    // Check if we're running on Fedora
    try {
      if (fs.existsSync('/etc/fedora-release')) {
        this.isFedora = true;
        console.log('Fedora Linux detected, enabling Fedora-specific features');
      } else {
        // Try to detect using os-release
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        if (osRelease.includes('Fedora')) {
          this.isFedora = true;
          console.log('Fedora Linux detected, enabling Fedora-specific features');
        }
      }
    } catch (error) {
      console.log('Not running on Fedora Linux, skipping Fedora-specific features');
      return false;
    }

    if (!this.isFedora) {
      return false;
    }

    // Check if we have a display
    if (!this.hasDisplay) {
      console.log('No display detected. Some Fedora features will be limited.');
    }

    // Initialize D-Bus service if available
    let dbusInitialized = false;
    try {
      dbusInitialized = await this.dbusService.initialize();
    } catch (error) {
      console.error('Failed to initialize D-Bus service:', error);
    }
    
    // We can still enable Fedora integration even if D-Bus fails
    this.isEnabled = true;
    console.log('Fedora integration enabled' + (dbusInitialized ? ' with D-Bus support' : ' without D-Bus support'));
    
    // Load Fedora-specific commands
    this.loadCommands();
    
    return true;
  }

  async sendNotification(title, body, urgency = 'normal') {
    if (!this.isFedora) {
      console.log('Not running on Fedora, notification not sent');
      return false;
    }
    
    try {
      const notificationId = await this.dbusService.sendNotification(title, body, urgency);
      console.log(`Notification sent with ID: ${notificationId}`);
      return notificationId;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  async getSystemStatus() {
    if (!this.isFedora) {
      console.log('Not running on Fedora, system status not available');
      return null;
    }
    
    try {
      return await this.dbusService.getSystemStatus();
    } catch (error) {
      console.error('Failed to get system status:', error);
      return null;
    }
  }

  async listServices() {
    if (!this.isFedora) {
      console.log('Not running on Fedora, services not available');
      return [];
    }
    
    try {
      const units = await this.dbusService.listUnits();
      return units.filter(unit => unit.name.endsWith('.service'));
    } catch (error) {
      console.error('Failed to list services:', error);
      return [];
    }
  }

  async startService(serviceName) {
    if (!this.isFedora) {
      console.log('Not running on Fedora, service not started');
      return false;
    }
    
    try {
      if (!serviceName.endsWith('.service')) {
        serviceName += '.service';
      }
      
      const job = await this.dbusService.startUnit(serviceName);
      console.log(`Service ${serviceName} start job: ${job}`);
      return true;
    } catch (error) {
      console.error(`Failed to start service ${serviceName}:`, error);
      return false;
    }
  }

  async stopService(serviceName) {
    if (!this.isFedora) {
      console.log('Not running on Fedora, service not stopped');
      return false;
    }
    
    try {
      if (!serviceName.endsWith('.service')) {
        serviceName += '.service';
      }
      
      const job = await this.dbusService.stopUnit(serviceName);
      console.log(`Service ${serviceName} stop job: ${job}`);
      return true;
    } catch (error) {
      console.error(`Failed to stop service ${serviceName}:`, error);
      return false;
    }
  }

  async restartService(serviceName) {
    if (!this.isFedora) {
      console.log('Not running on Fedora, service not restarted');
      return false;
    }
    
    try {
      if (!serviceName.endsWith('.service')) {
        serviceName += '.service';
      }
      
      const job = await this.dbusService.restartUnit(serviceName);
      console.log(`Service ${serviceName} restart job: ${job}`);
      return true;
    } catch (error) {
      console.error(`Failed to restart service ${serviceName}:`, error);
      return false;
    }
  }

  loadCommands() {
    // Implementation of loadCommands method
  }
}

module.exports = new FedoraIntegration(); 