import asyncio
import io
import random
import re
from datetime import datetime
from typing import TypedDict

import aiohttp
import discord
from discord.ext import commands
from pymongo.asynchronous.collection import AsyncCollection

from cogs.quotes.check_quotes_view import CheckQuotesView
from cogs.quotes.quote_image import generate_quote_image
from src import FriendlyFire, BaseCog

QUOTE_REGEX = re.compile(r'\"(.+?)\"\s*-*\s*(.*)', re.MULTILINE | re.DOTALL)
CONFIRMATION_COLOR = 0x2ea42a

class QuoteView(discord.ui.View):
    def __init__(self, quotes_cog, guild_id: int, current_idx: int, notify: str = None):
        super().__init__(timeout=60)
        self.quotes_cog = quotes_cog
        self.guild_id = guild_id
        self.current_idx = current_idx
        self.notify = notify  # persisted across rerolls

    @discord.ui.button(label='Reroll', style=discord.ButtonStyle.secondary, emoji='🎲')
    async def reroll(self, button: discord.ui.Button, interaction: discord.Interaction):
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(self.guild_id, 'quotes')
        all_quotes = await collection.find({}).sort('timestamp', 1).to_list()

        safe_quotes = [(i, q) for i, q in enumerate(all_quotes) if q.get('safe', False) and i != self.current_idx]
        if not safe_quotes:
            await interaction.response.send_message('No other safe quotes available.', ephemeral=True)
            return

        self.current_idx, quote = random.choice(safe_quotes)
        total = len(all_quotes)

        try:
            image_bytes = await generate_quote_image(quote['quote'], quote.get('author', ''), self.quotes_cog.config.get('fontPath'))
        except (aiohttp.ClientError, asyncio.TimeoutError):
            await interaction.response.send_message('Failed to fetch background image. Please try again.', ephemeral=True)
            return
        file = discord.File(io.BytesIO(image_bytes), filename='quote.jpg')
        content = self.quotes_cog._quote_content(quote, self.current_idx + 1, total, notify=self.notify)

        await interaction.response.edit_message(content=content, attachments=[], file=file, view=self)


class QuoteEntry(TypedDict):
    author: str
    submitted_by: str
    submitted_by_id: str
    quote: str
    timestamp: int
    safe: bool
    checked: bool

