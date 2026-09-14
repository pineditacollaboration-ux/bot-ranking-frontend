// Sistema de backup automático de MongoDB mejorado
// Guarda copias de seguridad de todas las colecciones importantes
// Incluye programación, compresión, notificaciones y restauración

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuración
const BACKUP_DIR = path.join(__dirname, '../../mongo_backup');
const MAX_BACKUPS = 10; // Mantener máximo 10 backups
const BACKUP_COLLECTIONS = [
    'players',
    'matchhistories',
    'activelobbies',
    'activematches',
    'activetempvoices',
    'blacklists',
    'excludeds',
    'invitations',
    'settings',
    'suggestions'
];

// Configuración de programación
const SCHEDULE_CONFIG = {
    fullBackup: '0 2 * * *', // 2 AM diario
    quickBackup: '0 */6 * * *', // Cada 6 horas
    enabled: true
};

// Crear directorio de backup si no existe
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

// Obtener timestamp formateado
function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
}

// Comprimir archivo usando gzip
async function compressFile(filePath) {
    try {
        const compressedPath = `${filePath}.gz`;
        await execAsync(`gzip -c "${filePath}" > "${compressedPath}"`);
        fs.unlinkSync(filePath); // Eliminar original después de comprimir
        return compressedPath;
    } catch (error) {
        console.error('[AutoBackup] Error comprimiendo archivo:', error);
        return filePath; // Retornar original si falla compresión
    }
}

// Descomprimir archivo gzip
async function decompressFile(compressedPath) {
    try {
        const decompressedPath = compressedPath.replace('.gz', '');
        await execAsync(`gunzip -c "${compressedPath}" > "${decompressedPath}"`);
        return decompressedPath;
    } catch (error) {
        console.error('[AutoBackup] Error descomprimiendo archivo:', error);
        return null;
    }
}

// Limpiar backups antiguos
function cleanOldBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        const backupFiles = files.filter(f => f.startsWith('auto_backup_') && (f.endsWith('.json') || f.endsWith('.json.gz')));
        
        if (backupFiles.length > MAX_BACKUPS) {
            // Ordenar por fecha (más antiguos primero)
            backupFiles.sort();
            const toDelete = backupFiles.slice(0, backupFiles.length - MAX_BACKUPS);
            
            toDelete.forEach(file => {
                const filePath = path.join(BACKUP_DIR, file);
                fs.unlinkSync(filePath);
                console.log(`[AutoBackup] 🗑️ Backup antiguo eliminado: ${file}`);
            });
        }
    } catch (error) {
        console.error('[AutoBackup] Error limpiando backups antiguos:', error);
    }
}

// Enviar notificación de backup
async function sendBackupNotification(metadata, type = 'full') {
    // Esta función se puede integrar con el sistema de logs del bot
    console.log(`[AutoBackup] 📢 Notificación: Backup ${type} completado - ${metadata.successful}/${metadata.totalCollections} colecciones`);
    
    // Aquí se podría agregar integración con Discord para notificar al staff
    // if (deps && deps.sendLog) {
    //     const embed = new EmbedBuilder()
    //         .setTitle(`💾 Backup ${type === 'full' ? 'Completo' : 'Rápido'}`)
    //         .setDescription(`Backup completado: ${metadata.successful}/${metadata.totalCollections} colecciones`)
    //         .addFields(
    //             { name: 'Fecha', value: metadata.date, inline: true },
    //             { name: 'Exitosos', value: String(metadata.successful), inline: true },
    //             { name: 'Fallidos', value: String(metadata.failed || 0), inline: true }
    //         )
    //         .setColor(COLORS.SUCCESS);
    //     await deps.sendLog(null, embed, [], 'admin');
    // }
}

