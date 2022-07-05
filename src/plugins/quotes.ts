import { SlashCommandBuilder } from '@discordjs/builders';
import { CacheType, Client, CommandInteraction } from 'discord.js';

import { model, Schema } from 'mongoose';
import QuotesPhotosGenerator from 'quotes-photos-generator';

import { Log, Plugin, PluginCommand } from '../plugin';

interface Quote
{
	author: string,
	submitted_by: string,
	quote: string,
	time: string,
}

const QuoteSchema = new Schema<Quote>({
	author: { type: String, required: true },
	submitted_by: { type: String, required: true },
	quote: { type: String, required: true },
	time: { type: String, required: true },
});

const quotesModel = model<Quote>('quotes', QuoteSchema);

const generator = new QuotesPhotosGenerator();

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

generator.style = quotesStyle;

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

					const count = await quotesModel.countDocuments() as number;
					const random = Math.floor(Math.random() * count);
					const quote = await quotesModel.findOne().skip(random) as Quote;
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

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>): void
	{
		// eslint-disable-next-line no-empty-function
	}

}

(new QuotesPlugin()).Register();