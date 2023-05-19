import { channelMention, SlashCommandBuilder, time, userMention } from '@discordjs/builders';
import { ButtonInteraction, CacheType, Client, CommandInteraction, Guild, Message, MessageActionRow, MessageButton, MessageEmbed, MessageOptions, MessageSelectOptionData, SelectMenuInteraction, TextBasedChannel, TextChannel, User } from 'discord.js';
import { Document, Schema, Types } from 'mongoose';
import fetch from 'node-fetch';

import { Log, Plugin, PluginCommand, DatabaseModel, CatchAndLog } from '../plugin';

const quoteChannelKey = 'captureChannelId';
const quoteReplyChannelKey = 'replyChannelId';
const quoteRegex = /^"(.+?)"(?:\s*-*(.*)$)/ms;
const apiURL = process.env.API_URL;

const confirmationEmbedColor = '#2ea42a';

// Quotes database
interface IQuote
{
	author: string,
	submitted_by: string,
	submitted_by_id: string,
	quote: string,
	timestamp: number,
	safe: boolean,
	checked: boolean,
}

const QuoteSchema = new Schema<IQuote>({
	author: { type: String },
	submitted_by: { type: String, required: true },
	submitted_by_id: { type: String, default: '' },
	quote: { type: String, required: true },
	timestamp: { type: Number, default: 0 },
	safe: { type: Boolean, default: false },
	checked: { type: Boolean, default: false },
});

