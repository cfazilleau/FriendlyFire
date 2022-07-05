import mongoose, { Mongoose } from 'mongoose';
import { Log } from './utils';

export let client: Mongoose | undefined = undefined;

export async function ConnectToDatabase()
{
	try
	{
		client = await mongoose.connect(process.env.MONGODB_URI as string, { dbName: process.env.MONGODB_DBNAME });
		Log('Connected to mongodb database');
	}
	catch (err)
	{
		Log(`Failed connecting to mongodb database: ${(err as mongoose.CallbackError)?.message ?? err}`);
	}
}