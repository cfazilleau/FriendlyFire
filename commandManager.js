const aliasPath = './config/alias.json';

var aliases = {};
var commands = {};

exports.Init = function () {
	try {
		aliases = require(aliasPath);
	} catch (e) {
		console.error('can\'t find a valid alias file, generating a new one as ' + aliasPath);
	}
	fs.writeFile(aliasPath, JSON.stringify(aliases, null, 4));

	commands += {
		'alias': {
			usage: '<name> <actual command>',
			description: 'creates command aliases. Useful for making simple commands on the fly',
			process: function (bot, msg, suffix) {
				var args = suffix.split(' ');
				var name = args.shift();
				if (!name) {
					msg.channel.send(Config.commandPrefix + 'alias ' + this.usage + '\n' + this.description);
				} else if (commands[name] || name === HELPCOMMAND_TEXT) {
					msg.channel.send('overwriting commands with aliases is not allowed!');
				} else {
					var command = args.shift();
					aliases[name] = [command, args.join(' ')];
					//now save the new alias
					fs.writeFile(aliasPath, JSON.stringify(aliases, null, 4), null);
					msg.channel.send('created alias ' + name);
				}
			}
		},
		'aliases': {
			description: 'lists all recorded aliases',
			process: function (bot, msg, suffix) {
				var text = 'current aliases:\n';
				for (var a in aliases) {
					if (typeof a === 'string')
						text += a + ' ';
				}
				msg.channel.send(text);
			}
		}
	};
}

exports.Process = function(message) {
	console.log(message);
}