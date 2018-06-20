const AUTHDETAILS_PATH = './config/auth.json';
const PERMISSIONSDETAILS_PATH = './config/permissions.json';

const HELPCOMMAND_TEXT = 'help';

var pluginManager = require('./plugins.js');


// ALIASES


// COMMANDS

// EVENTS


// EXPORTS

exports.addCommand = function (commandName, commandObject) {
	try {
		commands[commandName] = commandObject;
	} catch (err) {
		console.log(err);
	}
}

exports.addEvent = function (eventName, eventObject) {
	try {
		if (!events.hasOwnProperty(eventName)) events[eventName] = {};
		events[eventName][eventObject.pluginName] = eventObject.process;
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

function processCommand(message) {
	if (!message.content.startsWith(configuration.commandPrefix) ||
		message.author.id == bot.user.id)
		return;

	if (message.channel.type != 'text')
		return;

	console.log('treating ' + message.content + ' from ' + message.author.username + ' as command');

	var commandName = message.content.split(' ')[0].substring(configuration.commandPrefix.length);
	var commandArgs = message.content.substring(commandName.length + configuration.commandPrefix.length + 1); //add one to remove the space at the end

	// is the command an alias ?
	alias = aliases[commandName];

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
				info += '**' + configuration.commandPrefix + cmd + '**';
				var usage = commands[cmd].usage;
				if (usage) {
					info += ' ' + usage;
				}
				var description = commands[cmd].description;
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
					if (!permissionsDetails.hasPermission(message.author, cmd))
						continue;
					var info = '**' + configuration.commandPrefix + cmd + '**';
					var usage = commands[cmd].usage;
					if (usage) {
						info += ' ' + usage;
					}
					var description = commands[cmd].description;
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
		if (permissionsDetails.hasPermission(message.author, commandName)) {
			try {
				command.process(bot, message, commandArgs);
			} catch (e) {
				var ret = 'command ' + commandName + ' failed :(';
				if (configuration.debug) {
					ret += '\n' + e.stack;
				}
				message.channel.send(ret);
			}
		} else {
			message.channel.send('You are not allowed to run ' + commandName + '!')
				.then((message => message.delete(5000)));
		}
	} else {
		message.channel.send(commandName + ' not recognized as a command!')
			.then((message => message.delete(5000)))
	}
}

function processEvent(name, arg1, arg2, arg3, arg4, arg5) {
	// process event
	if (events.hasOwnProperty(name)) {
		for (var event in events[name]) {
			console.log('processing event ' + event + '.' + name);
			events[name][event].process(arg1, arg2, arg3, arg4, arg5);
		}
	}
}