"use strict";

const elements = {
  playerStatus:
    document.querySelector(
      "#playerStatus"
    ),

  deviceId:
    document.querySelector(
      "#deviceId"
    ),

  activateButton:
    document.querySelector(
      "#activateButton"
    ),

  trackBox:
    document.querySelector(
      "#trackBox"
    ),

  trackCover:
    document.querySelector(
      "#trackCover"
    ),

  trackTitle:
    document.querySelector(
      "#trackTitle"
    ),

  trackArtist:
    document.querySelector(
      "#trackArtist"
    ),

  errorBox:
    document.querySelector(
      "#errorBox"
    )
};

const PLAYER_SETTINGS = {
  name:
    "POLSKA NOSTALGIA PLAYER",

  volume:
    0.65,

  heartbeatIntervalMs:
    5000,

  stateCheckIntervalMs:
    4000,

  staleStateMs:
    18000,

  readyTimeoutMs:
    15000,

  reconnectBaseDelayMs:
    1000,

  reconnectMaximumDelayMs:
    15000,

  reconnectMaximumAttempts:
    0,

  registrationRetryAttempts:
    4,

  registrationRetryDelayMs:
    750,

  offlineNotificationTimeoutMs:
    2500,

  tokenCacheSafetyMs:
    60000
};

const ENDPOINTS = {
  token:
    "/api/spotify/player-token",

  ready:
    "/api/spotify/player-ready",

  heartbeat:
    "/api/spotify/player-heartbeat",

  offline:
    "/api/spotify/player-offline",

  state:
    "/api/state"
};

let spotifyPlayer = null;
let deviceId = null;

let sdkReady = false;
let playerConnected = false;
let playerReady = false;
let playerActivated = false;

let activating = false;
let connecting = false;
let reconnecting = false;
let destroyed = false;

let reconnectAttempt = 0;
let playerGeneration = 0;
let registrationGeneration = 0;

let reconnectTimer = null;
let readyTimeout = null;
let heartbeatInterval = null;
let stateCheckInterval = null;
let offlineNotificationTimer = null;

let lastSdkStateAt = 0;
let lastHeartbeatAt = 0;
let lastReadyAt = 0;
let lastRegistrationAt = 0;
let lastRecoveryAt = 0;

let currentTrackUri = null;
let currentPositionMs = 0;
let currentDurationMs = 0;
let currentPaused = true;

let cachedAccessToken = null;
let cachedAccessTokenAt = 0;

let consecutiveStateFailures = 0;
let consecutiveHeartbeatFailures = 0;

let recoveryReason = null;

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(
      resolve,
      Math.max(
        0,
        Number(milliseconds) || 0
      )
    );
  });
}

function normalizeText(
  value,
  fallback = ""
) {
  const normalized =
    String(value ?? "").trim();

  return normalized || fallback;
}

function createRequestId(prefix = "player") {
  return [
    prefix,
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2, 10)
  ].join("-");
}

async function request(
  url,
  options = {}
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, 12000);

  try {
    const response =
      await fetch(
        url,
        {
          ...options,

          cache:
            options.cache ||
            "no-store",

          headers: {
            Accept:
              "application/json",

            ...(options.body
              ? {
                  "Content-Type":
                    "application/json"
                }
              : {}),

            ...(options.headers || {})
          },

          signal:
            controller.signal
        }
      );

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      const error =
        new Error(
          data.error ||
          data.message ||
          `HTTP ${response.status}`
        );

      error.status =
        response.status;

      error.code =
        data.code ||
        `HTTP_${response.status}`;

      error.data =
        data;

      throw error;
    }

    return data;
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          "Przekroczono czas oczekiwania na serwer."
        );

      timeoutError.code =
        "REQUEST_TIMEOUT";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function setStatus(
  message,
  status
) {
  if (!elements.playerStatus) {
    return;
  }

  elements.playerStatus.textContent =
    normalizeText(
      message,
      "Nieznany stan"
    );

  elements.playerStatus.className =
    `status ${status}`;
}

function showError(
  message,
  options = {}
) {
  const persistent =
    options.persistent !== false;

  if (elements.errorBox) {
    elements.errorBox.textContent =
      normalizeText(
        message,
        "Nieznany błąd odtwarzacza."
      );

    elements.errorBox.classList.remove(
      "hidden"
    );
  }

  setStatus(
    options.statusText ||
    "Automatyczne odzyskiwanie",
    options.statusClass ||
    "error"
  );

  if (!persistent) {
    setTimeout(() => {
      hideError();
    }, 5000);
  }
}

