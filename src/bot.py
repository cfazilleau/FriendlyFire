import discord
from discord.ext import commands
from src.mongo import Mongo

class FriendlyFire(commands.Bot):
    def __init__(self, mongo_uri: str = None):
        intents = discord.Intents.default()
        intents.members = True          # required for on_member_join
        intents.message_content = True  # required for on_message quote capture
        super().__init__(intents=intents)
        self.mongo = Mongo(mongo_uri)

    async def on_ready(self):
        print(f'Logged in as {self.user.name} ({self.user.id})')
