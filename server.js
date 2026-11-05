"use strict";

require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");

const SpotifyEngine = require("./src/spotify-engine");
const QuizEngine = require("./src/quiz-engine");
const VoteEngine = require("./src/vote-engine");
const LiveController = require("./src/live-controller");
const ShowMomentEngine = require("./src/show-moment-engine");

const VERSION = "8.0.0";
const GAME_MODEL = "single-question-round";

function normalizeInteger(
  value,
  fallback,
  minimum,
  maximum
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(
    minimum,
    Math.min(
      maximum,
      Math.floor(parsed)
    )
  );
}

function normalizeText(
  value,
  maximumLength = 500
) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maximumLength);
}

function normalizeUsername(value) {
  return normalizeText(
    value,
    100
  )
    .replace(/^@+/, "")
    .trim();
}

function normalizeBoolean(
  value,
  fallback = false
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "on"
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off"
    ].includes(normalized)
  ) {
    return false;
  }

  return fallback;
}

function normalizeTimestamp(value) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return Math.floor(parsed);
}

function createId(
  prefix = "event"
) {
  return [
    prefix,
    Date.now(),
    crypto
      .randomBytes(6)
      .toString("hex")
  ].join("-");
}

function createIsoTimestamp() {
  return new Date()
    .toISOString();
}

function serializeError(error) {
  return {
    name:
      normalizeText(
        error?.name,
        100
      ) ||
      "Error",

    message:
      normalizeText(
        error?.message,
        500
      ) ||
      "Nieznany błąd.",

    status:
      Number(
        error?.status ||
        0
      ),

    code:
      normalizeText(
        error?.code,
        100
      ) ||
      "UNKNOWN",

    reason:
      normalizeText(
        error?.reason,
        250
      ),

    retryAfterMs:
      Math.max(
        0,
        Number(
          error?.retryAfterMs ||
          0
        )
      ),

    recoverable:
      Boolean(
        error?.recoverable
      )
  };
}

function decodeFallbackJsonValue(value) {
  return String(value ?? "")
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractFallbackField(
  rawBody,
  fieldName
) {
  const source =
    String(
      rawBody ??
      ""
    );

  const safeFieldName =
    String(fieldName)
      .replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

  const expression =
    new RegExp(
      `"${safeFieldName}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,|})`,
      "i"
    );

  const match =
    source.match(
      expression
    );

  return match
    ? decodeFallbackJsonValue(
        match[1]
      )
    : "";
}

function extractFallbackComment(
  rawBody
) {
  const source =
    String(
      rawBody ??
      ""
    );

  const match =
    source.match(
      /"comment"\s*:\s*"([\s\S]*)"\s*,\s*"webhookKey"\s*:/i
    );

  return match
    ? decodeFallbackJsonValue(
        match[1]
      )
    : extractFallbackField(
        source,
        "comment"
      );
}

function parseStreamToEarnPayload(
  rawBody
) {
  const source =
    String(
      rawBody ??
      ""
    )
      .trim();

  if (!source) {
    throw new Error(
      "StreamToEarn wysłał pusty POST Body."
    );
  }

  try {
    const parsed =
      JSON.parse(
        source
      );

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "POST Body nie jest obiektem."
      );
    }

    return parsed;
  } catch {
    const fallback = {
      event:
        extractFallbackField(
          source,
          "event"
        ),

      userId:
        extractFallbackField(
          source,
          "userId"
        ),

      username:
        extractFallbackField(
          source,
          "username"
        ),

      displayName:
        extractFallbackField(
          source,
          "displayName"
        ),

      uniqueid:
        extractFallbackField(
          source,
          "uniqueid"
        ),

      nickname:
        extractFallbackField(
          source,
          "nickname"
        ),

      comment:
        extractFallbackComment(
          source
        ),

      webhookKey:
        extractFallbackField(
          source,
          "webhookKey"
        )
    };

    const useful =
      fallback.userId ||
      fallback.username ||
      fallback.uniqueid ||
      fallback.displayName ||
      fallback.nickname ||
      fallback.comment;

    if (!useful) {
      throw new Error(
        "Nie udało się odczytać danych StreamToEarn."
      );
    }

    return fallback;
  }
}

const app =
  express();

const PORT =
  normalizeInteger(
    process.env.PORT,
    3000,
    1,
    65535
  );

const HOST =
  normalizeText(
    process.env.HOST ||
    "127.0.0.1",
    250
  );

const NODE_ENV =
  normalizeText(
    process.env.NODE_ENV ||
    "development",
    50
  )
    .toLowerCase();

const IS_PRODUCTION =
  NODE_ENV ===
  "production";

const TRUST_PROXY =
  normalizeBoolean(
    process.env.TRUST_PROXY,
    IS_PRODUCTION
  );

const APP_BASE_URL =
  String(
    process.env.APP_BASE_URL ||
    `http://127.0.0.1:${PORT}`
  )
    .trim()
    .replace(
      /\/+$/,
      ""
    );

const APP_ORIGIN = (() => {
  try {
    return new URL(
      APP_BASE_URL
    ).origin;
  } catch {
    return `http://127.0.0.1:${PORT}`;
  }
})();

const SESSION_SECRET =
  normalizeText(
    process.env.SESSION_SECRET,
    1000
  ) ||
  crypto
    .randomBytes(64)
    .toString("hex");

const STREAMTOEARN_WEBHOOK_KEY =
  normalizeText(
    process.env.STREAMTOEARN_WEBHOOK_KEY,
    500
  );

const ADMIN_API_KEY =
  normalizeText(
    process.env.ADMIN_API_KEY,
    500
  );

const PLAYER_HEARTBEAT_TIMEOUT_MS =
  normalizeInteger(
    process.env.PLAYER_HEARTBEAT_TIMEOUT_MS,
    18000,
    8000,
    120000
  );

const PLAYER_WATCHDOG_INTERVAL_MS =
  normalizeInteger(
    process.env.PLAYER_WATCHDOG_INTERVAL_MS,
    4000,
    1000,
    30000
  );

const SSE_HEARTBEAT_INTERVAL_MS =
  normalizeInteger(
    process.env.SSE_HEARTBEAT_INTERVAL_MS,
    15000,
    5000,
    60000
  );

const STATE_BROADCAST_DEBOUNCE_MS =
  normalizeInteger(
    process.env.STATE_BROADCAST_DEBOUNCE_MS,
    40,
    0,
    1000
  );

const API_RATE_WINDOW_MS =
  normalizeInteger(
    process.env.API_RATE_WINDOW_MS,
    10000,
    1000,
    60000
  );

const API_RATE_MAX_REQUESTS =
  normalizeInteger(
    process.env.API_RATE_MAX_REQUESTS,
    240,
    20,
    5000
  );

if (
  IS_PRODUCTION &&
  !process.env.SESSION_SECRET
) {
  console.warn(
    "[SECURITY] Brak SESSION_SECRET. Sesje OAuth nie przetrwają restartu."
  );
}

if (TRUST_PROXY) {
  app.set(
    "trust proxy",
    1
  );
}

const spotify =
  new SpotifyEngine({
    clientId:
      process.env.SPOTIFY_CLIENT_ID,

    clientSecret:
      process.env.SPOTIFY_CLIENT_SECRET,

    redirectUri:
      process.env.SPOTIFY_REDIRECT_URI ||
      `${APP_BASE_URL}/auth/spotify/callback`,

    requestTimeoutMs:
      normalizeInteger(
        process.env.SPOTIFY_REQUEST_TIMEOUT_MS,
        12000,
        2000,
        60000
      ),

    requestRetries:
      normalizeInteger(
        process.env.SPOTIFY_REQUEST_RETRIES,
        2,
        0,
        5
      ),

    playbackAttempts:
      normalizeInteger(
        process.env.SPOTIFY_PLAYBACK_ATTEMPTS,
        3,
        1,
        6
      ),

    verificationAttempts:
      normalizeInteger(
        process.env.SPOTIFY_VERIFICATION_ATTEMPTS,
        12,
        3,
        40
      ),

    verificationDelayMs:
      normalizeInteger(
        process.env.SPOTIFY_VERIFICATION_DELAY_MS,
        400,
        150,
        3000
      ),

    verificationRequiredSamples:
      normalizeInteger(
        process.env.SPOTIFY_VERIFICATION_SAMPLES,
        2,
        1,
        5
      ),

    verificationProgressMinimumMs:
      normalizeInteger(
        process.env.SPOTIFY_MINIMUM_PROGRESS_MS,
        120,
        1,
        5000
      ),

    playbackSyncTimeoutMs:
      normalizeInteger(
        process.env.SPOTIFY_SYNC_TIMEOUT_MS,
        12000,
        3000,
        60000
      ),

    deviceActivationDelayMs:
      normalizeInteger(
        process.env.SPOTIFY_DEVICE_ACTIVATION_DELAY_MS,
        700,
        100,
        5000
      ),

    deviceCacheMs:
      normalizeInteger(
        process.env.SPOTIFY_DEVICE_CACHE_MS,
        10000,
        1000,
        120000
      )
  });

