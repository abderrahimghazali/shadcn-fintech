import winston from 'winston';
import { env } from '../config/env.js';

/**
 * Structured JSON logger with requestId tracking.
 * Every log line includes: timestamp, level, message, requestId (if available), and any extra fields.
 */

const logFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.timestamp({ format: 'ISO' }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const reqId = requestId ? ` [${requestId}]` : '';
    const extra = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}${reqId} ${message}${extra}`;
  }),
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.NODE_ENV === 'production' ? logFormat : consoleFormat,
  defaultMeta: {
    service: 'monkey-pay-backend',
  },
  transports: [
    new winston.transports.Console(),
  ],
  exitOnError: false,
});

/**
 * Create a child logger bound to a specific requestId.
 */
export function childLogger(requestId: string): winston.Logger {
  return logger.child({ requestId });
}

export default logger;
