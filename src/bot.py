import traceback

import discord
from discord.ext import commands
from src.mongo import Mongo

class FriendlyFire(commands.Bot):
    intents = discord.Intents.default()

    def __init__(self, mongo_uri: str = None):
        super().__init__()
        self.mongo = Mongo(mongo_uri)
        self._owner: discord.User = None

    async def on_ready(self):
        print(f'Logged in as {self.user.name} ({self.user.id})')
        app_info = await self.application_info()
        self._owner = app_info.owner

    async def _dm_owner(self, content: str):
        if self._owner is None:
            return
        try:
            await self._owner.send(content[:2000])
        except discord.HTTPException:
            pass

    async def on_application_command_error(self, ctx: discord.ApplicationContext, error: discord.DiscordException):
        tb = ''.join(traceback.format_exception(type(error), error, error.__traceback__))
        print(f'[Bot] Error in /{ctx.command}: {tb}')
        await self._dm_owner(f'**Error in `/{ctx.command}`**\n```\n{tb}\n```')

    async def on_error(self, event_method: str, *args, **kwargs):
        tb = traceback.format_exc()
        print(f'[Bot] Error in event {event_method}: {tb}')
        await self._dm_owner(f'**Error in event `{event_method}`**\n```\n{tb}\n```')
