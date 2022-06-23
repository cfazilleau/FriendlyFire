import color from '@heroku-cli/color';

type ColorDelegate = (input: string) => string;

function GetFileName(err : Error) : string
{
	// Split captured stack to cature correct line
	const stack = err.stack?.split('\n');
	if (stack == undefined || stack.length < 3)
	{
		throw undefined;
	}

	// Regex to extract relative path from the line
	const matches = stack[2].match(/(?:dist[\\/])(.+\.[jt]s)/s);
	if (matches == undefined || matches.length < 1)
	{
		throw undefined;
	}

	// Filename is the second match
	return matches[1];
}

function GetLabel(fileName: string) : string
{
	// Regex to get last part of path and trim file extension
	const matches : RegExpMatchArray = fileName.match(/(.+[\\/])*(.+).[jt]s/i) ?? [];
	const label : string = matches.at(-1) ?? 'global';
	const colorDelegate = GetColor(fileName);

	return colorDelegate(`[${label}]`);
}

function GetColor(fileName: string) : ColorDelegate
{
	// handle filename cases
	switch (fileName)
	{
	// special case for files under the 'plugins' folder
	case fileName.match(/^plugins[/\\]/)?.input:
		return color.cyan;

	case 'main.js':
		return color.green;

	case 'config.js':
		return color.yellow;

	case 'pluginloader.js':
		return color.blue;

	default:
		return (s) => s;
	}
}

export function Log(text : any) : void
{
	const fileName = GetFileName(new Error());
	const label = GetLabel(fileName);

	console.log(`${label} ${text}`);
}