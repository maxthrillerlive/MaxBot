const dbus = require('dbus-next');
const { EventEmitter } = require('events');

class DBusService extends EventEmitter {
  constructor() {
    super();
    this.bus = null;
    this.initialized = false;
    this.serviceName = 'org.maxbot.Service';
    this.objectPath = '/org/maxbot/Service';
    this.interfaceName = 'org.maxbot.Interface';
    this.useSystemBus = false;
    this.logBuffer = []; // Buffer to store logs when not connected
    this.maxLogBuffer = 100; // Maximum number of log entries to buffer
  }

  async initialize() {
    try {
      // Try to connect to the session bus first
      try {
        this.bus = dbus.sessionBus();
        console.log('Connected to D-Bus session bus');
      } catch (error) {
        console.log('Failed to connect to session bus, falling back to system bus');
        // Fall back to system bus if session bus is not available
        this.bus = dbus.systemBus();
        this.useSystemBus = true;
        console.log('Connected to D-Bus system bus');
      }
      
      // Create interface description
      const dbusInterface = new dbus.Interface({
        name: this.interfaceName,
        methods: {
          SendMessage: {
            inSignature: 'ss',
            outSignature: 'b',
            handler: this.handleMessage.bind(this)
          },
          SendNotification: {
            inSignature: 'sss',
            outSignature: 'b',
            handler: this.handleNotification.bind(this)
          },
          SendLogMessage: {
            inSignature: 'sss',
            outSignature: 'b',
            handler: this.handleLogMessage.bind(this)
          },
          GetLogBuffer: {
            inSignature: '',
            outSignature: 'a(sss)',
            handler: this.getLogBuffer.bind(this)
          }
        },
        properties: {},
        signals: {
          MessageReceived: {
            signature: 'ss'
          },
          LogMessageReceived: {
            signature: 'sss'  // level, message, timestamp
          }
        }
      });

      // Export the interface
      const obj = new dbus.ObjectBuilder()
        .interface(this.interfaceName, dbusInterface)
        .build();

      await this.bus.export(this.objectPath, obj);
      
      // Request service name
      await this.bus.requestName(this.serviceName, 0);
      
      console.log(`D-Bus service initialized at ${this.serviceName}`);
      this.initialized = true;
      this.emit('initialized');
      
      // Only try to listen for system notifications if we're on the session bus
      if (!this.useSystemBus) {
        this.listenForSystemNotifications();
      } else {
        console.log('Skipping notification listener as we are on system bus');
      }
      
      // Install console overrides to capture logs
      this.installConsoleOverrides();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize D-Bus service:', error);
      return false;
    }
  }

  handleMessage(sender, message) {
    console.log(`D-Bus message received from ${sender}: ${message}`);
    this.emit('message', { sender, message });
    return true;
  }

  handleNotification(title, body, icon) {
    console.log(`D-Bus notification received: ${title} - ${body}`);
    this.emit('notification', { title, body, icon });
    return true;
  }

  handleLogMessage(level, message, timestamp) {
    // Store in buffer
    this.addToLogBuffer(level, message, timestamp);
    
    // Emit event for local handlers
    this.emit('log', { level, message, timestamp });
    
    return true;
  }

  getLogBuffer() {
    // Return the log buffer as an array of tuples
    return this.logBuffer.map(log => [log.level, log.message, log.timestamp]);
  }

  addToLogBuffer(level, message, timestamp) {
    this.logBuffer.push({ level, message, timestamp });
    
    // Keep buffer size in check
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.shift();
    }
  }

  sendLogMessage(level, message) {
    if (!this.initialized) {
      // Store in buffer even if not initialized
      this.addToLogBuffer(level, message, new Date().toISOString());
      return false;
    }
    
    try {
      // Create timestamp
      const timestamp = new Date().toISOString();
      
      // Store in buffer
      this.addToLogBuffer(level, message, timestamp);
      
      return true;
    } catch (error) {
      // Don't use console.error here to avoid infinite recursion
      process.stderr.write(`Failed to send D-Bus log message: ${error}\n`);
      return false;
    }
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

    // Override console.log
    console.log = (...args) => {
      // Call original method
      originalConsole.log(...args);
      
      // Send to D-Bus
      this.sendLogMessage('info', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    // Override console.info
    console.info = (...args) => {
      // Call original method
      originalConsole.info(...args);
      
      // Send to D-Bus
      this.sendLogMessage('info', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    // Override console.warn
    console.warn = (...args) => {
      // Call original method
      originalConsole.warn(...args);
      
      // Send to D-Bus
      this.sendLogMessage('warn', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    // Override console.error
    console.error = (...args) => {
      // Call original method
      originalConsole.error(...args);
      
      // Send to D-Bus
      this.sendLogMessage('error', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };

    // Override console.debug
    console.debug = (...args) => {
      // Call original method
      originalConsole.debug(...args);
      
      // Send to D-Bus
      this.sendLogMessage('debug', args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' '));
    };
  }

  async listenForSystemNotifications() {
    try {
      // Connect to the notification service
      const notificationBus = dbus.sessionBus();
      const notificationObj = await notificationBus.getProxyObject(
        'org.freedesktop.Notifications', 
        '/org/freedesktop/Notifications'
      );
      
      const notificationInterface = notificationObj.getInterface('org.freedesktop.Notifications');
      
      // Listen for notification signals
      notificationInterface.on('NotificationClosed', (id, reason) => {
        console.log(`System notification ${id} closed, reason: ${reason}`);
      });
      
      notificationInterface.on('ActionInvoked', (id, actionKey) => {
        console.log(`System notification ${id} action invoked: ${actionKey}`);
      });
      
      console.log('Listening for system notifications');
    } catch (error) {
      console.error('Failed to listen for system notifications:', error);
    }
  }

  sendSignal(sender, message) {
    if (!this.initialized) {
      console.error('D-Bus service not initialized');
      return false;
    }
    
    try {
      // This would emit a signal on the D-Bus
      // Implementation depends on the specific needs
      return true;
    } catch (error) {
      console.error('Failed to send D-Bus signal:', error);
      return false;
    }
  }
}

module.exports = new DBusService(); 