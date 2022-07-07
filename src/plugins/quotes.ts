import { SlashCommandBuilder } from '@discordjs/builders';
import { CacheType, Client, CommandInteraction, Guild, Message, MessageEmbed } from 'discord.js';
import { model, Schema } from 'mongoose';
import moment from 'moment';
import QuotesPhotosGenerator from 'quotes-photos-generator';

import { Log, Plugin, PluginCommand } from '../plugin';

const quoteChannelKey = 'channelId';
const quoteRegex = /"(.+?)"(?:\s*-*(.*)$)/ms;

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
	author: { type: String, required: true },
	submitted_by: { type: String, required: true },
	submitted_by_id: { type: String },
	quote: { type: String, required: true },
	time: { type: String, required: true },
	timestamp: { type: String },
});

const Quote = model<IQuote>('quotes', QuoteSchema);

// Quotes Image
const quotesStyle = `
  html {
	height: 100%;
  }

  body, .image {
	width: 100%;
	height: 100%;
	margin: 0;
  }

  .image {
	background-image: url(https://source.unsplash.com/random/?inspirational);
	background-size: cover;
	background-position: center;
  }

  .colorShadow, .darkShadow {
	width: 100%;
	height: 100%;
	display: flex;
	justify-content: center;
	align-items: center;
  }

  .colorShadow {
	background-color: #ffffff20;
	position: absolute;
	top: 0;
  }

  .darkShadow {
	background-color: #00000090;
  }

  .content {
	padding: 12px;
	margin: 16px;
	border: 4px solid white;
	width: calc(100% - 68px);
	height: calc(100% - 68px);
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
  }

  .content span {
	color: white;
	font-family: 'caveat';
	font-size: 42px;
	font-weight: 300;
	text-align: center;
  }

  .content .author {
	color: #ffffff;
	font-family: 'caveat';
	font-weight: 700;
	font-size: 32px;
	position: absolute;
	bottom: 8px;
	width: 100%;
	text-align: center;
  }`;

const generator = new QuotesPhotosGenerator();
generator.style = quotesStyle;

// -----
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

					const count = await Quote.countDocuments() as number;
					const random = Math.floor(Math.random() * count);
					const quote = await Quote.findOne().skip(random) as IQuote;
					const imgSize = 512;

					Log('Generating new quote image...');
					const binary = await generator.getImageBuffer({
						quote: quote.quote.split('\n').join('<br>'),
						author: quote.author,
						specialWords: [],
						width: imgSize,
						height: imgSize,
					});
					Log('Done generating quote image.');

					interaction.editReply({ content: `Sent by ${quote.submitted_by} the ${quote.time}`, files: [{ attachment: binary, name: 'image.png' }] });
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
			const old = messages.find(msg => msg.deletable && msg.author.id == client.user?.id);
			if (old) old.delete();

			const embed = new MessageEmbed({
				footer: { text: `Saved by ${quote.submitted_by} -- ${quote.time}`, iconURL: 'http://i.imgur.com/EeC5BAb.png' },
				title: quote.author,
				color: '#2ea42a',
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