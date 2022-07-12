import * as builders from '@discordjs/builders';
import * as types from 'discord-api-types/v10';
import * as discord from 'discord.js';
import * as fs from 'node:fs';

import { Plugin, CommandCallback } from '../plugin';
import { restAPI } from '../main';
import { Log } from './utils';

// Referenced plugins
const plugins : Map<string, Plugin> = new Map;
// CommandBuilders
export const commands : types.RESTPostAPIApplicationCommandsJSONBody[] = [];
// Callbacks by command names
const callbacks : Map<string, CommandCallback> = new Map();
// Are plugins loaded
let pluginsLoaded = false;

export async function HandleCommand(command : discord.CommandInteraction)
{
	Log(`Executing command '${command.toString()}'`);

	await callbacks.get(command.commandName)?.(command)
		.catch(error =>
		{
			Log(`Error executing '${command.toString()}': '${error}'`);

			const embed = new discord.MessageEmbed({
				title: 'Oops',
				description: `Error executing ${builders.inlineCode(command.toString())}:\n${builders.codeBlock(error)}`,
				color: '#ff0000',
			});

			if (command.deferred)
			{
				command.editReply({ embeds: [embed] });
			}
			else if (command.replied)
			{
				command.channel?.send({ embeds: [embed] });
			}
			else
			{
				command.reply({ embeds: [embed] });
			}
		});
}

export async function RegisterCommands(guild : discord.Guild) : Promise<void>
{
	// Check for valid clientId
	if (process.env.FF_ClientId == undefined)
	{
		throw 'Environment variable \'FF_ClientId\' not set.';
	}

	Log(`Registering commands... (${guild.name})`);

	// Register commands from all loaded plugins
	await restAPI.put(types.Routes.applicationGuildCommands(process.env.FF_ClientId, guild.id), { body: commands })
		.catch(e => Log(e));

	Log(`Registered ${commands.length} commands. (${guild.name})`);
}

export function LoadPlugins(client : discord.Client<boolean>)
{
	// TODO: find a better way and clean that
	const pluginsDir = 'plugins';
	const commandFiles = fs.readdirSync(`./dist/${pluginsDir}`).filter(file => file.endsWith('.js'));

	Log(`Loading ${commandFiles.length} plugins...`);

	// Require plugins so they can all register themselves
	for (const file of commandFiles)
	{
		try
		{
			require(`../${pluginsDir}/${file}`);
		}
		catch (error)
		{
			Log(`Error loading ${file}: ${error}`);
		}
	}

	// Init plugins
	plugins.forEach(plugin =>
	{
		try
		{
			plugin.Init(client);
			Log(`Loaded plugin ${plugin.name}`);
		}
		catch (error)
		{
			Log(`Error initializing plugin ${plugin.name}: ${error}`);
		}
	});

	// Import commands from plugins
	plugins.forEach(plugin =>
	{
		plugin.commands.forEach(command =>
		{
			commands.push(command.builder.toJSON());
			callbacks.set(command.builder.name, command.callback);
		});
	});

	// Set flags so plugins registered after LoadPlugins() will throw an error.
	pluginsLoaded = true;
}

export function RegisterPlugin(plugin : Plugin)
{
	if (pluginsLoaded)
	{
		throw 'plugins have already been loaded, you can\'t register any more of them.';
	}

	plugins.set(plugin.name, plugin);
	Log(`Registered plugin '${plugin.name}'`);
}