function hideError() {
  if (!elements.errorBox) {
    return;
  }

  elements.errorBox.classList.add(
    "hidden"
  );

  elements.errorBox.textContent =
    "";
}

function updateDeviceId(
  value
) {
  deviceId =
    normalizeText(value) ||
    null;

  if (elements.deviceId) {
    elements.deviceId.textContent =
      deviceId ||
      "Oczekiwanie...";
  }
}

function setActivateButton(
  state
) {
  if (!elements.activateButton) {
    return;
  }

  const states = {
    loading: {
      disabled: true,
      text:
        "Łączenie z Spotify..."
    },

    ready: {
      disabled: false,
      text:
        "Aktywuj odtwarzacz"
    },

    activating: {
      disabled: true,
      text:
        "Aktywowanie..."
    },

    active: {
      disabled: true,
      text:
        "Odtwarzacz aktywny"
    },

    recovering: {
      disabled: true,
      text:
        "Automatyczne odzyskiwanie..."
    },

    offline: {
      disabled: false,
      text:
        "Połącz ponownie"
    }
  };

  const selected =
    states[state] ||
    states.offline;

  elements.activateButton.disabled =
    selected.disabled;

  elements.activateButton.textContent =
    selected.text;
}

function clearTrackPresentation() {
  currentTrackUri = null;
  currentPositionMs = 0;
  currentDurationMs = 0;
  currentPaused = true;

  elements.trackBox?.classList.add(
    "hidden"
  );

  if (elements.trackCover) {
    elements.trackCover.removeAttribute(
      "src"
    );
  }

  if (elements.trackTitle) {
    elements.trackTitle.textContent =
      "-";
  }

  if (elements.trackArtist) {
    elements.trackArtist.textContent =
      "-";
  }
}

function renderTrack(state) {
  const track =
    state?.track_window
      ?.current_track;

  currentPositionMs =
    Number(
      state?.position ||
      0
    );

  currentDurationMs =
    Number(
      state?.duration ||
      track?.duration_ms ||
      0
    );

  currentPaused =
    Boolean(
      state?.paused
    );

  if (!track) {
    currentTrackUri = null;

    elements.trackBox?.classList.add(
      "hidden"
    );

    return;
  }

  currentTrackUri =
    track.uri ||
    track.id ||
    null;

  elements.trackBox?.classList.remove(
    "hidden"
  );

  if (elements.trackTitle) {
    elements.trackTitle.textContent =
      track.name ||
      "-";
  }

  if (elements.trackArtist) {
    elements.trackArtist.textContent =
      Array.isArray(
        track.artists
      )
        ? track.artists
            .map((artist) => {
              return artist.name;
            })
            .filter(Boolean)
            .join(", ")
        : "-";
  }

  const cover =
    track.album
      ?.images?.[0]?.url ||
    track.album
      ?.images?.[1]?.url ||
    null;

  if (
    cover &&
    elements.trackCover &&
    elements.trackCover
      .getAttribute("src") !==
      cover
  ) {
    elements.trackCover.src =
      cover;
  }
}

function parseSdkError(
  prefix,
  event
) {
  const message =
    event?.message ||
    event?.error?.message ||
    "Nieznany błąd.";

  return `${prefix}: ${message}`;
}

async function getAccessToken(
  forceRefresh = false
) {
  if (
    !forceRefresh &&
    cachedAccessToken &&
    Date.now() -
      cachedAccessTokenAt <
      PLAYER_SETTINGS
        .tokenCacheSafetyMs
  ) {
    return cachedAccessToken;
  }

  const result =
    await request(
      ENDPOINTS.token
    );

  if (!result.accessToken) {
    throw new Error(
      "Serwer nie zwrócił tokenu Spotify."
    );
  }

  cachedAccessToken =
    result.accessToken;

  cachedAccessTokenAt =
    Date.now();

  return cachedAccessToken;
}

function invalidateAccessToken() {
  cachedAccessToken = null;
  cachedAccessTokenAt = 0;
}

