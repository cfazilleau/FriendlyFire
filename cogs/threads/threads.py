import datetime
import discord
from discord.ext import commands
from discord.commands import default_permissions
from src import FriendlyFire, BaseCog

class ConfirmCopyView(discord.ui.View):
    def __init__(self, requester_id: int, *args, **kwargs):
        super().__init__(timeout=60.0, *args, **kwargs)
        self.requester_id = requester_id
        self.value = None

    @discord.ui.button(label="Confirm Copy", style=discord.ButtonStyle.danger)
    async def confirm(self, button: discord.ui.Button, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message("Only the person who initiated this move can confirm it.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        self.value = True
        self.stop()

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel(self, button: discord.ui.Button, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message("Only the person who initiated this move can cancel it.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        self.value = False
        self.stop()


class ConfirmMoveView(discord.ui.View):
    def __init__(self, cog: 'Threads'):
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(label="Finalize Move", style=discord.ButtonStyle.success, custom_id="finalize_thread_move")
    async def finalize(self, button: discord.ui.Button, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        collection = await self.cog.bot.mongo.get_collection(interaction.guild_id, "thread_moves")
        transaction = await collection.find_one({"thread_id": str(interaction.channel.id)})
        if not transaction:
            await interaction.followup.send("No active move transaction found for this thread.", ephemeral=True)
            return

        # Enforce requester lock
        if str(interaction.user.id) != transaction.get("requester_id"):
            await interaction.followup.send(
                f"Only <@{transaction.get('requester_id')}> (who initiated this move) can finalize it.",
                ephemeral=True
            )
            return

        thread = interaction.channel
        # Fetch current messages in the thread
        try:
            thread_messages = [msg async for msg in thread.history(limit=None)]
        except Exception as e:
            await interaction.followup.send(f"Failed to read thread history: {e}", ephemeral=True)
            return

        thread_msg_ids = {str(msg.id) for msg in thread_messages}
        original_ids_to_delete = []
        mappings = transaction.get("mappings", {})
        for new_id, old_id in mappings.items():
            if new_id in thread_msg_ids:
                original_ids_to_delete.append(int(old_id))

        main_channel_id = int(transaction["channel_id"])
        main_channel = self.cog.bot.get_channel(main_channel_id)

        # Delete migration notice message in main channel first to free the channel
        wait_msg_id = transaction.get("wait_message_id")
        if main_channel and wait_msg_id:
            try:
                wait_msg = main_channel.get_partial_message(int(wait_msg_id))
                await wait_msg.delete()
            except Exception as e:
                self.cog.log(f"Failed to delete migration notice: {e}")

        # Post the Move Finalized notice to the main channel
        anchor_url = f"https://discord.com/channels/{interaction.guild_id}/{main_channel.id}/{thread.id}"
        try:
            await main_channel.send(
                f"🧹 **Move finalized**: Subsequent messages after [this message]({anchor_url}) "
                f"have been moved to {thread.mention}."
            )
        except Exception as e:
            self.cog.log(f"Failed to send Move Finalized notice to main channel: {e}")

        # Deletion of remaining messages from the main channel
        if main_channel and original_ids_to_delete:
            objects_to_delete = [discord.Object(id=oid) for oid in original_ids_to_delete]
            try:
                await self.cog.delete_messages_helper(main_channel, objects_to_delete)
            except Exception as e:
                self.cog.log(f"Failed to delete original messages: {e}")
                await interaction.followup.send(f"Failed to delete original messages: {e}", ephemeral=True)
                return

        # Clean up database
        await collection.delete_one({"_id": transaction["_id"]})

        # Try to delete the confirmation message
        confirm_msg_id = int(transaction["confirm_message_id"])
        try:
            confirm_msg = await thread.fetch_message(confirm_msg_id)
            await confirm_msg.delete()
        except discord.NotFound:
            pass

        await interaction.followup.send("Move finalized! Original messages have been deleted from the main channel.", ephemeral=True)
        await thread.send(f"🧹 **Move finalized**: Original messages have been cleaned up from the main channel by {interaction.user.mention}.")

    @discord.ui.button(label="Cancel Move", style=discord.ButtonStyle.danger, custom_id="cancel_thread_move")
    async def cancel(self, button: discord.ui.Button, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        collection = await self.cog.bot.mongo.get_collection(interaction.guild_id, "thread_moves")
        transaction = await collection.find_one({"thread_id": str(interaction.channel.id)})
        if not transaction:
            await interaction.followup.send("No active move transaction found for this thread.", ephemeral=True)
            return

        # Enforce requester lock
        if str(interaction.user.id) != transaction.get("requester_id"):
            await interaction.followup.send(
                f"Only <@{transaction.get('requester_id')}> (who initiated this move) can cancel it.",
                ephemeral=True
            )
            return

        main_channel_id = int(transaction["channel_id"])
        main_channel = self.cog.bot.get_channel(main_channel_id)

        # Delete migration notice message in main channel
        wait_msg_id = transaction.get("wait_message_id")
        if main_channel and wait_msg_id:
            try:
                wait_msg = main_channel.get_partial_message(int(wait_msg_id))
                await wait_msg.delete()
            except Exception as e:
                self.cog.log(f"Failed to delete migration notice: {e}")

        # Clean up database
        await collection.delete_one({"_id": transaction["_id"]})

        # Delete the thread
        thread = interaction.channel
        try:
            await thread.delete(reason=f"Move cancelled by {interaction.user}")
        except discord.HTTPException as e:
            self.cog.log(f"Failed to delete thread on cancel: {e}")
            await interaction.followup.send("Failed to delete thread, but the move transaction was aborted.", ephemeral=True)


class MoveToThreadModal(discord.ui.Modal):
    def __init__(self, message: discord.Message, cog: 'Threads', *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.message = message
        self.cog = cog

        # Determine a default thread name based on message content or sender
        default_name = f"Debate from {message.author.display_name}"
        if message.content:
            words = message.content.split()
            msg_preview = " ".join(words[:5])
            if len(msg_preview) > 50:
                msg_preview = msg_preview[:47] + "..."
            if msg_preview.strip():
                default_name = f"Debate: {msg_preview}"

        # Limit to 100 characters (Discord limit)
        default_name = default_name[:100]

        self.add_item(discord.ui.InputText(
            label="Thread Name",
            placeholder="Enter a name for the thread",
            value=default_name,
            required=True,
            max_length=100
        ))

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        thread_name = self.children[0].value
        channel = self.message.channel

        # Retrieve configurations
        max_messages = self.cog.config.get('maxMessages', interaction.guild_id)
        confirm_threshold = self.cog.config.get('confirmThreshold', interaction.guild_id)

        # 1. Fetch messages after the selected message
        try:
            messages = [msg async for msg in channel.history(after=self.message, oldest_first=True, limit=max_messages + 1)]
        except Exception as e:
            await interaction.followup.send(f"Failed to read channel history: {e}", ephemeral=True)
            return

        if not messages:
            await interaction.followup.send("There are no messages after this one to move.", ephemeral=True)
            return

        if len(messages) > max_messages:
            await interaction.followup.send(
                f"There are too many messages after this one (more than {max_messages}). "
                f"To prevent API issues, the maximum number of messages that can be moved at once is {max_messages}.",
                ephemeral=True
            )
            return

        # 2. Check if we need confirmation from the user
        if len(messages) > confirm_threshold:
            view = ConfirmCopyView(requester_id=interaction.user.id)
            msg_confirm = await interaction.followup.send(
                f"⚠️ **Warning**: You are about to copy **{len(messages)}** messages to the thread **{thread_name}**.\n"
                f"This exceeds the threshold of {confirm_threshold} and might take a moment. Are you sure?",
                view=view,
                ephemeral=True
            )
            await view.wait()
            if view.value is not True:
                # Cancelled or timed out
                try:
                    await msg_confirm.delete()
                except discord.HTTPException:
                    pass
                await interaction.followup.send("Move cancelled.", ephemeral=True)
                return
            else:
                # Edit the confirmation message to indicate we are copying
                await msg_confirm.edit(content="Copying messages to thread, please wait...", view=None)

        # 3. Check bot permissions
        bot_member = channel.guild.me
        permissions = channel.permissions_for(bot_member)
        missing_perms = []
        if not permissions.manage_messages:
            missing_perms.append("Manage Messages")
        if not permissions.manage_webhooks:
            missing_perms.append("Manage Webhooks")
        if not permissions.create_public_threads:
            missing_perms.append("Create Public Threads")

        if missing_perms:
            await interaction.followup.send(
                f"I am missing the following permissions in this channel to perform this action: {', '.join(missing_perms)}",
                ephemeral=True
            )
            return

        # 4. Create the temporary migration notice in the main channel
        try:
            wait_message = await channel.send(
                f"⚠️ **Migration in progress**: Moving subsequent messages to thread **{thread_name}**. "
                "Please wait before posting new messages in this channel."
            )
        except Exception as e:
            self.cog.log(f"Failed to post migration notice: {e}")
            wait_message = None

        # 5. Create the thread
        try:
            thread = await self.message.create_thread(name=thread_name, auto_archive_duration=10080)
        except Exception as e:
            if wait_message:
                await wait_message.delete()
            await interaction.followup.send(f"Failed to create thread: {e}", ephemeral=True)
            return

        # 6. Get or create webhook
        try:
            webhooks = await channel.webhooks()
            webhook = None
            for wh in webhooks:
                if wh.user == self.cog.bot.user:
                    webhook = wh
                    break
            if webhook is None:
                webhook = await channel.create_webhook(name="FriendlyFire Thread Helper")
        except Exception as e:
            if wait_message:
                await wait_message.delete()
            await thread.delete(reason="Aborted due to webhook retrieval failure.")
            await interaction.followup.send(f"Failed to retrieve/create webhook: {e}", ephemeral=True)
            return

        # 7. Repost messages and record mapping
        mappings = {}
        for msg in messages:
            try:
                # Skip system messages
                if msg.type not in (discord.MessageType.default, discord.MessageType.reply):
                    continue

                # Fetch attachments
                files = []
                for att in msg.attachments:
                    try:
                        files.append(await att.to_file())
                    except Exception as fe:
                        self.cog.log(f"Failed to download attachment {att.filename}: {fe}")

                # Filter embeds to only copy rich ones
                embeds = [emb for emb in msg.embeds if emb.type == 'rich']

                content = msg.content or None
                if not content and not files and not embeds:
                    continue

                # Webhook send with wait=True to get the created message object
                reposted_msg = await webhook.send(
                    content=content,
                    username=msg.author.display_name[:80],
                    avatar_url=msg.author.display_avatar.url,
                    thread=thread,
                    files=files,
                    embeds=embeds,
                    wait=True,
                )
                mappings[str(reposted_msg.id)] = str(msg.id)
            except Exception as e:
                self.cog.log(f"Error reposting message {msg.id}: {e}")
                # We do not abort here to let the moderator finalize/cancel what was copied.
                break

        # 8. Post confirmation message with persistent view
        try:
            confirm_view = ConfirmMoveView(cog=self.cog)
            confirm_msg = await thread.send(
                "### 📝 Move to Thread Confirmation\n"
                "I have copied the messages to this thread.\n"
                "- **Admins**: You can delete any copied messages in this thread that you do not want to keep.\n"
                "- Once you are satisfied, click **Finalize Move** below to delete the corresponding original messages from the main channel.\n"
                "- Click **Cancel Move** to abort the move (no original messages will be deleted).",
                view=confirm_view
            )
        except Exception as e:
            self.cog.log(f"Failed to send confirmation message in thread: {e}")
            if wait_message:
                await wait_message.delete()
            await thread.delete(reason="Aborted due to confirmation message send failure.")
            await interaction.followup.send("Failed to start move transaction: could not send control view in thread.", ephemeral=True)
            return

        # 9. Store the transaction in MongoDB
        collection = await self.cog.bot.mongo.get_collection(interaction.guild_id, "thread_moves")
        await collection.insert_one({
            "thread_id": str(thread.id),
            "channel_id": str(channel.id),
            "confirm_message_id": str(confirm_msg.id),
            "wait_message_id": str(wait_message.id) if wait_message else None,
            "requester_id": str(interaction.user.id),
            "mappings": mappings
        })

        await interaction.followup.send(
            f"Successfully copied messages to <#{thread.id}>! Please review and finalize the move there.",
            ephemeral=True
        )


class Threads(BaseCog):
    def __init__(self, bot: FriendlyFire):
        super().__init__(bot, 'threads', {
            "confirmThreshold": 50,
            "maxMessages": 1000
        })

    @commands.Cog.listener()
    async def on_ready(self):
        self.bot.add_view(ConfirmMoveView(self))
        self.log("Registered persistent confirmation view.")

    @commands.message_command(name="Move to Thread")
    @default_permissions(manage_messages=True)
    async def move_to_thread(self, ctx: discord.ApplicationContext, message: discord.Message):
        # Safety checks
        if not ctx.guild:
            await ctx.respond("This command can only be used in a server.", ephemeral=True)
            return

        if isinstance(message.channel, discord.Thread):
            await ctx.respond("Cannot create a thread inside a thread.", ephemeral=True)
            return

        if message.thread is not None:
            await ctx.respond("A thread already exists on this message.", ephemeral=True)
            return

        # Hard permission check on the invoking user
        if not ctx.author.guild_permissions.manage_messages:
            await ctx.respond("You need the `Manage Messages` permission to use this command.", ephemeral=True)
            return

        # Send modal
        modal = MoveToThreadModal(message=message, cog=self, title="Move Messages to Thread")
        await ctx.send_modal(modal)

    async def delete_messages_helper(self, channel: discord.TextChannel, messages: list[discord.Object]):
        now = datetime.datetime.now(datetime.timezone.utc)
        under_14_days = []
        over_14_days = []

        for msg in messages:
            # discord.Object has a created_at property which returns timezone-aware datetime in UTC
            # Use total_seconds() < 13 days to have a safety margin for bulk delete
            if (now - msg.created_at).total_seconds() < 13 * 86400:
                under_14_days.append(msg)
            else:
                over_14_days.append(msg)

        # Bulk delete under 14 days in chunks of 100
        for i in range(0, len(under_14_days), 100):
            chunk = under_14_days[i:i+100]
            try:
                # TextChannel.delete_messages accepts an iterable of Snowflake (including discord.Object)
                await channel.delete_messages(chunk)
            except discord.HTTPException as e:
                self.log(f"Failed to bulk delete chunk of messages: {e}")
                # Fallback to individual deletion
                for msg in chunk:
                    try:
                        await channel.get_partial_message(msg.id).delete()
                    except discord.HTTPException as de:
                        self.log(f"Failed to delete message {msg.id}: {de}")

        # Delete over 14 days individually
        for msg in over_14_days:
            try:
                await channel.get_partial_message(msg.id).delete()
            except discord.HTTPException as e:
                self.log(f"Failed to delete message {msg.id}: {e}")

def setup(bot):
    bot.add_cog(Threads(bot))
