const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Custom format for console output with colored "info:" and timestamp
const consoleFormat = winston.format.printf(info => {
  const time = new Date().toTimeString().substring(0, 8); // Format as HH:MM:SS
  if (info.level === 'info') {
    return `[${time}] \x1b[32minfo:\x1b[0m ${info.message}`;
  } else if (info.level === 'error') {
    return `[${time}] \x1b[31merror:\x1b[0m ${info.message}`;
  } else if (info.level === 'warn') {
    return `[${time}] \x1b[33mwarn:\x1b[0m ${info.message}`;
  } else {
    return `[${time}] ${info.level}: ${info.message}`;
  }
});

// Create a logger instance
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
  ),
  transports: [
    // Write logs to files
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log') 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'chat.log'),
      level: 'info',
      // Only log chat messages
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => {
          if (info.chat) {
            return `${info.timestamp} [CHAT]: <${info.username}> ${info.message}`;
          }
          return null;
        })
      )
    })
  ]
});

// If we're not in production, also log to the console with our custom format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Custom logging functions that don't add JSON metadata
module.exports = {
  info: (message) => {
    if (typeof message === 'object') {
      // If it's an object, just log the message property without metadata
      logger.info(message.message || JSON.stringify(message));
    } else {
      logger.info(message);
    }
  },
  error: (message) => {
    if (typeof message === 'object') {
      logger.error(message.message || JSON.stringify(message));
    } else {
      logger.error(message);
    }
  },
  warn: (message) => {
    if (typeof message === 'object') {
      logger.warn(message.message || JSON.stringify(message));
    } else {
      logger.warn(message);
    }
  },
  debug: (message) => {
    if (typeof message === 'object') {
      logger.debug(message.message || JSON.stringify(message));
    } else {
      logger.debug(message);
    }
  },
  chat: (username, message, channel) => {
    // For chat messages, we still need the metadata for filtering
    logger.info({
      chat: true,
      username,
      message,
      channel
    });
  }
}; 