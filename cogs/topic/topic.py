from typing import TypedDict

import discord
from discord import option
from discord.ext import commands
from pymongo.asynchronous.collection import AsyncCollection

from src import FriendlyFire
from src.config import Config

class TopicEntry(TypedDict):
    messageId: str
    channelId: str
    roleId: str
    roleName: str

class Topic(commands.Cog):
    def __init__(self, bot: FriendlyFire):
        self.bot = bot
        default_config = {
            "topicTypes": {},
        }
        self.config = Config('topic', default_config)

        if not self.config.get('topicTypes'):
            print('[Topic] No topic types configured in config/topic.json — topic commands will be unavailable.')

    topicGroup = discord.SlashCommandGroup(name="topic", description="manage topics")

    async def get_topic_types(self, ctx: discord.AutocompleteContext):
        return list(self.config.get('topicTypes').keys())

    @topicGroup.command(name="create", description="create a topic", default_permission=False)
    @option(name="name", description="name of the new topic", required=True)
    @option(name="type", parameter_name="topic_type", description="type of topic", required=True, autocomplete=get_topic_types)
    @option(name="image", description="URL of an image for this topic", required=False)
    async def create_topic(self, ctx: discord.ApplicationContext, name: str, topic_type: str, image: str = None):
        await ctx.defer(ephemeral=True)

        topic_types = self.config.get('topicTypes') or {}
        if topic_type not in topic_types:
            await ctx.respond(f"Unknown topic type `{topic_type}`. Valid types: {', '.join(f'`{t}`' for t in topic_types)}")
            return

        type_descriptor = topic_types[topic_type]

        # create the role
        color = discord.Color(int(type_descriptor["color"], 16))
        role = await ctx.guild.create_role(name=name, color=color, mentionable=True)

        # send a new embed message for users to react to
        embed = discord.Embed(
            title=f"{name} {type_descriptor['emoji']} {type_descriptor['text']}",
            color=color,
            footer=discord.embeds.EmbedFooter(text="Clique sur ✅ pour t'abonner à ce topic"),
            # TODO: maybe cache the picture before, so if the original link dies, we still have a reliable url
            image=image
        )

        message = await ctx.channel.send(embed=embed)
        await message.add_reaction("✅")

        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        await collection.insert_one(TopicEntry(
            messageId=str(message.id),
            channelId=str(message.channel.id),
            roleId=str(role.id),
            roleName=role.name
        ))
        await ctx.respond("Created topic successfully!")

    @topicGroup.command(name="edit", description="edit a topic", default_permission=False)
    @option(name="role", description="current role of the topic", required=True, input_type=discord.SlashCommandOptionType.role)
    @option(name="type", parameter_name="topic_type", description="type of topic", required=True, autocomplete=get_topic_types)
    @option(name="name", description="name of the new topic", required=False)
    @option(name="image", description="URL of an image for this topic", required=False)
    async def edit_topic(self, ctx: discord.ApplicationContext, role: discord.Role, topic_type: str, name: str = None, image: str = None):
        await ctx.defer(ephemeral=True)

        topic_types = self.config.get('topicTypes') or {}
        if topic_type not in topic_types:
            await ctx.respond(f"Unknown topic type `{topic_type}`. Valid types: {', '.join(f'`{t}`' for t in topic_types)}")
            return

        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        topic = await collection.find_one(filter={"roleId": str(role.id)})
        type_descriptor = topic_types[topic_type]
        color = discord.Color(int(type_descriptor["color"], 16))

        channel = self.bot.get_channel(int(topic["channelId"]))
        message = await channel.fetch_message(int(topic["messageId"]))
        prev_embed = message.embeds[0]

        if name is None:
            name = topic["roleName"]
        else:
            await role.edit(name=name)

        if image is None:
            image = prev_embed.image

        # create a new embed message to update
        embed = discord.Embed(
            title=f"{name} {type_descriptor['emoji']} {type_descriptor['text']}",
            color=color,
            footer=discord.embeds.EmbedFooter(text="Clique sur ✅ pour t'abonner à ce topic"),
            # TODO: maybe cache the picture before, so if the original link dies, we still have a reliable url
            image=image
        )

        await role.edit(color=color)
        await message.edit(embed=embed)
        await collection.update_one(filter={"_id": topic["_id"]}, update={"$set": {
            "messageId": str(message.id),
            "channelId": str(message.channel.id),
            "roleId": str(role.id),
            "roleName": str(role.name)
        }})

        await ctx.respond("Updated topic successfully!")

    @topicGroup.command(name="delete", description="delete a topic", default_permission=False)
    @option(name="role", description="role of the topic", required=True)
    async def delete_topic(self, ctx: discord.ApplicationContext, role: discord.Role):
        await ctx.defer(ephemeral=True)
        collection: AsyncCollection[TopicEntry] = await self.bot.mongo.get_collection(ctx.guild_id, "topics")
        topic = await collection.find_one(filter={"roleId": str(role.id)})

        if topic is None:
            await ctx.respond("Topic not found in the database, you might need to delete this one manually")
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
        await ctx.respond("Removed topic successfully!")

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
            print(f"Added role {role.name} to user {payload.member.name}")

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
            print(f"Removed role {role.name} from user {member.name}")

def setup(bot):
    bot.add_cog(Topic(bot))
