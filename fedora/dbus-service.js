async initialize() {
  try {
    // Connect to the session bus
    this.bus = dbus.sessionBus();
    
    // Create interface description
    // Change 'interface' to 'interfaceObj' to avoid using the reserved word
    const interfaceObj = new dbus.Interface({
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
      .interface(this.interfaceName, interfaceObj)
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