class Quotes(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'quotes', {
            'captureChannelId': None,
            'replyChannelId': None,
            'fontPath': 'assets/fonts/PlayfairDisplay-Italic.ttf',
        })

    quotesGroup = discord.SlashCommandGroup(name="quotes", description="manage quotes config")

    @quotesGroup.command(name="set-capture-channel", description="Set the channel to listen for new quotes", default_permission=False)
    @discord.option(name="channel", required=True, input_type=discord.SlashCommandOptionType.channel)
    async def set_capture_channel(self, ctx: discord.ApplicationContext, channel: discord.TextChannel):
        await ctx.defer(ephemeral=True)
        self.config.set('captureChannelId', str(channel.id), ctx.guild_id)
        await ctx.respond(f"Capture channel set to {channel.mention}")

    @quotesGroup.command(name="set-reply-channel", description="Set the channel where /quote sends its output", default_permission=False)
    @discord.option(name="channel", required=True, input_type=discord.SlashCommandOptionType.channel)
    async def set_reply_channel(self, ctx: discord.ApplicationContext, channel: discord.TextChannel):
        await ctx.defer(ephemeral=True)
        self.config.set('replyChannelId', str(channel.id), ctx.guild_id)
        await ctx.respond(f"Reply channel set to {channel.mention}")

    @discord.slash_command(name="quote", description="Send a quote from the database.")
    @discord.option(name="id", parameter_name="quote_id", description="Id of the quote to send", required=False, input_type=int)
    async def quote(self, ctx: discord.ApplicationContext, quote_id: int = None):
        reply_channel_id = self.config.get('replyChannelId', ctx.guild_id)
        reply_channel = await self.bot.fetch_channel(int(reply_channel_id)) if reply_channel_id else None
        use_reply_channel = reply_channel is not None and reply_channel.id != ctx.channel_id

        await ctx.defer(ephemeral=use_reply_channel)

        collection: AsyncCollection[QuoteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "quotes")
        all_quotes = await collection.find({}).sort('timestamp', 1).to_list()
        total = len(all_quotes)

        if total == 0:
            await ctx.respond("No quotes in the database.")
            return

        if quote_id is not None:
            idx = quote_id - 1
            if idx < 0 or idx >= total:
                await ctx.respond(f"Invalid id. Must be between 1 and {total}.")
                return
            quote = all_quotes[idx]
            if not quote.get('safe', False):
                await ctx.respond(f"Quote #{quote_id} is unsafe, I'd rather not share it...")
                return
        else:
            safe_quotes = [(i, q) for i, q in enumerate(all_quotes) if q.get('safe', False)]
            if not safe_quotes:
                await ctx.respond("No safe quotes in the database.")
                return
            idx, quote = random.choice(safe_quotes)

        try:
            image_bytes = await generate_quote_image(quote['quote'], quote.get('author', ''), self.config.get('fontPath'))
        except (aiohttp.ClientError, asyncio.TimeoutError):
            await ctx.respond('Failed to fetch background image. Please try again.', ephemeral=True)
            return
        file = discord.File(io.BytesIO(image_bytes), filename='quote.jpg')
        notify = ctx.author.mention if use_reply_channel else None
        view = QuoteView(self, ctx.guild_id, idx, notify)
        content = self._quote_content(quote, idx + 1, total, notify=notify)

        if use_reply_channel:
            await reply_channel.send(content=content, file=file, view=view)
            await ctx.respond(f"Quote sent to {reply_channel.mention}.", ephemeral=True)
        else:
            await ctx.respond(content=content, file=file, view=view)

    @discord.slash_command(name="check-quotes", description="Open the quote moderation view.", default_permission=False)
    @discord.option(name="id", parameter_name="quote_id", description="Id of the quote to start at", required=False, input_type=int)
    async def check_quotes(self, ctx: discord.ApplicationContext, quote_id: int = None):
        await ctx.defer(ephemeral=True)

        collection: AsyncCollection[QuoteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "quotes")
        await collection.update_many({"checked": {"$exists": False}}, {"$set": {"checked": False}})
        quotes = await collection.find({}).sort('timestamp', 1).to_list()

        if not quotes:
            await ctx.respond("No quotes in the database.")
            return

        if quote_id is not None:
            idx = max(0, min(quote_id - 1, len(quotes) - 1))
        else:
            idx = next((i for i, q in enumerate(quotes) if not q.get('checked', False)), 0)

        view = CheckQuotesView(self, quotes, idx)
        await ctx.respond(embed=view.get_embed(), view=view)

    @discord.slash_command(name="crawl-missing-quotes", description="Crawl the quote channel to backfill missing quotes.", default_permission=False)
    async def crawl_missing_quotes(self, ctx: discord.ApplicationContext):
        capture_channel_id = self.config.get('captureChannelId', ctx.guild_id)
        if not capture_channel_id or str(ctx.channel_id) != capture_channel_id:
            await ctx.respond("This command must be run from the configured quote capture channel.", ephemeral=True)
            return

        await ctx.defer(ephemeral=True)
        channel = ctx.channel
        collection: AsyncCollection[QuoteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "quotes")
        existing = await collection.find({}).to_list()

        batch_size = 50
        last_id = ctx.interaction.id
        checked = 0
        saved = 0

        await ctx.respond(f"Starting...\n\n> {checked} messages checked\n> {saved} new quotes saved")

        while True:
            batch = [msg async for msg in channel.history(limit=batch_size, before=discord.Object(id=last_id))]
            if not batch:
                break

            for msg in batch:
                checked += 1
                if msg.author.bot:
                    continue
                ts = int(msg.created_at.timestamp() * 1000)
                if any(abs(ts - q['timestamp']) < 1000 for q in existing):
                    continue
                match = QUOTE_REGEX.match(msg.content)
                if not match:
                    continue
                entry: QuoteEntry = {
                    'quote': match.group(1),
                    'author': match.group(2).strip(),
                    'submitted_by': msg.author.name,
                    'submitted_by_id': str(msg.author.id),
                    'timestamp': ts,
                    'safe': True,
                    'checked': False,
                }
                await collection.insert_one(entry)
                existing.append(entry)
                saved += 1
                self.log(f'Found quote: "{entry["quote"]}" --{entry["author"]}')

            await ctx.edit(content=f"Saving quotes...\n\n> {checked} messages checked\n> {saved} new quotes saved")
            last_id = batch[-1].id

            if len(batch) < batch_size:
                break

        self.log(f'Crawl done: {checked} checked, {saved} saved')
        await ctx.edit(content=f"Done.\n\n> {checked} messages checked\n> {saved} new quotes saved")

    async def _try_capture_quote(self, message: discord.Message):
        if message.guild is None or message.author.bot:
            return
        capture_channel_id = self.config.get('captureChannelId', message.guild.id)
        if not capture_channel_id or str(message.channel.id) != capture_channel_id:
            return

        match = QUOTE_REGEX.match(message.content)
        if not match:
            return

        collection: AsyncCollection[QuoteEntry] = await self.bot.mongo.get_collection(message.guild.id, "quotes")

        ts = int(message.created_at.timestamp() * 1000)

        entry: QuoteEntry = {
            'quote': match.group(1),
            'author': match.group(2).strip(),
            'submitted_by': message.author.name,
            'submitted_by_id': str(message.author.id),
            'timestamp': ts,
            'safe': True,
            'checked': False,
        }
        await collection.update_one({"timestamp": ts}, {"$set": entry}, upsert=True)

        all_quotes = await collection.find({}).sort('timestamp', 1).to_list()
        idx = next((i for i, q in enumerate(all_quotes) if q['timestamp'] == ts), -1)
        self.log(f'Quote #{idx + 1}/{len(all_quotes)} saved')

        # delete previous bot confirmation in channel
        async for msg in message.channel.history(limit=20):
            if msg.author.id == self.bot.user.id and msg.embeds and msg.embeds[0].color and msg.embeds[0].color.value == CONFIRMATION_COLOR:
                await msg.delete()
                break

        embed = discord.Embed(
            color=CONFIRMATION_COLOR,
            title=entry['author'],
            description=entry['quote'],
            url=message.jump_url,
        )
        embed.set_footer(text=f'Saved by {entry["submitted_by"]}. Quote #{idx + 1}/{len(all_quotes)}')
        await message.channel.send(embed=embed)

    def _quote_content(self, quote: dict, idx: int, total: int, notify: str = None) -> str:
        submitter = f"<@{quote['submitted_by_id']}>" if quote.get('submitted_by_id') else quote.get('submitted_by', 'Unknown')
        date = discord.utils.format_dt(datetime.fromtimestamp(quote['timestamp'] / 1000), style='D')
        info = f"Quote #{idx}/{total} — submitted by {submitter} on {date}"
        return f"{notify}\n{info}" if notify else info

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        await self._try_capture_quote(message)

    @commands.Cog.listener()
    async def on_message_edit(self, _before: discord.Message, after: discord.Message):
        await self._try_capture_quote(after)

def setup(bot):
    bot.add_cog(Quotes(bot))
