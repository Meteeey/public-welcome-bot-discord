const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema({
  token: String,
  channelID: String,
  aktifRolID: String,
  yetkiliRolID: String,
  aktifDosya: { type: String, default: "aktif.mp3" },
  yetkiliDosya: { type: String, default: "yetkili.mp3" },
});

module.exports = mongoose.model("Settings", SettingsSchema);