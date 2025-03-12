const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

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

// If we're not in production, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = {
  info: (message) => {
    logger.info(message);
  },
  error: (message) => {
    logger.error(message);
  },
  warn: (message) => {
    logger.warn(message);
  },
  debug: (message) => {
    logger.debug(message);
  },
  chat: (username, message, channel) => {
    logger.info({
      chat: true,
      username,
      message,
      channel
    });
  }
}; 