import pino from 'pino';
import lt from 'semver/functions/lt';

const PinoLogger = pino({
	level: 'debug',
	transport: {
		target: 'pino-pretty',
	},
});

const SUPPORTED_VERSION = '1.1.25';

if (lt(Bun.version, SUPPORTED_VERSION)) {
	PinoLogger.warn(
		`You're using an outdated version of Bun (${Bun.version})! This template was made for '${SUPPORTED_VERSION}' and newer. You may experience unwanted effects.`
	);
}
