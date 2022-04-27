import 'dotenv/config';

import { Client, Intents } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { commands, HandleCommand, LoadPlugins } from './pluginloader';

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// When the client is ready, run this code (only once)
client.once('ready', () =>
{
	LoadPlugins(client);

	client.guilds.cache.forEach((guild, id) =>
	{
		console.log('connected to guild: ' + id);

		// Delete already registered commands
		guild.commands.set([]);

		// Check for valid clientId
		if (process.env.FF_ClientId == undefined)
		{
			throw 'Environment variable \'FF_ClientId\' not set.';
		}

		// Register commands from all loaded plugins
		rest.put(Routes.applicationGuildCommands(process.env.FF_ClientId, guild.id), { body: commands });
	});

	console.log('Ready!');
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
const rest = new REST({ version: '10' }).setToken(process.env.FF_Token);

// Login to Discord with your client's token
client.login(process.env.FF_Token);