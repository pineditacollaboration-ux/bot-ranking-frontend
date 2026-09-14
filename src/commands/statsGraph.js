const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { generateEloGraph } = require('../utils/graph');

module.exports = async function statsGraph(message, args, deps) {
    const { Player, MatchHistory, ensurePlayerRecord, COLORS, config } = deps;
    const EMOJIS = config?.emojis || {};

    // Usuario objetivo: mención o autor
    const member = message.mentions.members.first() || message.member;
    const playerDoc = await ensurePlayerRecord(member.id);

    // Buscar historial de partidas (últimas 20)
    // Filtramos donde el usuario esté en team1 o team2
    const matches = await MatchHistory.find({
        $or: [
            { team1: member.id },
            { team2: member.id }
        ]
    }).sort({ date: -1 }).limit(20);

    if (!matches || matches.length < 2) {
        return message.reply(`${EMOJIS.error || '❌'} Necesitas haber jugado al menos 2 partidas para generar una gráfica de rendimiento.`);
    }

    // Ordenar cronológicamente (antiguas -> nuevas) para procesar,
    // pero para el cálculo "hacia atrás" usamos (nuevas -> antiguas)
    const matchesDesc = [...matches]; // Ya vienen desc por el sort
    
    // Puntos actuales
    let currentPoints = playerDoc.currentSeason?.points || 0;
    
    // Array de historia: [PuntosActuales, PuntosAntesDeUltima, PuntosAntesDePenultima, ...]
    const history = [currentPoints]; 

    // Valores aproximados (si no se pasan en deps, usamos defaults)
    const WIN_POINTS = 200;
    const LOSE_POINTS = 200;
    const MVP_POINTS = 80;
    const CREATOR_POINTS = 80;

    // Recorremos desde la más reciente hacia atrás para reconstruir el pasado
    for (const match of matchesDesc) {
        let change = 0;
        
        const isTeam1 = match.team1.includes(member.id);
        const isTeam2 = match.team2.includes(member.id);
        
        // Determinar si ganó
        let won = false;
        if (match.winner === 'team1' && isTeam1) won = true;
        else if (match.winner === 'team2' && isTeam2) won = true;
        
        const wager = match.wager || 0;

        if (won) {
            change += (WIN_POINTS + wager);
        } else {
            change -= (LOSE_POINTS + wager);
        }

        // MVP
        if (match.mvp === member.id) {
            change += MVP_POINTS;
        }
        
        // Creator
        if (match.creator === member.id) {
            change += CREATOR_POINTS;
        }

        // Puntos antes de esta partida = PuntosDespués - Cambio
        const prevPoints = currentPoints - change;
        
        // Guardar en historial
        history.push(prevPoints);
        
        // Actualizar current para la siguiente iteración (que es la partida anterior)
        currentPoints = prevPoints;
    }

    // Ahora history tiene [Fin, ..., Inicio]. Lo invertimos para graficar [Inicio -> Fin]
    const plotData = history.reverse();

    // Generar imagen
    const buffer = await generateEloGraph(
        playerDoc.customName || member.displayName, 
        plotData, 
        playerDoc.profileColor || COLORS.PRIMARY
    );
    
    const attachment = new AttachmentBuilder(buffer, { name: 'graph.png' });

    const embed = new EmbedBuilder()
        .setTitle(`📈 Rendimiento: ${playerDoc.customName || member.displayName}`)
        .setDescription(`Evolución estimada en las últimas **${matches.length}** partidas.\n*Nota: Los valores históricos son aproximados.*`)
        .setColor(playerDoc.profileColor || COLORS.PRIMARY)
        .setImage('attachment://graph.png')
        .setFooter({ text: 'Sistema de Gráficas' })
        .setTimestamp();

    return message.channel.send({ embeds: [embed], files: [attachment] });
};
