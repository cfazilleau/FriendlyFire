const PLUGINDIR_PATH = './plugins/'
const ENTRYPOINT_PATH = './entry.js'

var fs = require('fs');
var path = require('path');

function getDirectories(srcpath) {
	return fs.readdirSync(srcpath).filter(function (file) {
		return fs.statSync(path.join(srcpath, file)).isDirectory();
	});
}

var plugin_folders = getDirectories(PLUGINDIR_PATH);

exports.pluginPath = PLUGINDIR_PATH;

exports.init = function () {
	preload_plugins();
};

function createNpmDependenciesArray(packageFilePath) {
	var p = require(packageFilePath);
	if (!p.dependencies) return [];
	var deps = [];
	for (var mod in p.dependencies) {
		deps.push(mod + '@' + p.dependencies[mod]);
	}

	return deps;
}

function preload_plugins() {
	var deps = [];
	var npm = require('npm');
	for (var i = 0; i < plugin_folders.length; i++) {
		try {
			require(PLUGINDIR_PATH + plugin_folders[i]);
		} catch (e) {
			deps = deps.concat(createNpmDependenciesArray(PLUGINDIR_PATH + plugin_folders[i] + '/package.json'));
		}
	}
	if (deps.length > 0) {
		npm.load({
			loaded: false
		}, function (err) {
			npm.commands.install(deps, function (er, data) {
				if (er) {
					console.log(er);
				}
				console.log('Plugin preload complete');
				load_plugins()
			});

			if (err) {
				console.log('preload_plugins: ' + err);
			}
		});
	} else {
		load_plugins()
	}
}

function load_plugins() {
	var dbot = require(ENTRYPOINT_PATH);
	var commandCount = 0;
	var eventsCount = 0;
	for (var i = 0; i < plugin_folders.length; i++) {
		var plugin;
		try {
			plugin = require(PLUGINDIR_PATH + plugin_folders[i])
		} catch (err) {
			console.log('Improper setup of the [' + plugin_folders[i] + '] plugin. : ' + err);
		}
		if (plugin) {
			if ('commands' in plugin) {
				for (var j = 0; j < plugin.commands.length; j++) {
					if (plugin.commands[j] in plugin) {
						dbot.addCommand(plugin.commands[j], plugin[plugin.commands[j]])
						commandCount++;
					}
				}
			}
			if ('events' in plugin) {
				for (var j = 0; j < plugin.events.length; j++) {
					if (plugin.events[j] in plugin) {
						var obj = {
							pluginName: plugin_folders[i],
							process: plugin[plugin.events[j]]
						};
						dbot.addEvent(plugin.events[j], obj )
						eventsCount++;
					}
				}
			}
		}
	}

	console.log('Loaded ' + dbot.commandCount() + ' chat commands')
	console.log('Loaded ' + dbot.eventsCount() + ' events')
}