# Friendly Fire

## Installation

First you will need to setup the following environment variables:

```
FF_Token=your_discord_app_token
FF_ClientId=your_discord_app_clientId
MONGODB_URI=your_mongodb_uri_including_credentials
```

Example:
```
FF_Token=ABCDEFGHIJKLMNOPQRSTUVWXYZ.0123456789
FF_ClientId=0123456789101112
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@database.mongodb.net/
```

install all the required modules with

>npm install

normally it should also compile the typescript code, if not, you can use

>npm run build

to compile the code.

Now you just have to run the bot by typing

>npm run start

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
