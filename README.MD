"moment": "^2.29.1",
"mongoose": "^5.11.9",
"npm": "^8.0.0",
"rcon-client": "^4.2.3"

	"eslint.format.enable": true,
	"eslint.validate": ["typescript", "typescriptreact"],
	"editor.codeActionsOnSave": {
		"source.fixAll.eslint": true
	},
	"[typescript]": {
		"editor.defaultFormatter": "dbaeumer.vscode-eslint"
	}

Phoenix Bot
-------------

## Installation

in order to log in, the bot uses the env vars:

```
# core
BOT_TOKEN=
BOT_ID=

# quote plugin
MONGODB_URI=

# minecraft plugin
MC_IP=
MC_PORT=
MC_PASSWORD=
```

install all the required modules with a

>npm install

then you're good to go, the entry point is main.js (`npm start` to compile and run)

you'll be able to find the link to invite the bot on your server in the logs of the bot.

# Plugin Template

```ts
import { SlashCommandBuilder } from '@discordjs/builders';
import { CacheType, Client, CommandInteraction } from 'discord.js';

import { Plugin, PluginCommand } from '../plugin';
import { Log } from '../utils';

// Create a class extending the Plugin class
class CustomPlugin extends Plugin
{
	// The plugin name, will be used in logs and in config files
	public name = 'Custom';

	// The Commands associated with this plugin
	public commands: PluginCommand[] = [
		{
			// The builder is a slash command descriptor that is registered as a guild command when loading plugin.
			builder:
				new SlashCommandBuilder()
					.setName('name')
					.setDescription('description')
					.setDefaultPermission(false) as SlashCommandBuilder,
			// The Callback is an async method called when someone runs the command
			callback:
				async (interaction: CommandInteraction<CacheType>) =>
				{
					// The log function from ../utils doas automatic formatting for logs consistency
					Log(interaction);
				},
		},
	];

	// The Init method is called by the bot when loading the plugin
	public Init(client: Client<boolean>): void
	{

	}
}

// Register the plugin to the bot
RegisterPlugin(new CustomPlugin());
```
