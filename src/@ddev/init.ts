import { plogger } from './utilities';

if (!Bun.env.BOT_TOKEN) {
	plogger.fatal('No "BOT_TOKEN" value was provided in environnment variables.');
	process.exit(1);
}
if (!Bun.env.APPLICATION_ID) {
	plogger.fatal('No "APPLICATION_ID" value was provided in environnment variables.');
	process.exit(1);
}