async function registerPlayer(
  options = {}
) {
  const targetDeviceId =
    normalizeText(
      options.deviceId ||
      deviceId
    );

  if (!targetDeviceId) {
    throw new Error(
      "Nie można zarejestrować Playera bez deviceId."
    );
  }

  const activate =
    Boolean(
      options.activate
    );

  const generation =
    ++registrationGeneration;

  let lastError = null;

  for (
    let attempt = 1;
    attempt <=
      PLAYER_SETTINGS
        .registrationRetryAttempts;
    attempt += 1
  ) {
    if (
      destroyed ||
      generation !==
        registrationGeneration
    ) {
      return null;
    }

    try {
      const result =
        await request(
          ENDPOINTS.ready,
          {
            method: "POST",

            body:
              JSON.stringify({
                deviceId:
                  targetDeviceId,

                activate,

                requestId:
                  createRequestId(
                    "ready"
                  ),

                playerState: {
                  connected:
                    playerConnected,

                  ready:
                    playerReady,

                  activated:
                    playerActivated,

                  trackUri:
                    currentTrackUri,

                  positionMs:
                    currentPositionMs,

                  durationMs:
                    currentDurationMs,

                  paused:
                    currentPaused,

                  lastStateAt:
                    lastSdkStateAt ||
                    null
                }
              })
          }
        );

      if (
        generation !==
        registrationGeneration
      ) {
        return null;
      }

      lastRegistrationAt =
        Date.now();

      consecutiveHeartbeatFailures =
        0;

      return result;
    } catch (error) {
      lastError =
        error;

      if (
        attempt >=
        PLAYER_SETTINGS
          .registrationRetryAttempts
      ) {
        break;
      }

      await sleep(
        PLAYER_SETTINGS
          .registrationRetryDelayMs *
        attempt
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "Nie udało się zarejestrować Playera."
    )
  );
}

async function sendHeartbeat() {
  if (
    destroyed ||
    !deviceId ||
    !playerConnected ||
    !playerReady
  ) {
    return;
  }

  const payload = {
    deviceId,

    connected:
      playerConnected,

    ready:
      playerReady,

    activated:
      playerActivated,

    paused:
      currentPaused,

    trackUri:
      currentTrackUri,

    positionMs:
      currentPositionMs,

    durationMs:
      currentDurationMs,

    lastStateAt:
      lastSdkStateAt ||
      null,

    sentAt:
      Date.now()
  };

  try {
    await request(
      ENDPOINTS.heartbeat,
      {
        method: "POST",

        body:
          JSON.stringify(
            payload
          )
      }
    );

    lastHeartbeatAt =
      Date.now();

    consecutiveHeartbeatFailures =
      0;
  } catch (error) {
    if (
      error?.status === 404
    ) {
      try {
        await registerPlayer({
          deviceId,
          activate: false
        });

        lastHeartbeatAt =
          Date.now();

        consecutiveHeartbeatFailures =
          0;

        return;
      } catch (fallbackError) {
        error =
          fallbackError;
      }
    }

    consecutiveHeartbeatFailures +=
      1;

    if (
      consecutiveHeartbeatFailures >= 3
    ) {
      scheduleRecovery(
        "heartbeat_failed",
        error
      );
    }
  }
}

function startHeartbeat() {
  stopHeartbeat();

  void sendHeartbeat();

  heartbeatInterval =
    setInterval(() => {
      void sendHeartbeat();
    },
    PLAYER_SETTINGS
      .heartbeatIntervalMs
    );
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(
      heartbeatInterval
    );

    heartbeatInterval =
      null;
  }
}

async function inspectCurrentState() {
  if (
    destroyed ||
    !spotifyPlayer ||
    !playerConnected
  ) {
    return;
  }

  try {
    const state =
      await spotifyPlayer
        .getCurrentState();

    if (!state) {
      consecutiveStateFailures +=
        1;

      if (
        playerReady &&
        consecutiveStateFailures >= 3
      ) {
        scheduleRecovery(
          "missing_sdk_state"
        );
      }

      return;
    }

    consecutiveStateFailures =
      0;

    lastSdkStateAt =
      Date.now();

    renderTrack(state);

    if (
      playerReady &&
      !reconnecting
    ) {
      setStatus(
        state.paused
          ? playerActivated
            ? "Gotowy do AUTO QUIZ"
            : "Player gotowy"
          : "Odtwarzanie aktywne",
        "online"
      );
    }
  } catch (error) {
    consecutiveStateFailures +=
      1;

    if (
      consecutiveStateFailures >= 3
    ) {
      scheduleRecovery(
        "state_check_failed",
        error
      );
    }
  }
}

