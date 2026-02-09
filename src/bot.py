import discord
from discord.ext import commands
from src.mongo import Mongo

class FriendlyFire(commands.Bot):
    intents = discord.Intents.default()

    def __init__(self, mongo_uri: str = None):
        super().__init__()
        self.mongo = Mongo(mongo_uri)

    async def on_ready(self):
        print(f'Logged in as {self.user.name} ({self.user.id})')
