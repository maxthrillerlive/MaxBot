const { EventEmitter } = require('events');

class SimpleDBusService extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.serviceName = 'org.maxbot.Service';
    this.objectPath = '/org/maxbot/Service';
    this.interfaceName = 'org.maxbot.Interface';
    this.logBuffer = [];
    this.maxLogBuffer = 100;
  }

  async initialize() {
    console.log('Initializing simple D-Bus service (no actual D-Bus connection)');
    this.initialized = true;
    
    // Install console overrides
    this.installConsoleOverrides();
    
    this.emit('initialized');
    return true;
  }

  handleMessage(sender, message) {
    console.log(`[Simple D-Bus] Message received from ${sender}: ${message}`);
    this.emit('message', { sender, message });
    return true;
  }

  handleNotification(title, body, icon) {
    console.log(`[Simple D-Bus] Notification received: ${title} - ${body}`);
    this.emit('notification', { title, body, icon });
    return true;
  }

  handleLogMessage(level, message, timestamp) {
    this.addToLogBuffer(level, message, timestamp);
    this.emit('log', { level, message, timestamp });
    return true;
  }

  getLogBuffer() {
    return this.logBuffer.map(log => [log.level, log.message, log.timestamp]);
  }

  addToLogBuffer(level, message, timestamp) {
    this.logBuffer.push({ level, message, timestamp });
    
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.shift();
    }
  }

  sendLogMessage(level, message) {
    const timestamp = new Date().toISOString();
    this.addToLogBuffer(level, message, timestamp);
    this.emit('log', { level, message, timestamp });
    return true;
  }

  installConsoleOverrides() {
    // Save original console methods
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };

    // Override console methods
    console.log = (...args) => {
      originalConsole.log(...args);
      this.sendLogMessage('info', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    console.info = (...args) => {
      originalConsole.info(...args);
      this.sendLogMessage('info', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    console.warn = (...args) => {
      originalConsole.warn(...args);
      this.sendLogMessage('warn', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    console.error = (...args) => {
      originalConsole.error(...args);
      this.sendLogMessage('error', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    console.debug = (...args) => {
      originalConsole.debug(...args);
      this.sendLogMessage('debug', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };
  }

  sendSignal(sender, message) {
    console.log(`[Simple D-Bus] Signal sent from ${sender}: ${message}`);
    return true;
  }
}

module.exports = new SimpleDBusService(); 