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

from cogs.quotes.quotes_paginate_view import QuotesPaginateView
from cogs.quotes.quote_image import generate_quote_image
from src import FriendlyFire, BaseCog

QUOTE_REGEX = re.compile(r'\"(.+?)\"\s*-*\s*(.*)', re.MULTILINE | re.DOTALL)
CONFIRMATION_COLOR = 0x2ea42a


async def _resolve_discord_mentions(text: str, guild: discord.Guild) -> str:
    # Replace raw Discord mention tags with human-readable names.
    def replace_role(match):
        role = guild.get_role(int(match.group(1)))
        return f'@{role.name}' if role else match.group(0)

    def replace_channel(match):
        channel = guild.get_channel(int(match.group(1)))
        return f'#{channel.name}' if channel else match.group(0)

    text = re.sub(r'<@&(\d+)>', replace_role, text)
    text = re.sub(r'<#(\d+)>', replace_channel, text)

    user_ids = {int(m.group(1)) for m in re.finditer(r'<@!?(\d+)>', text)}
    members: dict[int, str] = {}
    for uid in user_ids:
        member = guild.get_member(uid)
        if member is None:
            try:
                member = await guild.fetch_member(uid)
            except (discord.NotFound, discord.HTTPException):
                pass
        if member:
            members[uid] = member.name

    return re.sub(r'<@!?(\d+)>', lambda m: members.get(int(m.group(1)), m.group(0)), text)

