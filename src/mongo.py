import asyncio
from pymongo import AsyncMongoClient
from pymongo.asynchronous.collection import AsyncCollection


class Mongo:
    def __init__(self, mongo_uri):
        self.mongo_uri = mongo_uri
        self.client = AsyncMongoClient(self.mongo_uri, connect=True)

    async def get_collection(self, guild_id: int, collection_name: str):
        database = self.client.get_database(str(guild_id))
        collection = database[collection_name]

        if collection is None:
            collection = await database.create_collection(collection_name)

        return collection