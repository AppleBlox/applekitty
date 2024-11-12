import { $ } from 'bun';
import pino from 'pino';
import { name } from '../package.json';

const binaryName = name.toLowerCase().trim().replaceAll(' ', '_');

const start = performance.now();
const plogger = pino({
	transport: {
		target: 'pino-pretty',
	},
});
await $`rm -rf ./dist`;

const builds = {
	// biome-ignore lint: id
	win_x64: {
		target: 'bun-windows-x64-baseline',
		name: `${binaryName}_win_x64.exe`,
	},
	// biome-ignore lint: id
	linux_x64: {
		target: 'bun-linux-x64-baseline',
		name: `${binaryName}_linux_x64`,
	},
	// biome-ignore lint: id
	linux_arm64: {
		target: 'bun-linux-arm64',
		name: `${binaryName}_linux_arm64`,
	},
	// biome-ignore lint: id
	mac_x64: {
		target: 'bun-darwin-x64',
		name: `${binaryName}_macos_x64`,
	},
	// biome-ignore lint: id
	mac_arm64: {
		target: 'bun-darwin-arm64',
		name: `${binaryName}_macos_arm64`,
	},
};

async function build(arch: keyof typeof builds) {
	plogger.info(`Compiling for ${arch}...`);
	const build = builds[arch];
	await $`bun build --compile --sourcemap --target=${build.target} ./src/index.ts --outfile ./dist/${build.name}`;
}

async function buildDefault() {
	plogger.info('Compiling app...');
	await $`bun build --compile --sourcemap ./src/index.ts --outfile ./dist/${binaryName}`;
}

if (Bun.argv[2]) {
	switch (Bun.argv[2].slice(2)) {
		case 'windows':
			await build('win_x64');
			break;
		case 'linux':
			await build('linux_x64');
			await build('linux_arm64');
			break;
		case 'macos':
			await build('mac_x64');
			await build('mac_arm64');
			break;
		case 'all':
			await build('win_x64');
			await build('linux_x64');
			await build('linux_arm64');
			await build('mac_x64');
			await build('mac_arm64');
			break;
		default:
			await buildDefault();
	}
} else {
	await buildDefault();
}

await $`rm -f bot_commands`;

plogger.info(`Build complete in ${(performance.now() - start).toFixed(2)}ms`);
