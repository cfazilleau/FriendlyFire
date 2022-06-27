import 'dotenv/config';
import './config';

import { Client, Guild, Intents } from 'discord.js';
import { REST } from '@discordjs/rest';
import { HandleCommand, LoadPlugins, RegisterCommands } from './pluginloader';
import { Log } from './utils';
import { CreateGuildConfig } from './config';

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// When the client is ready, run this code (only once)
client.once('ready', () =>
{
	Log('Ready!');

	// Load Plugins
	LoadPlugins(client);

	// Register commands for all plugins and all guilds
	client.guilds.cache.forEach(async (guild : Guild, id : string) =>
	{
		Log(`Connected to guild ${id}. (${guild.name})`);

		// Create Config
		CreateGuildConfig(guild);

		RegisterCommands(guild)
			.catch(e => Log(e));
	});
});

// When the client receives an interaction, execute command
client.on('interactionCreate', async interaction =>
{
	if (interaction.isCommand())
	{
		HandleCommand(interaction);
	}
});

// Check for valid token
if (process.env.FF_Token == undefined)
{
	throw 'Environment variable \'FF_Token\' not set.';
}

// Login to REST API
export const rest = new REST({ version: '10' }).setToken(process.env.FF_Token);

// Login to Discord with your client's token
client.login(process.env.FF_Token);