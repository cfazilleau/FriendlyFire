const PERMISSIONSDETAILS_PATH = './config/permissions.json';
const CONFIGURATION_PATH = './config/config.json';
const ALIASES_PATH = './config/alias.json';

const HELPCOMMAND_TEXT = 'help';

import * as dotenv from "dotenv";
import * as discord from "discord.js";
import { BotPermissions, getInviteLink } from './bot';
import { readFileSync, writeFileSync } from "fs";

import * as pluginManager from "./plugins";

console.log(dotenv.config({ path: '.env' }));

process.on('unhandledRejejection', (reason) => {
	console.error(reason);
	process.exit(1);
});

// LOAD PERMISSIONS

class PermsDetails {
	roles : { [name: string]: { [name: string]: boolean } } = { 'everyone': { 'help': true } };
	users : { [name: string]: { [name: string]: boolean } } = {};

	public hasPermission(user: discord.User, guild: discord.Guild, permission: string) : boolean {
		var allowed : boolean = false;

		if (configuration.overridePermissions == true)
			return true;

		// for each role
		guild.roles.cache.forEach(role => {
			// if the user has this role
			if (role.members.find(u => u.id == user.id)) {
				// if the role is in the list
				if (this.roles.hasOwnProperty(role.name) &&
				// and if the role has the permission
				this.roles[role.name].hasOwnProperty(permission)) {
					// override 'allowed'
					allowed = this.roles[role.name][permission] === true;
				}
			}
		});

		// if the user is in the users list
		if (this.users.hasOwnProperty(user.id) &&
		// and this permission has an override
		this.users[user.id].hasOwnProperty(permission)) {
			// override 'allowed'
			allowed = this.users[user.id][permission] === true;
		}

		return allowed;
	};
}

var permissionsDetails: PermsDetails = new PermsDetails();
try {
	Object.assign(permissionsDetails, JSON.parse(readFileSync(PERMISSIONSDETAILS_PATH, "utf8")));
} catch (e) {
	console.error('can\'t find a valid permissions file file, generating a new one as ' + PERMISSIONSDETAILS_PATH);
	permissionsDetails.roles = {};
	permissionsDetails.users = {};
}
writeFileSync(PERMISSIONSDETAILS_PATH, JSON.stringify(permissionsDetails, null, 4));

// LOAD CONFIGURATION

export class Configuration {
	debug: boolean = false;
	overridePermissions: boolean = false;
	prefix: string = "!";
}

var configuration: Configuration = new Configuration();
try {
	configuration = JSON.parse(readFileSync(CONFIGURATION_PATH, "utf8"));
} catch (e) {
	console.error('can\'t find a valid configuration file, generating a new one as ' + CONFIGURATION_PATH);
}
writeFileSync(CONFIGURATION_PATH, JSON.stringify(configuration, null, 4));

// ALIASES

class Aliases {
	[name: string]: string[];
}

var aliases: Aliases = {};
try {
	aliases = JSON.parse(readFileSync(ALIASES_PATH, "utf8"));
} catch (e) {
	console.error('can\'t find a valid alias file, generating a new one as ' + ALIASES_PATH);
}
writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 4));

// COMMANDS

class CommandObject {
	"module": string;
	"usage": string;
	"description": string;
	"process": (bot: discord.Client, msg: discord.Message, suffix: string) => void;
}

class Commands {
	[name: string]: CommandObject;
}

var commands: Commands = {
	'alias': {
		module: "core",
		usage: '<name> <actual command>',
		description: 'creates command aliases. Useful for making simple commands on the fly',
		process: function (bot: discord.Client, msg: discord.Message, suffix: string) {
			var args = suffix.split(' ');
			var name = args.shift();
			if (!name) {
				msg.channel.send(configuration.prefix + 'alias ' + this.usage + '\n' + this.description);
			} else if (commands[name] || name === HELPCOMMAND_TEXT) {
				msg.channel.send('overwriting commands with aliases is not allowed!');
			} else {
				var command = args.shift();

				if (command === undefined)
					return;

				aliases[name] = [command, args.join(' ')];
				//now save the new alias
				writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 4));
				msg.channel.send('created alias ' + name);
			}
		}
	},
	'aliases': {
		module: "core",
		usage: '',
		description: 'lists all recorded aliases',
		process: function (bot: discord.Client, msg: discord.Message, suffix: string) {
			var text = 'current aliases:\n';
			for (var a in aliases) {
				if (typeof a === 'string')
					text += a + ' ';
			}
			msg.channel.send(text);
		}
	}
};

// EVENTS

class EventObject {
	"pluginName": string;
	"process": (bot: any, msg: any, suffix: any) => void;
}

class Events {
	[name: string]: { [pluginName: string]: EventObject };
}

var events: Events = {};

// MAIN

const options: discord.ClientOptions = { intents: [discord.Intents.FLAGS.GUILDS, discord.Intents.FLAGS.GUILD_MESSAGES, discord.Intents.FLAGS.DIRECT_MESSAGES] }
const bot: discord.Client = new discord.Client(options);

bot.on('ready', () => {
	bot.guilds.fetch().then(guilds => {

		console.log('connected successfully. Serving in ' + guilds.size + ' guilds');
	})

	bot?.user?.setPresence({
		status: "dnd"
	});
	pluginManager.init();
});

bot.on('disconnect', () => {
	console.log('bot disconnected.');
	process.exit(1);
});

bot.on('reconnecting', () => {
	console.log('trying to reconnect...');
});

bot.on('resume', (replayedCount) => {
	console.log('reconnected after ' + replayedCount + ' tries.');
});

/************/

bot.on('interaction', (interaction) => {
});

bot.on('message', (message) => {
	processCommand(message);
	processEvent('message', message);
});

