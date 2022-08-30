import express from 'express';

import { Plugin, PluginCommand, Log } from '../plugin';
import { Client } from 'discord.js';


class CorePlugin extends Plugin
{
	public name = 'Express';
	public commands: PluginCommand[] = [];

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>): void
	{
		express().listen(process.env.EXPRESS_PORT);
		Log('started express.');
	}
}

if (process.env.EXPRESS_PORT)
{
	new CorePlugin().Register();
}