class QuoteView(discord.ui.View):
    def __init__(self, quotes_cog, guild_id: int, current_idx: int, total: int, requester_id: int, quote: dict, notify: str = None):
        super().__init__(timeout=86400)
        self.quotes_cog = quotes_cog
        self.guild_id = guild_id
        self.current_idx = current_idx
        self.total = total
        self.requester_id = requester_id
        self.current_quote = quote
        self.notify = notify  # persisted across rerolls
        self.message: discord.Message = None
        self._update_vote_buttons()

    def _update_vote_buttons(self):
        up = len(self.current_quote.get('upvoted_by', []))
        down = len(self.current_quote.get('downvoted_by', []))
        for child in self.children:
            if not isinstance(child, discord.ui.Button):
                continue
            if child.custom_id == 'upvote':
                child.label = str(up)
            elif child.custom_id == 'downvote':
                child.label = str(down)

    def _remove_reroll(self):
        for child in list(self.children):
            if isinstance(child, discord.ui.Button) and child.custom_id == 'reroll':
                self.remove_item(child)
                break

    async def on_timeout(self):
        if self.message:
            try:
                embed = self.quotes_cog._quote_embed(self.current_quote, self.current_idx + 1, self.total, show_votes=True)
                await self.message.edit(embed=embed, view=None)
            except discord.NotFound:
                pass

    @discord.ui.button(label='Reroll', style=discord.ButtonStyle.secondary, emoji='🎲', custom_id='reroll')
    async def reroll(self, button: discord.ui.Button, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message('Only the user who requested this quote can reroll it.', ephemeral=True)
            return
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(self.guild_id, 'quotes')
        all_quotes = await collection.find({}).sort('timestamp', 1).to_list()

        safe_quotes = [(i, q) for i, q in enumerate(all_quotes) if q.get('safe', False) and i != self.current_idx]
        if not safe_quotes:
            await interaction.response.send_message('No other safe quotes available.', ephemeral=True)
            return

        self.current_idx, self.current_quote = random.choice(safe_quotes)
        self.total = len(all_quotes)

        resolved_quote = await _resolve_discord_mentions(self.current_quote['quote'], interaction.guild)
        resolved_author = await _resolve_discord_mentions(self.current_quote.get('author', ''), interaction.guild)

        try:
            image_bytes = await generate_quote_image(resolved_quote, resolved_author, self.quotes_cog.config.get('fontPath'))
        except (aiohttp.ClientError, asyncio.TimeoutError):
            await interaction.response.send_message('Failed to fetch background image. Please try again.', ephemeral=True)
            return
        file = discord.File(io.BytesIO(image_bytes), filename='quote.jpg')
        embed = self.quotes_cog._quote_embed(self.current_quote, self.current_idx + 1, self.total)
        self._update_vote_buttons()

        await interaction.response.edit_message(content=self.notify, attachments=[], file=file, embed=embed, view=self)

    @discord.ui.button(emoji='👍', style=discord.ButtonStyle.secondary, custom_id='upvote')
    async def upvote(self, button: discord.ui.Button, interaction: discord.Interaction):
        await self._vote(interaction, 'upvoted_by', 'downvoted_by')

    @discord.ui.button(emoji='👎', style=discord.ButtonStyle.secondary, custom_id='downvote')
    async def downvote(self, button: discord.ui.Button, interaction: discord.Interaction):
        await self._vote(interaction, 'downvoted_by', 'upvoted_by')

    async def _vote(self, interaction: discord.Interaction, field: str, opposite_field: str):
        user_id = str(interaction.user.id)
        if user_id in self.current_quote.get(field, []):
            await interaction.response.send_message('You already voted on this quote.', ephemeral=True)
            return

        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(self.guild_id, 'quotes')
        update: dict = {'$push': {field: user_id}}
        if user_id in self.current_quote.get(opposite_field, []):
            update['$pull'] = {opposite_field: user_id}
            self.current_quote[opposite_field].remove(user_id)

        await collection.update_one({'_id': self.current_quote['_id']}, update)
        self.current_quote.setdefault(field, []).append(user_id)
        self._remove_reroll()
        self._update_vote_buttons()

        await interaction.response.edit_message(view=self)


class QuoteEntry(TypedDict):
    author: str
    submitted_by: str
    submitted_by_id: str
    quote: str
    timestamp: int
    safe: bool
    checked: bool
    upvoted_by: list[str]
    downvoted_by: list[str]

class Quotes(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'quotes', {
            'captureChannelId': None,
            'replyChannelId': None,
            'fontPath': 'assets/fonts/PlayfairDisplay-Italic.ttf',
        })

    quotesGroup = discord.SlashCommandGroup(name="quotes", description="manage quotes config", default_member_permissions=discord.Permissions(administrator=True), contexts=[discord.InteractionContextType.guild])

    @quotesGroup.command(name="set-capture-channel", description="Set the channel to listen for new quotes")
    @discord.option(name="channel", required=True, input_type=discord.SlashCommandOptionType.channel)
    async def set_capture_channel(self, ctx: discord.ApplicationContext, channel: discord.TextChannel):
        await ctx.defer(ephemeral=True)
        self.config.set('captureChannelId', str(channel.id), ctx.guild_id)
        await ctx.respond(f"Capture channel set to {channel.mention}")

    @quotesGroup.command(name="set-reply-channel", description="Set the channel where /quote sends its output")
    @discord.option(name="channel", required=True, input_type=discord.SlashCommandOptionType.channel)
    async def set_reply_channel(self, ctx: discord.ApplicationContext, channel: discord.TextChannel):
        await ctx.defer(ephemeral=True)
        self.config.set('replyChannelId', str(channel.id), ctx.guild_id)
        await ctx.respond(f"Reply channel set to {channel.mention}")

    @discord.slash_command(name="quote", description="Send a quote from the database.", contexts=[discord.InteractionContextType.guild])
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

        resolved_quote = await _resolve_discord_mentions(quote['quote'], ctx.guild)
        resolved_author = await _resolve_discord_mentions(quote.get('author', ''), ctx.guild)

        try:
            image_bytes = await generate_quote_image(resolved_quote, resolved_author, self.config.get('fontPath'))
        except (aiohttp.ClientError, asyncio.TimeoutError):
            await ctx.respond('Failed to fetch background image. Please try again.', ephemeral=True)
            return
        file = discord.File(io.BytesIO(image_bytes), filename='quote.jpg')
        notify = ctx.author.mention if use_reply_channel else None
        view = QuoteView(self, ctx.guild_id, idx, total, ctx.author.id, quote, notify)
        embed = self._quote_embed(quote, idx + 1, total)

        if use_reply_channel:
            view.message = await reply_channel.send(content=notify, file=file, embed=embed, view=view)
            await ctx.respond(f"Quote sent to {reply_channel.mention}.", ephemeral=True)
        else:
            await ctx.respond(file=file, embed=embed, view=view)
            view.message = await ctx.interaction.original_response()

    @quotesGroup.command(name="paginate", description="Open the quote paginator/moderation view.")
    @discord.option(name="id", parameter_name="quote_id", description="Id of the quote to start at", required=False, input_type=int)
    async def paginate_quotes(self, ctx: discord.ApplicationContext, quote_id: int = None):
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

        view = QuotesPaginateView(self, quotes, idx)
        await ctx.respond(embed=view.get_embed(), view=view)
        view.message = await ctx.interaction.original_response()

    @discord.slash_command(name="crawl-missing-quotes", description="Crawl the quote channel to backfill missing quotes.", default_member_permissions=discord.Permissions(administrator=True), contexts=[discord.InteractionContextType.guild])
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

        display_author = await _resolve_discord_mentions(entry['author'], message.guild)
        display_quote = await _resolve_discord_mentions(entry['quote'], message.guild)
        embed = discord.Embed(
            color=CONFIRMATION_COLOR,
            title=display_author,
            description=display_quote,
            url=message.jump_url,
        )
        embed.set_footer(text=f'Saved by {entry["submitted_by"]}. Quote #{idx + 1}/{len(all_quotes)}')
        await message.channel.send(embed=embed)

    def _quote_embed(self, quote: dict, idx: int, total: int, show_votes: bool = False) -> discord.Embed:
        submitter = quote.get('submitted_by', 'Unknown')
        embed = discord.Embed(
            title=f"Quote #{idx}/{total}",
            color=discord.Color.dark_theme(),
            timestamp=datetime.fromtimestamp(quote['timestamp'] / 1000),
        )
        embed.set_image(url='attachment://quote.jpg')
        if show_votes:
            up = len(quote.get('upvoted_by', []))
            down = len(quote.get('downvoted_by', []))
            embed.set_footer(text=f"submitted by {submitter}  •  👍 {up}  👎 {down}")
        else:
            embed.set_footer(text=f"submitted by {submitter}")
        return embed

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        await self._try_capture_quote(message)

    @commands.Cog.listener()
    async def on_message_edit(self, _before: discord.Message, after: discord.Message):
        await self._try_capture_quote(after)

def setup(bot):
    bot.add_cog(Quotes(bot))