const quizEngine =
  new QuizEngine({
    recentTrackLimit:
      normalizeInteger(
        process.env.QUIZ_ENGINE_RECENT_TRACK_LIMIT,
        8,
        1,
        100
      ),

    maximumSameQuestionTypeStreak:
      normalizeInteger(
        process.env.QUIZ_MAX_SAME_TYPE_STREAK,
        2,
        1,
        10
      )
  });

const voteEngine =
  new VoteEngine();

const liveController =
  new LiveController({
    spotify,
    quizEngine,
    voteEngine,

    settings: {
      requiredCorrect:
        normalizeInteger(
          process.env.QUIZ_REQUIRED_CORRECT,
          10,
          1,
          1000000
        ),

      artistDurationSeconds:
        normalizeInteger(
          process.env.QUIZ_ARTIST_DURATION,
          45,
          10,
          600
        ),

      titleDurationSeconds:
        normalizeInteger(
          process.env.QUIZ_TITLE_DURATION,
          45,
          10,
          600
        ),

      roundRevealSeconds:
        normalizeInteger(
          process.env.QUIZ_ROUND_REVEAL_SECONDS,
          6,
          1,
          60
        ),

      hintOneSeconds:
        normalizeInteger(
          process.env.QUIZ_HINT_ONE_SECONDS,
          15,
          1,
          600
        ),

      hintTwoSeconds:
        normalizeInteger(
          process.env.QUIZ_HINT_TWO_SECONDS,
          30,
          1,
          600
        ),

      playbackMaxAttempts:
        normalizeInteger(
          process.env.QUIZ_PLAYBACK_MAX_ATTEMPTS,
          3,
          1,
          10
        ),

      playbackSyncTimeoutSeconds:
        normalizeInteger(
          process.env.QUIZ_PLAYBACK_SYNC_TIMEOUT_SECONDS,
          15,
          5,
          60
        ),

      playbackSyncPollMs:
        normalizeInteger(
          process.env.QUIZ_PLAYBACK_SYNC_POLL_MS,
          500,
          200,
          3000
        ),

      playbackRequiredConfirmations:
        normalizeInteger(
          process.env.QUIZ_PLAYBACK_CONFIRMATIONS,
          2,
          1,
          5
        ),

      playbackMinimumProgressMs:
        normalizeInteger(
          process.env.QUIZ_PLAYBACK_MINIMUM_PROGRESS_MS,
          120,
          1,
          5000
        ),

      maxRoundSelectionAttempts:
        normalizeInteger(
          process.env.QUIZ_MAX_ROUND_SELECTION_ATTEMPTS,
          25,
          3,
          500
        ),

      maxConsecutiveSkippedRounds:
        normalizeInteger(
          process.env.QUIZ_MAX_CONSECUTIVE_SKIPS,
          5,
          1,
          50
        ),

      recoveryBreakSeconds:
        normalizeInteger(
          process.env.QUIZ_RECOVERY_BREAK_SECONDS,
          7,
          2,
          120
        ),

      criticalRecoveryBreakSeconds:
        normalizeInteger(
          process.env.QUIZ_CRITICAL_RECOVERY_SECONDS,
          20,
          5,
          300
        ),

      returningCountdownSeconds:
        normalizeInteger(
          process.env.QUIZ_RETURNING_COUNTDOWN_SECONDS,
          3,
          1,
          10
        ),

      healthCheckIntervalSeconds:
        normalizeInteger(
          process.env.QUIZ_HEALTH_CHECK_INTERVAL_SECONDS,
          15,
          5,
          300
        ),

      watchdogIntervalSeconds:
        normalizeInteger(
          process.env.QUIZ_WATCHDOG_INTERVAL_SECONDS,
          8,
          3,
          120
        ),

      watchdogFailureThreshold:
        normalizeInteger(
          process.env.QUIZ_WATCHDOG_FAILURE_THRESHOLD,
          2,
          1,
          10
        ),

      watchdogPositionToleranceMs:
        normalizeInteger(
          process.env.QUIZ_WATCHDOG_TOLERANCE_MS,
          8000,
          1000,
          60000
        ),

      watchdogMinimumAdvanceMs:
        normalizeInteger(
          process.env.QUIZ_WATCHDOG_MINIMUM_ADVANCE_MS,
          500,
          100,
          10000
        ),

      recentlyPlayedLimit:
        normalizeInteger(
          process.env.QUIZ_RECENTLY_PLAYED_LIMIT,
          20,
          1,
          500
        ),

      baseCorrectPoints:
        normalizeInteger(
          process.env.QUIZ_BASE_CORRECT_POINTS,
          100,
          1,
          100000
        ),

      firstPlaceBonus:
        normalizeInteger(
          process.env.QUIZ_FIRST_PLACE_BONUS,
          50,
          0,
          100000
        ),

      secondPlaceBonus:
        normalizeInteger(
          process.env.QUIZ_SECOND_PLACE_BONUS,
          30,
          0,
          100000
        ),

      thirdPlaceBonus:
        normalizeInteger(
          process.env.QUIZ_THIRD_PLACE_BONUS,
          20,
          0,
          100000
        )
    }
  });

const showMomentEngine =
  new ShowMomentEngine({
    minimumDurationMs:
      normalizeInteger(
        process.env.SHOW_MOMENT_MINIMUM_DURATION,
        2000,
        1000,
        60000
      ),

    maximumDurationMs:
      normalizeInteger(
        process.env.SHOW_MOMENT_MAXIMUM_DURATION,
        30000,
        2000,
        120000
      ),

    maximumQueueSize:
      normalizeInteger(
        process.env.SHOW_MOMENT_MAXIMUM_QUEUE,
        25,
        1,
        100
      ),

    duplicateWindowMs:
      normalizeInteger(
        process.env.SHOW_MOMENT_DUPLICATE_WINDOW,
        1500,
        0,
        30000
      )
  });

const applicationState = {
  selectedPlaylist: null,
  tracks: []
};

const streamToEarnState = {
  configured:
    Boolean(
      STREAMTOEARN_WEBHOOK_KEY
    ),

  connected: false,
  status: "waiting",

  totalRequests: 0,
  acceptedRequests: 0,
  rejectedRequests: 0,
  invalidRequests: 0,

  lastRequestAt: null,
  lastAcceptedAt: null,
  lastError: null,
  lastEvent: null
};

const playerRuntime = {
  registered: false,
  connected: false,
  ready: false,
  activated: false,
  stale: true,

  deviceId: null,

  trackUri: null,
  positionMs: 0,
  durationMs: 0,
  paused: true,

  firstReadyAt: null,
  lastReadyAt: null,
  lastHeartbeatAt: null,
  lastStateAt: null,
  lastOfflineAt: null,

  heartbeatCount: 0,
  reconnectCount: 0,
  staleCount: 0,

  lastRequestId: null,
  lastOfflineReason: null,
  lastError: null
};

const sseClients =
  new Map();

const rateBuckets =
  new Map();

let shuttingDown =
  false;

let stateBroadcastTimer =
  null;

let playerWatchdogInterval =
  null;

let streamToEarnStatusTimer =
  null;

app.disable(
  "x-powered-by"
);

app.use(
  helmet({
    contentSecurityPolicy:
      false,

    crossOriginResourcePolicy: {
      policy:
        "cross-origin"
    },

    referrerPolicy: {
      policy:
        "no-referrer"
    },

    hsts:
      IS_PRODUCTION
        ? {
            maxAge:
              15552000,

            includeSubDomains:
              true,

            preload:
              false
          }
        : false
  })
);

