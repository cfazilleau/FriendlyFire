import 'dotenv/config';
import './config';

import { Client, Intents } from 'discord.js';
import { REST } from '@discordjs/rest';
import { HandleCommand, LoadPlugins, RegisterCommands } from './pluginloader';
import { Log } from './utils';

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// When the client is ready, run this code (only once)
client.once('ready', () =>
{
	Log('Ready!');

	// Load Plugins
	LoadPlugins(client);

	// Register commands for all plugins and all guilds
	client.guilds.cache.forEach(async (guild, id) =>
	{
		Log(`Connected to guild ${id}. (${guild.name})`);

		RegisterCommands(guild, id)
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