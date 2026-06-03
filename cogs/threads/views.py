import datetime
import discord

class ConfirmCopyView(discord.ui.View):
    def __init__(self, cog, guild_id: int, requester_id: int, *args, **kwargs):
        super().__init__(timeout=60.0, *args, **kwargs)
        self.cog = cog
        self.guild_id = guild_id
        self.requester_id = requester_id
        self.value = None

        # Dynamically localize button labels
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                if child.custom_id == "confirm_copy_btn":
                    child.label = self.cog.bot.t('threads.button_confirm_copy', self.guild_id)
                elif child.custom_id == "cancel_copy_btn":
                    child.label = self.cog.bot.t('threads.button_cancel', self.guild_id)

    @discord.ui.button(label="Confirm Copy", style=discord.ButtonStyle.danger, custom_id="confirm_copy_btn")
    async def confirm(self, button: discord.ui.Button, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message(self.cog.bot.t('threads.requester_lock_confirm', self.guild_id), ephemeral=True)
            return
        self.cog.log(f"ConfirmCopyView: Confirm Copy clicked by {interaction.user.name}.", interaction.guild)
        await interaction.response.defer(ephemeral=True)
        self.value = True
        self.stop()

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary, custom_id="cancel_copy_btn")
    async def cancel(self, button: discord.ui.Button, interaction: discord.Interaction):
        if interaction.user.id != self.requester_id:
            await interaction.response.send_message(self.cog.bot.t('threads.requester_lock_cancel', self.guild_id), ephemeral=True)
            return
        self.cog.log(f"ConfirmCopyView: Cancel clicked by {interaction.user.name}.", interaction.guild)
        await interaction.response.defer(ephemeral=True)
        self.value = False
        self.stop()


class ConfirmMoveView(discord.ui.View):
    def __init__(self, cog, guild_id: int = None):
        super().__init__(timeout=None)
        self.cog = cog
        self.guild_id = guild_id

        # Dynamically localize button labels if guild_id is provided
        if self.guild_id:
            for child in self.children:
                if isinstance(child, discord.ui.Button):
                    if child.custom_id == "finalize_thread_move":
                        child.label = self.cog.bot.t('threads.confirm_button_finalize', self.guild_id)
                    elif child.custom_id == "cancel_thread_move":
                        child.label = self.cog.bot.t('threads.confirm_button_cancel', self.guild_id)

    @discord.ui.button(label="Finalize Move", style=discord.ButtonStyle.success, custom_id="finalize_thread_move")
    async def finalize(self, button: discord.ui.Button, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        collection = await self.cog.bot.mongo.get_collection(interaction.guild_id, "thread_moves")
        transaction = await collection.find_one({"thread_id": str(interaction.channel.id)})
        if not transaction:
            await interaction.followup.send(self.cog.bot.t('threads.no_active_transaction', interaction.guild_id), ephemeral=True)
            return

        # Enforce requester lock
        if str(interaction.user.id) != transaction.get("requester_id"):
            await interaction.followup.send(
                self.cog.bot.t('threads.requester_lock_finalize', interaction.guild_id, user=f"<@{transaction.get('requester_id')}>"),
                ephemeral=True
            )
            return

        thread = interaction.channel
        # Fetch current messages in the thread
        try:
            thread_messages = [msg async for msg in thread.history(limit=None)]
        except Exception as e:
            await interaction.followup.send(self.cog.bot.t('threads.error_read_history_view', interaction.guild_id, error=str(e)), ephemeral=True)
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
                self.cog.bot.t('threads.move_finalized_main', interaction.guild_id, anchor_url=anchor_url, thread=thread.mention)
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
                await interaction.followup.send(self.cog.bot.t('threads.failed_delete_originals', interaction.guild_id, error=str(e)), ephemeral=True)
                return

        # Clean up database
        self.cog.log(f"ConfirmMoveView: Finalize Move clicked in #{interaction.channel.name} by {interaction.user.name}. Deleting {len(original_ids_to_delete)} original messages.", interaction.guild)
        await collection.delete_one({"_id": transaction["_id"]})

        # Try to delete the confirmation message
        confirm_msg_id = int(transaction["confirm_message_id"])
        try:
            confirm_msg = await thread.fetch_message(confirm_msg_id)
            await confirm_msg.delete()
        except discord.NotFound:
            pass

        await interaction.followup.send(self.cog.bot.t('threads.move_finalized_ephemeral', interaction.guild_id), ephemeral=True)
        await thread.send(self.cog.bot.t('threads.move_finalized_thread', interaction.guild_id, user=interaction.user.mention))

    @discord.ui.button(label="Cancel Move", style=discord.ButtonStyle.danger, custom_id="cancel_thread_move")
    async def cancel(self, button: discord.ui.Button, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        collection = await self.cog.bot.mongo.get_collection(interaction.guild_id, "thread_moves")
        transaction = await collection.find_one({"thread_id": str(interaction.channel.id)})
        if not transaction:
            await interaction.followup.send(self.cog.bot.t('threads.no_active_transaction', interaction.guild_id), ephemeral=True)
            return

        # Enforce requester lock
        if str(interaction.user.id) != transaction.get("requester_id"):
            await interaction.followup.send(
                self.cog.bot.t('threads.requester_lock_cancel_final', interaction.guild_id, user=f"<@{transaction.get('requester_id')}>"),
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
        self.cog.log(f"ConfirmMoveView: Cancel Move clicked in #{interaction.channel.name} by {interaction.user.name}. Deleting the thread.", interaction.guild)
        thread = interaction.channel
        try:
            await thread.delete(reason=f"Move cancelled by {interaction.user}")
        except discord.HTTPException as e:
            self.cog.log(f"Failed to delete thread on cancel: {e}")
            await interaction.followup.send(self.cog.bot.t('threads.failed_delete_thread', interaction.guild_id), ephemeral=True)
