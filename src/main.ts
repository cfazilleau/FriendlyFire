import 'dotenv/config';
import './internal/config';
import './internal/mongodb';

import * as discord from 'discord.js';
import * as rest from '@discordjs/rest';

import { HandleCommand, LoadPlugins, RegisterCommands } from './internal/pluginloader';
import { CreateGuildConfig } from './internal/config';
import { Log } from './internal/utils';
import { ConnectToDatabase } from './internal/mongodb';

import './internal/web';

// Create a new client instance
const client = new discord.Client({ intents: [discord.Intents.FLAGS.GUILDS, discord.Intents.FLAGS.GUILD_MEMBERS, discord.Intents.FLAGS.GUILD_MESSAGES, discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS ] });

// When the client is ready, run this code (only once)
client.once('ready', async () =>
{
	Log(`Ready! Join any server with this link: https://discord.com/oauth2/authorize?client_id=${process.env.FF_ClientId}&scope=bot&permissions=8`);

	// Load Plugins
	LoadPlugins(client);

	// Register commands for all plugins and all guilds
	client.guilds.cache.forEach(async (guild : discord.Guild, id : string) =>
	{
		Log(`Connected to guild ${id}. (${guild.name})`);

		// Create Config
		CreateGuildConfig(guild);

		RegisterCommands(guild)
			.catch(e => Log(e));
	});
});

client.on('guildCreate', async guild =>
{
	// Register commands for all plugins on this guild
	Log(`Joined guild ${guild.id}. (${guild.name})`);

	// Create Config
	CreateGuildConfig(guild);

	RegisterCommands(guild)
		.catch(e => Log(e));
});

// When the client receives an interaction, execute command
client.on('interactionCreate', async interaction =>
{
	if (interaction.isCommand() || interaction.isContextMenu())
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
export const restAPI = new rest.REST({ version: '10' }).setToken(process.env.FF_Token);

// Login to Discord with your client's token
client.login(process.env.FF_Token);
ConnectToDatabase();