app.use(
  (
    request,
    response,
    next
  ) => {
    response.setHeader(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive"
    );

    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );

    response.setHeader(
      "X-Request-Id",
      normalizeText(
        request.headers[
          "x-request-id"
        ],
        100
      ) ||
      createId(
        "request"
      )
    );

    next();
  }
);

function getClientAddress(
  request
) {
  return normalizeText(
    request.ip ||
    request.socket
      ?.remoteAddress ||
    "unknown",
    150
  );
}

function apiRateLimit(
  request,
  response,
  next
) {
  const now =
    Date.now();

  const key =
    `${getClientAddress(
      request
    )}:${request.path}`;

  let bucket =
    rateBuckets.get(
      key
    );

  if (
    !bucket ||
    now >=
      bucket.resetAt
  ) {
    bucket = {
      count: 0,

      resetAt:
        now +
        API_RATE_WINDOW_MS
    };

    rateBuckets.set(
      key,
      bucket
    );
  }

  bucket.count +=
    1;

  if (
    bucket.count >
    API_RATE_MAX_REQUESTS
  ) {
    const retryAfterSeconds =
      Math.max(
        1,
        Math.ceil(
          (
            bucket.resetAt -
            now
          ) /
          1000
        )
      );

    response.setHeader(
      "Retry-After",
      String(
        retryAfterSeconds
      )
    );

    return response
      .status(429)
      .json({
        ok: false,

        code:
          "RATE_LIMITED",

        error:
          "Przekroczono bezpieczny limit żądań.",

        retryAfterSeconds
      });
  }

  next();
}

setInterval(
  () => {
    const now =
      Date.now();

    for (
      const [
        key,
        bucket
      ] of
      rateBuckets.entries()
    ) {
      if (
        now >=
        bucket.resetAt +
        API_RATE_WINDOW_MS
      ) {
        rateBuckets.delete(
          key
        );
      }
    }
  },
  60000
).unref();

function validateAdminRequest(
  request,
  response,
  next
) {
  if (!ADMIN_API_KEY) {
    const origin =
      normalizeText(
        request.headers.origin,
        1000
      );

    if (
      origin &&
      origin !==
        APP_ORIGIN
    ) {
      return response
        .status(403)
        .json({
          ok: false,

          code:
            "INVALID_ORIGIN",

          error:
            "Odrzucono żądanie z nieautoryzowanego Origin."
        });
    }

    return next();
  }

  const supplied =
    normalizeText(
      request.headers[
        "x-admin-api-key"
      ] ||
      request.body
        ?.adminApiKey ||
      "",
      500
    );

  if (!supplied) {
    return response
      .status(401)
      .json({
        ok: false,

        code:
          "MISSING_ADMIN_API_KEY",

        error:
          "Brak klucza administratora."
      });
  }

  const expectedBuffer =
    Buffer.from(
      ADMIN_API_KEY,
      "utf8"
    );

  const suppliedBuffer =
    Buffer.from(
      supplied,
      "utf8"
    );

  if (
    expectedBuffer.length !==
      suppliedBuffer.length ||
    !crypto.timingSafeEqual(
      expectedBuffer,
      suppliedBuffer
    )
  ) {
    return response
      .status(403)
      .json({
        ok: false,

        code:
          "INVALID_ADMIN_API_KEY",

        error:
          "Nieprawidłowy klucz administratora."
      });
  }

  next();
}

function validateStreamToEarnKey(
  payload,
  request
) {
  if (
    !STREAMTOEARN_WEBHOOK_KEY
  ) {
    return true;
  }

  const suppliedKey =
    normalizeText(
      payload.webhookKey ||
      request.headers[
        "x-streamtoearn-key"
      ] ||
      "",
      500
    );

  if (!suppliedKey) {
    return false;
  }

  const expected =
    Buffer.from(
      STREAMTOEARN_WEBHOOK_KEY,
      "utf8"
    );

  const supplied =
    Buffer.from(
      suppliedKey,
      "utf8"
    );

  return (
    expected.length ===
      supplied.length &&
    crypto.timingSafeEqual(
      expected,
      supplied
    )
  );
}

function mapVoteReason(
  reason
) {
  return {
    missing_user:
      "Brak identyfikatora użytkownika.",

    invalid_answer:
      "Komentarz nie zawiera odpowiedzi A, B, C lub D.",

    already_voted:
      "Ten użytkownik już zagłosował.",

    quiz_inactive:
      "Quiz nie przyjmuje obecnie odpowiedzi.",

    time_expired:
      "Czas na odpowiedź minął."
  }[reason] ||
  reason ||
  "unknown";
}

function createPlayerRuntimeState() {
  const lastHeartbeatMs =
    playerRuntime.lastHeartbeatAt
      ? new Date(
          playerRuntime
            .lastHeartbeatAt
        ).getTime()
      : 0;

  const heartbeatAgeMs =
    lastHeartbeatMs > 0
      ? Math.max(
          0,
          Date.now() -
          lastHeartbeatMs
        )
      : null;

  const stale =
    !playerRuntime.registered ||
    !playerRuntime.ready ||
    heartbeatAgeMs ===
      null ||
    heartbeatAgeMs >
      PLAYER_HEARTBEAT_TIMEOUT_MS;

  return {
    ...playerRuntime,

    stale,

    heartbeatAgeMs,

    heartbeatTimeoutMs:
      PLAYER_HEARTBEAT_TIMEOUT_MS
  };
}

function createPublicTrack(
  track,
  state
) {
  if (!track) {
    return null;
  }

  const revealed =
    state.phase ===
    "round-reveal";

  return {
    id:
      track.id,

    uri:
      track.uri,

    /*
     * Okładka jest przekazywana
     * do overlayu także podczas pytania,
     * ale overlay może ją zasłonić.
     */
    cover:
      track.cover,

    durationMs:
      track.durationMs,

    /*
     * Nigdy nie ujawniamy odpowiedzi
     * przez API podczas aktywnego pytania.
     */
    artist:
      revealed
        ? (
            track.artist ||
            track.primaryArtist
          )
        : null,

    primaryArtist:
      revealed
        ? track.primaryArtist
        : null,

    title:
      revealed
        ? track.title
        : null,

    album:
      revealed
        ? track.album
        : null,

    year:
      revealed
        ? track.year
        : null
  };
}

function createPublicQuestion(
  question
) {
  if (!question) {
    return null;
  }

  return {
    type:
      question.type,

    question:
      question.question,

    options:
      Array.isArray(
        question.options
      )
        ? question.options
            .map(
              (option) => ({
                letter:
                  option.letter,

                text:
                  option.text
              })
            )
        : []
  };
}

function createPublicLiveState() {
  const state =
    liveController
      .getState();

  const revealed =
    state.phase ===
    "round-reveal";

  return {
    version:
      state.version,

    model:
      GAME_MODEL,

    running:
      Boolean(
        state.running
      ),

    paused:
      Boolean(
        state.paused
      ),

    locked:
      Boolean(
        state.locked
      ),

    phase:
      state.phase,

    /*
     * stage w v8 oznacza typ
     * bieżącego pytania:
     * artist albo title.
     */
    stage:
      state.stage,

    questionType:
      state.stage,

    round:
      state.round,

    roundId:
      state.roundId ||
      null,

    currentTrack:
      createPublicTrack(
        state.currentTrack,
        state
      ),

    question:
      createPublicQuestion(
        state.question
      ),

    requiredCorrect:
      state.requiredCorrect,

    votes: {
      A:
        Number(
          state.votes?.A ||
          0
        ),

      B:
        Number(
          state.votes?.B ||
          0
        ),

      C:
        Number(
          state.votes?.C ||
          0
        ),

      D:
        Number(
          state.votes?.D ||
          0
        )
    },

    correctCount:
      Number(
        state.correctCount ||
        0
      ),

    totalVotes:
      Number(
        state.totalVotes ||
        0
      ),

    uniquePlayers:
      Number(
        state.uniquePlayers ||
        0
      ),

    recentVotes:
      Array.isArray(
        state.recentVotes
      )
        ? state.recentVotes
        : [],

    winners:
      Array.isArray(
        state.winners
      )
        ? state.winners
        : [],

    hint:
      state.hint ||
      null,

    hintLevel:
      Number(
        state.hintLevel ||
        0
      ),

    remainingSeconds:
      state.remainingSeconds,

    countdown:
      state.countdown,

    playback:
      state.playback,

    recovery:
      state.recovery,

    reveal:
      revealed
        ? state.reveal
        : null,

    skippedRounds:
      Number(
        state.skippedRounds ||
        0
      ),

    consecutiveSkippedRounds:
      Number(
        state
          .consecutiveSkippedRounds ||
        0
      ),

    /*
     * Poprawna odpowiedź jest publiczna
     * wyłącznie podczas reveal.
     */
    correctLetter:
      revealed
        ? (
            state.correctLetter ||
            state.question
              ?.correctLetter ||
            null
          )
        : null,

    correctAnswer:
      revealed
        ? (
            state.correctAnswer ||
            state.question
              ?.correctAnswer ||
            null
          )
        : null,

    lastTransitionAt:
      state.lastTransitionAt
  };
}

