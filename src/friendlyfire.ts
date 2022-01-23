import * as discord from "discord.js";

import { permissionsDetails, PermsDetails } from "./core/permissions";
import { configuration } from "./core/configuration";

import { CommandObject, Commands } from "./core/commands";
import { EventObject, Events } from "./core/events";
import { init } from "./plugins";
import * as util from './util';

const HELPCOMMAND_TEXT = 'help';

export class FriendlyFire {
	private client: discord.Client

	private commands: Commands = {};
	private events: Events = {};

	//#region eventHandlers

	private handleReady(client: discord.Client) {
		client.guilds.fetch().then(guilds => {

			console.log('connected successfully. Serving in ' + guilds.size + ' guilds');
		})

		client?.user?.setPresence({
			status: "dnd"
		});
		init();
	}

	private handleDisconnect(...args: any[]) {
		console.log('bot disconnected.');
		process.exit(1);
	}

	private handleReconnecting(...args: any[]) {
		console.log('trying to reconnect...');
	}

	private handleResume(...args: any[]) {
		console.log('reconnected after ' + args[0] + ' tries.');
	}

	private handleWarn(message: string) {
		console.warn(message);
	}

	private handleError(error: Error) {
		console.error(error);
	}

	private handleMessageCreate(message: discord.Message) {
		this.processCommand(message);
		this.processEvent('message', message);
	}

	private handleMessageUpdate(oldMessage: discord.Message | discord.PartialMessage, newMessage: discord.Message | discord.PartialMessage) {
		if (newMessage instanceof discord.Message)
		{
			this.processCommand(newMessage);
			this.processEvent('message', newMessage);
		}
	}

	private handleMessageDelete(message: discord.Message | discord.PartialMessage) {
		this.processEvent('messageDelete', message);
	}

	private handleMessageReationAdd(reaction: discord.MessageReaction | discord.PartialMessageReaction, user: discord.User | discord.PartialUser) {
		this.processEvent('messageReactionAdd', reaction, user);
	}

	private handleMessageReactionRemove(reaction: discord.MessageReaction | discord.PartialMessageReaction, user: discord.User | discord.PartialUser) {
		this.processEvent('messageReactionRemove', reaction, user);
	}

	private handleGuildMemberAdd(member: discord.GuildMember) {
		this.processEvent('guildMemberAdd', member);
	}

	private handleGuildMemberRemove(member: discord.GuildMember | discord.PartialGuildMember) {
		this.processEvent('guildMemberRemove', member);
	}

	//#endregion

	//#region Processors

	processCommand(message: discord.Message) {
		if (!message.content.startsWith(configuration.prefix) ||
			this.client?.user == null || message.author.id == this.client.user.id)
			return;

		// if (message.channel.type != 'text')
		// 	return;

		console.log('treating ' + message.content + ' from ' + message.author.username + ' as command');

		var commandName = message.content.split(' ')[0].substring(configuration.prefix.length);
		var commandArgs = message.content.substring(commandName.length + configuration.prefix.length + 1); //add one to remove the space at the end

		// process command

		var command = this.commands[commandName];

		// TODO: take out of processCommand()
		if (commandName === HELPCOMMAND_TEXT) {
			//help is special since it iterates over the other commands
			if (commandArgs) {
				var cmds = commandArgs.split(' ').filter((cmd) => { return this.commands[cmd] });
				var info = '';
				for (var i = 0; i < cmds.length; i++) {
					var cmd = cmds[i];
					info += '**' + configuration.prefix + cmd + '**';
					var usage = this.commands[cmd].usage;
					if (usage) {
						info += ' ' + usage;
					}
					var description: any = this.commands[cmd].description;
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
				message.author.send('**Available Commands:**').then(() => {
					var batch = '';
					var sortedCommands = Object.keys(this.commands).sort();
					for (var i in sortedCommands) {
						var cmd = sortedCommands[i];

						if (message.guild == null)
							return;

						if (!permissionsDetails.hasPermission(message.author, message.guild, cmd))
							continue;

						var info = '**' + configuration.prefix + cmd + '**';
						var usage = this.commands[cmd].usage;
						if (usage) {
							info += ' ' + usage;
						}

						var description: any = '[*' + this.commands[cmd].module + '*] ' + this.commands[cmd].description;
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
					command.process(this.client, message, commandArgs);
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

	private processEvent(name: string, arg1: any = undefined, arg2: any = undefined, arg3: any = undefined, arg4: any = undefined, arg5: any = undefined) {
		// process event
		if (this.events.hasOwnProperty(name)) {
			for (var event in this.events[name]) {
				console.log('processing event ' + event + '.' + name);
				this.events[name][event].process(arg1, arg2, arg3);
			}
		}
	}

	//#endregion

	//#region Public Methods

	public addCommand(commandName: string, commandObject: CommandObject) {
		try {
			this.commands[commandName] = commandObject;
		} catch (err) {
			console.log(err);
		}
	}

	public addEvent(eventName: string, eventObject: EventObject) {
		try {
			if (!this.events.hasOwnProperty(eventName)) this.events[eventName] = {};
			this.events[eventName][eventObject.pluginName] = eventObject;
		} catch (err) {
			console.log(err);
		}
	}

	public commandCount() {
		return Object.keys(this.commands).length;
	}

	public eventsCount() {
		var len = 0;
		for (var event in this.events) {
			len += Object.keys(this.events[event]).length;
		}
		return len;
	}

	public login() {
		console.log('logging in with token');

		this.client.login(process.env.BOT_TOKEN)
			.then(() => {
				// TODO: generate permission request depending on the rights needed for all plugins
				console.log('invite link: ' + util.getInviteLink(process.env.BOT_ID, util.BotPermissions.generalAdministrator | util.BotPermissions.generalCreateInvite | util.BotPermissions.textReadMessages));
			})
			.catch(error => {
				console.log('failed to connect ' + error + process.env.BOT_ID);
			});
	}

	//#endregion

	constructor() {

		//TODO: get intents from all plugins
		const options: discord.ClientOptions = { intents: [discord.Intents.FLAGS.GUILDS, discord.Intents.FLAGS.GUILD_MESSAGES, discord.Intents.FLAGS.DIRECT_MESSAGES] }
		this.client = new discord.Client(options);

		this.client.on('ready', c => this.handleReady(c));
		this.client.on('disconnect', a => this.handleDisconnect(a));
		this.client.on('reconnecting', a => this.handleReconnecting(a));
		this.client.on('resume', a => this.handleResume(a));
		this.client.on('warn', m => this.handleWarn(m));
		this.client.on('error', e => this.handleError(e));
		this.client.on('messageCreate', m => this.handleMessageCreate(m));
		this.client.on('messageUpdate', (o, n) => this.handleMessageUpdate(o, n));
		this.client.on('messageDelete', m => this.handleMessageDelete(m));
		this.client.on('messageReationAdd', (r, u) => this.handleMessageReationAdd(r, u));
		this.client.on('messageReactionRemove', (r, u) => this.handleMessageReactionRemove(r, u));
		this.client.on('guildMemberAdd', m => this.handleGuildMemberAdd(m));
		this.client.on('guildMemberRemove', m => this.handleGuildMemberRemove(m));
	}
}