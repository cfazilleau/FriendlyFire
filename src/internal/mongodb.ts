import { Guild } from 'discord.js';
import mongoose, { Mongoose, Schema } from 'mongoose';
import { Log } from './utils';

export let client: Mongoose | undefined = undefined;

export async function ConnectToDatabase()
{
	try
	{
		client = await mongoose.connect(process.env.MONGODB_URI as string);
		Log('Connected to mongodb database');
	}
	catch (err)
	{
		Log(`Failed connecting to mongodb database: ${(err as mongoose.CallbackError)?.message ?? err}`);
	}
}

export async function DatabaseModel<Type>(model: string, schema: Schema<Type>, guild?: Guild | undefined | null)
{
	// TODO: await for connection to be complete
	// await mongoose.connection.readyState == mongoose.ConnectionStates.connected;
	const db = mongoose.connection.useDb(guild?.id ?? 'global');
	return db.model<Type>(model, schema);
}