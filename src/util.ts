export enum BotPermissions {
	none						= 0x0,
	generalCreateInvite			= 0x1,
	generalKickMembers			= 0x2,
	generalBanMembers			= 0x4,
	generalAdministrator		= 0x8,
	generalManageChannels		= 0x10,
	generalManageGuild			= 0x20,
	generalChangeNickname		= 0x4000000,
	generalManageNicknames		= 0x8000000,
	generalManageRoles			=0x10000000,
	generalManageWebhooks		=0x20000000,
	generalManageEmojis			=0x40000000,
	generalViewAuditLog			= 0x80,
	generalViewGuildInsights	= 0x80000,
	textAddReactions			= 0x40,
	textReadMessages			= 0x400,
	textSendMessages			= 0x800,
	textSendTTSMessages			= 0x1000,
	textManageMessages			= 0x2000,
	textEmbedLinks				= 0x4000,
	textAttachFiles				= 0x8000,
	textReadMessageHistory		= 0x10000,
	textMentionEveryone			= 0x20000,
	textUseExternalEmojis		= 0x40000,
	textUseSlashCommands		= 0x80000000,
	voiceViewChannel			= 0x400,
	voiceConnect				= 0x100000,
	voiceSpeak					= 0x200000,
	voiceStream					= 0x200,
	voiceMuteMembers			= 0x400000,
	voiceDeafenMembers			= 0x800000,
	voiceMoveMembers			= 0x1000000,
	voiceUseVAD					= 0x2000000,
	voicePrioritySpeaker		= 0x100,
	voiceStageRequestSpeak		= 0x100000000
}

export function getInviteLink(botid: string | undefined, permissions: BotPermissions) : string
{
	if (botid === undefined)
		return 'bot id was undefined';

	return 'https://discord.com/api/oauth2/authorize?client_id=' + botid + '&permissions=' + permissions.toString() + '&scope=bot%20applications.commands';
}