function startStateMonitor() {
  stopStateMonitor();

  stateCheckInterval =
    setInterval(() => {
      void inspectCurrentState();

      if (
        !playerReady ||
        !playerConnected
      ) {
        return;
      }

      const stateAge =
        lastSdkStateAt
          ? Date.now() -
            lastSdkStateAt
          : 0;

      if (
        stateAge >
        PLAYER_SETTINGS
          .staleStateMs
      ) {
        scheduleRecovery(
          "sdk_state_stale"
        );
      }
    },
    PLAYER_SETTINGS
      .stateCheckIntervalMs
    );
}

function stopStateMonitor() {
  if (stateCheckInterval) {
    clearInterval(
      stateCheckInterval
    );

    stateCheckInterval =
      null;
  }
}

function clearReadyTimeout() {
  if (readyTimeout) {
    clearTimeout(
      readyTimeout
    );

    readyTimeout =
      null;
  }
}

function startReadyTimeout(
  generation
) {
  clearReadyTimeout();

  readyTimeout =
    setTimeout(() => {
      if (
        destroyed ||
        generation !==
          playerGeneration ||
        playerReady
      ) {
        return;
      }

      scheduleRecovery(
        "ready_timeout"
      );
    },
    PLAYER_SETTINGS
      .readyTimeoutMs
    );
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer =
      null;
  }
}

function clearOfflineNotification() {
  if (offlineNotificationTimer) {
    clearTimeout(
      offlineNotificationTimer
    );

    offlineNotificationTimer =
      null;
  }
}

async function notifyOffline(
  targetDeviceId,
  reason
) {
  const normalizedDeviceId =
    normalizeText(
      targetDeviceId
    );

  if (!normalizedDeviceId) {
    return;
  }

  try {
    await request(
      ENDPOINTS.offline,
      {
        method: "POST",

        body:
          JSON.stringify({
            deviceId:
              normalizedDeviceId,

            reason:
              normalizeText(
                reason,
                "unknown"
              )
          })
      }
    );
  } catch {
    return;
  }
}

function calculateReconnectDelay() {
  const exponential =
    PLAYER_SETTINGS
      .reconnectBaseDelayMs *
    Math.pow(
      2,
      Math.max(
        0,
        reconnectAttempt
      )
    );

  return Math.min(
    PLAYER_SETTINGS
      .reconnectMaximumDelayMs,

    exponential +
    Math.floor(
      Math.random() *
      500
    )
  );
}

function removePlayerListeners(
  player
) {
  if (!player) {
    return;
  }

  try {
    player.removeListener(
      "ready"
    );

    player.removeListener(
      "not_ready"
    );

    player.removeListener(
      "player_state_changed"
    );

    player.removeListener(
      "initialization_error"
    );

    player.removeListener(
      "authentication_error"
    );

    player.removeListener(
      "account_error"
    );

    player.removeListener(
      "playback_error"
    );

    player.removeListener(
      "autoplay_failed"
    );
  } catch {
    return;
  }
}

function disconnectCurrentPlayer() {
  const current =
    spotifyPlayer;

  spotifyPlayer = null;

  if (!current) {
    return;
  }

  removePlayerListeners(
    current
  );

  try {
    current.disconnect();
  } catch {
    return;
  }
}

function resetConnectionState(
  options = {}
) {
  playerConnected = false;
  playerReady = false;
  sdkReady = false;

  currentPaused = true;

  clearReadyTimeout();
  stopHeartbeat();
  stopStateMonitor();

  if (
    options.clearDevice !==
    false
  ) {
    updateDeviceId(null);
  }
}

function scheduleRecovery(
  reason,
  error = null
) {
  if (
    destroyed ||
    reconnecting ||
    reconnectTimer
  ) {
    return;
  }

  recoveryReason =
    normalizeText(
      reason,
      "unknown"
    );

  lastRecoveryAt =
    Date.now();

  setActivateButton(
    "recovering"
  );

  setStatus(
    "Automatyczne odzyskiwanie Playera",
    "waiting"
  );

  if (error?.message) {
    showError(
      `Player utracił połączenie: ${error.message}`,
      {
        persistent: false,

        statusText:
          "Automatyczne odzyskiwanie",

        statusClass:
          "waiting"
      }
    );
  }

  const delay =
    calculateReconnectDelay();

  reconnectAttempt += 1;

  reconnectTimer =
    setTimeout(() => {
      reconnectTimer =
        null;

      void recoverPlayer(
        recoveryReason
      );
    }, delay);
}

