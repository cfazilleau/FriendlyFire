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
		Log(`Express running on port ${process.env.EXPRESS_PORT}`);
	}
}

if (process.env.EXPRESS_PORT)
{
	const app = express();

	app.get('/', (_req, res) =>
	{
		res.send('Hello World');
	});

	app.listen(process.env.EXPRESS_PORT);

	new CorePlugin().Register();
}