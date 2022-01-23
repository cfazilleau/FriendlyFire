import { readFileSync, writeFileSync } from "fs";

export class Configuration {
	debug: boolean = false;
	overridePermissions: boolean = false;
	prefix: string = "!";
}

const CONFIGURATION_PATH = './config/config.json';

export var configuration: Configuration = new Configuration();
try {
	configuration = JSON.parse(readFileSync(CONFIGURATION_PATH, "utf8"));
} catch (e) {
	console.error('can\'t find a valid configuration file, generating a new one as ' + CONFIGURATION_PATH);
}
writeFileSync(CONFIGURATION_PATH, JSON.stringify(configuration, null, 4));
