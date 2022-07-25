import { SlashCommandBuilder, time, userMention } from '@discordjs/builders';
import { CacheType, Client, CommandInteraction, Guild, Message, MessageEmbed, MessageOptions, TextBasedChannel } from 'discord.js';
import { Schema } from 'mongoose';
import moment from 'moment';
import fetch from 'node-fetch';

import { Log, Plugin, PluginCommand, DatabaseModel } from '../plugin';

const quoteChannelKey = 'captureChannelId';
const quoteReplyChannelKey = 'replyChannelId';
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
	time: { type: String, default: '' },
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
					const Quote = DatabaseModel('quotes', QuoteSchema, interaction.guild);
					let quotesChannelId = this.GetProperty(quoteReplyChannelKey, undefined, interaction.guild as Guild) as string | undefined;

					if (quotesChannelId == interaction.channelId)
					{
						quotesChannelId = undefined;
					}

					const ephemeral = quotesChannelId != undefined;

					await interaction.deferReply({ ephemeral: ephemeral });

					let id = interaction.options.getInteger('id');
					const count = await Quote.countDocuments() as number;

					// get quotes ordered by timestamp
					const quotes = (await Quote.find().sort({ timestamp: 'asc' }));

					if (id != undefined)
					{
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
					}
					else
					{
						/*
						// Get a random quote from the database
						const doc = (await Quote.aggregate([{ $sample: { size: 1 } }])).at(0);

						// Find the index of that quote
						id = quotes.findIndex(obj => obj._id.toString() == doc._id.toString()) + 1;
						*/

						// Get a random quote from the database
						id = Math.floor((Math.random() * quotes.length));
					}

					const quote = quotes.at(id) as IQuote;

					// Fetch image from the API and return it
					const quoteURI = encodeURIComponent(quote.quote.length > 0 ? quote.quote : ' ');
					const authorURI = encodeURIComponent(quote.author.length > 0 ? quote.author : ' ');

					const requestURL = `http://api.cfaz.dev/quote/${quoteURI}/${authorURI}/`;

					const image = await fetch(requestURL);
					if (!image.ok) throw `CodaAPI request failed with URL ${requestURL}:\n${image.status} ${image.statusText}`;

					// Create and send image buffer
					const buffer = Buffer.from(await image.arrayBuffer());

					// Create payload
					let payload: MessageOptions = {};
					switch (interaction.locale)
					{
					case 'fr':
						payload = {
							content: `> Citation #${id + 1}/${count}, Envoyée par ${quote.submitted_by_id == '' ? quote.submitted_by : userMention(quote.submitted_by_id)} ${quote.timestamp == 0 ? ' le ' + quote.time : time(new Date(quote.timestamp), 'R')}`,
							files: [{ attachment: buffer, name: `quote_${id}.png` }] };
						break;
					default:
						payload = {
							content: `> Quote #${id + 1}/${count}, Submitted by ${quote.submitted_by_id == '' ? quote.submitted_by : userMention(quote.submitted_by_id)} ${quote.timestamp == 0 ? ' the ' + quote.time : time(new Date(quote.timestamp), 'R')}`,
							files: [{ attachment: buffer, name: `quote_${id}.png` }] };
						break;
					}

					// Retrieve channel
					let channel: TextBasedChannel | undefined = undefined;
					if (quotesChannelId != undefined)
					{
						channel = await interaction.guild?.channels.fetch(quotesChannelId) as TextBasedChannel;
					}

					// Send payload
					if (channel)
					{
						payload.content = userMention(interaction.user.id) + '\n' + payload.content;
						const msg = await channel.send(payload);

						switch (interaction.locale)
						{
						case 'fr':
							await interaction.editReply(`Quote envoyée avec succès: ${msg.url}`);
							break;
						default:
							await interaction.editReply(`Quote successfully sent here: ${msg.url}`);
							break;
						}
					}
					else
					{
						await interaction.editReply(payload);
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

	private async CleanQuotes(guild: Guild)
	{
		const Quote = DatabaseModel('quotes', QuoteSchema, guild);

		// clean all undefined timestamps
		const allQuotes = await Quote.find({});

		for (let i = 0; i < allQuotes.length; i++)
		{
			const quote = allQuotes[i];

			if (quote.timestamp == 0 && quote.time != '')
			{
				quote.timestamp = moment.utc(quote.time, 'DD/MM/YY HH:mm').subtract(1, 'hour').valueOf();
				await quote.save();
				Log(`Fixed a timestamp in quote ${quote._id.toString()}`);
			}
		}

		// await Quote.updateMany({}, { $unset: { time: '' } });
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
				footer: { text: `Sauvegardé par ${quote.submitted_by}. Quote #${await Quote.countDocuments()}`, iconURL: 'http://i.imgur.com/EeC5BAb.png' },
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

		// Register commands for all plugins and all guilds
		client.guilds.cache.forEach(async (guild : Guild, id : string) =>
		{
			this.CleanQuotes(guild);
		});
	}
}

(new QuotesPlugin()).Register();
