import { SlashCommandBuilder } from '@discordjs/builders';
import { CacheType, Client, CommandInteraction, Guild, Message, MessageEmbed } from 'discord.js';
import { Schema } from 'mongoose';
import moment from 'moment';
import fetch from 'node-fetch';

import { Log, Plugin, PluginCommand, DatabaseModel } from '../plugin';

const quoteChannelKey = 'channelId';
const quoteRegex = /"(.+?)"(?:\s*-*(.*)$)/ms;

const confirmationEmbedColor = '#2ea42a';

// Quotes database
interface IQuote
{
	author: string,
	submitted_by: string,
	submitted_by_id: string,
	quote: string,
	time: string,
	timestamp: string,
}

const QuoteSchema = new Schema<IQuote>({
	author: { type: String },
	submitted_by: { type: String, required: true },
	submitted_by_id: { type: String },
	quote: { type: String, required: true },
	time: { type: String, required: true },
	timestamp: { type: String },
});

class QuotesPlugin extends Plugin
{
	public name = 'Quotes';
	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('quote')
					.setDescription('Cite a quote from the database.') as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) =>
				{
					await interaction.deferReply();

					const Quote = DatabaseModel('quotes', QuoteSchema, interaction.guild);

					const count = await Quote.countDocuments() as number;
					const random = Math.floor(Math.random() * count);
					const quote = await Quote.findOne().skip(random) as IQuote;

					// Fetch image from the API and return it
					const image = await fetch(`https://codaapi.herokuapp.com/quote/${encodeURI(quote.quote)}/${encodeURI(quote.author)}`);
					const buffer = Buffer.from(await image.arrayBuffer());

					interaction.editReply({ content: `Sent by ${quote.submitted_by} the ${quote.time}`, files: [{ attachment: buffer, name: `quote_${random}.png` }] });
				},
		},
	];


	private async HandleQuoteMessage(message: Message<boolean>, client: Client<boolean>)
	{
		if (message == undefined || client == undefined || message.author.id == client.user?.id)
		{ return; }

		const channelId = this.GetProperty(quoteChannelKey, '', message.guild as Guild);

		if (message.channelId != channelId)
		{ return; }

		try
		{
			this.HandleQuoteMessageInternal(message, client);
		}
		catch (error)
		{
			Log(`Error: '${error}'`);
			message.channel?.send(`Error: '${error}`);
		}
	}

	private async HandleQuoteMessageInternal(message: Message<boolean>, client: Client<boolean>)
	{
		const matches = message.content.match(quoteRegex);

		if (matches?.length == 3)
		{
			const Quote = DatabaseModel('quotes', QuoteSchema, message.guild);

			const quote = new Quote({
				quote: matches[1],
				author: matches[2],
				submitted_by: message.author.username,
				submitted_by_id: message.author.id,
				time: moment.utc(message.createdAt).add(1, 'hour').format('DD/MM/YY HH:mm'),
				timestamp: message.createdTimestamp,
			});
			await quote.save();
			Log('New quote saved');

			const messages = await message.channel.messages.fetch();

			const old = messages.find(
				msg => msg.deletable &&
				msg.author.id == client.user?.id &&
				msg.embeds?.at(0)?.hexColor == confirmationEmbedColor);
			if (old) old.delete();

			const embed = new MessageEmbed({
				footer: { text: `Saved by ${quote.submitted_by} -- ${quote.time}`, iconURL: 'http://i.imgur.com/EeC5BAb.png' },
				title: quote.author,
				color: confirmationEmbedColor,
				description: quote.quote,
			});

			await message.channel.send({ embeds: [ embed ] });
		}
	}

	public Init(client: Client<boolean>): void
	{
		client.on('messageUpdate', (_, message) => this.HandleQuoteMessage(message as Message<boolean>, client));
		client.on('messageCreate', (message: Message<boolean>) => this.HandleQuoteMessage(message, client));
	}
}

(new QuotesPlugin()).Register();