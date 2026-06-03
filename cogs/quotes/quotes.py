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

        # Dynamically translate Reroll button label
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                if child.custom_id == 'reroll':
                    child.label = self.quotes_cog.bot.t('quotes.btn_reroll', self.guild_id)

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
                embed = self.quotes_cog._quote_embed(self.current_quote, self.current_idx + 1, self.total, guild_id=self.guild_id, show_votes=True)
                await self.message.edit(embed=embed, view=None)
            except discord.NotFound:
                pass

    @discord.ui.button(label='Reroll', style=discord.ButtonStyle.secondary, emoji='🎲', custom_id='reroll')
    async def reroll(self, button: discord.ui.Button, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message(self.quotes_cog.bot.t('quotes.reroll_not_requester', self.guild_id), ephemeral=True)
            return
        self.quotes_cog.log(f"Quote reroll clicked by {interaction.user.name}", interaction.guild)
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(self.guild_id, 'quotes')
        all_quotes = await collection.find({}).sort('timestamp', 1).to_list()

        safe_quotes = [(i, q) for i, q in enumerate(all_quotes) if q.get('safe', False) and i != self.current_idx]
        if not safe_quotes:
            await interaction.response.send_message(self.quotes_cog.bot.t('quotes.no_other_safe_quotes', self.guild_id), ephemeral=True)
            return

        self.current_idx, self.current_quote = random.choice(safe_quotes)
        self.total = len(all_quotes)

        resolved_quote = await _resolve_discord_mentions(self.current_quote['quote'], interaction.guild)
        resolved_author = await _resolve_discord_mentions(self.current_quote.get('author', ''), interaction.guild)

        try:
            image_bytes = await generate_quote_image(resolved_quote, resolved_author, self.quotes_cog.config.get('fontPath'))
        except (aiohttp.ClientError, asyncio.TimeoutError):
            await interaction.response.send_message(self.quotes_cog.bot.t('quotes.image_error', self.guild_id), ephemeral=True)
            return
        file = discord.File(io.BytesIO(image_bytes), filename='quote.jpg')
        embed = self.quotes_cog._quote_embed(self.current_quote, self.current_idx + 1, self.total, guild_id=self.guild_id)
        self._update_vote_buttons()

        await interaction.response.edit_message(content=self.notify, attachments=[], file=file, embed=embed, view=self)

    @discord.ui.button(emoji='👍', style=discord.ButtonStyle.secondary, custom_id='upvote')
    async def upvote(self, button: discord.ui.Button, interaction: discord.Interaction):
        await self._vote(interaction, 'upvoted_by', 'downvoted_by')

    @discord.ui.button(emoji='👎', style=discord.ButtonStyle.secondary, custom_id='downvote')
    async def downvote(self, button: discord.ui.Button, interaction: discord.Interaction):
        await self._vote(interaction, 'downvoted_by', 'upvoted_by')

    async def _vote(self, interaction: discord.Interaction, field: str, opposite_field: str):
        self.quotes_cog.log(f"Quote vote ({field}) clicked by {interaction.user.name} for quote ID {self.current_quote['_id']}", interaction.guild)
        user_id = str(interaction.user.id)
        collection: AsyncCollection = await self.quotes_cog.bot.mongo.get_collection(self.guild_id, 'quotes')

        # Atomic check-and-update: only matches if user hasn't already voted
        result = await collection.update_one(
            {'_id': self.current_quote['_id'], field: {'$ne': user_id}},
            {
                '$addToSet': {field: user_id},
                '$pull': {opposite_field: user_id}
            }
        )

        if result.matched_count == 0:
            await interaction.response.send_message(self.quotes_cog.bot.t('quotes.already_voted', self.guild_id), ephemeral=True)
            return

        # Update in-memory state to reflect the change
        if user_id in self.current_quote.get(opposite_field, []):
            self.current_quote[opposite_field].remove(user_id)
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
        self.log(f"Quotes set-capture-channel command issued by {ctx.author.name}. Channel: #{channel.name}", ctx.guild)
        self.config.set('captureChannelId', str(channel.id), ctx.guild_id)
        await ctx.respond(self.bot.t('quotes.set_capture_success', ctx.guild_id, channel=channel.mention))

    @quotesGroup.command(name="set-reply-channel", description="Set the channel where /quote sends its output")
    @discord.option(name="channel", required=True, input_type=discord.SlashCommandOptionType.channel)
    async def set_reply_channel(self, ctx: discord.ApplicationContext, channel: discord.TextChannel):
        await ctx.defer(ephemeral=True)
        self.log(f"Quotes set-reply-channel command issued by {ctx.author.name}. Channel: #{channel.name}", ctx.guild)
        self.config.set('replyChannelId', str(channel.id), ctx.guild_id)
        await ctx.respond(self.bot.t('quotes.set_reply_success', ctx.guild_id, channel=channel.mention))

    @discord.slash_command(name="quote", description="Send a quote from the database.", contexts=[discord.InteractionContextType.guild])
    @discord.option(name="id", parameter_name="quote_id", description="Id of the quote to send", required=False, input_type=int)
    async def quote(self, ctx: discord.ApplicationContext, quote_id: int = None):
        self.log(f"Quote command issued by {ctx.author.name}. Parameter quote_id: {quote_id}", ctx.guild)
        reply_channel_id = self.config.get('replyChannelId', ctx.guild_id)
        if not reply_channel_id:
            await ctx.respond(self.bot.t('quotes.no_reply_channel', ctx.guild_id), ephemeral=True)
            return

        try:
            reply_channel = await self.bot.fetch_channel(int(reply_channel_id))
        except (discord.HTTPException, discord.Forbidden) as e:
            self.log(f"Failed to fetch configured reply channel: {e}", ctx.guild)
            await ctx.respond(self.bot.t('quotes.reply_channel_not_found', ctx.guild_id), ephemeral=True)
            return

        use_reply_channel = reply_channel.id != ctx.channel_id

        await ctx.defer(ephemeral=use_reply_channel)

        collection: AsyncCollection[QuoteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "quotes")
        all_quotes = await collection.find({}).sort('timestamp', 1).to_list()
        total = len(all_quotes)

        if total == 0:
            await ctx.respond(self.bot.t('quotes.no_quotes', ctx.guild_id))
            return

        if quote_id is not None:
            idx = quote_id - 1
            if idx < 0 or idx >= total:
                await ctx.respond(self.bot.t('quotes.invalid_id', ctx.guild_id, total=total))
                return
            quote = all_quotes[idx]
            if not quote.get('safe', False):
                await ctx.respond(self.bot.t('quotes.unsafe_quote', ctx.guild_id, quote_id=quote_id))
                return
        else:
            safe_quotes = [(i, q) for i, q in enumerate(all_quotes) if q.get('safe', False)]
            if not safe_quotes:
                await ctx.respond(self.bot.t('quotes.no_safe_quotes', ctx.guild_id))
                return
            idx, quote = random.choice(safe_quotes)

        resolved_quote = await _resolve_discord_mentions(quote['quote'], ctx.guild)
        resolved_author = await _resolve_discord_mentions(quote.get('author', ''), ctx.guild)

        try:
            image_bytes = await generate_quote_image(resolved_quote, resolved_author, self.config.get('fontPath'))
        except (aiohttp.ClientError, asyncio.TimeoutError):
            await ctx.respond(self.bot.t('quotes.image_error', ctx.guild_id), ephemeral=True)
            return
        file = discord.File(io.BytesIO(image_bytes), filename='quote.jpg')
        notify = ctx.author.mention if use_reply_channel else None
        view = QuoteView(self, ctx.guild_id, idx, total, ctx.author.id, quote, notify)
        embed = self._quote_embed(quote, idx + 1, total, guild_id=ctx.guild_id)

        self.log(f"Displaying quote #{idx + 1}/{total} (Safe: {quote.get('safe')}) to channel (reply channel: {use_reply_channel})", ctx.guild)
        if use_reply_channel:
            view.message = await reply_channel.send(content=notify, file=file, embed=embed, view=view)
            await ctx.respond(self.bot.t('quotes.quote_sent_to', ctx.guild_id, channel=reply_channel.mention), ephemeral=True)
        else:
            await ctx.respond(file=file, embed=embed, view=view)
            view.message = await ctx.interaction.original_response()

    @quotesGroup.command(name="paginate", description="Open the quote paginator/moderation view.")
    @discord.option(name="id", parameter_name="quote_id", description="Id of the quote to start at", required=False, input_type=int)
    async def paginate_quotes(self, ctx: discord.ApplicationContext, quote_id: int = None):
        await ctx.defer(ephemeral=True)
        self.log(f"Quotes paginate command issued by {ctx.author.name}. Starting ID: {quote_id}", ctx.guild)

        collection: AsyncCollection[QuoteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "quotes")
        await collection.update_many({"checked": {"$exists": False}}, {"$set": {"checked": False}})
        quotes = await collection.find({}).sort('timestamp', 1).to_list()

        if not quotes:
            await ctx.respond(self.bot.t('quotes.no_quotes_db', ctx.guild_id))
            return

        if quote_id is not None:
            idx = max(0, min(quote_id - 1, len(quotes) - 1))
        else:
            idx = next((i for i, q in enumerate(quotes) if not q.get('checked', False)), 0)

        view = QuotesPaginateView(self, quotes, idx, ctx.guild_id)
        await ctx.respond(embed=view.get_embed(), view=view)
        view.message = await ctx.interaction.original_response()

    @discord.slash_command(name="crawl-missing-quotes", description="Crawl the quote channel to backfill missing quotes.", default_member_permissions=discord.Permissions(administrator=True), contexts=[discord.InteractionContextType.guild])
    async def crawl_missing_quotes(self, ctx: discord.ApplicationContext):
        self.log(f"Crawl-missing-quotes command issued by {ctx.author.name} in #{ctx.channel.name}", ctx.guild)
        capture_channel_id = self.config.get('captureChannelId', ctx.guild_id)
        if not capture_channel_id or str(ctx.channel_id) != capture_channel_id:
            await ctx.respond(self.bot.t('quotes.crawl_not_capture_channel', ctx.guild_id), ephemeral=True)
            return

        await ctx.defer(ephemeral=True)
        channel = ctx.channel
        collection: AsyncCollection[QuoteEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "quotes")
        existing = await collection.find({}).to_list()

        batch_size = 50
        last_id = ctx.interaction.id
        checked = 0
        saved = 0

        await ctx.respond(self.bot.t('quotes.crawl_starting', ctx.guild_id, checked=checked, saved=saved))

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
                self.log(f'Found quote: "{entry["quote"]}" --{entry["author"]}', ctx.guild)

            await ctx.edit(content=self.bot.t('quotes.crawl_saving', ctx.guild_id, checked=checked, saved=saved))
            last_id = batch[-1].id

            if len(batch) < batch_size:
                break

        self.log(f'Crawl done: {checked} checked, {saved} saved', ctx.guild)
        await ctx.edit(content=self.bot.t('quotes.crawl_done', ctx.guild_id, checked=checked, saved=saved))

    async def _try_capture_quote(self, message: discord.Message):
        if message.guild is None or message.author.bot:
            return
        capture_channel_id = self.config.get('captureChannelId', message.guild.id)
        if not capture_channel_id or str(message.channel.id) != capture_channel_id:
            return

        match = QUOTE_REGEX.match(message.content)
        if not match:
            return

        self.log(f"Message in #{message.channel.name} matched quote format. Author: '{match.group(2).strip()}', Quote: '{match.group(1)}'. Submitter: {message.author.name}", message.guild)

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
        self.log(f'Quote #{idx + 1}/{len(all_quotes)} saved', message.guild)

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
        embed.set_footer(text=self.bot.t('quotes.saved_by', message.guild.id, submitter=entry['submitted_by'], idx=idx + 1, total=len(all_quotes)))
        await message.channel.send(embed=embed)

    def _quote_embed(self, quote: dict, idx: int, total: int, guild_id=None, show_votes: bool = False) -> discord.Embed:
        submitter = quote.get('submitted_by', 'Unknown')
        embed = discord.Embed(
            title=self.bot.t('quotes.quote_title', guild_id, idx=idx, total=total),
            color=discord.Color.dark_theme(),
            timestamp=datetime.fromtimestamp(quote['timestamp'] / 1000),
        )
        embed.set_image(url='attachment://quote.jpg')
        if show_votes:
            up = len(quote.get('upvoted_by', []))
            down = len(quote.get('downvoted_by', []))
            embed.set_footer(text=self.bot.t('quotes.submitted_by_votes', guild_id, submitter=submitter, up=up, down=down))
        else:
            embed.set_footer(text=self.bot.t('quotes.submitted_by', guild_id, submitter=submitter))
        return embed

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        await self._try_capture_quote(message)

    @commands.Cog.listener()
    async def on_message_edit(self, _before: discord.Message, after: discord.Message):
        await self._try_capture_quote(after)

def setup(bot):
    bot.add_cog(Quotes(bot))
