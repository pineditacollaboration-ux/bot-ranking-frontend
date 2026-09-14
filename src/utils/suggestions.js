// src/utils/suggestions.js
// Utilidad para gestionar sugerencias persistidas en MongoDB

function createSuggestionsUtils({ Suggestion }) {
  if (!Suggestion) throw new Error('Suggestion model is required');

  async function hasPending(userId) {
    const s = await Suggestion.findOne({ userId, status: 'pending' }).lean();
    return !!s;
  }

  async function create({ guildId, channelId, userId, content, messageId }) {
    const doc = new Suggestion({ guildId, channelId, userId, content, messageId, status: 'pending' });
    await doc.save();
    return doc.toObject();
  }

  async function getByUser(userId) {
    // Preferir pendiente, si no, traer la última por fecha
    const pending = await Suggestion.findOne({ userId, status: 'pending' }).lean();
    if (pending) return pending;
    const last = await Suggestion.findOne({ userId }).sort({ createdAt: -1 }).lean();
    return last || null;
  }

  async function getByMessage(messageId) {
    const s = await Suggestion.findOne({ messageId }).lean();
    return s || null;
  }

  async function setStatusByUser(userId, status) {
    const s = await Suggestion.findOneAndUpdate({ userId, status: 'pending' }, { $set: { status } }, { new: true }).lean();
    return s || null;
  }

  async function setStatusByMessage(messageId, status) {
    const s = await Suggestion.findOneAndUpdate({ messageId }, { $set: { status } }, { new: true }).lean();
    return s || null;
  }

  async function hasUserVoted(messageId, voterId) {
    const s = await Suggestion.findOne({ messageId }).select('voters').lean();
    if (!s) return false;
    return !!(s.voters && s.voters[voterId]);
  }

  async function recordVote(messageId, voterId, type) {
    const s = await Suggestion.findOne({ messageId });
    if (!s) return null;
    const prev = s.voters?.get(voterId);
    if (prev) return s.toObject(); // Ya votó, no cambiar

    if (type === 'yes') s.votes.yes++;
    else s.votes.no++;

    s.voters.set(voterId, type);
    await s.save();
    return s.toObject();
  }

  return {
    hasPending,
    create,
    getByUser,
    getByMessage,
    setStatusByUser,
    setStatusByMessage,
    hasUserVoted,
    recordVote,
  };
}

module.exports = createSuggestionsUtils;