import { join, resolve } from 'node:path';
import { PinoLogger } from '@ddev';
import { type Client, type ClientEvents, Collection } from 'discord.js';
import { glob } from 'glob';

export interface Event<K extends keyof ClientEvents> {
	/** Name of the event */
	name: K;
	/** Async function to execute when the event is called */
	listener: (...args: ClientEvents[K]) => void;
	/** Will this event be called only once? */
	once?: boolean;
}

export type EventCollection = Collection<keyof ClientEvents, Event<any>>;

// Events Collection
const events: EventCollection = new Collection();

/** Register an event by a name and callback */
export function registerEvent<K extends keyof ClientEvents>(event: Event<K>) {
	events.set(event.name, event);
}

/** Load every events in the 'events' folder */
export async function loadEvents(client: Client) {
	PinoLogger.info('Importing events...');
	await importEvents();
	PinoLogger.info(`Loading ${events.size} events:`);
	for (const [name, event] of events) {
		PinoLogger.info(`    - ${name}`);
		if (event.once) {
			client.once(event.name, event.listener);
		} else {
			client.on(event.name, event.listener);
		}
	}

	PinoLogger.info('Successfully loaded events.');
}

async function importEvents() {
	try {
		const eventsBundle = Bun.file('./src/@ddev/bundle.events.ts');
		if (!(await eventsBundle.exists())) {
			PinoLogger.error(
				"The 'events' bundle doesn't exist. You can generate it using the package scripts. Events will not be loaded."
			);
			return;
		}
		// @ts-ignore
		await import('./bundle.events');
	} catch (err) {
		PinoLogger.error("Couldn't import 'events' bundle file:");
		console.error(err);
	}
}
