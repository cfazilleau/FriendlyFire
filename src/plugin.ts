import * as discord from 'discord.js';
import * as builders from '@discordjs/builders';

import { RegisterPlugin } from './internal/pluginloader';
import { GetProperty } from './internal/config';
import { Log } from './internal/utils';

export * from './internal/utils';
export { DatabaseModel } from './internal/mongodb';

export type CommandCallback = (interaction: discord.CommandInteraction<discord.CacheType>) => Promise<void>;
export type ContextMenuCallback = (interaction: discord.ContextMenuInteraction<discord.CacheType>) => Promise<void>;

export type PluginCommand = {
	builder: builders.SlashCommandBuilder;
	callback: CommandCallback;
} | {
	builder: builders.ContextMenuCommandBuilder;
	callback: ContextMenuCallback;
}

export abstract class Plugin
{
	public abstract name : string;
	public abstract commands : PluginCommand[];
	public abstract Init(client : discord.Client<boolean>) : void;

	protected GetProperty<Type>(key: string, defaultValue: Type, guild? : discord.Guild) : Type
	{
		return GetProperty<Type>(this, key, defaultValue, guild);
	}

	public Register()
	{
		RegisterPlugin(this);
	}
}

export async function CatchAndLog<Type>(listener: () => Type, channel? : discord.TextBasedChannel | undefined | null)
{
	try
	{
		return await listener();
	}
	catch (error)
	{
		Log(error);

		if (channel)
		{
			const embed = new discord.MessageEmbed({
				title: 'Oops',
				description: `Error during interaction:\n${builders.codeBlock(`${error}`)}`,
				color: '#ff0000',
			});

			channel.send({ embeds: [ embed ] });
		}
	}
}