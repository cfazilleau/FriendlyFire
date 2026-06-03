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
            label=cog.bot.t('threads.modal_field_name', message.guild.id),
            placeholder=cog.bot.t('threads.modal_placeholder', message.guild.id),
            value=default_name,
            required=True,
            max_length=100
        ))

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        thread_name = self.children[0].value
        channel = self.message.channel
        self.cog.log(f"MoveToThreadModal submitted by {interaction.user.name}. Thread name: '{thread_name}'", interaction.guild)

        # Retrieve configurations
        max_messages = self.cog.config.get('maxMessages', interaction.guild_id)
        confirm_threshold = self.cog.config.get('confirmThreshold', interaction.guild_id)

        # 1. Fetch messages after the selected message
        try:
            messages = [msg async for msg in channel.history(after=self.message, oldest_first=True, limit=max_messages + 1)]
        except Exception as e:
            await interaction.followup.send(self.cog.bot.t('threads.error_read_history', interaction.guild_id, error=str(e)), ephemeral=True)
            return

        if not messages:
            await interaction.followup.send(self.cog.bot.t('threads.no_messages', interaction.guild_id), ephemeral=True)
            return

        if len(messages) > max_messages:
            await interaction.followup.send(
                self.cog.bot.t('threads.too_many_messages', interaction.guild_id, max_messages=max_messages),
                ephemeral=True
            )
            return

        # 2. Check if we need confirmation from the user
        if len(messages) > confirm_threshold:
            view = ConfirmCopyView(cog=self.cog, guild_id=interaction.guild_id, requester_id=interaction.user.id)
            msg_confirm = await interaction.followup.send(
                self.cog.bot.t('threads.warning_confirm_title', interaction.guild_id, count=len(messages), thread_name=thread_name, confirm_threshold=confirm_threshold),
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
                await interaction.followup.send(self.cog.bot.t('threads.move_cancelled', interaction.guild_id), ephemeral=True)
                return
            else:
                # Edit the confirmation message to indicate we are copying
                await msg_confirm.edit(content=self.cog.bot.t('threads.copying', interaction.guild_id), view=None)

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
                self.cog.bot.t('threads.missing_permissions', interaction.guild_id, permissions=', '.join(missing_perms)),
                ephemeral=True
            )
            return

        # 4. Create the temporary migration notice in the main channel
        try:
            wait_message = await channel.send(
                self.cog.bot.t('threads.migration_in_progress', interaction.guild_id, thread_name=thread_name)
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
            await interaction.followup.send(self.cog.bot.t('threads.error_create_thread', interaction.guild_id, error=str(e)), ephemeral=True)
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
            await interaction.followup.send(self.cog.bot.t('threads.error_webhook', interaction.guild_id, error=str(e)), ephemeral=True)
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
            confirm_view = ConfirmMoveView(cog=self.cog, guild_id=interaction.guild_id)
            confirm_msg = await thread.send(
                self.cog.bot.t('threads.confirm_box_title', interaction.guild_id),
                view=confirm_view
            )
        except Exception as e:
            self.cog.log(f"Failed to send confirmation message in thread: {e}")
            if wait_message:
                await wait_message.delete()
            await thread.delete(reason="Aborted due to confirmation message send failure.")
            await interaction.followup.send(self.cog.bot.t('threads.start_transaction_failed', interaction.guild_id), ephemeral=True)
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
        self.cog.log(f"Thread '{thread_name}' created and {len(mappings)} messages copied.", interaction.guild)

        await interaction.followup.send(
            self.cog.bot.t('threads.success_copied', interaction.guild_id, thread=f"<#{thread.id}>"),
            ephemeral=True
        )