function createStreamState() {
  return {
    ...streamToEarnState,

    lastEvent:
      streamToEarnState
        .lastEvent
        ? {
            ...streamToEarnState
              .lastEvent
          }
        : null
  };
}

function createPublicState() {
  return {
    version:
      VERSION,

    gameModel:
      GAME_MODEL,

    serverTime:
      createIsoTimestamp(),

    spotify:
      spotify
        .getConnectionState(),

    playerRuntime:
      createPlayerRuntimeState(),

    streamToEarn:
      createStreamState(),

    selectedPlaylist:
      applicationState
        .selectedPlaylist
        ? {
            ...applicationState
              .selectedPlaylist
          }
        : null,

    library: {
      trackCount:
        applicationState
          .tracks
          .length,

      ...quizEngine
        .getStats()
    },

    settings: {
      ...liveController
        .settings
    },

    leaderboard:
      liveController
        .getLeaderboard(),

    quiz:
      createPublicLiveState(),

    showMoment:
      showMomentEngine
        .getState()
  };
}

function writeSse(
  client,
  payload
) {
  try {
    client.response.write(
      payload
    );

    client.lastWriteAt =
      Date.now();

    return true;
  } catch {
    try {
      client.response.end();
    } catch {
      // Połączenie jest już zamknięte.
    }

    sseClients.delete(
      client.id
    );

    return false;
  }
}

function broadcastRaw(
  payload
) {
  for (
    const client of
    sseClients.values()
  ) {
    writeSse(
      client,
      payload
    );
  }
}

function broadcastStateNow() {
  clearTimeout(
    stateBroadcastTimer
  );

  stateBroadcastTimer =
    null;

  broadcastRaw(
    `data: ${JSON.stringify(
      createPublicState()
    )}\n\n`
  );
}

function broadcastState() {
  if (
    STATE_BROADCAST_DEBOUNCE_MS <=
    0
  ) {
    broadcastStateNow();
    return;
  }

  if (stateBroadcastTimer) {
    return;
  }

  stateBroadcastTimer =
    setTimeout(
      broadcastStateNow,
      STATE_BROADCAST_DEBOUNCE_MS
    );
}

function broadcastSseEvent(
  eventName,
  data
) {
  const safeName =
    normalizeText(
      eventName,
      100
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      );

  if (!safeName) {
    return;
  }

  broadcastRaw(
    `event: ${safeName}\n` +
    `data: ${JSON.stringify(
      data
    )}\n\n`
  );
}

function sendStateResponse(
  response,
  extra = {}
) {
  response.json({
    ok: true,

    ...extra,

    state:
      createPublicState()
  });
}

function updatePlayerRuntime(
  payload,
  options = {}
) {
  const nowIso =
    createIsoTimestamp();

  const incomingDeviceId =
    normalizeText(
      payload.deviceId,
      250
    );

  if (incomingDeviceId) {
    if (
      playerRuntime.deviceId &&
      playerRuntime.deviceId !==
        incomingDeviceId
    ) {
      playerRuntime
        .reconnectCount +=
        1;
    }

    playerRuntime.deviceId =
      incomingDeviceId;
  }

  if (
    options.readyEvent
  ) {
    Object.assign(
      playerRuntime,
      {
        registered: true,
        connected: true,
        ready: true,
        stale: false,

        lastReadyAt:
          nowIso,

        firstReadyAt:
          playerRuntime
            .firstReadyAt ||
          nowIso
      }
    );
  }

  if (
    payload.connected !==
    undefined
  ) {
    playerRuntime.connected =
      normalizeBoolean(
        payload.connected
      );
  }

  if (
    payload.ready !==
    undefined
  ) {
    playerRuntime.ready =
      normalizeBoolean(
        payload.ready
      );
  }

  if (
    payload.activated !==
    undefined
  ) {
    playerRuntime.activated =
      normalizeBoolean(
        payload.activated
      );
  }

  if (
    payload.paused !==
    undefined
  ) {
    playerRuntime.paused =
      normalizeBoolean(
        payload.paused,
        true
      );
  }

  playerRuntime.trackUri =
    normalizeText(
      payload.trackUri,
      250
    ) ||
    null;

  playerRuntime.positionMs =
    normalizeInteger(
      payload.positionMs,
      playerRuntime.positionMs,
      0,
      86400000
    );

  playerRuntime.durationMs =
    normalizeInteger(
      payload.durationMs,
      playerRuntime.durationMs,
      0,
      86400000
    );

  const lastStateAt =
    normalizeTimestamp(
      payload.lastStateAt
    );

  if (lastStateAt) {
    playerRuntime.lastStateAt =
      new Date(
        lastStateAt
      ).toISOString();
  }

  playerRuntime.lastHeartbeatAt =
    nowIso;

  playerRuntime.heartbeatCount +=
    1;

  playerRuntime.lastRequestId =
    normalizeText(
      payload.requestId,
      150
    ) ||
    playerRuntime.lastRequestId;

  playerRuntime.lastError =
    null;

  playerRuntime.stale =
    false;
}

async function markPlayerOffline(
  reason,
  deviceId = null
) {
  const normalizedReason =
    normalizeText(
      reason,
      150
    ) ||
    "unknown";

  const normalizedDeviceId =
    normalizeText(
      deviceId,
      250
    );

  Object.assign(
    playerRuntime,
    {
      registered: false,
      connected: false,
      ready: false,
      activated: false,
      stale: true,
      paused: true,

      lastOfflineAt:
        createIsoTimestamp(),

      lastOfflineReason:
        normalizedReason
    }
  );

  if (
    !normalizedDeviceId ||
    playerRuntime.deviceId ===
      normalizedDeviceId
  ) {
    playerRuntime.deviceId =
      null;
  }

  spotify.unregisterQuizPlayer(
    normalizedDeviceId ||
    null
  );

  broadcastSseEvent(
    "player-offline",
    {
      reason:
        normalizedReason,

      deviceId:
        normalizedDeviceId ||
        null,

      time:
        createIsoTimestamp()
    }
  );

  broadcastState();
}

function startPlayerWatchdog() {
  if (
    playerWatchdogInterval
  ) {
    clearInterval(
      playerWatchdogInterval
    );
  }

  playerWatchdogInterval =
    setInterval(
      () => {
        if (
          shuttingDown ||
          !playerRuntime.registered ||
          !playerRuntime
            .lastHeartbeatAt
        ) {
          return;
        }

        const age =
          Date.now() -
          new Date(
            playerRuntime
              .lastHeartbeatAt
          ).getTime();

        if (
          age <=
          PLAYER_HEARTBEAT_TIMEOUT_MS
        ) {
          return;
        }

        playerRuntime.staleCount +=
          1;

        void markPlayerOffline(
          "heartbeat_timeout",
          playerRuntime.deviceId
        );
      },
      PLAYER_WATCHDOG_INTERVAL_MS
    );

  playerWatchdogInterval
    .unref();
}

