import { deploy, registerCommand } from './commands';
import { loadEvents, registerEvent } from './events';
import { plogger } from './utilities';

export {
	registerCommand as RegisterSlashCommand,
	deploy as DeploySlashCommands,
	loadEvents as LoadEvents,
	registerEvent as RegisterEvent,
	plogger as PinoLogger,
};