async function recoverPlayer(
  reason = "automatic"
) {
  if (
    destroyed ||
    reconnecting
  ) {
    return;
  }

  reconnecting = true;

  clearReconnectTimer();
  clearReadyTimeout();
  stopHeartbeat();
  stopStateMonitor();

  const previousDeviceId =
    deviceId;

  setActivateButton(
    "recovering"
  );

  setStatus(
    "Odzyskiwanie połączenia...",
    "waiting"
  );

  try {
    if (
      previousDeviceId
    ) {
      void notifyOffline(
        previousDeviceId,
        reason
      );
    }

    disconnectCurrentPlayer();

    resetConnectionState({
      clearDevice: true
    });

    invalidateAccessToken();

    await sleep(500);

    await createPlayer({
      recovery: true
    });
  } catch (error) {
    showError(
      `Nie udało się odzyskać Playera: ${error.message}`,
      {
        persistent: false,

        statusText:
          "Kolejna próba za chwilę",

        statusClass:
          "waiting"
      }
    );

    reconnecting = false;

    scheduleRecovery(
      "recovery_failed",
      error
    );

    return;
  }

  reconnecting = false;
}

function addPlayerListeners(
  player,
  generation
) {
  player.addListener(
    "ready",
    async ({
      device_id
    }) => {
      if (
        destroyed ||
        generation !==
          playerGeneration ||
        player !==
          spotifyPlayer
      ) {
        return;
      }

      clearReadyTimeout();
      clearOfflineNotification();

      updateDeviceId(
        device_id
      );

      playerConnected = true;
      playerReady = true;
      sdkReady = true;

      lastReadyAt =
        Date.now();

      lastSdkStateAt =
        Date.now();

      reconnectAttempt = 0;
      consecutiveStateFailures = 0;
      consecutiveHeartbeatFailures = 0;

      hideError();

      setStatus(
        playerActivated
          ? "Gotowy do AUTO QUIZ"
          : "Player gotowy",
        "online"
      );

      setActivateButton(
        playerActivated
          ? "active"
          : "ready"
      );

      try {
        await registerPlayer({
          deviceId:
            device_id,

          activate:
            playerActivated
        });

        startHeartbeat();
        startStateMonitor();

        await inspectCurrentState();
      } catch (error) {
        scheduleRecovery(
          "registration_failed",
          error
        );
      }
    }
  );

  player.addListener(
    "not_ready",
    ({
      device_id
    }) => {
      if (
        destroyed ||
        generation !==
          playerGeneration
      ) {
        return;
      }

      const offlineDeviceId =
        normalizeText(
          device_id
        );

      playerReady = false;

      setStatus(
        "Urządzenie utraciło połączenie",
        "waiting"
      );

      setActivateButton(
        "recovering"
      );

      stopHeartbeat();
      stopStateMonitor();

      clearOfflineNotification();

      offlineNotificationTimer =
        setTimeout(() => {
          void notifyOffline(
            offlineDeviceId ||
            deviceId,
            "sdk_not_ready"
          );
        },
        PLAYER_SETTINGS
          .offlineNotificationTimeoutMs
        );

      scheduleRecovery(
        "sdk_not_ready"
      );
    }
  );

  player.addListener(
    "player_state_changed",
    (state) => {
      if (
        destroyed ||
        generation !==
          playerGeneration ||
        player !==
          spotifyPlayer
      ) {
        return;
      }

      if (!state) {
        consecutiveStateFailures +=
          1;

        if (
          consecutiveStateFailures >= 3
        ) {
          scheduleRecovery(
            "empty_state_event"
          );
        }

        return;
      }

      consecutiveStateFailures =
        0;

      lastSdkStateAt =
        Date.now();

      playerConnected =
        true;

      renderTrack(
        state
      );

      if (
        !reconnecting
      ) {
        setStatus(
          state.paused
            ? playerActivated
              ? "Gotowy do AUTO QUIZ"
              : "Player gotowy"
            : "Odtwarzanie aktywne",
          "online"
        );
      }
    }
  );

  player.addListener(
    "initialization_error",
    (event) => {
      if (
        generation !==
        playerGeneration
      ) {
        return;
      }

      const error =
        new Error(
          parseSdkError(
            "Błąd inicjalizacji",
            event
          )
        );

      showError(
        error.message,
        {
          persistent: false
        }
      );

      scheduleRecovery(
        "initialization_error",
        error
      );
    }
  );

  player.addListener(
    "authentication_error",
    (event) => {
      if (
        generation !==
        playerGeneration
      ) {
        return;
      }

      invalidateAccessToken();

      const error =
        new Error(
          parseSdkError(
            "Błąd Spotify OAuth",
            event
          )
        );

      showError(
        error.message,
        {
          persistent: false
        }
      );

      scheduleRecovery(
        "authentication_error",
        error
      );
    }
  );

  player.addListener(
    "account_error",
    (event) => {
      if (
        generation !==
        playerGeneration
      ) {
        return;
      }

      const error =
        new Error(
          parseSdkError(
            "Błąd konta Spotify",
            event
          )
        );

      showError(
        error.message,
        {
          persistent: true,

          statusText:
            "Sprawdź konto Spotify",

          statusClass:
            "error"
        }
      );

      scheduleRecovery(
        "account_error",
        error
      );
    }
  );

  player.addListener(
    "playback_error",
    (event) => {
      if (
        generation !==
        playerGeneration
      ) {
        return;
      }

      const error =
        new Error(
          parseSdkError(
            "Błąd odtwarzania",
            event
          )
        );

      showError(
        error.message,
        {
          persistent: false,

          statusText:
            "Naprawianie odtwarzania",

          statusClass:
            "waiting"
        }
      );

      scheduleRecovery(
        "playback_error",
        error
      );
    }
  );

  player.addListener(
    "autoplay_failed",
    () => {
      if (
        generation !==
        playerGeneration
      ) {
        return;
      }

      playerActivated =
        false;

      setActivateButton(
        "ready"
      );

      setStatus(
        "Wymagana aktywacja dźwięku",
        "waiting"
      );

      showError(
        "Przeglądarka zablokowała automatyczne odtwarzanie. Kliknij raz przycisk aktywacji Playera.",
        {
          persistent: true,

          statusText:
            "Wymagana jednorazowa aktywacja",

          statusClass:
            "waiting"
        }
      );
    }
  );
}

