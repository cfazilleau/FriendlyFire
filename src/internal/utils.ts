import chalk from 'chalk';

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
	const matches : RegExpMatchArray = fileName.match(/(.+[\\/])*(.+).[jt]s/i) ?? {} as RegExpMatchArray;
	const label : string = matches.at(-1) ?? 'global';
	const colorDelegate = GetColorDelegate(fileName);

	return colorDelegate(`[${label}]`);
}

function sdbm(str: string): number
{
	return str.split('').reduce((hashCode, currentVal) =>
		(hashCode = currentVal.charCodeAt(0) + (hashCode << 6) + (hashCode << 16) - hashCode), 0);
}

function GetColorDelegate(fileName: string) : ColorDelegate
{
	// handle filename cases
	switch (fileName)
	{
	// special case for files under the 'plugins' folder
	case fileName.match(/^plugins[/\\]/)?.input:
		return chalk.cyan;

	case 'main.js':
		return chalk.green;

	case fileName.match(/^internal[/\\]config\.js/)?.input:
		return chalk.yellow;

	case 'plugin.js':
	case fileName.match(/^internal[/\\]pluginloader\.js/)?.input:
		return chalk.blue;

	case fileName.match(/^internal[/\\]mongodb\.js/)?.input:
		return chalk.greenBright;

	default:
		return chalk.hsv(Math.abs(sdbm(fileName)) % 360, 90, 75);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Log(text: any, tags: (string | undefined)[] = []) : void
{
	const fileName = GetFileName(new Error());
	let prefix = '';
	tags.filter(tag => tag != undefined)
		.forEach(tag =>
		{
			prefix += GetColorDelegate(tag as string)(`[${tag}]`);
		});
	prefix += GetLabel(fileName);

	console.log(`${prefix} ${text}`);
}