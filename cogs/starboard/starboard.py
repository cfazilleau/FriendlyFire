from typing import TypedDict

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


class Starboard(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'starboard', {
            "minStars": 3,
        })

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
        self.config.set('starboardChannel', str(channel.id), guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('starboard.set_channel_success', ctx.guild_id, channel=channel.mention))

    @starboardGroup.command(name="setstars", description="Set the minimum number of ⭐ reactions to appear on the starboard")
    @option(name="count", description="Minimum number of stars", required=True, input_type=int)
    async def set_stars(self, ctx: discord.ApplicationContext, count: int):
        await ctx.defer(ephemeral=True)
        if count < 1:
            await ctx.respond(self.bot.t('starboard.min_stars_error', ctx.guild_id))
            return
        self.config.set('minStars', count, guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('starboard.min_stars_success', ctx.guild_id, count=count))

    def _star_count(self, message: discord.Message) -> int:
        for reaction in message.reactions:
            if str(reaction.emoji) == '⭐':
                return reaction.count
        return 0

    def _build_embed(self, message: discord.Message, star_count: int) -> discord.Embed:
        embed = discord.Embed(
            description=message.content or "",
            color=discord.Color.gold(),
            timestamp=message.created_at,
        )
        embed.set_author(name=message.author.display_name, icon_url=message.author.display_avatar.url)
        embed.add_field(
            name=self.bot.t('starboard.embed_original', message.guild.id),
            value=f"[{self.bot.t('starboard.embed_jump', message.guild.id)}]({message.jump_url})"
        )
        if message.attachments:
            att = message.attachments[0]
            if att.content_type and att.content_type.startswith('image/'):
                embed.set_image(url=att.url)
        embed.set_footer(text=f"⭐ {star_count} | #{message.channel.name}")
        return embed

    async def _handle_reaction_change(self, payload: discord.RawReactionActionEvent):
        if str(payload.emoji) != '⭐' or payload.guild_id is None:
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

        star_count = self._star_count(message)
        min_stars = self.config.get('minStars', payload.guild_id) or 3

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
                except discord.HTTPException:
                    pass
                await collection.delete_one({"original_message_id": str(payload.message_id)})
            return

        embed = self._build_embed(message, star_count)
        content = f"⭐ **{star_count}**"

        if existing:
            try:
                sb_msg = await starboard_channel.fetch_message(int(existing['starboard_message_id']))
                await sb_msg.edit(content=content, embed=embed)
            except discord.HTTPException:
                try:
                    sb_msg = await starboard_channel.send(content=content, embed=embed)
                    await collection.update_one(
                        {"original_message_id": str(payload.message_id)},
                        {"$set": {"starboard_message_id": str(sb_msg.id)}},
                    )
                except discord.HTTPException:
                    pass
        else:
            try:
                sb_msg = await starboard_channel.send(content=content, embed=embed)
                await collection.insert_one(StarboardEntry(
                    original_message_id=str(payload.message_id),
                    starboard_message_id=str(sb_msg.id),
                    channel_id=str(payload.channel_id),
                    author_id=message.author.id,
                ))
                self.log(f"Posted message {payload.message_id} to starboard with {star_count} stars.")
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
