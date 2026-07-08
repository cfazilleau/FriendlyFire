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
        self.log(f"Starboard setchannel command issued by {ctx.author.name}. Channel: #{channel.name}", ctx.guild)
        self.config.set('starboardChannel', str(channel.id), guild_id=ctx.guild_id)
        await ctx.respond(self.bot.t('starboard.set_channel_success', ctx.guild_id, channel=channel.mention))

    @starboardGroup.command(name="setstars", description="Set the minimum number of ⭐ reactions to appear on the starboard")
    @option(name="count", description="Minimum number of stars", required=True, input_type=int)
    async def set_stars(self, ctx: discord.ApplicationContext, count: int):
        await ctx.defer(ephemeral=True)
        self.log(f"Starboard setstars command issued by {ctx.author.name}. Count: {count}", ctx.guild)
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
        original_text = self.bot.t('starboard.embed_original', message.guild.id)
        jump_link = f"[{original_text}]({message.jump_url})"
        
        description = message.content or ""
        if description:
            description += f"\n\n{jump_link}"
        else:
            description = jump_link

        embed = discord.Embed(
            description=description,
            color=discord.Color.gold(),
            timestamp=message.created_at,
        )
        embed.set_author(
            name=message.author.display_name,
            icon_url=message.author.display_avatar.url,
            url=message.jump_url
        )
        if message.attachments:
            att = message.attachments[0]
            if att.content_type and att.content_type.startswith('image/'):
                embed.set_image(url=att.url)
        embed.set_footer(text=f"⭐ {star_count} • #{message.channel.name}")
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
            return

        embeds = self._get_starboard_embeds(message, star_count)
        content = f"⭐ **{star_count}**"

        if existing:
            try:
                sb_msg = await starboard_channel.fetch_message(int(existing['starboard_message_id']))
                await sb_msg.edit(content=content, embeds=embeds)
                self.log(f"Updated starboard entry for message {message.id} in #{channel.name} to {star_count} stars.", message.guild)
            except discord.HTTPException:
                try:
                    sb_msg = await starboard_channel.send(content=content, embeds=embeds)
                    await collection.update_one(
                        {"original_message_id": str(payload.message_id)},
                        {"$set": {"starboard_message_id": str(sb_msg.id)}},
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
                ))
                self.log(f"Posted message {message.id} in #{channel.name} to starboard with {star_count} stars.", message.guild)
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
