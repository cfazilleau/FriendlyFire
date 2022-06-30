import * as discord from 'discord.js';
import * as builders from '@discordjs/builders';

import { RegisterPlugin } from './internal/pluginloader';
import { GetProperty } from './internal/config';
import { Log } from './utils';

export type CommandCallback = (interaction: discord.CommandInteraction<discord.CacheType>) => Promise<void>;

export interface PluginCommand {
	builder: builders.SlashCommandBuilder;
	callback: CommandCallback;
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

	public constructor()
	{
		Log(this);
		RegisterPlugin(this);
	}
}

