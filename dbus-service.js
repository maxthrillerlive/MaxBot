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
  }

  async initialize() {
    try {
      // Connect to the session bus
      this.bus = dbus.sessionBus();
      
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
          }
        },
        properties: {},
        signals: {
          MessageReceived: {
            signature: 'ss'
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
      
      // Also listen for system notifications
      this.listenForSystemNotifications();
      
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