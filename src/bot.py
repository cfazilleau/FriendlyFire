import asyncio
import io
import traceback
import warnings

import discord
from discord.ext import commands
from src.mongo import Mongo

class FriendlyFire(commands.Bot):
    def __init__(self, mongo_uri: str = None):
        super().__init__(intents=discord.Intents.all())
        self.mongo = Mongo(mongo_uri)
        self._owner: discord.User = None
        self._pending_warnings: list[tuple[str, str]] = []
        self._setup_warning_hook()

    def _setup_warning_hook(self):
        original = warnings.showwarning
        def hook(message, category, filename, lineno, file=None, line=None):
            original(message, category, filename, lineno, file, line)
            header = f'**Warning: `{category.__name__}`**'
            text = f'{filename}:{lineno}: {category.__name__}: {message}'
            if self._owner is not None:
                asyncio.ensure_future(self._dm_owner(header, text))
            else:
                self._pending_warnings.append((header, text))
        warnings.showwarning = hook

    async def on_ready(self):
        print(f'Logged in as {self.user.name} ({self.user.id})')

        # TODO: Generate the permissions needed according to the cogs used
        perms = discord.Permissions.all()
        invite_link = discord.utils.oauth_url(self.user.id, permissions=perms)
        print(f'Invite link: {invite_link}')

        app_info = await self.application_info()
        self._owner = app_info.owner

        for header, text in self._pending_warnings:
            await self._dm_owner(header, text)
        self._pending_warnings.clear()

    async def _dm_owner(self, header: str, tb: str):
        if self._owner is None:
            return
        try:
            full = f'{header}\n```\n{tb}\n```'
            if len(full) <= 2000:
                await self._owner.send(full)
            else:
                file = discord.File(io.BytesIO(tb.encode()), filename='traceback.txt')
                await self._owner.send(f'{header}\n*(traceback too long — see attached file)*', file=file)
        except discord.HTTPException:
            pass

    async def on_application_command_error(self, ctx: discord.ApplicationContext, error: discord.DiscordException):
        tb = ''.join(traceback.format_exception(type(error), error, error.__traceback__))
        print(f'[Bot] Error in /{ctx.command}: {tb}')

        options = ' '.join(f'{o["name"]}: {o["value"]}' for o in (ctx.selected_options or []))
        full_cmd = f'/{ctx.command.qualified_name} {options}'.strip()
        guild = ctx.guild.name if ctx.guild else 'DM'
        channel = f'#{ctx.channel.name}' if hasattr(ctx.channel, 'name') else str(ctx.channel_id)
        user = f'{ctx.author} ({ctx.author.id})'
        header = f'**Error in `{full_cmd}`**\nGuild: `{guild}` | Channel: `{channel}` | User: `{user}`'
        await self._dm_owner(header, tb)

    async def on_error(self, event_method: str, *args, **kwargs):
        tb = traceback.format_exc()
        print(f'[Bot] Error in event {event_method}: {tb}')
        await self._dm_owner(f'**Error in event `{event_method}`**', tb)
