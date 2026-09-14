// Modulariza la gestión de partidas: selección de acciones y respuestas
module.exports = {
    handleMatchManagementSelection: async function (interaction, matchObj, deps) {
        const { hasPermission, hasStrictStaff, safeReplyEphemeral, StringSelectMenuBuilder, ActionRowBuilder, handleMatchCloseButton } = deps;

        if (!interaction.channel) return;
        // Acknowledge temprano para evitar 'Unknown interaction'
        if (!interaction.replied && !interaction.deferred) {
            // Como es un select menu que no necesariamente actualiza el mensaje, deferimos como update
            await interaction.deferUpdate().catch(() => { });
        }

        const action = interaction.values[0];
        if (!matchObj) {
            console.error('[Match Management] Intento de gestionar partida con matchObj nulo.');
            return interaction.followUp({ content: '❌ Esta partida ya no existe o ha sido cerrada.', ephemeral: true }).catch(() => { });
        }

        const isCreator = interaction.user.id === matchObj.creatorId;
        const team1 = Array.isArray(matchObj.team1) ? matchObj.team1 : [];
        const team2 = Array.isArray(matchObj.team2) ? matchObj.team2 : [];
        const isPlayer = [...team1, ...team2].includes(interaction.user.id);
        const isStaff = hasPermission(interaction.member);
        const hasCloseRole = Array.isArray(deps.CLOSE_APPLY_ROLE_IDS) && interaction.member?.roles?.cache?.some(r => deps.CLOSE_APPLY_ROLE_IDS.includes(r.id));

        // Restringir acceso general al panel: solo participantes o staff
        if (!isPlayer && !isStaff) {
            console.warn(`[Match Management] Acceso denegado para ${interaction.user.tag} en Partida #${matchObj.matchNumber}`);
            return safeReplyEphemeral(interaction, '❌ Solo participantes y staff pueden usar este panel.');
        }

        // Roles específicos que pueden anular partidas (basado en config)
        const { config } = deps;
        const STAFF_CLOSE_ROLES = [
            ...(config?.manageRole || []),
            ...(config?.staffRoleId || []),
            "1484375565975617595", // Admin (fallback)
            "1484375565975617594", // Moderador (fallback)
        ];
        const hasStaffCloseRole = STAFF_CLOSE_ROLES.some(roleId =>
            interaction.member?.roles?.cache?.has(roleId)
        );

        if (action === 'close' && !isCreator && !hasCloseRole) {
            return safeReplyEphemeral(interaction, '❌ Solo el creador o roles autorizados pueden cerrar y aplicar puntos.');
        } else if (action === 'staffclose' && !hasStaffCloseRole) {
            return safeReplyEphemeral(interaction, '❌ Solo usuarios con roles autorizados pueden anular la partida.');
        }
        // Solo el creador o roles autorizados pueden registrar resultados (creator/mvp/winner)
        if (['creator', 'mvp', 'winner'].includes(action) && !isCreator && !hasCloseRole) {
            return safeReplyEphemeral(interaction, '❌ Solo el creador o roles autorizados pueden registrar resultados.');
        }

        const playersUnique = [...new Set([...team1, ...team2])].filter(Boolean);
        // Construir opciones con nombres visibles (no usar menciones en label: Discord no las renderiza en select)
        const optionsPlayers = [];

        // Optimización: Fetch de nombres personalizados en paralelo
        let playerMap = new Map();
        try {
            if (deps.Player) {
                const docs = await deps.Player.find({ _id: { $in: playersUnique } }).select('_id customName').lean();
                docs.forEach(d => {
                    if (d.customName) playerMap.set(d._id, d.customName);
                });
            }
        } catch (e) {
            console.error('Error fetching custom names for match management:', e);
        }

        for (const id of playersUnique) {
            let label = `Usuario (${id})`;
            if (playerMap.has(id)) {
                const custom = playerMap.get(id);
                if (custom && custom.trim().length > 0) {
                    label = custom;
                }
            } else {
                try {
                    const member = interaction.guild.members.cache.get(id) || await interaction.guild.members.fetch(id).catch(() => null);
                    if (member) {
                        const rawName = member.displayName || member.user?.username;
                        // Limpiar tag de rango si existe
                        const cleanName = rawName ? rawName.replace(/RANK\s*\d+\s*\|\s*/, '').trim() : '';
                        if (cleanName.length > 0) {
                            label = cleanName;
                        }
                    }
                } catch (_) { }
            }
            // No incluir mención ni ID en la opción para evitar mostrar IDs
            // Asegurar que label nunca esté vacío
            if (!label || label.trim().length === 0) {
                label = `Usuario ${id}`;
            }
            optionsPlayers.push({ label: label.substring(0, 100), value: id });
        }

        // Safety: Discord strings select menus MUST have at least 1 option and max 25
        if (optionsPlayers.length === 0) {
            optionsPlayers.push({ label: 'Sin jugadores registrados', value: 'none', description: 'No se encontraron jugadores disponibles.' });
        }
        if (optionsPlayers.length > 25) optionsPlayers.length = 25;

        const matchNumber = matchObj.matchNumber;

        let responseMenu = null;
        switch (action) {
            case 'staffclose':
                console.log(`[Match Management] Staff ${interaction.user.tag} inició anulación de Partida #${matchNumber}`);
                return await handleMatchCloseButton(interaction, matchObj, deps, true);
            case 'close':
                // Validar requisitos antes del cierre
                if (!matchObj.selectedWinner || !matchObj.selectedCreator || !matchObj.selectedMVP) {
                    return safeReplyEphemeral(interaction, '⚠️ No puedes cerrar la partida hasta que se elijan **Creador de sala**, **MVP** y **Ganador**.');
                }
                if (!matchObj.idAndPasswordSet) {
                    return safeReplyEphemeral(interaction, '⚠️ No puedes cerrar la partida hasta que se ingrese el **ID** y la **contraseña** de la sala (dos mensajes numéricos en este hilo).');
                }
                {
                    const createdAt = new Date(matchObj.createdAt);
                    const minMs = 10 * 60 * 1000;
                    const owners = deps.BOT_OWNER_ID;
                    const isBotOwner = Array.isArray(owners)
                        ? owners.includes(interaction.user.id)
                        : interaction.user.id === owners;
                    if ((Date.now() - createdAt.getTime() < minMs) && !isBotOwner) {
                        return safeReplyEphemeral(interaction, '⚠️ No puedes cerrar la partida hasta que hayan transcurrido al menos 10 minutos.');
                    }
                }
                return await handleMatchCloseButton(interaction, matchObj, deps, false);
            case 'creator':
                responseMenu = new StringSelectMenuBuilder().setCustomId(`match_response_creator:${matchNumber}`).setPlaceholder('Selecciona al creador de la sala...').addOptions(optionsPlayers);
                break;
            case 'mvp':
                responseMenu = new StringSelectMenuBuilder().setCustomId(`match_response_mvp:${matchNumber}`).setPlaceholder('Selecciona al MVP de la partida...').addOptions(optionsPlayers);
                break;
            case 'winner':
                responseMenu = new StringSelectMenuBuilder().setCustomId(`match_response_winner:${matchNumber}`).setPlaceholder('Selecciona al equipo ganador...').addOptions([{ label: 'Equipo 1', value: 'team1' }, { label: 'Equipo 2', value: 'team2' }]);
                break;
        }

        if (responseMenu) {
            if (!interaction.channel) return;
            const row = new ActionRowBuilder().addComponents(responseMenu);
            console.log(`[Match Management] Enviando menú de selección para acción: ${action}`);
            await safeReplyEphemeral(interaction, {
                content: `Por favor, haz tu selección para **${action.toUpperCase()}**:`,
                components: [row]
            });
        }
    },

    handleMatchResponseSelection: async function (interaction, deps) {
        const { ActiveMatch, matches, updateMatchManagementMessage, safeReplyEphemeral, hasPermission } = deps;
        if (!interaction.channel) return;
        await interaction.deferUpdate().catch(() => { });

        const parts = interaction.customId.split(':');
        const actionType = parts[0].split('_')[2];
        const matchNumber = parseInt(parts[1], 10);

        const matchKey = `${interaction.guild.id}:${matchNumber}`;
        let matchObj = matches.get(matchKey);
        if (!matchObj) {
            matchObj = [...matches.values()].find(m => m.textChannelId === interaction.channelId && m.matchNumber === matchNumber);
        }
        if (!matchObj) {
            const fetched = await ActiveMatch.findById(matchKey).lean();
            if (fetched) {
                matches.set(matchKey, fetched);
                matchObj = fetched;
            }
        }
        if (!matchObj) return interaction.followUp({ content: '❌ Esta partida ya no existe.', ephemeral: true }).catch(() => { });

        // Restringir quién puede registrar resultados: creador o roles autorizados
        const isCreator = interaction.user.id === matchObj.creatorId;
        const hasCloseRole = Array.isArray(deps.CLOSE_APPLY_ROLE_IDS) && interaction.member?.roles?.cache?.some(r => deps.CLOSE_APPLY_ROLE_IDS.includes(r.id));
        if (!isCreator && !hasCloseRole) {
            return safeReplyEphemeral(interaction, '❌ Solo el creador o roles autorizados pueden registrar resultados.');
        }

        const propMap = { creator: 'selectedCreator', mvp: 'selectedMVP', winner: 'selectedWinner' };
        const propToUpdate = propMap[actionType];

        matchObj[propToUpdate] = interaction.values[0];
        await updateMatchManagementMessage(interaction.guild, matchObj, deps);
        await safeReplyEphemeral(interaction, '✅ Tu selección ha sido registrada.');
    },

    updateMatchManagementMessage: async function (guild, matchObj, deps) {
        const { ActiveMatch, EmbedBuilder, ActionRowBuilder } = deps;
        try {
            const matchKey = matchObj._id;
            if (matchKey) {
                const setPayload = {};
                if (typeof matchObj.selectedCreator === 'string') setPayload.selectedCreator = matchObj.selectedCreator;
                if (typeof matchObj.selectedMVP === 'string') setPayload.selectedMVP = matchObj.selectedMVP;
                if (typeof matchObj.selectedWinner === 'string') setPayload.selectedWinner = matchObj.selectedWinner;
                // Intentar guardar en DB, pero si falla continuar con la actualización del mensaje
                await ActiveMatch.updateOne({ _id: matchKey }, { $set: setPayload }).catch(err => {
                    console.warn('[updateMatchManagementMessage] No se pudo guardar en DB, continuando con la actualización del mensaje:', err);
                });
            }
            const channel = guild.channels.cache.get(matchObj.textChannelId) || await guild.channels.fetch(matchObj.textChannelId).catch(() => null);
            const message = channel ? await channel.messages.fetch(matchObj.messageId).catch(() => null) : null;
            if (!message) return;

            const canClose = !!matchObj.selectedWinner && !!matchObj.selectedCreator && !!matchObj.selectedMVP && !!matchObj.idAndPasswordSet;
            const updatedFields = message.embeds[0].fields.map(field => {
                if (field.name.includes('Creador')) return { ...field, value: matchObj.selectedCreator ? `<@${matchObj.selectedCreator}>` : '`Aún no seleccionado`' };
                if (field.name.includes('MVP')) return { ...field, value: matchObj.selectedMVP ? `<@${matchObj.selectedMVP}>` : '`Aún no seleccionado`' };
                if (field.name.includes('Ganador')) return { ...field, value: matchObj.selectedWinner ? (matchObj.selectedWinner === 'team1' ? 'Equipo 1' : 'Equipo 2') : '`Aún no seleccionado`' };
                if (field.name.includes('Datos de Sala')) return { ...field, value: matchObj.idAndPasswordSet ? '`Registrados`' : '`Aún no registrados`' };
                return field;
            });
            if (!updatedFields.some(f => f.name.includes('Datos de Sala'))) {
                const EMOJIS = (deps.config && deps.config.emojis) || {};
                updatedFields.push({ name: `${EMOJIS.id || '🔑'} Datos de Sala`, value: matchObj.idAndPasswordSet ? '`Registrados`' : '`Aún no registrados`', inline: false });
            }
            const updatedEmbed = EmbedBuilder.from(message.embeds[0]).setFields(updatedFields);

            const updatedComponents = message.components.map(row => {
                const newRow = ActionRowBuilder.from(row);
                newRow.components.forEach(comp => {
                    if (comp.customId && comp.customId.includes(':close') && comp.customId.includes('match:')) {
                        comp.setDisabled(!canClose);
                    }
                });
                return newRow;
            });

            await message.edit({ embeds: [updatedEmbed], components: updatedComponents }).catch(() => { });
        } catch (error) {
            console.error('Error en updateMatchManagementMessage:', error);
        }
    }
};
