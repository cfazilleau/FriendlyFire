const configPath	= './config/config.json';

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
	return 1;
}

exports = config;