import { SlashCommandBuilder, time, userMention } from '@discordjs/builders';
import { CacheType, Client, CommandInteraction, Guild, Message, MessageEmbed } from 'discord.js';
import { Schema } from 'mongoose';
import moment from 'moment';

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
	timestamp: number,
}

const QuoteSchema = new Schema<IQuote>({
	author: { type: String },
	submitted_by: { type: String, required: true },
	submitted_by_id: { type: String, default: '' },
	quote: { type: String, required: true },
	time: { type: String, required: true },
	timestamp: { type: Number, default: 0 },
});

class QuotesPlugin extends Plugin
{
	public name = 'Quotes';
	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('quote')
					.setDescription('Send a quote from the database.')
					.setDescriptionLocalization('fr', 'Envoie une citation de la base de données')
					.addIntegerOption(option => option
						.setName('id')
						.setDescription('Id of the required quote')
						.setDescriptionLocalization('fr', 'Id de la citation recherchée')
						.setMinValue(1)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) =>
				{
					await interaction.deferReply();

					const Quote = DatabaseModel('quotes', QuoteSchema, interaction.guild);

					const count = await Quote.countDocuments() as number;
					const id = interaction.options.getInteger('id') ?? Math.floor(Math.random() * count) + 1;

					if (id > count)
					{
						switch (interaction.locale)
						{
						case 'fr':
							interaction.editReply({ content: `La valeur maximale de 'id' est ${count}.` });
							break;
						default:
							interaction.editReply({ content: `The maximum value of 'id' is ${count}.` });
							break;
						}

						return;
					}

					// Get quote from the database
					const quote = await Quote.findOne().skip(id - 1) as IQuote;

					// Fetch image from the API and return it
					const image = await fetch(`http://api.cfaz.dev/quote/${encodeURI(quote.quote)}/${encodeURI(quote.author)}`);
					if (!image.ok) throw `CodaAPI request failed: ${image.status} ${image.statusText}`;

					// Create and send image buffer
					const buffer = Buffer.from(await image.arrayBuffer());

					switch (interaction.locale)
					{
					case 'fr':
						interaction.editReply({
							content: `> Citation #${id}/${count}, Envoyée par ${quote.submitted_by_id == '' ? quote.submitted_by : userMention(quote.submitted_by_id)} ${quote.timestamp == 0 ? ' le ' + quote.time : time(new Date(quote.timestamp), 'R')}`,
							files: [{ attachment: buffer, name: `quote_${id}.png` }] });
						break;
					default:
						interaction.editReply({
							content: `> Quote #${id}/${count}, Submitted by ${quote.submitted_by_id == '' ? quote.submitted_by : userMention(quote.submitted_by_id)} ${quote.timestamp == 0 ? ' the ' + quote.time : time(new Date(quote.timestamp), 'R')}`,
							files: [{ attachment: buffer, name: `quote_${id}.png` }] });
						break;
					}
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
				footer: { text: `Sauvegardé par ${quote.submitted_by}`, iconURL: 'http://i.imgur.com/EeC5BAb.png' },
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