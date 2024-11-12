import '@ddev/init';
import { DeploySlashCommands, LoadEvents, PinoLogger } from '@ddev';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
	],
});

client.commands = new Collection();

client.once(Events.ClientReady, async (c) => {
	PinoLogger.info(`Ready! Logged in as ${c.user.tag}`);
	await DeploySlashCommands(c, Bun.argv.includes('--ignore-cache'));
	await LoadEvents(c);
});

client.login(Bun.env.BOT_TOKEN);
