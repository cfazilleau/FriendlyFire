import * as discord from "discord.js"
import { configuration } from "./configuration";

export class CommandObject {
	module: string = "";
	usage: string = "";
	description: string = "";
	process: (bot: discord.Client, msg: discord.Message, suffix: string) => void = () => {};
}

export class Commands {
	[name: string]: CommandObject;
}
