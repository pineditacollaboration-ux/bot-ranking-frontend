const { parentPort } = require('worker_threads');
const { generateProfileCard } = require('../utils/profile-canvas-generator');

parentPort.on('message', async (message) => {
  const { type, requestId, playerData, rankingData, playerStats } = message;
  
  if (type === 'generateProfile') {
    try {
      const buffer = await generateProfileCard(playerData);
      parentPort.postMessage({ requestId, success: true, buffer });
    } catch (e) {
      parentPort.postMessage({ requestId, success: false, error: e.message });
    }
  } else {
    // Other types ignored or stubbed
    parentPort.postMessage({ requestId, success: true, buffer: Buffer.from('') });
  }
});
