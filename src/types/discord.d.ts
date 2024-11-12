import type { CommandCollection } from '@ddev/commands';
import type { Collection } from 'discord.js';

declare module 'discord.js' {
	export interface Client {
		commands: CommandCollection;
	}
}