async function createPlayer(
  options = {}
) {
  if (destroyed) {
    return;
  }

  if (!window.Spotify) {
    throw new Error(
      "Spotify Web Playback SDK nie jest jeszcze dostępny."
    );
  }

  if (
    connecting ||
    (
      spotifyPlayer &&
      playerConnected &&
      playerReady
    )
  ) {
    return;
  }

  connecting =
    true;

  const generation =
    ++playerGeneration;

  hideError();

  setActivateButton(
    options.recovery
      ? "recovering"
      : "loading"
  );

  setStatus(
    options.recovery
      ? "Odzyskiwanie połączenia..."
      : "Łączenie z Spotify...",
    "waiting"
  );

  const player =
    new window.Spotify.Player({
      name:
        PLAYER_SETTINGS.name,

      volume:
        PLAYER_SETTINGS.volume,

      enableMediaSession:
        true,

      getOAuthToken:
        async (callback) => {
          try {
            const token =
              await getAccessToken();

            callback(token);
          } catch (error) {
            invalidateAccessToken();

            showError(
              error.message,
              {
                persistent: false,

                statusText:
                  "Odświeżanie autoryzacji",

                statusClass:
                  "waiting"
              }
            );

            scheduleRecovery(
              "token_error",
              error
            );
          }
        }
    });

  spotifyPlayer =
    player;

  addPlayerListeners(
    player,
    generation
  );

  startReadyTimeout(
    generation
  );

  try {
    const success =
      await player.connect();

    if (
      generation !==
      playerGeneration ||
      player !==
        spotifyPlayer
    ) {
      try {
        player.disconnect();
      } catch {
        return;
      }

      return;
    }

    if (!success) {
      throw new Error(
        "Spotify Web Playback SDK odrzucił połączenie."
      );
    }

    playerConnected =
      true;

    sdkReady =
      true;

    setStatus(
      "Połączono. Oczekiwanie na urządzenie...",
      "waiting"
    );
  } catch (error) {
    if (
      generation ===
      playerGeneration
    ) {
      playerConnected =
        false;

      playerReady =
        false;

      showError(
        error.message,
        {
          persistent: false
        }
      );

      scheduleRecovery(
        "connect_failed",
        error
      );
    }

    throw error;
  } finally {
    connecting =
      false;
  }
}

