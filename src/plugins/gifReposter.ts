// This file is a template file to be used as a model for custom plugins

import { SlashCommandBuilder } from '@discordjs/builders';
import { Client, CommandInteraction, Message, MessageEmbed, PresenceStatusData, TextChannel } from 'discord.js';
import { CatchAndLog, Log, Plugin } from '../plugin';

const urlregex = /https?:\/\/(?:www\.)?([-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6})\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/

class GifReposterPlugin extends Plugin
{
	public name = 'GifReposter';
	public commands = [];

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>) : void
	{
		client.on('messageCreate', async (message) =>
		{
			CatchAndLog(async () =>
			{
				if (message.author.id == client.user?.id)
				{
					return;
				}

				if (message.guild == null)
				{
					throw 'Guild is null';
				}

				const channels: string[] = this.GetProperty<string[]>('channels', [], message.guild);

				Log(channels[0]);

				if (channels.includes(message.channelId))
				{
					// const channel = message.channel as TextChannel;
					// const webhooks = await channel.fetchWebhooks();
					// const webhook = webhooks.find()

					await this.OnMessageCreated(message);
				}
			});
		});


		// eslint-disable-next-line no-empty-function
	}

	private domainsList = [
		'tenor.com',
		'giphy.com',
	];

	private OnMessageCreated(message: Message<boolean>)
	{
		Log('Message created');

		// if the message don't have any whitespace
		if (!message.content.match(/\s/))
		{
			const results = message.content.match(urlregex);
			if (results != null && results.length > 0)
			{
				if (results[0].endsWith('.gif') ||
					this.domainsList.includes(results[1]))
				{
					message.reply({ content: results[0], embeds: [ new MessageEmbed().setImage(results[0] + '.gif') ] });
				}
			}
		}
	}
}

(new GifReposterPlugin()).Register();