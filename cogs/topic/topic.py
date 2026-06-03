import asyncio
import io
from typing import TypedDict

import aiohttp
import discord
from discord import option
from discord.ext import commands
from pymongo.asynchronous.collection import AsyncCollection

from src import FriendlyFire, BaseCog

class TopicEntry(TypedDict):
    messageId: str
    channelId: str
    roleId: str
    roleName: str

class Topic(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'topic', {
            "topicTypes": {}
        })

        if not self.config.get('topicTypes'):
            self.log('No topic types configured in config/topic.json — topic commands will be unavailable.')

    topicGroup = discord.SlashCommandGroup(name="topic", description="manage topics", default_member_permissions=discord.Permissions(administrator=True), contexts=[discord.InteractionContextType.guild])

    async def get_topic_types(self, ctx: discord.AutocompleteContext):
        return list(self.config.get('topicTypes').keys())

    async def _fetch_image(self, url: str) -> bytes | None:
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        return await resp.read()
        except (aiohttp.ClientError, asyncio.TimeoutError):
            self.log(f'Failed to fetch image from {url}')
        return None

    @topicGroup.command(name="create", description="create a topic")
    @option(name="name", description="name of the new topic", required=True)
    @option(name="type", parameter_name="topic_type", description="type of topic", required=True, autocomplete=get_topic_types)
    @option(name="image", description="URL of an image for this topic", required=False)
    async def create_topic(self, ctx: discord.ApplicationContext, name: str, topic_type: str, image: str = None):
        await ctx.defer(ephemeral=True)
        self.log(f"Topic create command issued by {ctx.author.name}. Name: '{name}', Type: '{topic_type}', Image: {image}", ctx.guild)

        topic_types = self.config.get('topicTypes') or {}
        if topic_type not in topic_types:
            valid_types = ', '.join(f'`{t}`' for t in topic_types)
            await ctx.respond(self.bot.t('topic.unknown_type', ctx.guild_id, topic_type=topic_type, valid_types=valid_types))
            return

        type_descriptor = topic_types[topic_type]

        # create the role
        color = discord.Color(int(type_descriptor["color"], 16))
        role = await ctx.guild.create_role(name=name, color=color, mentionable=True)

        embed = discord.Embed(
            title=f"{name} {type_descriptor['emoji']} {type_descriptor['text']}",
            color=color,
            footer=discord.embeds.EmbedFooter(text=self.bot.t('topic.subscribe_footer', ctx.guild_id)),
        )

        image_data = await self._fetch_image(image) if image else None
        if image_data:
            embed.set_image(url="attachment://topic.png")
            message = await ctx.channel.send(file=discord.File(io.BytesIO(image_data), filename="topic.png"), embed=embed)
        else:
            message = await ctx.channel.send(embed=embed)

        await message.add_reaction("✅")

        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        await collection.insert_one(TopicEntry(
            messageId=str(message.id),
            channelId=str(message.channel.id),
            roleId=str(role.id),
            roleName=role.name
        ))
        self.log(f"Successfully created role '{role.name}' and message for topic '{name}'", ctx.guild)
        await ctx.respond(self.bot.t('topic.create_success', ctx.guild_id))

    @topicGroup.command(name="edit", description="edit a topic")
    @option(name="role", description="current role of the topic", required=True, input_type=discord.SlashCommandOptionType.role)
    @option(name="type", parameter_name="topic_type", description="type of topic", required=True, autocomplete=get_topic_types)
    @option(name="name", description="name of the new topic", required=False)
    @option(name="image", description="URL of an image for this topic", required=False)
    async def edit_topic(self, ctx: discord.ApplicationContext, role: discord.Role, topic_type: str, name: str = None, image: str = None):
        await ctx.defer(ephemeral=True)
        self.log(f"Topic edit command issued by {ctx.author.name}. Target Role: {role.name}, Type: '{topic_type}', New Name: '{name}', New Image: {image}", ctx.guild)

        topic_types = self.config.get('topicTypes') or {}
        if topic_type not in topic_types:
            valid_types = ', '.join(f'`{t}`' for t in topic_types)
            await ctx.respond(self.bot.t('topic.unknown_type', ctx.guild_id, topic_type=topic_type, valid_types=valid_types))
            return

        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        topic = await collection.find_one(filter={"roleId": str(role.id)})
        if topic is None:
            await ctx.respond(self.bot.t('topic.not_found', ctx.guild_id))
            return
        type_descriptor = topic_types[topic_type]
        color = discord.Color(int(type_descriptor["color"], 16))

        channel = self.bot.get_channel(int(topic["channelId"]))
        if channel is None:
            await ctx.respond(self.bot.t('topic.channel_not_exists', ctx.guild_id))
            return
        try:
            message = await channel.fetch_message(int(topic["messageId"]))
        except discord.NotFound:
            await ctx.respond(self.bot.t('topic.message_not_exists', ctx.guild_id))
            return

        if name is None:
            name = topic["roleName"]
        else:
            await role.edit(name=name)

        embed = discord.Embed(
            title=f"{name} {type_descriptor['emoji']} {type_descriptor['text']}",
            color=color,
            footer=discord.embeds.EmbedFooter(text=self.bot.t('topic.subscribe_footer', ctx.guild_id)),
        )

        await role.edit(color=color)

        if image is not None:
            image_data = await self._fetch_image(image)
            if image_data:
                embed.set_image(url="attachment://topic.png")
                await message.edit(attachments=[], file=discord.File(io.BytesIO(image_data), filename="topic.png"), embed=embed)
            else:
                await message.edit(embed=embed)
        elif message.attachments:
            # retain the previously uploaded image
            embed.set_image(url=message.attachments[0].url)
            await message.edit(attachments=message.attachments, embed=embed)
        else:
            await message.edit(embed=embed)

        await collection.update_one(filter={"_id": topic["_id"]}, update={"$set": {
            "messageId": str(message.id),
            "channelId": str(message.channel.id),
            "roleId": str(role.id),
            "roleName": str(role.name)
        }})

        await ctx.respond(self.bot.t('topic.edit_success', ctx.guild_id))

    @topicGroup.command(name="delete", description="delete a topic")
    @option(name="role", description="role of the topic", required=True)
    async def delete_topic(self, ctx: discord.ApplicationContext, role: discord.Role):
        await ctx.defer(ephemeral=True)
        self.log(f"Topic delete command issued by {ctx.author.name}. Target Role: {role.name}", ctx.guild)
        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        topic = await collection.find_one(filter={"roleId": str(role.id)})

        if topic is None:
            await ctx.respond(self.bot.t('topic.not_found', ctx.guild_id))
            return

        channel = self.bot.get_channel(int(topic["channelId"]))
        if channel is not None:
            try:
                message = await channel.fetch_message(int(topic["messageId"]))
                await message.delete()
            except discord.NotFound:
                pass

        await collection.delete_one({"_id": topic["_id"]})
        await role.delete()
        await ctx.respond(self.bot.t('topic.delete_success', ctx.guild_id))

    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent):
        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(payload.guild_id, "topics")
        topic = await collection.find_one(filter={"messageId": str(payload.message_id)})
        if topic:
            guild = self.bot.get_guild(payload.guild_id)
            role = guild.get_role(int(topic["roleId"]))
            if role is None:
                return
            await payload.member.add_roles(role)
            self.log(f"Added role {role.name} to user {payload.member.name}")

    @commands.Cog.listener()
    async def on_raw_reaction_remove(self, payload: discord.RawReactionActionEvent):
        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(payload.guild_id, "topics")
        topic = await collection.find_one(filter={"messageId": str(payload.message_id)})
        if topic:
            guild = self.bot.get_guild(payload.guild_id)
            role = guild.get_role(int(topic["roleId"]))
            if role is None:
                return
            try:
                member = await guild.fetch_member(payload.user_id)
            except discord.NotFound:
                return
            await member.remove_roles(role)
            self.log(f"Removed role {role.name} from user {member.name}")

def setup(bot):
    bot.add_cog(Topic(bot))
