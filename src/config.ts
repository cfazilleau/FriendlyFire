import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Log } from './utils';

export interface Config {
	global: ConfigClass;
	guilds: Guild[];
}

export interface Guild {
	id: string;
	config: ConfigClass;
}

export type ConfigClass = any;

`
{
	"global": {

	},
	"guilds": [
		{
			"id" : "458239249221812226",
			"config" : {
				"invites.greetings" : [
					"",
					"",
					""
				],
				"core.truc" : 05449646,
				"test.bidule" : false
			}
		}
	]
}
`

const configPath = '.ffconfig';
let config : Config;

function LoadConfig() : void
{
	let file = '{}';

	Log(`Loading ${configPath}...`);

	if (existsSync(configPath))
	{
		file = readFileSync(configPath, 'utf8');
	}
	else
	{
		Log(`${configPath} not found, creating it with default config.`);
	}

	config = JSON.parse(file) as Config;
	Log('Config loaded.');
}

function SaveConfig() : void
{
	writeFileSync(configPath, JSON.stringify(config), 'utf8');
}

LoadConfig();
SaveConfig();