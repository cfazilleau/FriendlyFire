import { Client, CommandInteraction, MessageEmbed } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { Log, Plugin, PluginCommand } from '../plugin';
import { Drink, FetchById, FetchByIngredient, FetchByName } from './cocktail/cocktaildbWrapper';

class CocktailPlugin extends Plugin
{
	public name = 'Cocktail';

	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('cocktail')
					.setDescription('Search a cocktail in the database.')
					.setDefaultPermission(false)
					.addStringOption(option => option
						.setName('name')
						.setDescription('name of the cocktail')
						.setRequired(true)) as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					await interaction.deferReply({ ephemeral: false });
					const name = interaction.options.getString('name');

					if (name == undefined)
					{
						throw 'no name provided';
					}

					let drink: Drink;

					// try to fetch a cocktail by name
					let cocktails = await FetchByName(name);
					if (cocktails.length > 0)
					{
						// pick a random drink from the results
						drink = cocktails[Math.floor(Math.random() * cocktails.length)];
					}
					// Not found ? try by ingredient
					else
					{
						cocktails = await FetchByIngredient(name);

						// Still nothing...
						if (cocktails.length == 0)
						{
							await interaction.editReply({ content: `Hmm... je ne suis pas sur de connaitre un cocktail qui s'appelle '${name}'` });
							return;
						}

						// Cocktail found, fetch full details by id
						const dr = cocktails[Math.floor(Math.random() * cocktails.length)];
						const fetched = await FetchById(dr.id);

						if (fetched == undefined)
						{
							throw `error fetching cocktail with id ${dr.id}`;
						}

						drink = fetched;
					}

					// Send embed
					const embed = new MessageEmbed()
						.setTitle(drink.name)
						.setColor('#5c3626')
						.setURL(`https://www.thecocktaildb.com/drink/${drink.id}`);

					// Add ingredients
					if (drink.ingredients.length > 0)
					{
						let ingredients = '';
						drink.ingredients.forEach(ing => {
							ingredients += `${ing.measure} ${ing.ingredient}\n`;
						});

						embed.addFields([{
							name: '**Ingredients:**',
							value: ingredients,
						}]);
					}

					// Add thumbnail
					if (drink.thumbnailURL != undefined)
					{
						embed.setImage(drink.thumbnailURL);
					}

					// Add instructions
					const instruction = drink.instructionLocalized.find(val => val.locale == 'FR')?.instructions ?? drink.instruction;
					if (instruction != undefined)
					{
						embed.addFields([{
							name: '**Instructions:**',
							value: instruction,
						}]);
					}

					await interaction.editReply({ content: 'Voila pour toi!', embeds: [ embed ] });
				},
		},
	];

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public Init(client: Client<boolean>) : void
	{
		Log('test');
		// eslint-disable-next-line no-empty-function
	}
}

(new CocktailPlugin()).Register();