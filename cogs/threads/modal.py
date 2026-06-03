import discord
from .views import ConfirmCopyView, ConfirmMoveView

class MoveToThreadModal(discord.ui.Modal):
    def __init__(self, message: discord.Message, cog, *args, **kwargs) -> None:
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