bot.on('messageUpdate', (oldMessage, newMessage) => {
	if (newMessage instanceof discord.Message)
	{
		processCommand(newMessage);
		processEvent('message', newMessage);
	}
});

bot.on('messageReactionAdd', (messageReaction, user) => {
	processEvent('messageReactionAdd', messageReaction, user);
})

bot.on('messageReactionRemove', (messageReaction, user) => {
	processEvent('messageReactionRemove', messageReaction, user);
})

bot.on('guildMemberAdd', (member) => {
	processEvent('guildMemberAdd', member);
});

bot.on('guildMemberRemove', (member) => {
	processEvent('guildMemberRemove', member);
});

bot.on('messageDelete', (message) => {
	processEvent('messageDelete', message);
});

/************/

bot.on('warn', (warning) => {
	console.warn(warning);
});

bot.on('error', (error) => {
	console.error(error);
});

// EXPORTS

exports.addCommand = function (commandName: string, commandObject: CommandObject) {
	try {
		commands[commandName] = commandObject;
	} catch (err) {
		console.log(err);
	}
}

exports.addEvent = function (eventName: string, eventObject: EventObject) {
	try {
		if (!events.hasOwnProperty(eventName)) events[eventName] = {};
		events[eventName][eventObject.pluginName] = eventObject;
	} catch (err) {
		console.log(err);
	}
}

exports.commandCount = function () {
	return Object.keys(commands).length;
}

exports.eventsCount = function () {
	var len = 0;
	for (var event in events) {
		len += Object.keys(events[event]).length;
	}
	return len;
}

// FUNCTIONS

function processCommand(message: discord.Message) {
	if (!message.content.startsWith(configuration.prefix) ||
		bot?.user == null || message.author.id == bot.user.id)
		return;

	// if (message.channel.type != 'text')
	// 	return;

	console.log('treating ' + message.content + ' from ' + message.author.username + ' as command');

	var commandName = message.content.split(' ')[0].substring(configuration.prefix.length);
	var commandArgs = message.content.substring(commandName.length + configuration.prefix.length + 1); //add one to remove the space at the end

	// is the command an alias ?
	var alias = aliases[commandName];

	if (alias) {
		console.log(commandName + ' is an alias, constructed command is ' + alias.join(' ') + ' ' + commandArgs);
		commandName = alias[0];
		commandArgs = alias[1] + ' ' + commandArgs;
	}

	// process command

	var command = commands[commandName];

	// TODO: take out of processCommand()
	if (commandName === HELPCOMMAND_TEXT) {
		//help is special since it iterates over the other commands
		if (commandArgs) {
			var cmds = commandArgs.split(' ').filter(function (cmd) { return commands[cmd] });
			var info = '';
			for (var i = 0; i < cmds.length; i++) {
				var cmd = cmds[i];
				info += '**' + configuration.prefix + cmd + '**';
				var usage = commands[cmd].usage;
				if (usage) {
					info += ' ' + usage;
				}
				var description: any = commands[cmd].description;
				if (description instanceof Function) {
					description = description();
				}
				if (description) {
					info += '\n\t' + description;
				}
				info += '\n';
			}
			message.channel.send(info);
		} else {
			message.author.send('**Available Commands:**').then(function () {
				var batch = '';
				var sortedCommands = Object.keys(commands).sort();
				for (var i in sortedCommands) {
					var cmd = sortedCommands[i];

					if (message.guild == null)
						return;

					if (!permissionsDetails.hasPermission(message.author, message.guild, cmd))
						continue;

					var info = '**' + configuration.prefix + cmd + '**';
					var usage = commands[cmd].usage;
					if (usage) {
						info += ' ' + usage;
					}

					var description: any = '[*' + commands[cmd].module + '*] ' + commands[cmd].description;
					if (description instanceof Function) {
						description = description();
					}
					if (description) {
						info += '\n\t' + description;
					}
					var newBatch = batch + '\n' + info;
					if (newBatch.length > (1024 - 8)) { //limit message length
						message.author.send(batch);
						batch = info;
					} else {
						batch = newBatch
					}
				}
				if (batch.length > 0) {
					message.author.send(batch);
				} else {
					message.author.send('none');
				}
			});
		}
	}

	// TODO: cleanup command handler
	else if (command) {

		if (message.guild == null)
			return;

		if (permissionsDetails.hasPermission(message.author, message.guild, commandName)) {
			try {
				command.process(bot, message, commandArgs);
			} catch (e: any) {
				console.log(e);
				var ret = 'command ' + commandName + ' failed :(';
				if (configuration.debug) {
					ret += '\n' + e.stack;
				}
				message.channel.send(ret);
			}
		} else {
			message.channel.send('You are not allowed to run ' + commandName + '!');
		}
	} else {
		message.channel.send(commandName + ' not recognized as a command!');
	}
}

function processEvent(name: string, arg1: any = undefined, arg2: any = undefined, arg3: any = undefined, arg4: any = undefined, arg5: any = undefined) {
	// process event
	if (events.hasOwnProperty(name)) {
		for (var event in events[name]) {
			console.log('processing event ' + event + '.' + name);
			events[name][event].process(arg1, arg2, arg3);
		}
	}
}

// AUTH

console.log('logging in with token');

// Connect client to discord
bot.login(process.env.BOT_TOKEN)
	.then(() => {
		// TODO: generate permission request depending on the rights needed for all plugins
		console.log('invite link: ' + getInviteLink(process.env.BOT_ID, BotPermissions.generalAdministrator | BotPermissions.generalCreateInvite | BotPermissions.textReadMessages));
	})
	.catch(error => {
		console.log('failed to connect ' + error + process.env.BOT_ID);
	});