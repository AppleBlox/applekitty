# Discord.js ddev template

This is a template/framework for Discord.js v14. It has all the thing you need for fast TypeScript developpement.

## Features

#### Technologies

Bun is used instead of NodeJS.
The template comes with the **BiomeJS** linter pre-installed. It's a fast **prettier** alternative in **Rust**, and `pino`, as a logger:
```ts
import { PinoLogger } from "@ddev`
```

#### Slash Commands Cache

All the commands are deployed when starting the bot, but if the slash commands have previously been deployed and are unchanged, they will be skipped.
This great because this way you can easily deploy your command when starting the bot, without getting rate-limited.

#### Commands & Events

To register a slash command, you need to create a file named `<name>.cmd.ts` inside the `src/commands` directory. Example:
```ts
// ping.cmd.ts
import { RegisterSlashCommand } from '@ddev';
import { SlashCommandBuilder } from 'discord.js';

RegisterSlashCommand({
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription("Replies with the bot's latency"),
	async execute(interaction) {
		await interaction.reply(
			`Reply in \`${Math.abs(Date.now() - interaction.createdTimestamp)}ms\`.`
		);
	},
});
```

As you can see, no need to import types, etc... as you can use the `RegisterSlashCommand` function, which is already typed-out.

The process is similiar to register events. You need to create a file named `<name>.evt.ts` inside the `src/events` directory. Exemple:
```ts
// interactionCreate.evt.ts
import { RegisterEvent } from '@ddev';
import { codeBlock } from 'discord.js';

RegisterEvent({
	name: 'interactionCreate',
	listener(interaction) {
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);
			if (!command) {
				interaction.reply(
					codeBlock(`The command "${interaction.commandName}" wasn't found.`)
				);
				return;
			}
			command.execute(interaction);
		}
	},
});
```

## Importing functions

All functions of the template can be imported as such:
```ts
import { myFunction } from "@ddev"
```

`@ddev` isn't a package, it's a directory inside `src/@ddev`. So if you want to modify some of the core functions, you can, unlinke many Discord.js frameworks.

## Running your bot

You can run your bot like this:
```bash
bun run start
```

## Build your bot

Using bun, we can compile the code into a single executable. To do so, run one of these commands:
```bash
# Compile for your platform
bun run build

# Compile for windows
bun run build:windows

# Compile for linux
bun run build:linux

# Compile for MacOS
bun run build:macos

# Compile for all platforms
bun run build:all
```