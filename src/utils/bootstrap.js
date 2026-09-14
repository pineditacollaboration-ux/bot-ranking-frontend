// src/utils/bootstrap.js
// Centraliza conexión a MongoDB y carga de datos iniciales

const fs = require('fs');
const path = require('path');

module.exports = function createBootstrapUtils({ mongoose, config, Blacklist, Excluded, Setting, EMBED_DEFAULTS }) {
  async function connectToDatabase() {
    if (!config.mongoURL) {
      console.error("❌ No se ha proporcionado una URL de MongoDB en config.json. El bot no puede iniciarse.");
      process.exit(1);
    }
    const maxAttempts = 5;
    const baseDelayMs = 3000;

    // Configurar listeners globales de conexión una sola vez
    if (!mongoose.connection._hasListeners) {
      mongoose.connection.on('error', err => {
        console.error(`[MongoDB] ❌ Error de conexión: ${err.message}`);
      });
      mongoose.connection.on('disconnected', () => {
        console.warn('[MongoDB] ⚠️ Desconectado. Mongoose intentará reconectar automáticamente...');
      });
      mongoose.connection.on('reconnected', () => {
        console.log('[MongoDB] 🔄 Reconectado exitosamente.');
      });
      mongoose.connection._hasListeners = true;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await mongoose.connect(config.mongoURL, {
          maxPoolSize: 20,
          minPoolSize: 5,
          socketTimeoutMS: 300000, // Aumentado a 5 minutos
          connectTimeoutMS: 300000, // Aumentado a 5 minutos
          serverSelectionTimeoutMS: 300000, // Aumentado a 5 minutos
          heartbeatFrequencyMS: 10000,
          maxIdleTimeMS: 60000,
          family: 4, 
          retryWrites: true,
          retryReads: true,
          readPreference: 'nearest', // Usar nearest para mejor latencia
          directConnection: false,
          tls: true,
          w: 'majority',
          // Mongoose specific options
          bufferCommands: true,
          autoIndex: true,
        });
        console.log('[MongoDB] ✅ Conectado exitosamente con pooling y timeouts optimizados');
        return;
      } catch (error) {
        const name = error?.name || 'UnknownError';
        const reasonType = error?.reason?.type || '';
        console.error(`[MongoDB] intento ${attempt}/${maxAttempts} falló: ${name}${reasonType ? ` (${reasonType})` : ''}`);
        
        // Hint for common errors
        if (name === 'MongoNetworkTimeoutError' || name === 'MongoServerSelectionError') {
             console.error('⚠️  [Sugerencia] Verifica que la IP del servidor esté en la Whitelist de MongoDB Atlas.');
        }

        if (attempt < maxAttempts) {
          const waitMs = baseDelayMs * attempt;
          await new Promise(r => setTimeout(r, waitMs));
        } else {
          console.error('❌ Error al conectar a MongoDB, agotados los reintentos');
          process.exit(1);
        }
      }
    }
  }

  async function loadInitialData() {
    // Blacklist en memoria
    const blacklistEntries = await Blacklist.find().lean();
    const blacklistedUsersMap = new Map();
    for (const u of blacklistEntries) {
      const exp = u.expiresAt ? new Date(u.expiresAt).getTime() : null;
      if (exp && Date.now() > exp) {
        try { await Blacklist.findByIdAndDelete(u._id); } catch (_) {}
        continue;
      }
      blacklistedUsersMap.set(u._id, { reason: u.reason, date: u.date, expiresAt: u.expiresAt });
    }

    // Excluidos de cambios de nick
    const excludedDoc = await Excluded.findById('main');
    const excludedSet = new Set((excludedDoc?.excluded || []));
    const excludedFromVoiceMoveSet = new Set((excludedDoc?.excludedFromVoiceMove || []));
    const excludedFromQueueRestrictionSet = new Set((excludedDoc?.excludedFromQueueRestriction || []));

    // Configuraciones
    const settingsDocs = await Setting.find().lean();
    const settingsPatchFromDB = {};
    for (const doc of settingsDocs) {
      if (doc.value !== undefined && doc.value !== null && doc.value !== '') {
        settingsPatchFromDB[doc._id] = doc.value;
      }
    }

    // Leer settings.json como respaldo/valores por defecto
    let settingsFromFile = {};
    try {
      const settingsPath = path.resolve(process.cwd(), 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        settingsFromFile = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('⚠️ No se pudo leer settings.json, continuaré solo con la DB:', e.message);
    }

    // SYNC: La DB tiene prioridad sobre settings.json
    // Solo actualizar la DB si el valor no existe en la DB
    if (Object.keys(settingsFromFile).length > 0) {
        console.log('[Bootstrap] Sincronizando settings.json con MongoDB...');
        for (const [key, value] of Object.entries(settingsFromFile)) {
            if (value !== undefined && value !== null && value !== '' && settingsPatchFromDB[key] === undefined) {
                 await Setting.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
                 settingsPatchFromDB[key] = value;
            }
        }
    }

    // Combinar: la DB tiene prioridad sobre settings.json
    const settingsPatch = { ...settingsFromFile, ...settingsPatchFromDB };
    if (settingsPatch.logChannelId) {
      EMBED_DEFAULTS.logChannelId = settingsPatch.logChannelId;
    } else if (settingsFromFile.logChannelId) {
      EMBED_DEFAULTS.logChannelId = settingsFromFile.logChannelId;
    }

    const configuredKeys = Object.keys(settingsPatch).length;
    console.log(`Configuraciones y listas iniciales cargadas: blacklist=${blacklistedUsersMap.size}, excluidos=${excludedSet.size}, excluidosVoz=${excludedFromVoiceMoveSet.size}, excluidosFila=${excludedFromQueueRestrictionSet.size}, settingsKeys=${configuredKeys}.`);
    return { blacklistedUsersMap, excludedSet, excludedFromVoiceMoveSet, excludedFromQueueRestrictionSet, settingsPatch };
  }

  return { connectToDatabase, loadInitialData };
};