class QuotesPlugin extends Plugin
{
	public name = 'Quotes';
	public commands: PluginCommand[] = [
		{
			builder: new SlashCommandBuilder()
				.setName('quote')
				.setDescription('Send a quote from the database.')
				.setDescriptionLocalization('fr', 'Envoie une citation de la base de données')
				.addIntegerOption(option => option
					.setName('id')
					.setDescription('Id of the required quote')
					.setDescriptionLocalization('fr', 'Id de la citation recherchée')
					.setMinValue(1)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) => this.HandleQuoteCommand(interaction),
		},
		{
			builder: new SlashCommandBuilder()
				.setName('check-quotes')
				.setDescription('mark a random unchecked quote')
				.setDefaultPermission(false)
				.addIntegerOption(option => option
					.setName('id')
					.setDescription('Id of the required quote')
					.setDescriptionLocalization('fr', 'Id de la citation recherchée')
					.setMinValue(1)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) => this.HandleCheckQuotesCommand(interaction),
		},
		{
			builder: new SlashCommandBuilder()
				.setName('crawl-missing-quotes')
				.setDescription('crawl the whole hierarchy to find the missing quotes')
				.setDefaultPermission(false) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) => this.HandleCrawlMissingQuotesCommand(interaction),
		},
		{
			builder: new SlashCommandBuilder()
				.setName('quote-custom')
				.setDescription('create a custom quote image')
				.addStringOption(option => option
					.setName('body')
					.setDescription('Quote text')
					.setRequired(true))
				.addStringOption(option => option
					.setName('author')
					.setDescription('Author name')
					.setRequired(true))
				.setDefaultPermission(false) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction<CacheType>) => this.HandleCustomQuoteCommand(interaction),
		},
	];

	private showPayload: Map<string, boolean> = new Map();

	private async HandleQuoteCommand(interaction: CommandInteraction<CacheType>)
	{
		const Quote = await DatabaseModel('quotes', QuoteSchema, interaction.guild);
		let quotesChannelId = this.GetProperty(quoteReplyChannelKey, undefined, interaction.guild as Guild) as string | undefined;

		if (quotesChannelId == interaction.channelId)
		{
			quotesChannelId = undefined;
		}

		const ephemeral = quotesChannelId != undefined;

		await interaction.deferReply({ ephemeral: ephemeral });

		let id = interaction.options.getInteger('id');

		// get quotes ordered by timestamp
		const allquotes = (await Quote.find().sort({ timestamp: 'asc' }));
		const allcount = allquotes.length;

		let quote : IQuote | undefined = undefined;

		if (id != undefined)
		{
			// Substract 1 to get a id starting at 0
			id -= 1;

			if (id >= allcount)
			{
				switch (interaction.locale)
				{
				case 'fr':
					await interaction.editReply({ content: `La valeur maximale de 'id' est ${allcount}.` });
					break;
				default:
					await interaction.editReply({ content: `The maximum value of 'id' is ${allcount}.` });
					break;
				}

				return;
			}

			quote = allquotes.at(id) as IQuote;

			if (quote.safe == false)
			{
				switch (interaction.locale)
				{
				case 'fr':
					await interaction.editReply({ content: `La quote #${id + 1} est unsafe, je préfère éviter de la poster...` });
					break;
				default:
					await interaction.editReply({ content: `The quote #${id + 1} is unsafe, I'd rather not share it...` });
					break;
				}

				return;
			}
		}
		else
		{
			// Get a random quote from the database
			const selected = (await Quote.aggregate([{ $match: { safe: true } }, { $sample: { size: 1 } }])).at(0);
			if (selected == undefined) throw 'undefined quote';

			quote = selected as IQuote;

			// Find the index of that quote
			id = allquotes.findIndex(q => selected._id.toString() == q._id.toString());
		}

		// Fetch image from the API and return it
		const quoteURI = encodeURIComponent(quote.quote.length > 0 ? quote.quote : ' ');
		const authorURI = encodeURIComponent(quote.author.length > 0 ? quote.author : ' ');

		const requestURL = `${apiURL}/${quoteURI}/${authorURI}/`;

		const image = await fetch(requestURL);
		if (!image.ok) throw `CodaAPI request failed with URL ${requestURL}:\n${image.status} ${image.statusText}`;

		// Create and send image buffer
		const buffer = Buffer.from(await image.arrayBuffer());

		// Create payload
		let payload: MessageOptions = {};

		// Add 1 to get a id starting at 1
		id += 1;

		switch (interaction.locale)
		{
		case 'fr':
			payload = {
				content: `> Citation #${id}/${allcount}, Envoyée par ${quote.submitted_by_id == '' ? quote.submitted_by : userMention(quote.submitted_by_id)} ${time(new Date(quote.timestamp), 'R')}`,
				files: [{ attachment: buffer, name: `quote_${id}.png` }] };
			break;
		default:
			payload = {
				content: `> Quote #${id}/${allcount}, Submitted by ${quote.submitted_by_id == '' ? quote.submitted_by : userMention(quote.submitted_by_id)} ${time(new Date(quote.timestamp), 'R')}`,
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

			const button = new MessageButton({ style: 'LINK', url: msg.url });
			let text = '';

			switch (interaction.locale)
			{
			case 'fr':
				text = `Quote envoyée avec succès dans ${channelMention(msg.channelId)}.`;
				button.label = 'Acceder à la quote';
				break;
			default:
				text = `Quote successfully sent in ${channelMention(msg.channelId)}.`;
				button.label = 'Access quote';
				break;
			}

			await interaction.editReply({
				content: text,
				components: [ new MessageActionRow().setComponents([ button ]) ],
			});
		}
		else
		{
			await interaction.editReply(payload);
		}
	}

	private async HandleCheckQuotesCommand(interaction: CommandInteraction)
	{
		await interaction.deferReply({ ephemeral: true });

		const model = await DatabaseModel('quotes', QuoteSchema, interaction.guild);

		await model.updateMany({ checked: undefined }, { checked: false });

		const quotes = (await model.find({}).sort({ timestamp: 'asc' }));

		let id = interaction.options.getInteger('id');

		if (id == undefined)
		{
			id = quotes.findIndex(doc => doc.checked == false);
		}
		else
		{
			id -= 1;
		}

		const count = quotes.length;
		const quote = quotes.at(id);

		if (quote == undefined)
		{
			throw 'no unchecked quote found';
		}

		const payload = await this.GetCheckQuotePayload(interaction.guild as Guild, interaction.user, quote, id, count);
		await interaction.editReply(payload);
	}

	private async HandleCrawlMissingQuotesCommand(interaction: CommandInteraction)
	{
		const reply = await interaction.reply({ content: 'Starting...', fetchReply: true, ephemeral: true });
		const baseBatchSize = 50;
		const channel = interaction.channel as TextChannel;

		let batchSize	= baseBatchSize;
		let lastMsg		= reply.id;
		let saved		= 0;
		let amount		= 0;

		await interaction.editReply(`Starting...\n\n> ${amount} messages checked\n> ${saved} new quotes saved`);

		const channelId = this.GetProperty(quoteChannelKey, '', interaction.guild as Guild);

		if (interaction.channelId != channelId)
		{
			throw 'this command must be ran from the #quote channel';
		}

		const model = await DatabaseModel('quotes', QuoteSchema, interaction.guild);
		const db = await model.find();

		while (batchSize == baseBatchSize)
		{
			const batch = await channel.messages.fetch({ limit: baseBatchSize, before: lastMsg });
			if (batch == undefined)
			{
				break;
			}

			batchSize = batch.size;
			Log(`Fetched ${batchSize} messages.`);

			amount += batchSize;

			// Iterate on messages
			for await (const element of batch.values())
			{
				// Message was sent by the bot or already saved
				if (element.author.id == interaction.client.user?.id ||
					db.find(m => this.IsMessageQuote(element, m)))
				{
					continue;
				}

				// Not already existing, try to save quote

				const matches = element.content.match(quoteRegex);
				if (matches?.length != 3)
				{
					// Regex failed
					continue;
				}

				// new quote entry
				const quote = new model({
					quote: matches[1],
					author: matches[2],
					submitted_by: element.author.username,
					submitted_by_id: element.author.id,
					timestamp: element.createdTimestamp,
					checked: false,
				});
				await quote.save();
				Log(`new quote found: "${quote.quote}" --${quote.author} from the ${new Date(quote.timestamp).toLocaleString()}`);
				saved++;
			}

			await interaction.editReply(`Saving quotes...\n\n> ${amount} messages checked\n> ${saved} new quotes saved`);

			// Continue fetching messages before the date of the first element of the previous batch
			if (batchSize > 0)
			{
				lastMsg = (batch.last() as Message).id;
			}
		}

		Log(`Done. ${amount} messages checked and ${saved} new quotes saved`);
		await interaction.editReply(`Done.\n\n> ${amount} messages checked\n> ${saved} new quotes saved`);
	}

	private async HandleCustomQuoteCommand(interaction: CommandInteraction)
	{
		await interaction.deferReply({ ephemeral: true });

		const authorText = interaction.options.getString('author') ?? ' ';
		const bodyText = interaction.options.getString('body') ?? ' ';

		// Fetch image from the API and return it
		const quoteURI = encodeURIComponent(bodyText);
		const authorURI = encodeURIComponent(authorText);

		const requestURL = `${apiURL}/${quoteURI}/${authorURI}/`;

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
				content: '> Citation Custom',
				files: [{ attachment: buffer, name: 'custom_quote.png' }] };
			break;
		default:
			payload = {
				content: '> Custom Quote',
				files: [{ attachment: buffer, name: 'custom_quote.png' }] };
			break;
		}

		await interaction.editReply(payload);
	}

	private IsMessageQuote(message: Message<boolean>, quote: IQuote): boolean
	{
		// ignore milliseconds
		const threshold = 1000;

		return Math.abs(message.createdTimestamp - quote.timestamp) < threshold;
	}

	private async GetCheckQuotePayload(guild: Guild, user: User, quote: Document<unknown, unknown, IQuote> & IQuote & { _id: Types.ObjectId; }, id: number, count: number)
	{
		const showPayload = this.showPayload.get(user.id) ?? false;

		const embed = new MessageEmbed({
			title: `Quote #${id + 1}/${count} (${quote.checked ? 'checked' : 'unchecked' })`,
			description: `Submitted by ${quote.submitted_by_id == '' ? quote.submitted_by : `${userMention(quote.submitted_by_id)} (${quote.submitted_by})`}`,
			color: quote.checked ? '#07A0DE' : '#000000',
			fields: [],
			timestamp: quote.timestamp,
			footer: {
				text: quote.author,
			},
		});

		if (showPayload)
		{
			embed.fields.push({
				name: '‍',
				value: '```json\n' + JSON.stringify(quote as IQuote, null, 4) + '\n```',
				inline: true,
			});
		}

		embed.fields.push({
			name: '‍',
			value: quote.quote,
			inline: true,
		});

		const members = await guild.members.fetch();

		const users: MessageSelectOptionData[] = [];
		users.push({
			label: 'None',
			value: 'undefined',
			default: quote.id == '',
		});
		members.forEach(member =>
		{
			users.push({
				label: member.displayName,
				description: member.user.tag,
				value: member.id,
				default: member.id == quote.submitted_by_id,
			});
		});

		const actionRows = [];

		actionRows.push(
			new MessageActionRow({ components:
			[
				new MessageButton({
					customId: this.CustomId(`tag_safe___${quote._id}`),
					label: 'Safe',
					style: quote.safe == true ? 'PRIMARY' : 'SECONDARY',
				}),
				new MessageButton({
					customId: this.CustomId(`tag_unsafe___${quote._id}`),
					label: 'Unsafe',
					style: quote.safe != true ? 'PRIMARY' : 'SECONDARY',
				}),
			] }),
		);

		actionRows.push(
			new MessageActionRow({ components:
				[
					new MessageButton({
						customId: this.CustomId(`get_prev___${quote._id}`),
						label: 'Previous',
						style: 'SECONDARY',
					}),
					new MessageButton({
						customId: this.CustomId(`get_next___${quote._id}`),
						label: 'Next',
						style: 'SECONDARY',
					}),
					new MessageButton({
						customId: this.CustomId(`toggle_payload___${quote._id}`),
						label: showPayload ? 'Hide Payload' : 'Show Payload',
						style: 'SECONDARY',
					}),
				],
			}),
		);

		return { embeds: [ embed ], components: actionRows };
	}

	private async HandleInteraction(interaction: ButtonInteraction | SelectMenuInteraction)
	{
		const customId = this.GetShortCustomId(interaction.customId);
		Log(`Handling interaction '${customId}' from '${interaction.user.tag}'`);

		const split = customId.split('___');
		const action = split[0];
		const id = split[1];

		const model = await DatabaseModel('quotes', QuoteSchema, interaction.guild);

		// get quotes ordered by timestamp
		const quotes = (await model.find({}).sort({ timestamp: 'asc' }));
		const count = quotes.length;

		// get current id
		let curId = quotes.findIndex(doc => doc._id.toString() == id);

		switch (action)
		{
		case 'get_next':
			curId++;
			break;
		case 'get_prev':
			curId--;
			break;
		}

		if (curId < 0) curId = count - 1;
		if (curId > count - 1) curId = 0;

		const quote = quotes.at(curId);
		if (quote == undefined) throw `no quote found at id: ${curId}`;

		if (action == 'tag_safe' || action == 'tag_unsafe')
		{
			quote.safe = action == 'tag_safe';
			quote.checked = true;
			await quote.save();
		}
		else if (action == 'set_submitter' && interaction.isSelectMenu())
		{
			const selectedId = interaction.values[0];
			if (selectedId == 'undefined')
			{
				quote.submitted_by_id = '';
				quote.submitted_by = 'Unknown';
			}
			else
			{
				const member = await interaction.guild?.members.fetch(selectedId);
				if (member == undefined) throw 'guild or member not found';

				quote.submitted_by_id = selectedId;
				quote.submitted_by = member.user.username;
			}

			await quote.save();
		}
		else if (action == 'toggle_payload')
		{
			const showPayload = this.showPayload.get(interaction.user.id) ?? false;
			this.showPayload.set(interaction.user.id, !showPayload);
		}

		await interaction.editReply(await this.GetCheckQuotePayload(interaction.guild as Guild, interaction.user, quote, curId, count));
	}

	private async HandleQuoteMessage(message: Message<boolean>, client: Client<boolean>)
	{
		if (message == undefined || client == undefined || message.author.id == client.user?.id)
		{ return; }

		const channelId = this.GetProperty(quoteChannelKey, '', message.guild as Guild);

		if (message.channelId != channelId)
		{ return; }

		const quote = await this.HandleQuoteMessageInternal(message);

		if (quote == undefined)
		{ return; }

		// delete previous bot message
		const messages = await message.channel.messages.fetch();
		const old = messages.find(
			msg => msg.deletable &&
			msg.author.id == client.user?.id &&
			msg.embeds?.at(0)?.hexColor == confirmationEmbedColor);
		if (old) old.delete();

		// create and send embed
		const embed = new MessageEmbed({
			footer: { text: `Sauvegardé par ${quote.submitted_by}. Quote #${quote?.id}`, iconURL: 'http://i.imgur.com/EeC5BAb.png' },
			url: message.url,
			title: quote.author,
			color: confirmationEmbedColor,
			description: quote.quote,
		});

		await message.channel.send({ embeds: [ embed ] });
	}

	private async HandleQuoteMessageInternal(message: Message<boolean>) : Promise<IQuote & { id?: number } | undefined>
	{
		const matches = message.content.match(quoteRegex);
		if (matches?.length != 3)
		{
			// Regex failed
			return undefined;
		}

		const Quote = await DatabaseModel('quotes', QuoteSchema, message.guild);

		// new quote entry
		const quote = new Quote({
			quote: matches[1],
			author: matches[2],
			submitted_by: message.author.username,
			submitted_by_id: message.author.id,
			timestamp: message.createdTimestamp,
			safe: true,
		});
		await quote.save();

		const quotes = (await Quote.find({}).sort({ timestamp: 'asc' }));
		const id = quotes.findIndex(q => quote._id.toString() == q._id.toString());

		Log(`Quote #${id}/${quotes.length} saved`);

		const ret: IQuote & { id?: number } = quote;
		ret.id = id;
		return ret;
	}

	public Init(client: Client<boolean>): void
	{
		client.on('messageUpdate', (_, message) =>
		{
			CatchAndLog(async () =>
			{
				await this.HandleQuoteMessage(message as Message<boolean>, client);
			}, message.channel);
		});

		client.on('messageCreate', (message: Message<boolean>) =>
		{
			CatchAndLog(async () =>
			{
				await this.HandleQuoteMessage(message, client);
			}, message.channel);
		});

		client.on('interactionCreate', interaction =>
		{
			CatchAndLog(async () =>
			{
				if ((interaction.isButton() || interaction.isSelectMenu()) && this.CheckCustomId(interaction.customId))
				{
					await interaction.deferUpdate();
					await this.HandleInteraction(interaction);
				}
			}, interaction.channel);
		});
	}
}

(new QuotesPlugin()).Register();
