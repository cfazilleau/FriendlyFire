const discord		= require('discord.js');

const configMgr		= require('./configManager.js');
const permMgr		= require('./permissionsManager.js');
const commandMgr	= require('./commandManager.js');
const eventMgr		= require('./eventManager.js');
// const pluginMgr = require('./pluginManager.js');

const bot = new discord.Client();

exports.Start = function () {
	console.log("start bot");
	// commandMgr.Load();
	// eventMgr.Load();

	bot.on('ready', () => {
		console.log('connected successfully. Serving in ' + bot.guilds.array().length + ' servers');
		// pluginMgr.Init();
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

	bot.on('warn', (warning) => {
		console.warn(warning);
	});

	bot.on('error', (error) => {
		console.error(error);
	});

	bot.on('message', (message) => {
		commandMgr.process(message);
		eventMgr.processMessage(message);
	});

	bot.on('messageUpdate', (oldMessage, newMessage) => {
		commandMgr.process(newMessage);
		eventMgr.processMessage(newMessage);
	});

	bot.on('guildMemberAdd', (member) => {
		eventMgr.processGuildMemberAdd(member);
	});

	bot.on('guildMemberRemove', (member) => {
		eventMgr.processGuildMemberRemove(member);
	});

	bot.on('messageDelete', (message) => {
		eventMgr.processMessageDelete(member);
	});

	console.log('invite link: https://discordapp.com/oauth2/authorize?&client_id=' + configMgr.client_id + '&scope=bot&permissions=470019135');
	bot.login(configMgr.bot_token)
		.then(
			console.log("login success")
		)
		.catch((error) => {
			console.error('failed to login ' + configMgr.bot_token);
		});

	permMgr.Load(bot);
}