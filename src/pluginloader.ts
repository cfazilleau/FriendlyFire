import { SlashCommandBuilder } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody, Routes } from 'discord-api-types/v10';
import { CacheType, Client, CommandInteraction, Guild } from 'discord.js';
import { readdirSync } from 'node:fs';
import { rest } from './main';
import { Log } from './utils';

type CommandCallback = (interaction: CommandInteraction<CacheType>) => Promise<void>;

export abstract class Plugin
{
	public abstract name : string;
	public abstract commands : PluginCommand[];
	public abstract Init(client : Client<boolean>) : void;
}

export interface PluginCommand {
	builder: SlashCommandBuilder;
	callback: CommandCallback;
}

// Referenced plugins
const plugins : Map<string, Plugin> = new Map;
// CommandBuilders
export const commands : RESTPostAPIApplicationCommandsJSONBody[] = [];
// Callbacks by command names
const callbacks : Map<string, CommandCallback> = new Map();
// Are plugins loaded
let pluginsLoaded = false;

export async function HandleCommand(command : CommandInteraction)
{
	Log(`Executing command '${command.toString()}'`);

	await callbacks.get(command.commandName)?.(command)
		.catch(error =>
		{
			Log(`Error executing '${command.toString()}': '${error}'`);
			command.reply(`Error executing \`${command.toString()}\`:\n\`\`\`${error}\`\`\``);
		});
}

export async function RegisterCommands(guild : Guild) : Promise<void>
{
	// Check for valid clientId
	if (process.env.FF_ClientId == undefined)
	{
		throw 'Environment variable \'FF_ClientId\' not set.';
	}

	Log(`Registering commands... (${guild.name})`);

	// Register commands from all loaded plugins
	await rest.put(Routes.applicationGuildCommands(process.env.FF_ClientId, guild.id), { body: commands }).catch(Log);

	Log(`Registered ${commands.length} commands. (${guild.name})`);
}

export function LoadPlugins(client : Client<boolean>)
{
	// TODO: find a better way and clean that
	const pluginsDir = './plugins';
	const commandFiles = readdirSync(`./dist/${pluginsDir}`).filter(file => file.endsWith('.js'));

	Log(`Loading ${commandFiles.length} plugins...`);

	// Require plugins so they can all register themselves
	for (const file of commandFiles)
	{
		require(`${pluginsDir}/${file}`);
	}

	// Init plugins
	plugins.forEach(plugin =>
	{
		plugin.Init(client);
		Log(`Loaded plugin ${plugin.name}`);
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
}
