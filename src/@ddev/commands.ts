import { PinoLogger } from '@ddev';
import {
	type ChatInputCommandInteraction,
	type Client,
	Collection,
	REST,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	Routes,
	type SlashCommandBuilder,
	type SlashCommandOptionsOnlyBuilder,
	type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

export interface Command {
	/** Command data */
	data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
	/** Async function to execute when the command is used */
	execute: (interaction: ChatInputCommandInteraction) => Promise<void> | void;
	options?: {
		/** Array of guild IDs */
		guilds?: string[];
	};
}

export type CommandCollection = Collection<any, Command>;

// Commands collection
const commands: CommandCollection = new Collection();

/** Register a slash command */
export async function registerCommand(cmd: Command) {
	commands.set(cmd.data.name, cmd);
}

/** Deploy all slash commands */
export async function deploy(
	client: Client,
	/** Ignores the cache and force the deployement */
	ignoreCache = false
) {
	if (!(await importCommands())) {
		PinoLogger.error('Commands deployement failed.');
		return;
	}
	client.commands = commands;

	// Commands are the same as last deploy
	if (!ignoreCache && (await areCommandsCached(commands))) {
		PinoLogger.info('Deploy skipped because current commands are identical as last deploy.');
		return;
	}

	PinoLogger.info(`Deploying ${client.commands.size} total command(s):`);
	for (const cmd of client.commands) {
		PinoLogger.info(`	- ${cmd[1].data.name}`);
	}

	const isGuildCommand = (cmd: Command) => cmd.options?.guilds != null;
	const rest = new REST().setToken(Bun.env.BOT_TOKEN);

	// Global commands
	const globalCommands = client.commands
		.filter((cmd) => !isGuildCommand(cmd))
		.map((c) => c.data.toJSON());
	PinoLogger.info('Deploying global command(s)...');
	const data = (await rest.put(Routes.applicationCommands(Bun.env.APPLICATION_ID.toString()), {
		body: globalCommands,
	})) as Array<any>;
	PinoLogger.info(`Successfully deployed ${data.length} global command(s).`);

	// We first get all guilds so old commands will also be removed
	const guildCommands = client.commands.filter(isGuildCommand);
	const guilds: Collection<string, RESTPostAPIChatInputApplicationCommandsJSONBody[]> =
		new Collection();
	for (const [_key, command] of guildCommands) {
		if (!command.options?.guilds) continue;
		// biome-ignore lint: command.options.guilds cannot be undefined here
		for (const guild of command.options?.guilds) {
			if (!guilds.has(guild)) {
				guilds.set(guild, []);
			}
			guilds.get(guild)?.push(command.data.toJSON());
		}
	}

	for (const guild of guilds) {
		try {
			const data = (await rest.put(
				Routes.applicationGuildCommands(Bun.env.APPLICATION_ID.toString(), guild[0]),
				{ body: [...new Set(guild[1])] }
			)) as { length: number };
			PinoLogger.info(`Deployed ${data.length} command(s) for the '${guild[0]}' guild.`);
		} catch (err) {
			PinoLogger.error(`Could not deploy commands for the "${guild[0]}" guild.`);
		}
	}
}

/** Import every typescript file in the commands folder */
async function importCommands() {
	try {
		const commandsBundle = Bun.file('./src/@ddev/bundle.commands.ts');
		if (!(await commandsBundle.exists())) {
			PinoLogger.error(
				"The 'commands' bundle doesn't exist. You can generate it using the package scripts. Commands will not be deployed."
			);
			return false;
		}
		// @ts-ignore
		await import('./bundle.commands');
		return true;
	} catch (err) {
		PinoLogger.error("Couldn't import 'commands' bundle file:");
		PinoLogger.error(err);
		return false;
	}
}

/** Compares 2 objects to see if they are the same */
function deepEqual(obj1: any, obj2: any): boolean {
	if (obj1 === obj2) return true;

	if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
		return obj1 === obj2;
	}

	const keys1 = Object.keys(obj1);
	const keys2 = Object.keys(obj2);

	if (keys1.length !== keys2.length) return false;

	for (const key of keys1) {
		if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
			return false;
		}
	}

	return true;
}

/** Check to see if the command data has changed, and if yes, then cache */
async function areCommandsCached(commandCollection: CommandCollection): Promise<boolean> {
	// We stringify and parse to remove any non-json property
	const commands = JSON.parse(JSON.stringify(commandCollection.map((c) => c)));
	const cacheFile = Bun.file('.cache.json');

	// Initialize cache structure if file doesn't exist
	if (!(await cacheFile.exists())) {
		const initialCache = {
			date: Date.now(),
			commands: commands,
		};
		await Bun.write(cacheFile, JSON.stringify(initialCache));
		return false; // First time cache is created, we should deploy
	}

	const cacheJson = await cacheFile.json();

	// If the cache is older than 5 minutes, update cache and return false
	if (!cacheJson.date || (Date.now() - cacheJson.date) / 1000 > 300) {
		const updatedCache = {
			date: Date.now(),
			commands: commands,
		};
		await Bun.write(cacheFile, JSON.stringify(updatedCache));
		return false;
	}

	// If commands are the same, just update the date
	if (deepEqual(commands, cacheJson.commands)) {
		const updatedCache = {
			date: Date.now(),
			commands: cacheJson.commands,
		};
		await Bun.write(cacheFile, JSON.stringify(updatedCache));
		return true;
	}

	// Commands have changed, update everything
	const newCache = {
		date: Date.now(),
		commands: commands,
	};
	await Bun.write(cacheFile, JSON.stringify(newCache));
	return false;
}
