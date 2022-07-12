import { Client, TextChannel } from 'discord.js';
import { CatchAndLog, Plugin } from '../plugin';

class AlivePlugin extends Plugin
{
	public name = 'Alive';
	public commands = [];

	public Init(client: Client<boolean>): void
	{
		client.on('messageCreate', message =>
		{
			CatchAndLog(() =>
			{
				if (message.mentions.users.has(client.user?.id ?? ''))
				{
					message.react('👀');
				}
			}, message.channel as TextChannel);
		});
	}
}

(new AlivePlugin()).Register();