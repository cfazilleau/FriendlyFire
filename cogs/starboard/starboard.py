import asyncio
from typing import Callable, NotRequired, TypedDict

import discord
from discord import option
from discord.ext import commands
from pymongo.asynchronous.collection import AsyncCollection

from src import FriendlyFire, BaseCog


class StarboardEntry(TypedDict):
    original_message_id: str
    starboard_message_id: str
    channel_id: str
    author_id: int
    star_count: NotRequired[int]  # missing on entries created before legendary/pin support


DEFAULT_LEGENDARY_COLOR = "#FF8C00"
MAX_PIN_COUNT = 10


class Starboard(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'starboard', {
            "minStars": 3,
            "starboardEmoji": ["⭐"],
            "legendaryStars": 10,                     # 0 disables legendary posts
            "legendaryColor": DEFAULT_LEGENDARY_COLOR,
            "pinCount": 3,                            # 0 disables pinning
        })
        self._pin_locks: dict[int, asyncio.Lock] = {}
        self._last_pinned: dict[int, list[int]] = {}

    starboardGroup = discord.SlashCommandGroup(
        name="starboard",
        description="Manage starboard settings",
        default_member_permissions=discord.Permissions(administrator=True),
        contexts=[discord.InteractionContextType.guild],
    )

    @starboardGroup.command(name="setchannel", description="Set the starboard channel")
    @option(name="channel", description="Channel to post starred messages in", required=True, input_type=discord.SlashCommandOptionType.channel)
    async def set_channel(self, ctx: discord.ApplicationContext, channel: discord.TextChannel):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard setchannel command issued by {ctx.author.name}. Channel: #{channel.name}", ctx.guild)
        self.config.set('starboardChannel', str(channel.id), guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('starboard.set_channel_success', ctx.guild_id, channel=channel.mention))

    @starboardGroup.command(name="setstars", description="Set the minimum number of reactions to appear on the starboard")
    @option(name="count", description="Minimum number of reactions", required=True, input_type=int)
    async def set_stars(self, ctx: discord.ApplicationContext, count: int):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard setstars command issued by {ctx.author.name}. Count: {count}", ctx.guild)
        if count < 1:
            await ctx.respond(self.bot.t('starboard.min_stars_error', ctx.guild_id))
            return
        self.config.set('minStars', count, guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('starboard.min_stars_success', ctx.guild_id, count=count))

    @starboardGroup.command(name="addemoji", description="Add an emoji to the starboard accepted list")
    @option(name="emoji", description="The emoji to add (unicode or custom)", required=True, input_type=str)
    async def add_emoji(self, ctx: discord.ApplicationContext, emoji: str):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard addemoji command issued by {ctx.author.name}. Emoji: {emoji}", ctx.guild)
        emoji = emoji.strip()
        current_emojis = self.config.get('starboardEmoji', ctx.guild_id) or ["⭐"]
        if emoji in current_emojis:
            await ctx.respond(self.bot.t('starboard.emoji_already_exists', ctx.guild_id, emoji=emoji))
            return
        new_emojis = list(current_emojis)
        new_emojis.append(emoji)
        self.config.set('starboardEmoji', new_emojis, guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('starboard.emoji_add_success', ctx.guild_id, emoji=emoji))

    @starboardGroup.command(name="removeemoji", description="Remove an emoji from the starboard accepted list")
    @option(name="emoji", description="The emoji to remove", required=True, input_type=str)
    async def remove_emoji(self, ctx: discord.ApplicationContext, emoji: str):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard removeemoji command issued by {ctx.author.name}. Emoji: {emoji}", ctx.guild)
        emoji = emoji.strip()
        current_emojis = self.config.get('starboardEmoji', ctx.guild_id) or ["⭐"]
        if emoji not in current_emojis:
            await ctx.respond(self.bot.t('starboard.emoji_not_found', ctx.guild_id, emoji=emoji))
            return
        if len(current_emojis) <= 1:
            await ctx.respond(self.bot.t('starboard.emoji_remove_last_error', ctx.guild_id))
            return
        new_emojis = list(current_emojis)
        new_emojis.remove(emoji)
        self.config.set('starboardEmoji', new_emojis, guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('starboard.emoji_remove_success', ctx.guild_id, emoji=emoji))

    @starboardGroup.command(name="listemojis", description="List all accepted starboard emojis")
    async def list_emojis(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)
        current_emojis = self.config.get('starboardEmoji', ctx.guild_id) or ["⭐"]
        emojis_str = " ".join(current_emojis)
        await ctx.respond(self.bot.t('starboard.emoji_list', ctx.guild_id, emojis=emojis_str))

    @starboardGroup.command(name="setlegendary", description="Set the number of reactions for a post to become legendary (0 to disable)")
    @option(name="count", description="Reactions needed to become legendary (0 disables)", required=True, input_type=int)
    async def set_legendary(self, ctx: discord.ApplicationContext, count: int):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard setlegendary command issued by {ctx.author.name}. Count: {count}", ctx.guild)
        if count < 0:
            await ctx.respond(self.bot.t('starboard.legendary_stars_error', ctx.guild_id))
            return
        old_threshold = self._legendary_threshold(ctx.guild_id)
        self.config.set('legendaryStars', count, guild_id=ctx.guild_id)

        def status_changed(stars: int) -> bool:
            was = old_threshold > 0 and stars >= old_threshold
            return was != self._is_legendary(ctx.guild_id, stars)

        result = await self._refresh_posts(ctx.guild, recount=False, only=status_changed)
        key = 'starboard.legendary_stars_disabled' if count == 0 else 'starboard.legendary_stars_success'
        message = self.bot.t(key, ctx.guild_id, count=count)
        if result is not None:
            message += "\n" + self.bot.t('starboard.refresh_summary', ctx.guild_id, updated=result[0], legendary=result[1], failed=result[2])
        await ctx.respond(message)

    @starboardGroup.command(name="setlegendarycolor", description="Set the embed color of legendary posts")
    @option(name="color", description="Hex color, e.g. #FF8C00", required=True, input_type=str)
    async def set_legendary_color(self, ctx: discord.ApplicationContext, color: str):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard setlegendarycolor command issued by {ctx.author.name}. Color: {color}", ctx.guild)
        parsed = self._parse_color(color)
        if parsed is None:
            await ctx.respond(self.bot.t('starboard.legendary_color_error', ctx.guild_id, color=color))
            return
        normalized = f"#{parsed.value:06X}"
        self.config.set('legendaryColor', normalized, guild_id=ctx.guild_id)

        result = await self._refresh_posts(ctx.guild, recount=False, only=lambda stars: self._is_legendary(ctx.guild_id, stars))
        message = self.bot.t('starboard.legendary_color_success', ctx.guild_id, color=normalized)
        if result is not None:
            message += "\n" + self.bot.t('starboard.refresh_summary', ctx.guild_id, updated=result[0], legendary=result[1], failed=result[2])
        await ctx.respond(message)

    @starboardGroup.command(name="setpins", description="Set how many top starboard posts are pinned (0 to disable)")
    @option(name="count", description=f"Number of top posts to pin (0-{MAX_PIN_COUNT})", required=True, input_type=int)
    async def set_pins(self, ctx: discord.ApplicationContext, count: int):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard setpins command issued by {ctx.author.name}. Count: {count}", ctx.guild)
        if count < 0 or count > MAX_PIN_COUNT:
            await ctx.respond(self.bot.t('starboard.pin_count_error', ctx.guild_id, max=MAX_PIN_COUNT))
            return
        self.config.set('pinCount', count, guild_id=ctx.guild_id)
        starboard_channel = self._get_starboard_channel(ctx.guild_id)
        if starboard_channel is not None:
            await self._sync_pins(ctx.guild_id, starboard_channel, force=True)
        key = 'starboard.pin_count_disabled' if count == 0 else 'starboard.pin_count_success'
        await ctx.respond(self.bot.t(key, ctx.guild_id, count=count))

    @starboardGroup.command(name="refresh", description="Recount reactions and update every existing starboard post and pin")
    async def refresh(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard refresh command issued by {ctx.author.name}.", ctx.guild)
        result = await self._refresh_posts(ctx.guild, recount=True)
        if result is None:
            await ctx.respond(self.bot.t('starboard.no_channel', ctx.guild_id))
            return
        await ctx.respond(self.bot.t('starboard.refresh_summary', ctx.guild_id, updated=result[0], legendary=result[1], failed=result[2]))

    # --- Helpers -----------------------------------------------------------------------------

    def _accepted_emojis(self, guild_id) -> list[str]:
        return self.config.get('starboardEmoji', guild_id) or ["⭐"]

    def _legendary_threshold(self, guild_id) -> int:
        value = self.config.get('legendaryStars', guild_id)
        return int(value) if value else 0

    def _is_legendary(self, guild_id, star_count: int) -> bool:
        threshold = self._legendary_threshold(guild_id)
        return threshold > 0 and star_count >= threshold

    @staticmethod
    def _parse_color(raw) -> discord.Color | None:
        text = str(raw).strip().lstrip('#')
        if len(text) != 6:
            return None
        try:
            return discord.Color(int(text, 16))
        except ValueError:
            return None

    def _legendary_color(self, guild_id) -> discord.Color:
        return (self._parse_color(self.config.get('legendaryColor', guild_id) or DEFAULT_LEGENDARY_COLOR)
                or self._parse_color(DEFAULT_LEGENDARY_COLOR))

    def _pin_count(self, guild_id) -> int:
        value = self.config.get('pinCount', guild_id)
        if value is None:
            return 3
        return max(0, min(int(value), MAX_PIN_COUNT))

    def _get_starboard_channel(self, guild_id) -> discord.TextChannel | None:
        channel_id = self.config.get('starboardChannel', guild_id)
        if not channel_id:
            return None
        return self.bot.get_channel(int(channel_id))

    def _apply_style(self, embed: discord.Embed, guild_id, star_count: int) -> discord.Embed:
        """Colors and titles the main starboard embed according to its legendary status."""
        if self._is_legendary(guild_id, star_count):
            embed.color = self._legendary_color(guild_id)
            embed.title = self.bot.t('starboard.legendary_title', guild_id)
        else:
            embed.color = discord.Color.gold()
            embed.title = None
        return embed

    def _render_content(self, guild_id, star_count: int) -> str:
        primary_emoji = self._accepted_emojis(guild_id)[0]
        if self._is_legendary(guild_id, star_count):
            return self.bot.t('starboard.legendary_content', guild_id, emoji=primary_emoji, count=star_count)
        return f"{primary_emoji} **{star_count}**"

    async def _star_count(self, message: discord.Message, accepted_emojis: list[str]) -> int:
        unique_users = set()
        for reaction in message.reactions:
            emoji_str = str(reaction.emoji)
            if emoji_str in accepted_emojis:
                async for user in reaction.users():
                    if not user.bot:
                        unique_users.add(user.id)
        return len(unique_users)

    def _build_embed(self, message: discord.Message, star_count: int) -> discord.Embed:
        original_text = self.bot.t('starboard.embed_original', message.guild.id)
        jump_link = f"[{original_text}]({message.jump_url})"
        
        description = message.content or ""
        if description:
            description += f"\n\n{jump_link}"
        else:
            description = jump_link

        embed = discord.Embed(
            description=description,
            timestamp=message.created_at,
        )
        self._apply_style(embed, message.guild.id, star_count)
        embed.set_author(
            name=message.author.display_name,
            icon_url=message.author.display_avatar.url,
            url=message.jump_url
        )
        if message.attachments:
            att = message.attachments[0]
            if att.content_type and att.content_type.startswith('image/'):
                embed.set_image(url=att.url)
                
        primary_emoji = self._accepted_emojis(message.guild.id)[0]
        embed.set_footer(text=f"{primary_emoji} {star_count} • #{message.channel.name}")
        return embed

    def _sanitize_embed(self, embed: discord.Embed) -> discord.Embed:
        # Convert embed to dictionary to clean up read-only or unsupported fields
        embed_dict = embed.to_dict()
        
        # Force type to rich (otherwise Discord rejects it as a bot-sent embed)
        embed_dict['type'] = 'rich'
        
        # Remove read-only root fields that bots are not allowed to send
        embed_dict.pop('video', None)
        embed_dict.pop('provider', None)
        
        # Clean thumbnail to remove dimensions and proxy urls
        if 'thumbnail' in embed_dict and isinstance(embed_dict['thumbnail'], dict):
            embed_dict['thumbnail'].pop('proxy_url', None)
            embed_dict['thumbnail'].pop('height', None)
            embed_dict['thumbnail'].pop('width', None)
            
        # Clean image to remove dimensions and proxy urls
        if 'image' in embed_dict and isinstance(embed_dict['image'], dict):
            embed_dict['image'].pop('proxy_url', None)
            embed_dict['image'].pop('height', None)
            embed_dict['image'].pop('width', None)
            
        # Clean author to remove proxy icon urls
        if 'author' in embed_dict and isinstance(embed_dict['author'], dict):
            embed_dict['author'].pop('proxy_icon_url', None)
            
        # Clean footer to remove proxy icon urls
        if 'footer' in embed_dict and isinstance(embed_dict['footer'], dict):
            embed_dict['footer'].pop('proxy_icon_url', None)
            
        return discord.Embed.from_dict(embed_dict)

    def _get_starboard_embeds(self, message: discord.Message, star_count: int) -> list[discord.Embed]:
        base_embed = self._build_embed(message, star_count)
        embeds = [base_embed]
        
        # Add up to 9 original/link embeds (since Discord allows max 10 embeds per message)
        for orig_embed in message.embeds:
            if len(embeds) >= 10:
                break
            try:
                sanitized = self._sanitize_embed(orig_embed)
                embeds.append(sanitized)
            except Exception as e:
                self.log(f"Failed to sanitize embed for message {message.id}: {e}", message.guild)
                
        return embeds

    async def _handle_reaction_change(self, payload: discord.RawReactionActionEvent):
        if payload.guild_id is None:
            return

        accepted_emojis = self._accepted_emojis(payload.guild_id)
        if str(payload.emoji) not in accepted_emojis:
            return

        starboard_channel_id = self.config.get('starboardChannel', payload.guild_id)
        if not starboard_channel_id:
            return

        if str(payload.channel_id) == str(starboard_channel_id):
            return

        channel = self.bot.get_channel(payload.channel_id)
        if channel is None:
            return

        try:
            message = await channel.fetch_message(payload.message_id)
        except discord.HTTPException:
            return

        star_count = await self._star_count(message, accepted_emojis)
        min_stars = self.config.get('minStars', payload.guild_id) or 3
        self.log(f"Reaction change detected for message {message.id} in #{channel.name}. Star count: {star_count}, Minimum stars required: {min_stars}", message.guild)

        collection: AsyncCollection[StarboardEntry] = await self.bot.mongo.get_collection(payload.guild_id, "starboard")
        existing = await collection.find_one({"original_message_id": str(payload.message_id)})

        starboard_channel = self.bot.get_channel(int(starboard_channel_id))
        if starboard_channel is None:
            return

        if star_count < min_stars:
            if existing:
                try:
                    sb_msg = await starboard_channel.fetch_message(int(existing['starboard_message_id']))
                    await sb_msg.delete()
                    self.log(f"Message {message.id} fell below minStars ({min_stars}) with {star_count} stars. Deleted starboard entry.", message.guild)
                except discord.HTTPException:
                    pass
                await collection.delete_one({"original_message_id": str(payload.message_id)})
                await self._sync_pins(payload.guild_id, starboard_channel)
            return

        embeds = self._get_starboard_embeds(message, star_count)
        content = self._render_content(payload.guild_id, star_count)

        if existing:
            previous_count = existing.get('star_count')
            if (previous_count is not None and self._is_legendary(payload.guild_id, star_count)
                    and not self._is_legendary(payload.guild_id, previous_count)):
                self.log(f"Message {message.id} in #{channel.name} became legendary with {star_count} stars.", message.guild)
            try:
                sb_msg = await starboard_channel.fetch_message(int(existing['starboard_message_id']))
                await sb_msg.edit(content=content, embeds=embeds)
                await collection.update_one(
                    {"original_message_id": str(payload.message_id)},
                    {"$set": {"star_count": star_count}},
                )
                self.log(f"Updated starboard entry for message {message.id} in #{channel.name} to {star_count} stars.", message.guild)
            except discord.HTTPException:
                try:
                    sb_msg = await starboard_channel.send(content=content, embeds=embeds)
                    await collection.update_one(
                        {"original_message_id": str(payload.message_id)},
                        {"$set": {"starboard_message_id": str(sb_msg.id), "star_count": star_count}},
                    )
                    self.log(f"Re-posted starboard entry for message {message.id} in #{channel.name} with {star_count} stars (previous message not found/deleted).", message.guild)
                except discord.HTTPException:
                    pass
        else:
            try:
                sb_msg = await starboard_channel.send(content=content, embeds=embeds)
                await collection.insert_one(StarboardEntry(
                    original_message_id=str(payload.message_id),
                    starboard_message_id=str(sb_msg.id),
                    channel_id=str(payload.channel_id),
                    author_id=message.author.id,
                    star_count=star_count,
                ))
                self.log(f"Posted message {message.id} in #{channel.name} to starboard with {star_count} stars.", message.guild)
            except discord.HTTPException:
                pass

        await self._sync_pins(payload.guild_id, starboard_channel)

    async def _refresh_posts(self, guild: discord.Guild, recount: bool,
                             only: Callable[[int], bool] | None = None) -> tuple[int, int, int] | None:
        """Re-render existing starboard posts so they match the current legendary settings.

        `recount` re-reads reactions on every original message; otherwise the stored count is
        used (entries created before star counts were stored are always recounted).
        `only` filters entries by their stored star count (ignored when recounting; entries
        without a stored count are always re-rendered). Returns (updated, legendary, failed),
        or None when no starboard channel is configured.
        """
        starboard_channel = self._get_starboard_channel(guild.id)
        if starboard_channel is None:
            return None

        collection: AsyncCollection[StarboardEntry] = await self.bot.mongo.get_collection(guild.id, "starboard")
        entries = await collection.find({}).to_list(None)
        accepted_emojis = self._accepted_emojis(guild.id)
        updated = legendary = failed = 0
        self.log(f"Refreshing {len(entries)} starboard posts (recount={recount}).", guild)

        for entry in entries:
            star_count = entry.get('star_count')
            if not recount and star_count is not None and only is not None and not only(star_count):
                continue

            # Rebuild from the original message when it still exists.
            original: discord.Message | None = None
            source_channel = self.bot.get_channel(int(entry['channel_id']))
            if source_channel is not None:
                try:
                    original = await source_channel.fetch_message(int(entry['original_message_id']))
                except discord.HTTPException:
                    original = None

            if original is not None and (recount or star_count is None):
                star_count = await self._star_count(original, accepted_emojis)
            if star_count is None:
                # Original is gone and the count was never stored: nothing reliable to show.
                failed += 1
                continue

            content = self._render_content(guild.id, star_count)
            try:
                if original is not None:
                    embeds = self._get_starboard_embeds(original, star_count)
                    sb_msg = starboard_channel.get_partial_message(int(entry['starboard_message_id']))
                else:
                    # Original deleted: restyle the embeds already on the starboard post.
                    sb_msg = await starboard_channel.fetch_message(int(entry['starboard_message_id']))
                    embeds = [self._sanitize_embed(e) for e in sb_msg.embeds]
                    if embeds:
                        self._apply_style(embeds[0], guild.id, star_count)
                await sb_msg.edit(content=content, embeds=embeds)
            except discord.HTTPException as e:
                self.log(f"Failed to refresh starboard post {entry['starboard_message_id']}: {e}", guild)
                failed += 1
                continue

            await collection.update_one({"_id": entry["_id"]}, {"$set": {"star_count": star_count}})
            updated += 1
            if self._is_legendary(guild.id, star_count):
                legendary += 1

        await self._sync_pins(guild.id, starboard_channel, force=True)
        self.log(f"Starboard refresh done: {updated} updated, {legendary} legendary, {failed} failed.", guild)
        return updated, legendary, failed

    async def _sync_pins(self, guild_id: int, starboard_channel: discord.TextChannel, force: bool = False):
        """Keep the top `pinCount` starboard posts pinned, ranked #1 on top of the pin list."""
        lock = self._pin_locks.setdefault(guild_id, asyncio.Lock())
        async with lock:
            desired: list[int] = []
            count = self._pin_count(guild_id)
            if count > 0:
                collection: AsyncCollection[StarboardEntry] = await self.bot.mongo.get_collection(guild_id, "starboard")
                cursor = collection.find({"star_count": {"$exists": True}}).sort([("star_count", -1), ("_id", 1)]).limit(count)
                desired = [int(doc['starboard_message_id']) async for doc in cursor]

            if not force and self._last_pinned.get(guild_id) == desired:
                return

            try:
                pins = await starboard_channel.pins()
            except discord.HTTPException as e:
                self.log(f"Failed to read starboard pins: {e}", guild_id)
                return

            # Pins are returned most recently pinned first; only touch the bot's own posts.
            current = [m.id for m in pins if m.author.id == self.bot.user.id]
            if current == desired:
                self._last_pinned[guild_id] = desired
                return

            try:
                for message_id in current:
                    if message_id not in desired:
                        await self._set_pinned(starboard_channel, message_id, False)
                kept = [m for m in current if m in desired]

                # Discord lists the most recently pinned message first, so find the smallest
                # prefix of the ranking to (re)pin such that the untouched pins already sit
                # below it in the right order, then pin that prefix from last to first.
                split = next(k for k in range(len(desired) + 1)
                             if [m for m in kept if m not in desired[:k]] == desired[k:])
                for message_id in reversed(desired[:split]):
                    if message_id in kept:
                        await self._set_pinned(starboard_channel, message_id, False)
                    await self._set_pinned(starboard_channel, message_id, True)
            except discord.Forbidden:
                self.log("Missing permission to pin messages in the starboard channel.", guild_id)
            self._last_pinned[guild_id] = desired
            self.log(f"Starboard pins updated: {desired}", guild_id)

    async def _set_pinned(self, channel: discord.TextChannel, message_id: int, pinned: bool):
        partial = channel.get_partial_message(message_id)
        try:
            if pinned:
                await partial.pin(reason="Starboard top posts")
            else:
                await partial.unpin(reason="Starboard top posts")
        except discord.NotFound:
            pass

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        # Hide the "<bot> pinned a message" notices generated by _sync_pins.
        if message.guild is None or message.type != discord.MessageType.pins_add:
            return
        if self.bot.user is None or message.author.id != self.bot.user.id:
            return
        if str(message.channel.id) != str(self.config.get('starboardChannel', message.guild.id)):
            return
        try:
            await message.delete()
        except discord.HTTPException:
            pass

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent):
        await self._handle_reaction_change(payload)

    @commands.Cog.listener()
    async def on_raw_reaction_remove(self, payload: discord.RawReactionActionEvent):
        await self._handle_reaction_change(payload)


def setup(bot):
    bot.add_cog(Starboard(bot))