async function activatePlayer() {
  if (
    activating ||
    reconnecting
  ) {
    return;
  }

  if (
    !spotifyPlayer ||
    !sdkReady
  ) {
    scheduleRecovery(
      "manual_activate_without_player"
    );

    return;
  }

  activating =
    true;

  setActivateButton(
    "activating"
  );

  hideError();

  try {
    if (
      typeof spotifyPlayer
        .activateElement ===
      "function"
    ) {
      await spotifyPlayer
        .activateElement();
    }

    if (!deviceId) {
      const deadline =
        Date.now() +
        PLAYER_SETTINGS
          .readyTimeoutMs;

      while (
        !deviceId &&
        Date.now() <
          deadline
      ) {
        await sleep(
          250
        );
      }
    }

    if (!deviceId) {
      throw new Error(
        "Spotify nie zwróciło deviceId w wymaganym czasie."
      );
    }

    await registerPlayer({
      deviceId,
      activate: true
    });

    playerActivated =
      true;

    reconnectAttempt =
      0;

    startHeartbeat();
    startStateMonitor();

    setStatus(
      "Gotowy do AUTO QUIZ",
      "online"
    );

    setActivateButton(
      "active"
    );

    hideError();
  } catch (error) {
    playerActivated =
      false;

    showError(
      error.message,
      {
        persistent: false
      }
    );

    setActivateButton(
      "offline"
    );

    scheduleRecovery(
      "activation_failed",
      error
    );
  } finally {
    activating =
      false;
  }
}

function initializeSdk() {
  if (destroyed) {
    return;
  }

  void createPlayer()
    .catch((error) => {
      showError(
        error.message,
        {
          persistent: false
        }
      );

      scheduleRecovery(
        "initial_connect_failed",
        error
      );
    });
}

async function shutdownPlayer() {
  if (destroyed) {
    return;
  }

  destroyed =
    true;

  clearReconnectTimer();
  clearReadyTimeout();
  clearOfflineNotification();

  stopHeartbeat();
  stopStateMonitor();

  const previousDeviceId =
    deviceId;

  if (previousDeviceId) {
    try {
      const body =
        JSON.stringify({
          deviceId:
            previousDeviceId,

          reason:
            "page_shutdown"
        });

      if (
        navigator.sendBeacon
      ) {
        navigator.sendBeacon(
          ENDPOINTS.offline,

          new Blob(
            [body],
            {
              type:
                "application/json"
            }
          )
        );
      } else {
        await notifyOffline(
          previousDeviceId,
          "page_shutdown"
        );
      }
    } catch {
      // Zamknięcie strony trwa dalej.
    }
  }

  disconnectCurrentPlayer();

  updateDeviceId(
    null
  );

  clearTrackPresentation();
}

window.onSpotifyWebPlaybackSDKReady =
  () => {
    initializeSdk();
  };

if (window.Spotify) {
  initializeSdk();
}

elements.activateButton
  ?.addEventListener(
    "click",
    () => {
      void activatePlayer();
    }
  );

window.addEventListener(
  "online",
  () => {
    if (destroyed) {
      return;
    }

    reconnectAttempt =
      0;

    scheduleRecovery(
      "browser_online"
    );
  }
);

window.addEventListener(
  "offline",
  () => {
    if (destroyed) {
      return;
    }

    setStatus(
      "Brak połączenia z internetem",
      "error"
    );

    setActivateButton(
      "recovering"
    );

    stopHeartbeat();
    stopStateMonitor();
  }
);

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      destroyed ||
      document.hidden
    ) {
      return;
    }

    void inspectCurrentState();

    if (
      !spotifyPlayer ||
      !playerConnected ||
      !playerReady
    ) {
      scheduleRecovery(
        "page_visible_reconnect"
      );
    } else {
      startHeartbeat();
      startStateMonitor();
    }
  }
);

window.addEventListener(
  "beforeunload",
  () => {
    void shutdownPlayer();
  }
);

window.addEventListener(
  "pagehide",
  () => {
    void shutdownPlayer();
  }
);

setActivateButton(
  "loading"
);

setStatus(
  "Ładowanie Spotify SDK...",
  "waiting"
);

clearTrackPresentation();