/**
 * Image Generation Manager
 * Gestiona el pool de worker threads para generación de imágenes
 * Previene bloqueo del bot principal durante rendering pesado
 */

const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

class ImageGenerationManager {
  constructor(maxWorkers = Math.max(2, os.cpus().length - 1)) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.queue = [];
    this.activeJobs = new Map();
    this.requestId = 0;
    this.initialized = false;
  }

  /**
   * Inicializar el pool de workers
   */
  initialize() {
    if (this.initialized) return;

    try {
      for (let i = 0; i < this.maxWorkers; i++) {
        this.createWorker();
      }
      this.initialized = true;
      console.log(`[ImageManager] Initialized with ${this.maxWorkers} worker threads`);
    } catch (error) {
      console.error('[ImageManager] Failed to initialize workers:', error);
      this.initialized = false;
    }
  }

  /**
   * Crear un nuevo worker thread
   */
  createWorker() {
    try {
      const worker = new Worker(path.join(__dirname, '../workers/imageGenerator.worker.js'));
      
      worker.on('message', (message) => {
        this.handleWorkerMessage(message);
      });

      worker.on('error', (error) => {
        console.error('[ImageManager] Worker error:', error);
        this.workers = this.workers.filter(w => w !== worker);
        this.processQueue();
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.warn(`[ImageManager] Worker exited with code ${code}`);
        }
        this.workers = this.workers.filter(w => w !== worker);
      });

      this.workers.push(worker);
    } catch (error) {
      console.error('[ImageManager] Error creating worker:', error);
    }
  }

  /**
   * Procesar mensaje de worker
   */
  handleWorkerMessage(message) {
    const { requestId } = message;
    if (!requestId) return;

    const job = this.activeJobs.get(requestId);
    if (job) {
      this.activeJobs.delete(requestId);
      
      if (message.success) {
        job.resolve(message);
      } else {
        job.reject(new Error(message.error));
      }
    }

    this.processQueue();
  }

  /**
   * Procesar cola de trabajos
   */
  processQueue() {
    if (this.queue.length === 0) return;
    if (this.workers.length === 0) {
      console.warn('[ImageManager] No workers available');
      return;
    }

    const job = this.queue.shift();
    const worker = this.workers[0];
    
    try {
      worker.postMessage(job.message);
    } catch (error) {
      job.reject(error);
      this.processQueue();
    }
  }

  /**
   * Generar imagen de perfil (async)
   */
  async generateProfile(playerData, theme) {
    return this.submitJob({
      type: 'generateProfile',
      playerData,
      theme
    });
  }

  /**
   * Generar imagen de ranking (async)
   */
  async generateRanking(rankingData, rankingType = 'points') {
    return this.submitJob({
      type: 'generateRanking',
      rankingData,
      rankingType
    });
  }

  /**
   * Generar imagen de estadísticas (async)
   */
  async generateStats(playerStats) {
    return this.submitJob({
      type: 'generateStats',
      playerStats
    });
  }

  /**
   * Enviar trabajo al queue
   */
  submitJob(message) {
    return new Promise((resolve, reject) => {
      this.requestId++;
      const requestId = this.requestId;

      message.requestId = requestId;

      this.activeJobs.set(requestId, { resolve, reject });
      this.queue.push({ message, resolve, reject });

      this.processQueue();

      // Timeout de 60 segundos para trabajos
      const timeout = setTimeout(() => {
        this.activeJobs.delete(requestId);
        reject(new Error('Image generation timeout (60s)'));
      }, 60000);

      const originalResolve = resolve;
      resolve = (result) => {
        clearTimeout(timeout);
        originalResolve(result);
      };

      const originalReject = reject;
      reject = (error) => {
        clearTimeout(timeout);
        originalReject(error);
      };
    });
  }

  /**
   * Obtener estadísticas del manager
   */
  getStats() {
    return {
      workers: this.workers.length,
      maxWorkers: this.maxWorkers,
      queueLength: this.queue.length,
      activeJobs: this.activeJobs.size
    };
  }

  /**
   * Terminar todos los workers
   */
  shutdown() {
    this.workers.forEach(worker => {
      try {
        worker.terminate();
      } catch (error) {
        console.error('[ImageManager] Error terminating worker:', error);
      }
    });
    this.workers = [];
    this.queue = [];
    this.activeJobs.clear();
    this.initialized = false;
    console.log('[ImageManager] Shutdown complete');
  }
}

module.exports = ImageGenerationManager;
