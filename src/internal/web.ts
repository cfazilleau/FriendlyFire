import express from 'express';

import { Log } from '../plugin';

const port = process.env.EXPRESS_PORT ?? 3000;

const app = express();

app.get('/', (_req, res) =>
{
	let out = '';
	out += `<link rel="preconnect" href="https://fonts.googleapis.com">
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
			<link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet">
			<style>html{font-family: 'Roboto', sans-serif;}</style>`;

	out += '<div>FriendlyFire</div>';
	out += `<div>Node.js ${process.version}</div>`;
	out += `<div>CPU Usage ${process.cpuUsage().system.toFixed(2)}</div>`;
	out += `<div>Memory Usage ${process.memoryUsage().heapUsed.toFixed(2)} / ${process.memoryUsage().heapTotal.toFixed(2)}</div>`;

	res.send(out);
});

app.listen(port);
Log(`Express running on port ${port}`);