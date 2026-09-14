const { ChannelType, PermissionsBitField } = require('discord.js');

/**
 * Updates the server stats channel (Miembros en call).
 * @param {import('discord.js').Guild} guild - The guild to update.
 * @param {Object} ctx - Context object containing models and utilities.
 */
async function updateServerStats(guild, ctx) {
    const { Setting } = ctx;
    if (!guild) {
        console.log('[Stats Utility] No guild provided');
        return;
    }

    try {
        // Fetch setting ID from DB
        let voiceChanId;

        if (Setting) {
            const voiceSetting = await Setting.findById('serverStatsMembersInVoiceId').lean();
            voiceChanId = voiceSetting?.value;
            console.log('[Stats Utility] Voice channel ID from DB:', voiceChanId);
        }

        if (!voiceChanId) {
            console.log('[Stats Utility] No voice channel ID configured');
            return;
        }

        // Fetch channel
        const voiceChan = await guild.channels.fetch(voiceChanId).catch(async (err) => {
            console.log('[Stats Utility] Error fetching channel:', err.message);
            if (Setting && (err.code === 10003 || err.message.includes('Unknown Channel'))) {
                console.log(`[Stats Utility] Removing stale config for voiceChanId: ${voiceChanId}`);
                await Setting.findByIdAndDelete('serverStatsMembersInVoiceId').catch(() => {});
            }
            return null;
        });
        if (!voiceChan) {
            console.log('[Stats Utility] Channel not found:', voiceChanId);
            return;
        }

        console.log('[Stats Utility] Channel found:', voiceChan.name, 'Type:', voiceChan.type);

        // Count members in voice channels using voiceStates (more accurate)
        const voiceCount = guild.voiceStates.cache.filter(vs => vs.channelId && vs.member && !vs.member.user.bot).size;
        console.log('[Stats Utility] Voice count:', voiceCount);

        // Update channel name
        const desiredName = `Miembros en call: ${voiceCount}`;
        if (voiceChan.name !== desiredName) {
            console.log('[Stats Utility] Updating channel name from', voiceChan.name, 'to', desiredName);
            await voiceChan.setName(desiredName).catch((err) => {
                console.error('[Stats Utility] Error setting channel name:', err.message, 'Code:', err.code);
            });
            console.log('[Stats Utility] Channel name updated successfully');
        } else {
            console.log('[Stats Utility] Channel name already correct:', voiceChan.name);
        }
    } catch (error) {
        console.error('[Stats Utility] Error updating server stats:', error);
    }
}

module.exports = { updateServerStats };
