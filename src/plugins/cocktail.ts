import { Client, CommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import { Log, Plugin, PluginCommand } from '../plugin';
import fetch from 'node-fetch';
import { request } from 'https';

interface Drink {
        idDrink: string;
        strDrink: string;
        strIngredient1?: string;
        strIngredient2?: string;
        strIngredient3?: string;
        strIngredient4?: string;
        strIngredient5?: string;
        strIngredient6?: string;
        strIngredient7?: string;
        strIngredient8?: string;
        strIngredient9?: string;
        strIngredient10?: string;
        strIngredient11?: string;
        strIngredient12?: string;
        strIngredient13?: string;
        strIngredient14?: string;
        strIngredient15?: string;
        strImageSource: string;
    }

class CocktailPlugin extends Plugin
{
	public name = 'Cocktail';

	public commands: PluginCommand[] = [
		{
			builder:
				new SlashCommandBuilder()
					.setName('cocktail')
					.setDescription('Search a cocktail in the database.') as SlashCommandBuilder,
			callback:
				async (interaction: CommandInteraction) =>
				{
					await interaction.deferReply({ ephemeral: true });

					const response = await fetch('https://www.thecocktaildb.com/api/json/v1/1/search.php?s=margarita');
					
					if (response == undefined)
					{
						throw 'no response';
					}
					
					Log(await response.json);
					const drinkspacket: { drinks: Drink[] } = JSON.parse(await response.json());
					
					if (drinkspacket.drinks == undefined)
					{
						throw 'no result';
					}
					
					await interaction.editReply({ content: JSON.stringify(drinkspacket.drinks[0]) });
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