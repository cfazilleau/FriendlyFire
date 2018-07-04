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
		fs.writeFile(configPath, JSON.stringify(config, null, 4));
		throw error;
	}
	exports.debug = config.debug
	exports.commandPrefix = config.commandPrefix
}