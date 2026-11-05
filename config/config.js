const path = require("path");

function numberValue(value, fallback, minimum, maximum) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, parsed));
}

function booleanValue(value, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

const port = numberValue(process.env.PORT, 3000, 1, 65535);
const appBaseUrl =
  process.env.APP_BASE_URL || `http://127.0.0.1:${port}`;

module.exports = {
  app: {
    port,
    baseUrl: appBaseUrl,
    publicDirectory: path.join(__dirname, "..", "public"),
    mediaDirectory: path.join(__dirname, "..", "media"),
    dataDirectory: path.join(__dirname, "..", "data"),
    sessionSecret:
      process.env.SESSION_SECRET || "change-session-secret",
    adminSecret:
      process.env.ADMIN_SECRET || "change-admin-secret"
  },

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    redirectUri:
      process.env.SPOTIFY_REDIRECT_URI ||
      `${appBaseUrl}/auth/spotify/callback`,
    scopes: [
      "user-read-private",
      "user-read-currently-playing",
      "user-read-playback-state",
      "user-modify-playback-state",
      "playlist-read-private",
      "playlist-read-collaborative"
    ]
  },

  quiz: {
    requiredCorrect: numberValue(
      process.env.QUIZ_REQUIRED_CORRECT,
      10,
      1,
      1000
    ),
    revealSeconds: numberValue(
      process.env.QUIZ_REVEAL_SECONDS,
      5,
      1,
      60
    ),
    nextRoundSeconds: numberValue(
      process.env.QUIZ_NEXT_ROUND_SECONDS,
      5,
      1,
      60
    ),
    hintOneSeconds: numberValue(
      process.env.QUIZ_HINT_ONE_SECONDS,
      20,
      5,
      300
    ),
    hintTwoSeconds: numberValue(
      process.env.QUIZ_HINT_TWO_SECONDS,
      35,
      10,
      300
    ),
    maxStageSeconds: numberValue(
      process.env.QUIZ_MAX_STAGE_SECONDS,
      60,
      15,
      900
    ),
    autoStart: booleanValue(
      process.env.QUIZ_AUTOSTART,
      false
    ),
    randomOrder: booleanValue(
      process.env.QUIZ_RANDOM_ORDER,
      true
    )
  },

  tiktok: {
    enabled: booleanValue(
      process.env.TIKTOK_ENABLED,
      false
    ),
    username: (process.env.TIKTOK_USERNAME || "")
      .replace(/^@/, "")
      .trim(),
    apiKey: process.env.TIKTOK_API_KEY || "",
    websocketUrl:
      process.env.TIKTOK_WEBSOCKET_URL ||
      "wss://api.tik.tools"
  }
};