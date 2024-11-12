import pino from 'pino';
import PinoPretty from 'pino-pretty';

/** Returns true if running in dev mode */
export const isDeveloppementMode = () => Bun.env.NODE_ENV === 'development';

const stream = PinoPretty({ colorize: true });

/** Pino logger instance, usable in the entire application */
export const plogger = pino(
	{
		level: process.env.LOG_LEVEL || (isDeveloppementMode() ? 'debug' : 'info'),
	},
	stream
);
