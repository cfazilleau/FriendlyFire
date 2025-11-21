import discord
from discord.ext import commands

class FriendlyFire(commands.Bot):
    intents = discord.Intents.default()

    async def on_ready(self):
        print('Logged in as')
        print(self.user.name)
        print(self.user.id)
