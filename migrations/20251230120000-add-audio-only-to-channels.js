'use strict';

const { addColumnIfMissing, removeColumnIfExists } = require('./helpers');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add audio_only column for per-channel audio-only download preference
    // null = inherit global setting, true = audio only (MP3), false = video
    await addColumnIfMissing(queryInterface, 'channels', 'audio_only', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null
    });
  },

  async down (queryInterface, Sequelize) {
    await removeColumnIfExists(queryInterface, 'channels', 'audio_only');
  }
};
