const fs = require('fs');

const configPath = './config/config.json';

exports.Init = function () {
	console.log("init configMgr");
	var config = {};
	try {
		config = require(configPath);
	} catch (e) {
		console.error('can\'t find a valid config file, generating a new one as ' + configPath);
		config.debug = false;
		config.commandPrefix = '!';
		config.client_id = 'YOUR_CLIENT_ID_GOES_HERE';
		config.bot_token = 'YOUR_BOT_TOKEN_GOES_HERE';
		fs.writeFile(configPath, JSON.stringify(config, null, 4));
		throw error;
	}
	exports.debug = config.debug
	exports.commandPrefix = config.commandPrefix
	exports.client_id = config.client_id
	exports.bot_token = config.bot_token
}