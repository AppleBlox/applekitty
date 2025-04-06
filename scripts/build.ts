import { $, argv } from 'bun';
import pino from 'pino';

const start = performance.now();
const plogger = pino({
	transport: {
		target: 'pino-pretty',
	},
});
await $`rm -rf ./dist`;

await Bun.build({
	entrypoints: ['src/index.ts'],
	minify: true,
	target: 'bun',
	outdir: 'dist',
});

plogger.info(`Build complete in ${(performance.now() - start).toFixed(2)}ms`);
