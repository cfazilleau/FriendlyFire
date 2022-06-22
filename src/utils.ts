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
	return matches.at(-1) ?? 'global';
}

function GetColor(fileName: string) : string
{
	// special case for files under the 'plugins' folder
	if (fileName.match(/^plugins[/\\]/))
	{
		return '36';
	}

	// handle filename cases
	switch (fileName)
	{
	case 'main.js': return '32';
	case 'config.js': return '33';
	case 'pluginloader.js': return '34';

	default: return '0';
	}
}

export function Log(text : any) : void
{
	const fileName = GetFileName(new Error());
	const label = GetLabel(fileName);
	const color = GetColor(fileName);

	console.log(`\x1b[${color}m[${label}]\x1b[0m ${text}`);
}