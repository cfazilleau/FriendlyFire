import discord
from discord.ext import commands
from src.mongo import Mongo

class FriendlyFire(commands.Bot):
    intents = discord.Intents.default()

    def __init__(self, mongo_uri: str = None):
        super().__init__()
        self.mongo = Mongo(mongo_uri)

    async def on_ready(self):
        print('Logged in as')
        print(self.user.name)
        print(self.user.id)
