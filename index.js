const express = require("express");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const config = require("./config.js");


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

const SettingSchema = new mongoose.Schema({
  botToken: String,
  kanalID: String,
  kayitsizRolID: String,
  yetkiliRolID: String,
  kayitsizSes: String,
  yetkiliSes: String,
});
const Setting = mongoose.model("Setting", SettingSchema);


const app = express();
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "public")));

let sunucuAdi = "Sunucu Adı";
let sunucuPFP = "/default.png";
const activeConnections = new Map();
let persistentConnection = null; 


if (!config.token || typeof config.token !== "string" || config.token.length < 50) {
  console.error("❌ Bot token geçersiz veya boş. Lütfen config.js dosyanı kontrol et.");
  process.exit(1);
}

client.login(config.token)
  .then(() => console.log("✅ Bot config token ile giriş yaptı."))
  .catch((err) => {
    console.error("❌ Bot token ile giriş başarısız:", err);
    process.exit(1);
  });


client.once("ready", async () => {
  const guild = client.guilds.cache.first();
  if (guild) {
    sunucuAdi = guild.name;
    sunucuPFP = guild.iconURL({ dynamic: true, size: 128 }) || "/default.png";
    console.log(`🌐 Sunucu bilgileri güncellendi: ${sunucuAdi}`);
  }
});

async function playVoiceForMember(member, settings) {
  const channelId = member.voice?.channelId;
  if (!channelId || channelId !== settings.kanalID) return;

  const hasYetkili = member.roles.cache.has(settings.yetkiliRolID);
  const hasKayitsiz = member.roles.cache.has(settings.kayitsizRolID);

  let fileName = null;

  if (hasYetkili) {
    fileName = settings.yetkiliSes;
  } else if (hasKayitsiz) {
    fileName = settings.kayitsizSes;
  } else {
    return;
  }

  if (!fileName) return;

  const filePath = path.join(__dirname, "uploads", fileName);
  if (!fs.existsSync(filePath)) return;

  const connectionKey = `${channelId}-${fileName}`;
  if (activeConnections.has(connectionKey)) return;

  try {
    if (!persistentConnection) {
      console.warn("⚠️ Bot ses kanalına henüz bağlı değil.");
      return;
    }

    const player = createAudioPlayer();
    const resource = createAudioResource(filePath);

    persistentConnection.subscribe(player);
    player.play(resource);

    activeConnections.set(connectionKey, true);

    player.on(AudioPlayerStatus.Idle, () => {
      activeConnections.delete(connectionKey);
    });

    player.on("error", (err) => {
      console.error("🎧 Ses hatası:", err);
      activeConnections.delete(connectionKey);
    });

    console.log(`🔊 ${member.user.tag} için çalınan ses: ${fileName}`);
  } catch (err) {
    console.error("❌ Ses oynatma hatası:", err);
  }
}


app.get("/", async (req, res) => {
  const ayar = (await Setting.findOne()) || (await new Setting({}).save());
  res.render("index", {
    ayar,
    sunucuAdi,
    sunucuPFP,
    success: undefined,
  });
});


app.post("/kaydet", async (req, res) => {
  const { kanalID, kayitsizRolID, yetkiliRolID } = req.body;
  const kayitsizSes = req.files?.kayitsizSes;
  const yetkiliSes = req.files?.yetkiliSes;
  const data = await Setting.findOne();

  if (kayitsizSes) {
    const kayitsizPath = path.join(__dirname, "uploads", "kayitsiz.mp3");
    await kayitsizSes.mv(kayitsizPath);
    data.kayitsizSes = "kayitsiz.mp3";
  }

  if (yetkiliSes) {
    const yetkiliPath = path.join(__dirname, "uploads", "yetkili.mp3");
    await yetkiliSes.mv(yetkiliPath);
    data.yetkiliSes = "yetkili.mp3";
  }

  data.kanalID = kanalID;
  data.kayitsizRolID = kayitsizRolID;
  data.yetkiliRolID = yetkiliRolID;
  await data.save();

 
  const guild = client.guilds.cache.first();
  if (guild) {
    const voiceChannel = guild.channels.cache.get(kanalID);
    if (voiceChannel && !persistentConnection) {
      try {
        persistentConnection = joinVoiceChannel({
          channelId: kanalID,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false,
        });

        console.log("🔊 Bot ses kanalına bağlandı (7/24).");
      } catch (err) {
        console.error("❌ Kanal bağlantısı hatası:", err);
      }
    }
  }

  res.render("index", {
    ayar: data,
    sunucuAdi,
    sunucuPFP,
    success: "✅ Ayarlar kaydedildi. Bot ses kanalına bağlandı.",
  });
});


client.on("voiceStateUpdate", async (oldState, newState) => {
  const settings = await Setting.findOne();
  if (!settings) return;
  if (!newState.channelId || newState.channelId !== settings.kanalID) return;

  await playVoiceForMember(newState.member, settings);
});


mongoose
  .connect(config.mongoURI)
  .then(() => {
    console.log("📦 MongoDB bağlantısı başarılı.");
    app.listen(config.port, () => {
      console.log(`🌍 Web panel: http://localhost:${config.port}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB bağlantı hatası:", err);
    process.exit(1);
  });