function startStreamToEarnWatchdog() {
  if (
    streamToEarnStatusTimer
  ) {
    clearInterval(
      streamToEarnStatusTimer
    );
  }

  streamToEarnStatusTimer =
    setInterval(
      () => {
        if (
          !streamToEarnState
            .connected ||
          !streamToEarnState
            .lastRequestAt
        ) {
          return;
        }

        const age =
          Date.now() -
          new Date(
            streamToEarnState
              .lastRequestAt
          ).getTime();

        if (
          age >
          5 *
          60 *
          1000
        ) {
          streamToEarnState.status =
            "idle";
        }
      },
      30000
    );

  streamToEarnStatusTimer
    .unref();
}

liveController.on(
  "state",
  broadcastState
);

liveController.on(
  "leaderboard",
  broadcastState
);

liveController.on(
  "diagnostic",
  (diagnostic) => {
    console.log(
      `[LIVE:${diagnostic.type}]`,
      diagnostic.error
        ?.code ||
      ""
    );

    broadcastSseEvent(
      "live-diagnostic",
      diagnostic
    );
  }
);

showMomentEngine.on(
  "show",
  (payload) => {
    broadcastSseEvent(
      "show-moment",
      payload
    );

    broadcastState();
  }
);

showMomentEngine.on(
  "stop",
  (payload) => {
    broadcastSseEvent(
      "show-moment-stop",
      payload
    );

    broadcastState();
  }
);

showMomentEngine.on(
  "clear",
  (payload) => {
    broadcastSseEvent(
      "show-moment-clear",
      payload
    );

    broadcastState();
  }
);

showMomentEngine.on(
  "update",
  (payload) => {
    broadcastSseEvent(
      "show-moment-update",
      payload
    );

    broadcastState();
  }
);

showMomentEngine.on(
  "state",
  (payload) => {
    broadcastSseEvent(
      "show-moment-state",
      payload
    );
  }
);

app.post(
  "/api/streamtoearn/chat",

  apiRateLimit,

  express.text({
    type: "*/*",
    limit: "100kb"
  }),

  (
    request,
    response
  ) => {
    streamToEarnState
      .totalRequests +=
      1;

    streamToEarnState
      .lastRequestAt =
      createIsoTimestamp();

    let payload;

    try {
      payload =
        parseStreamToEarnPayload(
          request.body
        );
    } catch (error) {
      Object.assign(
        streamToEarnState,
        {
          connected: true,
          status:
            "invalid-payload",

          invalidRequests:
            streamToEarnState
              .invalidRequests +
            1,

          lastError:
            error.message
        }
      );

      broadcastState();

      return response
        .status(400)
        .json({
          ok: false,
          received: true,
          accepted: false,

          code:
            "INVALID_PAYLOAD",

          error:
            error.message
        });
    }

    if (
      !validateStreamToEarnKey(
        payload,
        request
      )
    ) {
      Object.assign(
        streamToEarnState,
        {
          connected: true,

          status:
            "unauthorized",

          rejectedRequests:
            streamToEarnState
              .rejectedRequests +
            1,

          lastError:
            "Nieprawidłowy klucz webhooka."
        }
      );

      broadcastState();

      return response
        .status(401)
        .json({
          ok: false,
          received: true,
          accepted: false,

          code:
            "INVALID_WEBHOOK_KEY",

          error:
            "Nieprawidłowy klucz webhooka."
        });
    }

    const userId =
      normalizeUsername(
        payload.userId ||
        payload.uniqueid ||
        payload.uniqueId ||
        payload.username ||
        payload.displayName ||
        payload.nickname
      );

    const username =
      normalizeUsername(
        payload.username ||
        payload.uniqueid ||
        payload.uniqueId ||
        userId
      );

    const displayName =
      normalizeText(
        payload.displayName ||
        payload.nickname ||
        username ||
        userId,
        100
      );

    const comment =
      normalizeText(
        payload.comment ||
        payload.message ||
        payload.text,
        500
      );

    Object.assign(
      streamToEarnState,
      {
        connected: true,
        status:
          "receiving",

        lastError:
          null
      }
    );

    if (
      !userId ||
      !comment
    ) {
      streamToEarnState
        .invalidRequests +=
        1;

      streamToEarnState
        .lastError =
        "Brak userId lub comment.";

      broadcastState();

      return response
        .status(400)
        .json({
          ok: false,
          received: true,
          accepted: false,

          code:
            "MISSING_VOTE_DATA",

          error:
            "Brak identyfikatora użytkownika lub komentarza."
        });
    }

    const result =
      liveController
        .handleVote({
          userId:
            `streamtoearn:${userId.toLowerCase()}`,

          username:
            username ||
            userId,

          displayName:
            displayName ||
            username ||
            userId,

          comment,

          source:
            "streamtoearn"
        });

    if (
      result.accepted
    ) {
      streamToEarnState
        .acceptedRequests +=
        1;

      streamToEarnState
        .lastAcceptedAt =
        createIsoTimestamp();
    } else {
      streamToEarnState
        .rejectedRequests +=
        1;
    }

    streamToEarnState
      .lastEvent = {
        username:
          username ||
          userId,

        displayName:
          displayName ||
          username ||
          userId,

        comment,

        receivedAt:
          createIsoTimestamp(),

        accepted:
          Boolean(
            result.accepted
          ),

        reason:
          result.accepted
            ? null
            : result.reason,

        letter:
          result.vote?.letter ||
          null,

        isCorrect:
          Boolean(
            result.vote
              ?.isCorrect
          ),

        earnedPoints:
          Number(
            result.earnedPoints ||
            0
          )
      };

    broadcastState();

    return response.json({
      ok: true,
      received: true,

      accepted:
        Boolean(
          result.accepted
        ),

      reason:
        result.accepted
          ? null
          : result.reason,

      message:
        result.accepted
          ? result.vote
              ?.isCorrect
            ? "Poprawna odpowiedź."
            : "Głos przyjęty."
          : mapVoteReason(
              result.reason
            ),

      vote:
        result.accepted
          ? {
              letter:
                result.vote
                  .letter,

              isCorrect:
                result.vote
                  .isCorrect,

              earnedPoints:
                result
                  .earnedPoints ||
                0
            }
          : null
    });
  }
);

app.use(
  express.json({
    limit: "250kb",
    strict: true
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "50kb"
  })
);

app.use(
  "/api",
  apiRateLimit
);

app.use(
  session({
    name:
      "pn_session",

    secret:
      SESSION_SECRET,

    resave: false,
    saveUninitialized: false,
    rolling: true,

    cookie: {
      path: "/",
      httpOnly: true,
      sameSite:
        "lax",

      secure:
        IS_PRODUCTION
          ? "auto"
          : false,

      maxAge:
        24 *
        60 *
        60 *
        1000
    }
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    ),
    {
      etag: true,
      fallthrough: true,
      index: false,

      maxAge:
        IS_PRODUCTION
          ? "1h"
          : 0
    }
  )
);