// Exportar una colección a JSON
async function exportCollection(collectionName) {
    try {
        const collection = mongoose.connection.db.collection(collectionName);
        const documents = await collection.find({}).toArray();
        
        const filePath = path.join(BACKUP_DIR, `${collectionName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), 'utf8');
        
        console.log(`[AutoBackup] ✅ ${collectionName}: ${documents.length} documentos`);
        return { collection: collectionName, count: documents.length, success: true };
    } catch (error) {
        console.error(`[AutoBackup] ❌ Error exportando ${collectionName}:`, error.message);
        return { collection: collectionName, count: 0, success: false, error: error.message };
    }
}

// Crear backup completo
async function createFullBackup(compress = true) {
    const timestamp = getTimestamp();
    console.log(`[AutoBackup] 🚀 Iniciando backup automático: ${timestamp}`);
    
    ensureBackupDir();
    
    const results = [];
    
    for (const collectionName of BACKUP_COLLECTIONS) {
        const result = await exportCollection(collectionName);
        results.push(result);
    }
    
    // Crear archivo de metadatos del backup
    const metadata = {
        timestamp: timestamp,
        date: new Date().toISOString(),
        collections: results,
        totalCollections: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        compressed: compress
    };
    
    const metadataPath = path.join(BACKUP_DIR, `auto_backup_${timestamp}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    
    // Comprimir si está habilitado
    if (compress) {
        await compressFile(metadataPath);
        // Comprimir también las colecciones individuales
        for (const collectionName of BACKUP_COLLECTIONS) {
            const collectionPath = path.join(BACKUP_DIR, `${collectionName}.json`);
            if (fs.existsSync(collectionPath)) {
                await compressFile(collectionPath);
            }
        }
    }
    
    console.log(`[AutoBackup] 📊 Backup completado: ${metadata.successful}/${metadata.totalCollections} colecciones exitosas`);
    
    if (metadata.failed > 0) {
        console.error(`[AutoBackup] ⚠️ ${metadata.failed} colecciones fallaron`);
    }
    
    // Limpiar backups antiguos
    cleanOldBackups();
    
    // Enviar notificación
    await sendBackupNotification(metadata, 'full');
    
    return metadata;
}

// Backup rápido (solo players y matchhistories)
async function createQuickBackup(compress = true) {
    const timestamp = getTimestamp();
    console.log(`[AutoBackup] ⚡ Iniciando backup rápido: ${timestamp}`);
    
    ensureBackupDir();
    
    const quickCollections = ['players', 'matchhistories'];
    const results = [];
    
    for (const collectionName of quickCollections) {
        const result = await exportCollection(collectionName);
        results.push(result);
    }
    
    const metadata = {
        timestamp: timestamp,
        date: new Date().toISOString(),
        type: 'quick',
        collections: results,
        successful: results.filter(r => r.success).length,
        compressed: compress
    };
    
    const metadataPath = path.join(BACKUP_DIR, `quick_backup_${timestamp}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    
    // Comprimir si está habilitado
    if (compress) {
        await compressFile(metadataPath);
        for (const collectionName of quickCollections) {
            const collectionPath = path.join(BACKUP_DIR, `${collectionName}.json`);
            if (fs.existsSync(collectionPath)) {
                await compressFile(collectionPath);
            }
        }
    }
    
    console.log(`[AutoBackup] ⚡ Backup rápido completado`);
    
    // Enviar notificación
    await sendBackupNotification(metadata, 'quick');
    
    return metadata;
}

// Restaurar desde backup
async function restoreFromBackup(backupTimestamp, collections = null) {
    console.log(`[AutoBackup] 🔄 Iniciando restauración desde backup: ${backupTimestamp}`);
    
    try {
        // Buscar el archivo de metadatos
        const metadataPath = path.join(BACKUP_DIR, `auto_backup_${backupTimestamp}.json`);
        let finalMetadataPath = metadataPath;
        
        // Si no existe, intentar con versión comprimida
        if (!fs.existsSync(metadataPath)) {
            const compressedPath = `${metadataPath}.gz`;
            if (fs.existsSync(compressedPath)) {
                finalMetadataPath = await decompressFile(compressedPath);
            } else {
                throw new Error('Backup no encontrado');
            }
        }
        
        const metadata = JSON.parse(fs.readFileSync(finalMetadataPath, 'utf8'));
        const collectionsToRestore = collections || BACKUP_COLLECTIONS;
        
        const results = [];
        
        for (const collectionName of collectionsToRestore) {
            try {
                const collectionPath = path.join(BACKUP_DIR, `${collectionName}.json`);
                let finalCollectionPath = collectionPath;
                
                // Descomprimir si es necesario
                if (!fs.existsSync(collectionPath)) {
                    const compressedPath = `${collectionPath}.gz`;
                    if (fs.existsSync(compressedPath)) {
                        finalCollectionPath = await decompressFile(compressedPath);
                    }
                }
                
                if (fs.existsSync(finalCollectionPath)) {
                    const documents = JSON.parse(fs.readFileSync(finalCollectionPath, 'utf8'));
                    const collection = mongoose.connection.db.collection(collectionName);
                    
                    // Limpiar colección existente
                    await collection.deleteMany({});
                    
                    // Insertar documentos
                    if (documents.length > 0) {
                        await collection.insertMany(documents);
                    }
                    
                    results.push({ collection: collectionName, restored: documents.length, success: true });
                    console.log(`[AutoBackup] ✅ ${collectionName}: ${documents.length} documentos restaurados`);
                } else {
                    results.push({ collection: collectionName, restored: 0, success: false, error: 'Archivo no encontrado' });
                }
            } catch (error) {
                results.push({ collection: collectionName, restored: 0, success: false, error: error.message });
                console.error(`[AutoBackup] ❌ Error restaurando ${collectionName}:`, error);
            }
        }
        
        const restoreSummary = {
            timestamp: backupTimestamp,
            date: new Date().toISOString(),
            collections: results,
            totalCollections: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        };
        
        console.log(`[AutoBackup] 📊 Restauración completada: ${restoreSummary.successful}/${restoreSummary.totalCollections} colecciones`);
        
        return restoreSummary;
    } catch (error) {
        console.error('[AutoBackup] ❌ Error en restauración:', error);
        throw error;
    }
}

// Listar backups disponibles
function listBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        const backupFiles = files.filter(f => f.startsWith('auto_backup_') && (f.endsWith('.json') || f.endsWith('.json.gz')));
        
        const backups = backupFiles.map(file => {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);
            const isCompressed = file.endsWith('.gz');
            const timestamp = file.replace('auto_backup_', '').replace('.json', '').replace('.gz', '');
            
            return {
                filename: file,
                timestamp: timestamp,
                size: stats.size,
                compressed: isCompressed,
                createdAt: stats.mtime
            };
        }).sort((a, b) => b.createdAt - a.createdAt);
        
        return backups;
    } catch (error) {
        console.error('[AutoBackup] Error listando backups:', error);
        return [];
    }
}

module.exports = {
    createFullBackup,
    createQuickBackup,
    restoreFromBackup,
    listBackups,
    ensureBackupDir,
    cleanOldBackups,
    SCHEDULE_CONFIG
};
