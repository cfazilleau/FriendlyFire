from pymongo import AsyncMongoClient


class Mongo:
    def __init__(self, mongo_uri):
        self.mongo_uri = mongo_uri
        self.client = AsyncMongoClient(self.mongo_uri, connect=True)

    async def get_collection(self, guild_id: int, collection_name: str):
        database = self.client.get_database(str(guild_id))
        return database[collection_name]