app.get(
  "/",
  (
    request,
    response
  ) => {
    response.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

app.get(
  "/overlay",
  (
    request,
    response
  ) => {
    response.sendFile(
      path.join(
        __dirname,
        "public",
        "overlay.html"
      )
    );
  }
);

app.get(
  "/player",
  (
    request,
    response
  ) => {
    response.sendFile(
      path.join(
        __dirname,
        "public",
        "player.html"
      )
    );
  }
);

app.get(
  "/health",
  (
    request,
    response
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    response.json({
      ok:
        !shuttingDown,

      version:
        VERSION,

      gameModel:
        GAME_MODEL,

      environment:
        NODE_ENV,

      shuttingDown,

      spotifyConfigured:
        spotify.isConfigured(),

      spotifyConnected:
        spotify.isConnected(),

      spotifyPlayer:
        spotify
          .getQuizPlayerState(),

      playerRuntime:
        createPlayerRuntimeState(),

      streamToEarnConfigured:
        streamToEarnState
          .configured,

      streamToEarnConnected:
        streamToEarnState
          .connected,

      showMoment:
        showMomentEngine
          .getState(),

      quiz:
        createPublicLiveState(),

      diagnostics:
        typeof liveController
          .getRuntimeDiagnostics ===
          "function"
          ? liveController
              .getRuntimeDiagnostics()
          : null,

      sseClients:
        sseClients.size,

      panel:
        APP_BASE_URL,

      overlay:
        `${APP_BASE_URL}/overlay`,

      player:
        `${APP_BASE_URL}/player`,

      time:
        createIsoTimestamp()
    });
  }
);

app.get(
  "/auth/spotify",
  (
    request,
    response
  ) => {
    if (
      !spotify.isConfigured()
    ) {
      return response
        .status(500)
        .send(
          "Spotify API nie jest skonfigurowane."
        );
    }

    const oauthState =
      crypto
        .randomBytes(32)
        .toString("hex");

    request.session
      .spotifyOAuthState =
      oauthState;

    return response.redirect(
      spotify
        .getAuthorizationUrl(
          oauthState
        )
    );
  }
);

app.get(
  "/auth/spotify/callback",
  async (
    request,
    response
  ) => {
    const code =
      normalizeText(
        request.query.code,
        2000
      );

    const returnedState =
      normalizeText(
        request.query.state,
        500
      );

    const spotifyError =
      normalizeText(
        request.query.error,
        500
      );

    const expectedState =
      normalizeText(
        request.session
          .spotifyOAuthState,
        500
      );

    delete request.session
      .spotifyOAuthState;

    if (spotifyError) {
      return response.redirect(
        `/?error=${encodeURIComponent(
          spotifyError
        )}`
      );
    }

    if (
      !code ||
      !returnedState ||
      !expectedState ||
      returnedState !==
        expectedState
    ) {
      return response.redirect(
        "/?error=invalid_oauth_state"
      );
    }

    try {
      await spotify
        .exchangeAuthorizationCode(
          code
        );

      broadcastState();

      return response.redirect(
        "/?spotify=connected"
      );
    } catch (error) {
      return response.redirect(
        `/?error=${encodeURIComponent(
          error.message
        )}`
      );
    }
  }
);

app.get(
  "/api/state",
  (
    request,
    response
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    response.json(
      createPublicState()
    );
  }
);

app.get(
  "/api/events",
  (
    request,
    response
  ) => {
    response.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );

    response.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    response.setHeader(
      "Connection",
      "keep-alive"
    );

    response.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    response.flushHeaders();

    const id =
      createId(
        "sse"
      );

    const client = {
      id,

      response,

      connectedAt:
        Date.now(),

      lastWriteAt:
        Date.now()
    };

    sseClients.set(
      id,
      client
    );

    writeSse(
      client,
      `retry: 3000\n` +
      `event: connected\n` +
      `data: ${JSON.stringify({
        id,

        version:
          VERSION,

        gameModel:
          GAME_MODEL,

        time:
          createIsoTimestamp()
      })}\n\n`
    );

    writeSse(
      client,
      `data: ${JSON.stringify(
        createPublicState()
      )}\n\n`
    );

    const heartbeat =
      setInterval(
        () => {
          writeSse(
            client,
            `event: heartbeat\n` +
            `data: ${JSON.stringify({
              time:
                Date.now()
            })}\n\n`
          );
        },
        SSE_HEARTBEAT_INTERVAL_MS
      );

    request.on(
      "close",
      () => {
        clearInterval(
          heartbeat
        );

        sseClients.delete(
          id
        );
      }
    );
  }
);

app.get(
  "/api/show-moment/status",
  (
    request,
    response
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    response.json({
      ok: true,

      showMoment:
        showMomentEngine
          .getState()
    });
  }
);

app.post(
  "/api/show-moment",
  validateAdminRequest,
  (
    request,
    response
  ) => {
    try {
      const body =
        request.body &&
        typeof request.body ===
          "object" &&
        !Array.isArray(
          request.body
        )
          ? request.body
          : {};

      const command =
        normalizeText(
          body.command ||
          body.action ||
          "show",
          30
        )
          .toLowerCase();

      if (
        [
          "stop",
          "hide",
          "cancel"
        ].includes(
          command
        )
      ) {
        const result =
          showMomentEngine
            .stop({
              clearQueue:
                Boolean(
                  body.clearQueue
                )
            });

        return response.json({
          ok: true,

          command:
            "stop",

          ...result,

          state:
            createPublicState()
        });
      }

      if (
        [
          "clear",
          "clear-queue"
        ].includes(
          command
        )
      ) {
        const result =
          showMomentEngine
            .clearQueue();

        return response.json({
          ok: true,

          command:
            "clear",

          ...result,

          state:
            createPublicState()
        });
      }

      if (
        command ===
        "stop-all"
      ) {
        const result =
          showMomentEngine
            .stop({
              clearQueue:
                true
            });

        return response.json({
          ok: true,

          command:
            "stop-all",

          ...result,

          state:
            createPublicState()
        });
      }

      if (
        command ===
        "update"
      ) {
        const result =
          showMomentEngine
            .update(body);

        return response.json({
          ok: true,

          command:
            "update",

          ...result,

          state:
            createPublicState()
        });
      }

      const result =
        showMomentEngine
          .enqueue(body);

      return response
        .status(
          result.duplicate
            ? 200
            : 201
        )
        .json({
          ok: true,

          command:
            "show",

          accepted:
            result.accepted,

          duplicate:
            result.duplicate,

          moment:
            result.moment,

          showMoment:
            showMomentEngine
              .getState(),

          state:
            createPublicState()
        });
    } catch (error) {
      return response
        .status(400)
        .json({
          ok: false,

          code:
            "SHOW_MOMENT_ERROR",

          error:
            error.message,

          showMoment:
            showMomentEngine
              .getState(),

          state:
            createPublicState()
        });
    }
  }
);

app.post(
  "/api/show-moment/stop",
  validateAdminRequest,
  (
    request,
    response
  ) => {
    const result =
      showMomentEngine
        .stop({
          clearQueue:
            Boolean(
              request.body
                ?.clearQueue
            )
        });

    response.json({
      ok: true,

      ...result,

      showMoment:
        showMomentEngine
          .getState(),

      state:
        createPublicState()
    });
  }
);

app.post(
  "/api/show-moment/clear",
  validateAdminRequest,
  (
    request,
    response
  ) => {
    const result =
      showMomentEngine
        .clearQueue();

    response.json({
      ok: true,

      ...result,

      showMoment:
        showMomentEngine
          .getState(),

      state:
        createPublicState()
    });
  }
);

app.post(
  "/api/show-moment/update",
  validateAdminRequest,
  (
    request,
    response
  ) => {
    try {
      const result =
        showMomentEngine
          .update(
            request.body ||
            {}
          );

      response.json({
        ok: true,

        ...result,

        showMoment:
          showMomentEngine
            .getState(),

        state:
          createPublicState()
      });
    } catch (error) {
      response
        .status(400)
        .json({
          ok: false,

          code:
            "SHOW_MOMENT_UPDATE_ERROR",

          error:
            error.message
        });
    }
  }
);

app.get(
  "/api/spotify/player-token",
  async (
    request,
    response
  ) => {
    try {
      if (
        !spotify.isConnected()
      ) {
        throw Object.assign(
          new Error(
            "Najpierw połącz konto Spotify w panelu."
          ),
          {
            status: 401,

            code:
              "SPOTIFY_NOT_CONNECTED"
          }
        );
      }

      response.setHeader(
        "Cache-Control",
        "no-store, private"
      );

      response.json({
        ok: true,

        accessToken:
          await spotify
            .getPlayerAccessToken()
      });
    } catch (error) {
      response
        .status(
          Number(
            error.status
          ) ||
          401
        )
        .json({
          ok: false,

          code:
            error.code ||
            "PLAYER_TOKEN_ERROR",

          error:
            error.message
        });
    }
  }
);

app.post(
  "/api/spotify/player-ready",
  async (
    request,
    response
  ) => {
    const deviceId =
      normalizeText(
        request.body.deviceId,
        250
      );

    if (!deviceId) {
      return response
        .status(400)
        .json({
          ok: false,

          code:
            "MISSING_DEVICE_ID",

          error:
            "Player nie przekazał device_id."
        });
    }

    try {
      const device =
        await spotify
          .registerQuizPlayer(
            deviceId
          );

      if (
        normalizeBoolean(
          request.body.activate
        )
      ) {
        await spotify
          .transferPlayback(
            deviceId,
            false
          );
      }

      updatePlayerRuntime(
        {
          ...(
            request.body
              .playerState ||
            {}
          ),

          deviceId,

          activated:
            normalizeBoolean(
              request.body.activate,
              playerRuntime
                .activated
            ),

          requestId:
            request.body
              .requestId
        },
        {
          readyEvent:
            true
        }
      );

      broadcastSseEvent(
        "player-ready",
        {
          deviceId,
          device,

          runtime:
            createPlayerRuntimeState()
        }
      );

      broadcastState();

      response.json({
        ok: true,
        device,

        player:
          spotify
            .getQuizPlayerState(),

        runtime:
          createPlayerRuntimeState(),

        state:
          createPublicState()
      });
    } catch (error) {
      playerRuntime.lastError =
        serializeError(
          error
        );

      response
        .status(400)
        .json({
          ok: false,

          code:
            error.code ||
            "PLAYER_READY_ERROR",

          error:
            error.message,

          runtime:
            createPlayerRuntimeState()
        });
    }
  }
);

app.post(
  "/api/spotify/player-heartbeat",
  (
    request,
    response
  ) => {
    const deviceId =
      normalizeText(
        request.body.deviceId,
        250
      );

    if (!deviceId) {
      return response
        .status(400)
        .json({
          ok: false,

          code:
            "MISSING_DEVICE_ID",

          error:
            "Heartbeat Playera nie zawiera deviceId."
        });
    }

    if (
      playerRuntime.deviceId &&
      playerRuntime.deviceId !==
        deviceId
    ) {
      playerRuntime
        .reconnectCount +=
        1;
    }

    updatePlayerRuntime(
      request.body,
      {
        readyEvent:
          false
      }
    );

    if (
      !playerRuntime.registered ||
      spotify
        .getQuizPlayerState()
        .deviceId !==
        deviceId
    ) {
      playerRuntime.registered =
        true;

      playerRuntime.ready =
        true;

      spotify.quizPlayerDeviceId =
        deviceId;

      spotify.quizPlayerReady =
        true;
    }

    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    response.json({
      ok: true,

      receivedAt:
        createIsoTimestamp(),

      runtime:
        createPlayerRuntimeState()
    });
  }
);

app.post(
  "/api/spotify/player-offline",
  async (
    request,
    response
  ) => {
    const deviceId =
      normalizeText(
        request.body.deviceId,
        250
      );

    const reason =
      normalizeText(
        request.body.reason,
        150
      ) ||
      "player_reported_offline";

    await markPlayerOffline(
      reason,
      deviceId ||
      null
    );

    response.json({
      ok: true,

      runtime:
        createPlayerRuntimeState()
    });
  }
);

app.get(
  "/api/spotify/player-status",
  (
    request,
    response
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    response.json({
      ok: true,

      player:
        spotify
          .getQuizPlayerState(),

      runtime:
        createPlayerRuntimeState(),

      sync:
        typeof spotify
          .getPlaybackSyncState ===
          "function"
          ? spotify
              .getPlaybackSyncState()
          : null
    });
  }
);

app.get(
  "/api/spotify/playlists",
  async (
    request,
    response
  ) => {
    try {
      response.json({
        ok: true,

        playlists:
          await spotify
            .getPlaylists()
      });
    } catch (error) {
      response
        .status(400)
        .json({
          ok: false,

          code:
            error.code ||
            "PLAYLISTS_ERROR",

          error:
            error.message
        });
    }
  }
);

app.get(
  "/api/spotify/playback",
  async (
    request,
    response
  ) => {
    try {
      response.setHeader(
        "Cache-Control",
        "no-store"
      );

      response.json({
        ok: true,

        playback:
          await spotify
            .getPlaybackState(),

        player:
          spotify
            .getQuizPlayerState(),

        runtime:
          createPlayerRuntimeState()
      });
    } catch (error) {
      response
        .status(400)
        .json({
          ok: false,

          code:
            error.code ||
            "PLAYBACK_STATE_ERROR",

          error:
            error.message
        });
    }
  }
);

app.post(
  "/api/spotify/select-playlist",
  validateAdminRequest,
  async (
    request,
    response
  ) => {
    const playlistId =
      normalizeText(
        request.body.playlistId,
        150
      );

    if (!playlistId) {
      return response
        .status(400)
        .json({
          ok: false,

          code:
            "MISSING_PLAYLIST_ID",

          error:
            "Nie podano playlisty."
        });
    }

    try {
      await liveController
        .stop();

      const playlists =
        await spotify
          .getPlaylists();

      const playlist =
        playlists.find(
          (item) =>
            item.id ===
            playlistId
        );

      if (!playlist) {
        throw new Error(
          "Nie znaleziono playlisty."
        );
      }

      const tracks =
        await spotify
          .getPlaylistTracks(
            playlistId,
            {
              forceRefresh:
                true
            }
          );

      if (
        !Array.isArray(
          tracks
        ) ||
        tracks.length < 4
      ) {
        throw new Error(
          "Playlista musi zawierać przynajmniej 4 dostępne utwory."
        );
      }

      const imported =
        quizEngine
          .loadTracks(
            tracks
          );

      spotify
        .setSelectedPlaylists(
          [
            playlistId
          ]
        );

      applicationState
        .selectedPlaylist = {
          ...playlist
        };

      applicationState.tracks = [
        ...tracks
      ];

      if (
        typeof liveController
          .clearSessionTrackFailures ===
        "function"
      ) {
        liveController
          .clearSessionTrackFailures();
      }

      broadcastState();

      response.json({
        ok: true,
        playlist,
        imported,

        state:
          createPublicState()
      });
    } catch (error) {
      response
        .status(400)
        .json({
          ok: false,

          code:
            error.code ||
            "PLAYLIST_SELECTION_ERROR",

          error:
            error.message
        });
    }
  }
);

app.post(
  "/api/spotify/disconnect",
  validateAdminRequest,
  async (
    request,
    response
  ) => {
    try {
      await liveController
        .stop();

      spotify.disconnect();

      quizEngine.tracks = [];
      quizEngine.queue = [];
      quizEngine.currentTrack =
        null;
      quizEngine.currentQuestion =
        null;
      quizEngine.currentRound =
        null;

      applicationState
        .selectedPlaylist =
        null;

      applicationState.tracks =
        [];

      liveController
        .leaderboard
        .clear();

      Object.assign(
        playerRuntime,
        {
          registered: false,
          connected: false,
          ready: false,
          activated: false,
          stale: true,

          deviceId: null,

          trackUri: null,
          positionMs: 0,
          durationMs: 0,

          paused: true,

          lastHeartbeatAt:
            null,

          lastStateAt:
            null
        }
      );

      broadcastState();

      sendStateResponse(
        response
      );
    } catch (error) {
      response
        .status(400)
        .json({
          ok: false,

          code:
            error.code ||
            "SPOTIFY_DISCONNECT_ERROR",

          error:
            error.message
        });
    }
  }
);

app.get(
  "/api/streamtoearn/status",
  (
    request,
    response
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    response.json({
      ok: true,

      streamToEarn:
        createStreamState()
    });
  }
);

app.post(
  "/api/streamtoearn/reset-status",
  validateAdminRequest,
  (
    request,
    response
  ) => {
    Object.assign(
      streamToEarnState,
      {
        connected:
          false,

        status:
          "waiting",

        totalRequests:
          0,

        acceptedRequests:
          0,

        rejectedRequests:
          0,

        invalidRequests:
          0,

        lastRequestAt:
          null,

        lastAcceptedAt:
          null,

        lastError:
          null,

        lastEvent:
          null
      }
    );

    broadcastState();

    sendStateResponse(
      response
    );
  }
);

function createQuizAction(
  methodName
) {
  return async (
    request,
    response
  ) => {
    try {
      if (
        typeof liveController[
          methodName
        ] !==
        "function"
      ) {
        throw new Error(
          `Nieobsługiwana akcja quizu: ${methodName}`
        );
      }

      await liveController[
        methodName
      ]();

      sendStateResponse(
        response
      );
    } catch (error) {
      response
        .status(400)
        .json({
          ok: false,

          code:
            error.code ||
            "QUIZ_ACTION_ERROR",

          error:
            error.message,

          state:
            createPublicState()
        });
    }
  };
}

app.post(
  "/api/quiz/start",
  validateAdminRequest,
  async (
    request,
    response
  ) => {
    try {
      if (
        applicationState
          .tracks.length <
        4
      ) {
        throw new Error(
          "Najpierw wczytaj playlistę."
        );
      }

      const player =
        spotify
          .getQuizPlayerState();

      const runtime =
        createPlayerRuntimeState();

      if (
        !player.ready ||
        !player.deviceId ||
        !runtime.registered ||
        !runtime.ready ||
        runtime.stale
      ) {
        throw Object.assign(
          new Error(
            "POLSKA NOSTALGIA PLAYER nie jest gotowy lub jego heartbeat wygasł."
          ),
          {
            code:
              "PLAYER_NOT_READY"
          }
        );
      }

      await liveController
        .start();

      sendStateResponse(
        response
      );
    } catch (error) {
      response
        .status(400)
        .json({
          ok: false,

          code:
            error.code ||
            "QUIZ_START_ERROR",

          error:
            error.message,

          state:
            createPublicState()
        });
    }
  }
);

app.post(
  "/api/quiz/pause",
  validateAdminRequest,
  createQuizAction(
    "pause"
  )
);

app.post(
  "/api/quiz/resume",
  validateAdminRequest,
  createQuizAction(
    "resume"
  )
);

app.post(
  "/api/quiz/next",
  validateAdminRequest,
  createQuizAction(
    "skip"
  )
);

app.post(
  "/api/quiz/reveal",
  validateAdminRequest,
  createQuizAction(
    "reveal"
  )
);

app.post(
  "/api/quiz/stop",
  validateAdminRequest,
  createQuizAction(
    "stop"
  )
);

app.post(
  "/api/quiz/test-comment",
  validateAdminRequest,
  (
    request,
    response
  ) => {
    const username =
      normalizeUsername(
        request.body.username
      );

    const comment =
      normalizeText(
        request.body.comment,
        500
      );

    if (
      !username ||
      !comment
    ) {
      return response
        .status(400)
        .json({
          ok: false,

          code:
            "MISSING_TEST_VOTE",

          error:
            "Podaj użytkownika oraz komentarz."
        });
    }

    const result =
      liveController
        .handleVote({
          userId:
            `test:${username.toLowerCase()}`,

          username,

          displayName:
            username,

          comment,

          source:
            "test"
        });

    response.json({
      ok: true,
      result,

      state:
        createPublicState()
    });
  }
);

app.put(
  "/api/settings",
  validateAdminRequest,
  (
    request,
    response
  ) => {
    try {
      const settings =
        liveController
          .updateSettings(
            request.body ||
            {}
          );

      response.json({
        ok: true,
        settings,

        state:
          createPublicState()
      });
    } catch (error) {
      response
        .status(400)
        .json({
          ok: false,

          code:
            "SETTINGS_ERROR",

          error:
            error.message
        });
    }
  }
);

app.get(
  "/api/diagnostics",
  validateAdminRequest,
  (
    request,
    response
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    response.json({
      ok: true,

      version:
        VERSION,

      gameModel:
        GAME_MODEL,

      playerRuntime:
        createPlayerRuntimeState(),

      spotify:
        typeof spotify
          .getDiagnostics ===
          "function"
          ? spotify
              .getDiagnostics()
          : null,

      quizEngine:
        typeof quizEngine
          .getDiagnostics ===
          "function"
          ? quizEngine
              .getDiagnostics()
          : null,

      live:
        typeof liveController
          .getRuntimeDiagnostics ===
          "function"
          ? liveController
              .getRuntimeDiagnostics()
          : null,

      showMoment:
        showMomentEngine
          .getState(),

      sse: {
        clients:
          sseClients.size
      },

      time:
        createIsoTimestamp()
    });
  }
);

app.use(
  (
    request,
    response
  ) => {
    response
      .status(404)
      .json({
        ok: false,

        code:
          "ENDPOINT_NOT_FOUND",

        error:
          "Nie znaleziono wskazanego endpointu."
      });
  }
);

app.use(
  (
    error,
    request,
    response,
    next
  ) => {
    console.error(
      "[SERVER ERROR]",
      serializeError(
        error
      )
    );

    if (
      response.headersSent
    ) {
      return next(
        error
      );
    }

    if (
      error?.type ===
      "entity.too.large"
    ) {
      return response
        .status(413)
        .json({
          ok: false,

          code:
            "PAYLOAD_TOO_LARGE",

          error:
            "Przesłane dane są zbyt duże."
        });
    }

    if (
      error instanceof
        SyntaxError &&
      error.status ===
        400
    ) {
      return response
        .status(400)
        .json({
          ok: false,

          code:
            "INVALID_JSON",

          error:
            "Niepoprawny format JSON."
        });
    }

    return response
      .status(500)
      .json({
        ok: false,

        code:
          "INTERNAL_SERVER_ERROR",

        error:
          "Wystąpił wewnętrzny błąd serwera."
      });
  }
);

startPlayerWatchdog();
startStreamToEarnWatchdog();

const server =
  app.listen(
    PORT,
    HOST,
    () => {
      console.log("");
      console.log(
        "POLSKA NOSTALGIA LIVE"
      );

      console.log(
        `GAME SHOW ENGINE v${VERSION}`
      );

      console.log(
        `Game model: ${GAME_MODEL}`
      );

      console.log("");

      console.log(
        `Environment: ${NODE_ENV}`
      );

      console.log(
        `Host: ${HOST}:${PORT}`
      );

      console.log(
        `Panel: ${APP_BASE_URL}`
      );

      console.log(
        `Spotify Player: ${APP_BASE_URL}/player`
      );

      console.log(
        `Overlay: ${APP_BASE_URL}/overlay`
      );

      console.log(
        `Health: ${APP_BASE_URL}/health`
      );

      console.log(
        `LIVE FX status: ${APP_BASE_URL}/api/show-moment/status`
      );

      console.log(
        `StreamToEarn: ${APP_BASE_URL}/api/streamtoearn/chat`
      );

      console.log("");

      if (
        IS_PRODUCTION &&
        !APP_BASE_URL
          .startsWith(
            "https://"
          )
      ) {
        console.warn(
          "[SECURITY] Tryb production działa bez HTTPS."
        );
      }
    }
  );

server.keepAliveTimeout =
  65000;

server.headersTimeout =
  70000;

server.requestTimeout =
  30000;

server.on(
  "clientError",
  (
    error,
    socket
  ) => {
    if (
      socket.writable
    ) {
      socket.end(
        "HTTP/1.1 400 Bad Request\r\n\r\n"
      );
    }

    console.warn(
      "[CLIENT ERROR]",
      error.code ||
      error.message
    );
  }
);

server.on(
  "error",
  (error) => {
    if (
      error.code ===
      "EADDRINUSE"
    ) {
      console.error(
        `Port ${PORT} jest już zajęty. Zamknij poprzednią instancję aplikacji.`
      );

      process.exit(1);
    }

    throw error;
  }
);

async function shutdown(
  signal
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown =
    true;

  console.log(
    `Zamykanie aplikacji: ${signal}`
  );

  clearTimeout(
    stateBroadcastTimer
  );

  if (
    playerWatchdogInterval
  ) {
    clearInterval(
      playerWatchdogInterval
    );
  }

  if (
    streamToEarnStatusTimer
  ) {
    clearInterval(
      streamToEarnStatusTimer
    );
  }

  try {
    await liveController
      .stop();
  } catch (error) {
    console.warn(
      "[SHUTDOWN LIVE]",
      error.message
    );
  }

  try {
    showMomentEngine
      .shutdown();
  } catch {
    // ShowMomentEngine może być już wyłączony.
  }

  for (
    const client of
    sseClients.values()
  ) {
    try {
      client.response.write(
        `event: shutdown\n` +
        `data: ${JSON.stringify({
          signal,

          time:
            createIsoTimestamp()
        })}\n\n`
      );

      client.response.end();
    } catch {
      // SSE jest już rozłączone.
    }
  }

  sseClients.clear();

  server.close(
    () => {
      process.exit(0);
    }
  );

  setTimeout(
    () => {
      process.exit(1);
    },
    10000
  ).unref();
}

process.on(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT"
    );
  }
);

process.on(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM"
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "[UNCAUGHT EXCEPTION]",
      error
    );

    void shutdown(
      "uncaughtException"
    );
  }
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "[UNHANDLED REJECTION]",
      error
    );
  }
);