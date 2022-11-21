import fetch from 'node-fetch';

interface DrinkRaw {
	idDrink: string;
	strDrink: string;
	strDrinkAlternate?: string;
	strTags?: string;
	strVideo?: string;
	strCategory?: string;
	strIBA?: string;
	strAlcoholic?: string;
	strGlass?: string;
	strInstructions?: string;
	strInstructionsES?: string;
	strInstructionsDE?: string;
	strInstructionsFR?: string;
	strInstructionsIT?: string;
	'strInstructionsZH-HANS'?: string;
	'strInstructionsZH-HANT'?: string;
	strDrinkThumb?: string;
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
	strMeasure1?: string;
	strMeasure2?: string;
	strMeasure3?: string;
	strMeasure4?: string;
	strMeasure5?: string;
	strMeasure6?: string;
	strMeasure7?: string;
	strMeasure8?: string;
	strMeasure9?: string;
	strMeasure10?: string;
	strMeasure11?: string;
	strMeasure12?: string;
	strMeasure13?: string;
	strMeasure14?: string;
	strMeasure15?: string;
	strImageSource?: string;
	strImageAttribution?: string;
	strCreativeCommonsConfirmed?: string;
	dateModified: string;
}

type Locale = 'ES'|'DE'|'FR'|'IT'|'ZH-HANS';
type Index = '1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'11'|'12'|'13'|'14'|'15';

export class Drink
{
	id: string;
	name: string;
	nameAlt?: string;
	tags?: string;
	videoURL?: string;
	category?: string;
	iba?: string;
	alcoholic?: string;
	glass?: string;
	instruction?: string;
	instructionLocalized: {
		locale: Locale,
		instructions: string
	}[];
	thumbnailURL?: string;
	ingredients: {
		ingredient: string,
		measure: string
	}[];
	imageSourceURL?: string;
	imageAttribution?: string;
	creativeCommonsConfirmed?: string;
	dateModified?: string;

	constructor(raw: DrinkRaw)
	{
		this.id							= raw.idDrink;
		this.name						= raw.strDrink;
		this.nameAlt					= raw.strDrinkAlternate;
		this.tags						= raw.strTags;
		this.videoURL					= raw.strVideo;
		this.category					= raw.strCategory;
		this.iba						= raw.strIBA;
		this.alcoholic					= raw.strAlcoholic;
		this.glass						= raw.strGlass;
		this.instruction				= raw.strInstructions;
		this.thumbnailURL				= raw.strDrinkThumb;
		this.imageSourceURL				= raw.strImageSource;
		this.imageAttribution			= raw.strImageAttribution;
		this.creativeCommonsConfirmed	= raw.strCreativeCommonsConfirmed;
		this.dateModified				= raw.dateModified;
		this.instructionLocalized		= [];
		this.ingredients				= [];

		// Localized instructions
		const locale: Locale[] = ['ES', 'DE', 'FR', 'IT', 'ZH-HANS'];
		locale.forEach(loc =>
		{
			const instr = raw[`strInstructions${loc}`];
			if (instr != undefined)
			{
				this.instructionLocalized.push({
					locale: loc,
					instructions: instr.trim(),
				});
			}
		});

		// Ingredients
		const index: Index[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
		index.forEach(i =>
		{
			const ingr = raw[`strIngredient${i}`];
			if (ingr != undefined)
			{
				this.ingredients.push({
					ingredient: ingr.trim(),
					measure: raw[`strMeasure${i}`]?.trim() ?? '',
				});
			}
		});
	}
}

export async function FetchByName(query: string): Promise<Drink[]>
{
	// try to fetch a cocktail by name
	const response = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`,
		{
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
		});

	if (!response.ok)
	{
		throw `Error fetching the cocktail db.\nstatus: ${response.status}`;
	}

	// convert the received packet in a js object
	const drinkspacket = (await response.json()) as { drinks: DrinkRaw[] | undefined };

	const drinks: Drink[] = [];
	drinkspacket?.drinks?.forEach(element =>
	{
		drinks.push(new Drink(element));
	});

	return drinks;
}

export async function FetchByIngredient(query: string): Promise<Drink[]>
{
	// try to fetch an ingredient by name
	const iresponse = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?i=${encodeURIComponent(query)}`,
		{
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
		});

	if (!iresponse.ok)
	{
		throw `Error fetching the cocktail db.\nstatus: ${iresponse.status}`;
	}

	// convert the received packet in a js object
	const ingredientspacket = (await iresponse.json()) as { ingredients: { strIngredient: string }[] | undefined };
	const ingredient = ingredientspacket?.ingredients?.at(0)?.strIngredient;

	if (ingredient == undefined)
	{
		return [];
	}

	// try to fetch a cocktail by ingredient name
	const response = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ingredient)}`,
		{
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
		});

	if (!response.ok)
	{
		throw `Error fetching the cocktail db.\nstatus: ${response.status}`;
	}

	const drinkspacket = (await response.json()) as { drinks: DrinkRaw[] | undefined };

	const drinks: Drink[] = [];
	drinkspacket?.drinks?.forEach(element =>
	{
		drinks.push(new Drink(element));
	});

	return drinks;
}

export async function FetchById(id: string): Promise<Drink|undefined>
{
	// try to fetch a cocktail by name
	const response = await fetch(`https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i=${id}`,
		{
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
		});

	if (!response.ok)
	{
		throw `Error fetching the cocktail db.\nstatus: ${response.status}`;
	}

	// convert the received packet in a js object
	const drinkspacket = (await response.json()) as { drinks: DrinkRaw[] | undefined };
	if (drinkspacket?.drinks != undefined && drinkspacket.drinks.length > 0)
	{
		return new Drink(drinkspacket.drinks[0]);
	}

	return undefined;
}