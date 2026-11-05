"use strict";

class SpotifyApiError extends Error {
  constructor(message, details = {}) {
    super(message);

    this.name = "SpotifyApiError";

    this.status = Number(details.status || 0);
    this.code = String(details.code || "UNKNOWN");
    this.reason = String(details.reason || "");
    this.endpoint = String(details.endpoint || "");
    this.method = String(details.method || "GET");

    this.retryAfterMs = Math.max(
      0,
      Number(details.retryAfterMs || 0)
    );

    this.recoverable = Boolean(details.recoverable);
    this.responseBody = details.responseBody || null;
    this.originalError = details.originalError || null;
  }
}

class SpotifyEngine {
  constructor(config = {}) {
    this.clientId = String(
      config.clientId || ""
    ).trim();

    this.clientSecret = String(
      config.clientSecret || ""
    ).trim();

    this.redirectUri = String(
      config.redirectUri || ""
    ).trim();

    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;

    this.profile = null;

    this.selectedDeviceId = null;
    this.selectedDevice = null;

    this.quizPlayerDeviceId = null;
    this.quizPlayerReady = false;

    this.cachedDevices = [];
    this.devicesFetchedAt = null;
    this.devicesFetchedAtMs = 0;

    this.selectedPlaylistIds = [];
    this.playlistTrackCache = new Map();

    this.failedTracks = new Map();

    this.requestBlockedUntil = 0;

    this.commandQueue = Promise.resolve();

    this.playbackOperationId = 0;

    this.currentPlaybackSession = null;

    this.lastPlaybackSnapshot = null;

    this.settings = {
      requestTimeoutMs: this.normalizeInteger(
        config.requestTimeoutMs,
        12000,
        2000,
        60000
      ),

      requestRetries: this.normalizeInteger(
        config.requestRetries,
        2,
        0,
        5
      ),

      playbackAttempts: this.normalizeInteger(
        config.playbackAttempts,
        3,
        1,
        6
      ),

      verificationAttempts: this.normalizeInteger(
        config.verificationAttempts,
        12,
        3,
        40
      ),

      verificationDelayMs: this.normalizeInteger(
        config.verificationDelayMs,
        400,
        150,
        3000
      ),

      verificationRequiredSamples: this.normalizeInteger(
        config.verificationRequiredSamples,
        2,
        1,
        5
      ),

      verificationProgressMinimumMs: this.normalizeInteger(
        config.verificationProgressMinimumMs,
        120,
        1,
        5000
      ),

      playbackSyncTimeoutMs: this.normalizeInteger(
        config.playbackSyncTimeoutMs,
        12000,
        3000,
        60000
      ),

      deviceActivationDelayMs: this.normalizeInteger(
        config.deviceActivationDelayMs,
        700,
        100,
        5000
      ),

      deviceCacheMs: this.normalizeInteger(
        config.deviceCacheMs,
        10000,
        1000,
        120000
      ),

      failedTrackThreshold: this.normalizeInteger(
        config.failedTrackThreshold,
        2,
        1,
        10
      ),

      failedTrackCooldownMs: this.normalizeInteger(
        config.failedTrackCooldownMs,
        30 * 60 * 1000,
        10000,
        24 * 60 * 60 * 1000
      ),

      circuitFailureThreshold: this.normalizeInteger(
        config.circuitFailureThreshold,
        4,
        2,
        20
      ),

      circuitCooldownMs: this.normalizeInteger(
        config.circuitCooldownMs,
        30000,
        5000,
        10 * 60 * 1000
      ),

      playlistCacheMs: this.normalizeInteger(
        config.playlistCacheMs,
        5 * 60 * 1000,
        10000,
        60 * 60 * 1000
      )
    };

    this.circuit = {
      state: "CLOSED",
      failures: 0,
      openedAt: 0,
      blockedUntil: 0,
      lastError: null,
      lastSuccessAt: null
    };

    this.diagnostics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      rateLimitHits: 0,
      tokenRefreshes: 0,

      playbackRequests: 0,
      playbackRecoveries: 0,

      playbackVerificationRequests: 0,
      playbackVerificationSuccesses: 0,
      playbackVerificationFailures: 0,

      playbackProgressConfirmations: 0,
      playbackUriMismatches: 0,
      playbackDeviceMismatches: 0,
      playbackStalls: 0,
      playbackSuperseded: 0,

      orphanPlaybackStops: 0,

      skippedTracks: 0,

      lastRequestAt: null,
      lastPlaybackAt: null,
      lastPlaybackVerifiedAt: null,

      lastVerification: null,
      lastError: null
    };

    this.scopes = [
      "user-read-private",
      "user-read-currently-playing",
      "user-read-playback-state",
      "user-modify-playback-state",
      "playlist-read-private",
      "playlist-read-collaborative",
      "streaming"
    ];
  }

  normalizeInteger(
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

  sleep(milliseconds) {
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

  isConfigured() {
    return Boolean(
      this.clientId &&
      this.clientSecret &&
      this.redirectUri
    );
  }

  isConnected() {
    return Boolean(
      this.accessToken &&
      this.refreshToken
    );
  }

  getPlayerAccessToken() {
    return this.ensureAccessToken();
  }

  getAuthorizationUrl(state) {
    if (!this.isConfigured()) {
      throw new Error(
        "Spotify API nie jest skonfigurowane."
      );
    }

    const parameters = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: this.scopes.join(" "),
      redirect_uri: this.redirectUri,
      state: String(state || ""),
      show_dialog: "true"
    });

    return (
      "https://accounts.spotify.com/authorize?" +
      parameters.toString()
    );
  }

  async tokenRequest(parameters) {
    if (!this.isConfigured()) {
      throw new Error(
        "Spotify API nie jest skonfigurowane."
      );
    }

    const authorization = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");

    const controller =
      new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, this.settings.requestTimeoutMs);

    try {
      const response = await fetch(
        "https://accounts.spotify.com/api/token",
        {
          method: "POST",

          headers: {
            Authorization:
              `Basic ${authorization}`,

            "Content-Type":
              "application/x-www-form-urlencoded"
          },

          body:
            new URLSearchParams(parameters),

          signal:
            controller.signal
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new SpotifyApiError(
          data.error_description ||
          data.error ||
          `Spotify OAuth HTTP ${response.status}`,
          {
            status: response.status,
            code: "OAUTH_ERROR",
            endpoint: "/api/token",
            method: "POST",
            responseBody: data,
            recoverable:
              response.status >= 500
          }
        );
      }

      return data;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new SpotifyApiError(
          "Przekroczono czas połączenia z Spotify OAuth.",
          {
            code: "REQUEST_TIMEOUT",
            endpoint: "/api/token",
            method: "POST",
            recoverable: true,
            originalError: error
          }
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  setTokens(data) {
    if (data?.access_token) {
      this.accessToken =
        data.access_token;
    }

    if (data?.refresh_token) {
      this.refreshToken =
        data.refresh_token;
    }

    this.expiresAt =
      Date.now() +
      Number(
        data?.expires_in ||
        3600
      ) *
      1000;
  }

  async exchangeAuthorizationCode(code) {
    const data =
      await this.tokenRequest({
        grant_type:
          "authorization_code",

        code:
          String(code || ""),

        redirect_uri:
          this.redirectUri
      });

    this.setTokens(data);

    await this.loadProfile();

    try {
      await this.refreshDevices();
    } catch {
      this.invalidateSelectedDevice();
    }

    return this.getConnectionState();
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new SpotifyApiError(
        "Brak refresh tokenu Spotify.",
        {
          status: 401,
          code: "MISSING_REFRESH_TOKEN",
          recoverable: false
        }
      );
    }

    const data =
      await this.tokenRequest({
        grant_type:
          "refresh_token",

        refresh_token:
          this.refreshToken
      });

    this.setTokens(data);

    this.diagnostics.tokenRefreshes += 1;

    return this.accessToken;
  }

  async ensureAccessToken() {
    if (!this.accessToken) {
      throw new SpotifyApiError(
        "Spotify nie jest połączone.",
        {
          status: 401,
          code: "NOT_CONNECTED",
          recoverable: false
        }
      );
    }

    if (
      Date.now() >=
      this.expiresAt - 60000
    ) {
      await this.refreshAccessToken();
    }

    return this.accessToken;
  }

  classifyError(
    status,
    data,
    response,
    endpoint,
    method
  ) {
    const message =
      data?.error?.message ||
      data?.error_description ||
      data?.message ||
      `Spotify API HTTP ${status}`;

    const reason = String(
      data?.error?.reason ||
      data?.reason ||
      ""
    );

    const normalizedMessage =
      String(message).toLowerCase();

    const normalizedReason =
      reason.toLowerCase();

    let code =
      `HTTP_${status}`;

    let recoverable =
      false;

    if (status === 401) {
      code = "TOKEN_EXPIRED";
      recoverable = true;
    } else if (status === 429) {
      code = "RATE_LIMITED";
      recoverable = true;
    } else if (status >= 500) {
      code = "SPOTIFY_UNAVAILABLE";
      recoverable = true;
    } else if (
      status === 403 &&
      (
        normalizedMessage.includes(
          "restriction violated"
        ) ||
        normalizedReason.includes(
          "restriction"
        )
      )
    ) {
      code = "RESTRICTION_VIOLATED";
      recoverable = true;
    } else if (
      normalizedMessage.includes(
        "no active device"
      )
    ) {
      code = "NO_ACTIVE_DEVICE";
      recoverable = true;
    } else if (
      normalizedMessage.includes(
        "not available"
      ) ||
      normalizedMessage.includes(
        "unavailable"
      )
    ) {
      code = "TRACK_UNAVAILABLE";
      recoverable = false;
    } else if (status === 403) {
      code = "FORBIDDEN";
      recoverable = false;
    } else if (status === 404) {
      code = "NOT_FOUND";
      recoverable = false;
    }

    const retryAfterSeconds =
      Number(
        response?.headers?.get(
          "retry-after"
        ) ||
        0
      );

    return new SpotifyApiError(
      message,
      {
        status,
        code,
        reason,
        endpoint,
        method,

        retryAfterMs:
          Number.isFinite(
            retryAfterSeconds
          ) &&
          retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : 0,

        recoverable,
        responseBody: data
      }
    );
  }

  getRetryDelay(error, attempt) {
    if (
      error?.code ===
        "RATE_LIMITED" &&
      error.retryAfterMs > 0
    ) {
      return error.retryAfterMs;
    }

    const exponential =
      500 *
      Math.pow(
        2,
        Math.max(
          0,
          attempt
        )
      );

    return Math.min(
      10000,
      exponential +
      Math.floor(
        Math.random() *
        250
      )
    );
  }

  async waitForRequestWindow() {
    const waitMs =
      this.requestBlockedUntil -
      Date.now();

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }

  async request(
    endpoint,
    options = {},
    controls = {}
  ) {
    const method =
      String(
        options.method ||
        "GET"
      ).toUpperCase();

    const maxRetries =
      controls.maxRetries ===
      undefined
        ? this.settings
            .requestRetries
        : Math.max(
            0,
            Number(
              controls.maxRetries
            ) ||
            0
          );

    let tokenRefreshAttempted =
      false;

    for (
      let attempt = 0;
      attempt <= maxRetries;
      attempt += 1
    ) {
      await this.waitForRequestWindow();

      const token =
        await this.ensureAccessToken();

      const controller =
        new AbortController();

      const timeout =
        setTimeout(() => {
          controller.abort();
        }, this.settings.requestTimeoutMs);

      this.diagnostics.totalRequests += 1;

      this.diagnostics.lastRequestAt =
        new Date().toISOString();

      try {
        const response =
          await fetch(
            `https://api.spotify.com/v1${endpoint}`,
            {
              ...options,

              headers: {
                Authorization:
                  `Bearer ${token}`,

                ...(options.body
                  ? {
                      "Content-Type":
                        "application/json"
                    }
                  : {}),

                ...(options.headers ||
                  {})
              },

              signal:
                controller.signal
            }
          );

        if (
          response.status === 204
        ) {
          this.diagnostics.successfulRequests += 1;

          this.registerCircuitSuccess();

          return null;
        }

        const data =
          await response
            .json()
            .catch(() => null);

        if (response.ok) {
          this.diagnostics.successfulRequests += 1;

          this.registerCircuitSuccess();

          return data;
        }

        const error =
          this.classifyError(
            response.status,
            data,
            response,
            endpoint,
            method
          );

        if (
          error.status === 401 &&
          !tokenRefreshAttempted
        ) {
          tokenRefreshAttempted =
            true;

          await this.refreshAccessToken();

          this.diagnostics.retriedRequests += 1;

          continue;
        }

        if (
          error.code ===
          "RATE_LIMITED"
        ) {
          this.diagnostics.rateLimitHits += 1;

          const delay =
            Math.max(
              error.retryAfterMs,
              1000
            );

          this.requestBlockedUntil =
            Math.max(
              this.requestBlockedUntil,
              Date.now() + delay
            );
        }

        if (
          error.recoverable &&
          attempt < maxRetries
        ) {
          this.diagnostics.retriedRequests += 1;

          await this.sleep(
            this.getRetryDelay(
              error,
              attempt
            )
          );

          continue;
        }

        throw error;
      } catch (error) {
        const normalizedError =
          error?.name ===
          "AbortError"
            ? new SpotifyApiError(
                "Przekroczono czas oczekiwania na Spotify API.",
                {
                  code:
                    "REQUEST_TIMEOUT",

                  endpoint,
                  method,
                  recoverable: true,
                  originalError:
                    error
                }
              )
            : error instanceof
                SpotifyApiError
              ? error
              : new SpotifyApiError(
                  error?.message ||
                  "Nieznany błąd połączenia ze Spotify.",
                  {
                    code:
                      "NETWORK_ERROR",

                    endpoint,
                    method,
                    recoverable: true,
                    originalError:
                      error
                  }
                );

        if (
          normalizedError.recoverable &&
          attempt < maxRetries
        ) {
          this.diagnostics.retriedRequests += 1;

          await this.sleep(
            this.getRetryDelay(
              normalizedError,
              attempt
            )
          );

          continue;
        }

        this.diagnostics.failedRequests += 1;

        this.diagnostics.lastError =
          this.serializeError(
            normalizedError
          );

        this.registerCircuitFailure(
          normalizedError
        );

        throw normalizedError;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new SpotifyApiError(
      "Spotify API nie wykonało żądania.",
      {
        code: "REQUEST_FAILED",
        endpoint,
        method,
        recoverable: true
      }
    );
  }

  async requestAbsoluteUrl(
    url,
    controls = {}
  ) {
    const normalizedUrl =
      String(url || "");

    if (
      !normalizedUrl.startsWith(
        "https://api.spotify.com/"
      )
    ) {
      throw new SpotifyApiError(
        "Odrzucono niepoprawny adres Spotify API.",
        {
          code: "INVALID_API_URL",
          recoverable: false
        }
      );
    }

    const endpoint =
      normalizedUrl.replace(
        "https://api.spotify.com/v1",
        ""
      );

    return this.request(
      endpoint,
      {},
      controls
    );
  }

  async getAllPages(endpoint) {
    let data =
      await this.request(endpoint);

    const items = [];

    while (data) {
      if (
        Array.isArray(
          data.items
        )
      ) {
        items.push(
          ...data.items
        );
      }

      if (!data.next) {
        break;
      }

      data =
        await this.requestAbsoluteUrl(
          data.next
        );
    }

    return items;
  }

  async loadProfile() {
    this.profile =
      await this.request("/me");

    return this.profile;
  }

  normalizeDevice(device) {
    if (!device) {
      return null;
    }

    return {
      id:
        device.id ||
        null,

      name:
        String(
          device.name ||
          "Nieznane urządzenie"
        ),

      type:
        String(
          device.type ||
          "Unknown"
        ),

      isActive:
        Boolean(
          device.is_active
        ),

      isPrivateSession:
        Boolean(
          device.is_private_session
        ),

      isRestricted:
        Boolean(
          device.is_restricted
        ),

      volumePercent:
        device.volume_percent ==
        null
          ? null
          : Number(
              device.volume_percent
            ),

      supportsVolume:
        Boolean(
          device.supports_volume
        )
    };
  }

  async getDevices() {
    const data =
      await this.request(
        "/me/player/devices"
      );

    const devices =
      Array.isArray(
        data?.devices
      )
        ? data.devices
            .map((device) =>
              this.normalizeDevice(
                device
              )
            )
            .filter(Boolean)
        : [];

    this.cachedDevices =
      devices;

    this.devicesFetchedAt =
      new Date().toISOString();

    this.devicesFetchedAtMs =
      Date.now();

    return devices;
  }

  isDeviceCacheFresh() {
    return Boolean(
      this.devicesFetchedAtMs &&
      Date.now() -
        this.devicesFetchedAtMs <
        this.settings.deviceCacheMs
    );
  }

  chooseBestDevice(devices) {
    const available =
      Array.isArray(devices)
        ? devices.filter(
            (device) =>
              device?.id &&
              !device.isRestricted &&
              !device.isPrivateSession
          )
        : [];

    const preferredIds = [
      this.quizPlayerDeviceId,
      this.selectedDeviceId
    ].filter(Boolean);

    for (
      const preferredId of
      preferredIds
    ) {
      const matchingDevice =
        available.find(
          (device) =>
            device.id ===
            preferredId
        );

      if (matchingDevice) {
        return matchingDevice;
      }
    }

    const namedQuizPlayer =
      available.find(
        (device) =>
          device.name
            .toLowerCase() ===
          "polska nostalgia player"
      );

    if (namedQuizPlayer) {
      return namedQuizPlayer;
    }

    return (
      available.find(
        (device) =>
          device.isActive
      ) ||
      available[0] ||
      null
    );
  }

  invalidateSelectedDevice() {
    this.selectedDeviceId =
      null;

    this.selectedDevice =
      null;
  }

  async refreshDevices() {
    const devices =
      await this.getDevices();

    const selected =
      this.chooseBestDevice(
        devices
      );

    if (selected) {
      this.selectedDeviceId =
        selected.id;

      this.selectedDevice =
        selected;
    } else {
      this.invalidateSelectedDevice();
    }

    return {
      devices,
      selectedDevice:
        selected ||
        null
    };
  }

  async ensureSelectedDevice(
    forceRefresh = false
  ) {
    if (
      !forceRefresh &&
      this.isDeviceCacheFresh() &&
      this.selectedDevice?.id &&
      !this.selectedDevice
        .isRestricted &&
      !this.selectedDevice
        .isPrivateSession
    ) {
      const cachedMatch =
        this.cachedDevices.find(
          (device) =>
            device.id ===
              this.selectedDevice
                .id &&
            !device.isRestricted &&
            !device
              .isPrivateSession
        );

      if (cachedMatch) {
        return cachedMatch;
      }
    }

    const result =
      await this.refreshDevices();

    if (!result.selectedDevice) {
      throw new SpotifyApiError(
        "Brak sterowalnego urządzenia Spotify. Uruchom odtwarzacz i aktywuj POLSKA NOSTALGIA PLAYER.",
        {
          code:
            "NO_AVAILABLE_DEVICE",
          recoverable: true
        }
      );
    }

    return result.selectedDevice;
  }

  async registerQuizPlayer(
    deviceId
  ) {
    const normalizedDeviceId =
      String(
        deviceId ||
        ""
      ).trim();

    if (!normalizedDeviceId) {
      throw new Error(
        "Player nie przekazał device_id."
      );
    }

    this.quizPlayerDeviceId =
      normalizedDeviceId;

    this.quizPlayerReady =
      true;

    await this.sleep(400);

    const devices =
      await this.getDevices();

    const player =
      devices.find(
        (device) =>
          device.id ===
          normalizedDeviceId
      );

    if (!player) {
      this.selectedDeviceId =
        normalizedDeviceId;

      this.selectedDevice = {
        id: normalizedDeviceId,
        name:
          "POLSKA NOSTALGIA PLAYER",
        type: "Computer",
        isActive: false,
        isPrivateSession: false,
        isRestricted: false,
        volumePercent: null,
        supportsVolume: true
      };

      return this.selectedDevice;
    }

    if (player.isRestricted) {
      throw new SpotifyApiError(
        "POLSKA NOSTALGIA PLAYER jest urządzeniem ograniczonym.",
        {
          status: 403,
          code:
            "RESTRICTED_DEVICE",
          recoverable: true
        }
      );
    }

    if (player.isPrivateSession) {
      throw new SpotifyApiError(
        "POLSKA NOSTALGIA PLAYER działa w prywatnej sesji.",
        {
          code:
            "PRIVATE_SESSION",
          recoverable: true
        }
      );
    }

    this.selectedDeviceId =
      player.id;

    this.selectedDevice =
      player;

    return player;
  }

  unregisterQuizPlayer(
    deviceId = null
  ) {
    if (
      deviceId &&
      this.quizPlayerDeviceId &&
      String(deviceId) !==
        String(
          this.quizPlayerDeviceId
        )
    ) {
      return;
    }

    this.quizPlayerDeviceId =
      null;

    this.quizPlayerReady =
      false;

    if (
      !deviceId ||
      this.selectedDeviceId ===
        String(deviceId)
    ) {
      this.invalidateSelectedDevice();
    }
  }

  async transferPlayback(
    deviceId,
    play = false
  ) {
    const normalizedDeviceId =
      String(
        deviceId ||
        ""
      ).trim();

    if (!normalizedDeviceId) {
      throw new SpotifyApiError(
        "Nie podano urządzenia Spotify.",
        {
          code:
            "MISSING_DEVICE_ID",
          recoverable: true
        }
      );
    }

    await this.request(
      "/me/player",
      {
        method: "PUT",

        body:
          JSON.stringify({
            device_ids: [
              normalizedDeviceId
            ],

            play:
              Boolean(play)
          })
      },
      {
        maxRetries: 1
      }
    );

    this.selectedDeviceId =
      normalizedDeviceId;

    return true;
  }

  setSelectedPlaylists(
    playlistIds
  ) {
    const unique = [];

    for (
      const value of
      Array.isArray(playlistIds)
        ? playlistIds
        : []
    ) {
      const id =
        String(
          value ||
          ""
        ).trim();

      if (
        id &&
        !unique.includes(id)
      ) {
        unique.push(id);
      }
    }

    this.selectedPlaylistIds =
      unique;

    return [
      ...this.selectedPlaylistIds
    ];
  }

  getSelectedPlaylists() {
    return [
      ...this.selectedPlaylistIds
    ];
  }

  async getPlaylists() {
    const playlists =
      await this.getAllPages(
        "/me/playlists?limit=50"
      );

    return playlists.map(
      (playlist) => ({
        id:
          playlist.id,

        uri:
          playlist.uri,

        name:
          playlist.name,

        description:
          playlist.description ||
          "",

        public:
          playlist.public ??
          null,

        collaborative:
          Boolean(
            playlist.collaborative
          ),

        owner: {
          id:
            playlist.owner?.id ||
            null,

          displayName:
            playlist.owner
              ?.display_name ||
            playlist.owner?.id ||
            "Nieznany"
        },

        image:
          playlist.images?.[0]
            ?.url ||
          null,

        totalTracks:
          playlist.tracks?.total ??
          null,

        externalUrl:
          playlist
            .external_urls
            ?.spotify ||
          null
      })
    );
  }

  normalizeTrack(
    item,
    sourcePlaylistId = null
  ) {
    const track =
      item?.item ||
      item?.track ||
      item;

    if (
      !track ||
      track.type !== "track"
    ) {
      return null;
    }

    if (
      !track.id ||
      !track.uri ||
      track.is_local
    ) {
      return null;
    }

    const artists =
      Array.isArray(
        track.artists
      )
        ? track.artists
            .map(
              (artist) => ({
                id:
                  artist.id ||
                  null,

                name:
                  String(
                    artist.name ||
                    ""
                  ).trim()
              })
            )
            .filter(
              (artist) =>
                artist.name
            )
        : [];

    if (
      !track.name ||
      artists.length === 0
    ) {
      return null;
    }

    const album =
      track.album ||
      {};

    const releaseDate =
      album.release_date ||
      "";

    return {
      id: track.id,
      uri: track.uri,
      title: track.name,

      artist:
        artists
          .map(
            (artist) =>
              artist.name
          )
          .join(", "),

      primaryArtist:
        artists[0]?.name ||
        "",

      primaryArtistId:
        artists[0]?.id ||
        null,

      artists,

      album:
        album.name ||
        "",

      albumId:
        album.id ||
        null,

      year:
        /^\d{4}/.test(
          releaseDate
        )
          ? Number(
              releaseDate.slice(
                0,
                4
              )
            )
          : null,

      releaseDate:
        releaseDate ||
        null,

      cover:
        album.images?.[0]
          ?.url ||
        album.images?.[1]
          ?.url ||
        null,

      durationMs:
        Number(
          track.duration_ms ||
          0
        ),

      explicit:
        Boolean(
          track.explicit
        ),

      externalUrl:
        track.external_urls
          ?.spotify ||
        null,

      sourcePlaylistId
    };
  }

  async getPlaylistTracks(
    playlistId,
    options = {}
  ) {
    const normalizedPlaylistId =
      String(
        playlistId ||
        ""
      ).trim();

    if (!normalizedPlaylistId) {
      throw new Error(
        "Nie podano ID playlisty."
      );
    }

    const includeBlocked =
      Boolean(
        options.includeBlocked
      );

    const forceRefresh =
      Boolean(
        options.forceRefresh
      );

    const cached =
      this.playlistTrackCache.get(
        normalizedPlaylistId
      );

    if (
      !forceRefresh &&
      cached &&
      Date.now() -
        cached.fetchedAt <
        this.settings
          .playlistCacheMs
    ) {
      return cached.tracks.filter(
        (track) =>
          includeBlocked ||
          !this.isTrackBlocked(
            track.uri
          )
      );
    }

    const endpoint =
      `/playlists/${encodeURIComponent(
        normalizedPlaylistId
      )}/items` +
      "?limit=50&additional_types=track";

    const items =
      await this.getAllPages(
        endpoint
      );

    const tracks =
      items
        .map((item) =>
          this.normalizeTrack(
            item,
            normalizedPlaylistId
          )
        )
        .filter(Boolean);

    const uniqueTracks = [];
    const ids = new Set();

    for (
      const track of tracks
    ) {
      if (
        ids.has(track.id)
      ) {
        continue;
      }

      ids.add(track.id);
      uniqueTracks.push(track);
    }

    this.playlistTrackCache.set(
      normalizedPlaylistId,
      {
        fetchedAt:
          Date.now(),

        tracks:
          uniqueTracks
      }
    );

    return uniqueTracks.filter(
      (track) =>
        includeBlocked ||
        !this.isTrackBlocked(
          track.uri
        )
    );
  }

  async getTracksFromSelectedPlaylists(
    options = {}
  ) {
    const playlistIds =
      Array.isArray(
        options.playlistIds
      )
        ? options.playlistIds
        : this.selectedPlaylistIds;

    if (
      playlistIds.length === 0
    ) {
      throw new Error(
        "Nie wybrano żadnej playlisty do automatycznej rozgrywki."
      );
    }

    const allTracks = [];

    for (
      const playlistId of
      playlistIds
    ) {
      try {
        const tracks =
          await this.getPlaylistTracks(
            playlistId,
            options
          );

        allTracks.push(
          ...tracks
        );
      } catch (error) {
        this.diagnostics.lastError =
          this.serializeError(
            error
          );
      }
    }

    const unique = [];
    const ids = new Set();

    for (
      const track of
      allTracks
    ) {
      if (
        ids.has(track.id)
      ) {
        continue;
      }

      ids.add(track.id);
      unique.push(track);
    }

    if (
      unique.length === 0
    ) {
      throw new Error(
        "Wybrane playlisty nie zawierają dostępnych utworów."
      );
    }

    return unique;
  }

  selectRandomTrack(
    tracks,
    excludedUris = []
  ) {
    const excluded =
      new Set(
        excludedUris.map(
          (uri) =>
            String(uri)
        )
      );

    const available =
      (
        Array.isArray(tracks)
          ? tracks
          : []
      ).filter(
        (track) =>
          track?.uri &&
          !excluded.has(
            track.uri
          ) &&
          !this.isTrackBlocked(
            track.uri
          )
      );

    if (
      available.length === 0
    ) {
      return null;
    }

    return available[
      Math.floor(
        Math.random() *
        available.length
      )
    ];
  }

  async getAutomaticTrack(
    options = {}
  ) {
    const tracks =
      await this.getTracksFromSelectedPlaylists(
        options
      );

    const selected =
      this.selectRandomTrack(
        tracks,

        Array.isArray(
          options.excludedUris
        )
          ? options.excludedUris
          : []
      );

    if (!selected) {
      throw new Error(
        "Brak dostępnych utworów do kolejnej rundy."
      );
    }

    return selected;
  }

  registerTrackFailure(
    spotifyUri,
    error
  ) {
    const uri =
      String(
        spotifyUri ||
        ""
      ).trim();

    if (!uri) {
      return null;
    }

    const previous =
      this.failedTracks.get(
        uri
      ) ||
      {
        failures: 0,
        blockedUntil: 0
      };

    const failures =
      previous.failures +
      1;

    const blockedUntil =
      failures >=
      this.settings
        .failedTrackThreshold
        ? Date.now() +
          this.settings
            .failedTrackCooldownMs
        : 0;

    const record = {
      uri,
      failures,

      code:
        error?.code ||
        "UNKNOWN",

      message:
        error?.message ||
        "Nieznany błąd.",

      lastFailureAt:
        new Date()
          .toISOString(),

      blockedUntil
    };

    this.failedTracks.set(
      uri,
      record
    );

    if (
      blockedUntil > 0
    ) {
      this.diagnostics.skippedTracks += 1;
    }

    return {
      ...record
    };
  }

  clearTrackFailure(
    spotifyUri
  ) {
    this.failedTracks.delete(
      String(
        spotifyUri ||
        ""
      )
    );
  }

  isTrackBlocked(
    spotifyUri
  ) {
    const uri =
      String(
        spotifyUri ||
        ""
      );

    const record =
      this.failedTracks.get(
        uri
      );

    if (!record) {
      return false;
    }

    if (
      record.blockedUntil > 0 &&
      Date.now() >=
        record.blockedUntil
    ) {
      this.failedTracks.delete(
        uri
      );

      return false;
    }

    return (
      record.blockedUntil >
      Date.now()
    );
  }

  getFailedTracks() {
    const results = [];

    for (
      const [
        uri,
        record
      ] of
      this.failedTracks.entries()
    ) {
      if (
        record.blockedUntil > 0 &&
        Date.now() >=
          record.blockedUntil
      ) {
        this.failedTracks.delete(
          uri
        );

        continue;
      }

      results.push({
        ...record
      });
    }

    return results;
  }

  registerCircuitSuccess() {
    this.circuit.state =
      "CLOSED";

    this.circuit.failures =
      0;

    this.circuit.openedAt =
      0;

    this.circuit.blockedUntil =
      0;

    this.circuit.lastError =
      null;

    this.circuit.lastSuccessAt =
      new Date().toISOString();
  }

  registerCircuitFailure(
    error
  ) {
    if (
      !error?.recoverable
    ) {
      return;
    }

    this.circuit.failures +=
      1;

    this.circuit.lastError =
      this.serializeError(
        error
      );

    if (
      this.circuit.failures >=
      this.settings
        .circuitFailureThreshold
    ) {
      this.circuit.state =
        "OPEN";

      this.circuit.openedAt =
        Date.now();

      this.circuit.blockedUntil =
        Date.now() +
        Math.max(
          this.settings
            .circuitCooldownMs,

          error.retryAfterMs ||
          0
        );
    }
  }

  ensureCircuitAvailable() {
    if (
      this.circuit.state !==
      "OPEN"
    ) {
      return;
    }

    if (
      Date.now() >=
      this.circuit.blockedUntil
    ) {
      this.circuit.state =
        "HALF_OPEN";

      return;
    }

    throw new SpotifyApiError(
      "Spotify jest chwilowo w trybie ochronnym.",
      {
        code:
          "CIRCUIT_OPEN",

        retryAfterMs:
          this.circuit
            .blockedUntil -
          Date.now(),

        recoverable:
          true
      }
    );
  }

  enqueueCommand(operation) {
    const queued =
      this.commandQueue
        .catch(() => null)
        .then(operation);

    this.commandQueue =
      queued.catch(
        () => null
      );

    return queued;
  }

  async getPlaybackState() {
    const data =
      await this.request(
        "/me/player?additional_types=track",
        {},
        {
          maxRetries: 1
        }
      );

    if (!data) {
      const empty = {
        isPlaying: false,
        progressMs: 0,
        timestamp: 0,
        shuffleState: false,
        repeatState: "off",
        device: null,
        track: null,
        fetchedAt:
          Date.now()
      };

      this.lastPlaybackSnapshot =
        empty;

      return empty;
    }

    const device =
      this.normalizeDevice(
        data.device
      );

    if (
      device?.id &&
      !device.isRestricted
    ) {
      this.selectedDeviceId =
        device.id;

      this.selectedDevice =
        device;
    }

    const playback = {
      isPlaying:
        Boolean(
          data.is_playing
        ),

      progressMs:
        Number(
          data.progress_ms ||
          0
        ),

      timestamp:
        Number(
          data.timestamp ||
          0
        ),

      shuffleState:
        Boolean(
          data.shuffle_state
        ),

      repeatState:
        data.repeat_state ||
        "off",

      device,

      track:
        this.normalizeTrack(
          data.item
        ),

      fetchedAt:
        Date.now()
    };

    this.lastPlaybackSnapshot =
      playback;

    return playback;
  }

  async sendPlayCommand(
    spotifyUri,
    positionMs,
    deviceId
  ) {
    await this.request(
      `/me/player/play?device_id=${encodeURIComponent(
        deviceId
      )}`,
      {
        method: "PUT",

        body:
          JSON.stringify({
            uris: [
              spotifyUri
            ],

            position_ms:
              positionMs
          })
      },
      {
        maxRetries: 0
      }
    );
  }

  playbackMatches(
    playback,
    spotifyUri
  ) {
    return Boolean(
      playback?.isPlaying &&
      playback?.track?.uri ===
        spotifyUri
    );
  }

  playbackDeviceMatches(
    playback,
    expectedDeviceId
  ) {
    if (!expectedDeviceId) {
      return true;
    }

    return Boolean(
      playback?.device?.id ===
        expectedDeviceId
    );
  }

  isOperationCurrent(
    operationId
  ) {
    return (
      operationId ===
      this.playbackOperationId
    );
  }

  assertOperationCurrent(
    operationId
  ) {
    if (
      this.isOperationCurrent(
        operationId
      )
    ) {
      return;
    }

    this.diagnostics.playbackSuperseded +=
      1;

    throw new SpotifyApiError(
      "Odtwarzanie zostało zastąpione nowszą komendą.",
      {
        code:
          "PLAYBACK_SUPERSEDED",
        recoverable: false
      }
    );
  }

  createVerificationResult(
    overrides = {}
  ) {
    return {
      success: false,
      confirmed: false,

      reason:
        "not_verified",

      attempt: 0,
      samples: 0,

      uriMatches: false,
      deviceMatches: false,
      progressConfirmed: false,

      initialProgressMs: null,
      finalProgressMs: null,
      progressDeltaMs: 0,

      playback: null,
      error: null,

      ...overrides
    };
  }

  async verifyPlaybackStarted(
    spotifyUri,
    options = {}
  ) {
    const operationId =
      Number(
        options.operationId ||
        this.playbackOperationId
      );

    const expectedDeviceId =
      String(
        options.deviceId ||
        ""
      ).trim() ||
      null;

    const timeoutMs =
      this.normalizeInteger(
        options.timeoutMs,
        this.settings
          .playbackSyncTimeoutMs,
        1000,
        60000
      );

    const delayMs =
      this.normalizeInteger(
        options.delayMs,
        this.settings
          .verificationDelayMs,
        100,
        5000
      );

    const maximumAttempts =
      this.normalizeInteger(
        options.attempts,
        this.settings
          .verificationAttempts,
        2,
        50
      );

    const requiredSamples =
      this.normalizeInteger(
        options.requiredSamples,
        this.settings
          .verificationRequiredSamples,
        1,
        8
      );

    const minimumProgressDelta =
      this.normalizeInteger(
        options.minimumProgressDeltaMs,
        this.settings
          .verificationProgressMinimumMs,
        1,
        10000
      );

    const startedAt =
      Date.now();

    this.diagnostics.playbackVerificationRequests +=
      1;

    let lastPlayback =
      null;

    let lastError =
      null;

    let matchingSamples =
      0;

    let previousMatchingProgress =
      null;

    let initialProgress =
      null;

    let finalProgress =
      null;

    let progressConfirmed =
      false;

    let attempt =
      0;

    while (
      attempt <
        maximumAttempts &&
      Date.now() -
        startedAt <
        timeoutMs
    ) {
      this.assertOperationCurrent(
        operationId
      );

      if (attempt > 0) {
        await this.sleep(
          delayMs
        );
      }

      this.assertOperationCurrent(
        operationId
      );

      attempt += 1;

      try {
        const playback =
          await this.getPlaybackState();

        lastPlayback =
          playback;

        const uriMatches =
          this.playbackMatches(
            playback,
            spotifyUri
          );

        const deviceMatches =
          this.playbackDeviceMatches(
            playback,
            expectedDeviceId
          );

        if (!uriMatches) {
          matchingSamples =
            0;

          previousMatchingProgress =
            null;

          if (
            playback?.track?.uri &&
            playback.track.uri !==
              spotifyUri
          ) {
            this.diagnostics.playbackUriMismatches +=
              1;
          }

          continue;
        }

        if (!deviceMatches) {
          this.diagnostics.playbackDeviceMismatches +=
            1;

          matchingSamples =
            0;

          previousMatchingProgress =
            null;

          continue;
        }

        const currentProgress =
          Math.max(
            0,
            Number(
              playback.progressMs ||
              0
            )
          );

        if (
          initialProgress ===
          null
        ) {
          initialProgress =
            currentProgress;
        }

        finalProgress =
          currentProgress;

        matchingSamples +=
          1;

        if (
          previousMatchingProgress !==
          null
        ) {
          const delta =
            currentProgress -
            previousMatchingProgress;

          if (
            delta >=
            minimumProgressDelta
          ) {
            progressConfirmed =
              true;

            this.diagnostics.playbackProgressConfirmations +=
              1;
          } else if (
            delta <= 0
          ) {
            this.diagnostics.playbackStalls +=
              1;
          }
        }

        previousMatchingProgress =
          currentProgress;

        if (
          matchingSamples >=
            requiredSamples &&
          (
            progressConfirmed ||
            requiredSamples === 1
          )
        ) {
          const result =
            this.createVerificationResult(
              {
                success:
                  true,

                confirmed:
                  true,

                reason:
                  "verified",

                attempt,

                samples:
                  matchingSamples,

                uriMatches:
                  true,

                deviceMatches:
                  true,

                progressConfirmed,

                initialProgressMs:
                  initialProgress,

                finalProgressMs:
                  finalProgress,

                progressDeltaMs:
                  initialProgress ==
                  null
                    ? 0
                    : Math.max(
                        0,
                        finalProgress -
                        initialProgress
                      ),

                playback,

                error:
                  null
              }
            );

          this.diagnostics.playbackVerificationSuccesses +=
            1;

          this.diagnostics.lastPlaybackVerifiedAt =
            new Date()
              .toISOString();

          this.diagnostics.lastVerification =
            {
              ...result,
              playback:
                undefined
            };

          return result;
        }
      } catch (error) {
        lastError =
          error;

        if (
          error?.code ===
          "PLAYBACK_SUPERSEDED"
        ) {
          throw error;
        }
      }
    }

    const uriMatches =
      Boolean(
        lastPlayback?.track
          ?.uri ===
        spotifyUri
      );

    const deviceMatches =
      this.playbackDeviceMatches(
        lastPlayback,
        expectedDeviceId
      );

    const result =
      this.createVerificationResult(
        {
          success:
            false,

          confirmed:
            false,

          reason:
            uriMatches &&
            lastPlayback?.isPlaying
              ? progressConfirmed
                ? "insufficient_samples"
                : "progress_not_confirmed"
              : "playback_not_matching",

          attempt,

          samples:
            matchingSamples,

          uriMatches,

          deviceMatches,

          progressConfirmed,

          initialProgressMs:
            initialProgress,

          finalProgressMs:
            finalProgress,

          progressDeltaMs:
            initialProgress ==
              null ||
            finalProgress ==
              null
              ? 0
              : Math.max(
                  0,
                  finalProgress -
                  initialProgress
                ),

          playback:
            lastPlayback,

          error:
            lastError
        }
      );

    this.diagnostics.playbackVerificationFailures +=
      1;

    this.diagnostics.lastVerification =
      {
        ...result,

        playback:
          undefined,

        error:
          lastError
            ? this.serializeError(
                lastError
              )
            : null
      };

    return result;
  }

  async waitForPlayback(
    spotifyUri,
    attempts =
      this.settings
        .verificationAttempts,
    delayMs =
      this.settings
        .verificationDelayMs,
    options = {}
  ) {
    return this.verifyPlaybackStarted(
      spotifyUri,
      {
        ...options,
        attempts,
        delayMs
      }
    );
  }

  async isTrackActuallyPlaying(
    spotifyUri,
    options = {}
  ) {
    try {
      const verification =
        await this.verifyPlaybackStarted(
          spotifyUri,
          {
            operationId:
              options.operationId ||
              this.playbackOperationId,

            deviceId:
              options.deviceId ||
              this.selectedDeviceId,

            attempts:
              options.attempts ||
              3,

            requiredSamples:
              options.requiredSamples ||
              2,

            delayMs:
              options.delayMs ||
              this.settings
                .verificationDelayMs,

            timeoutMs:
              options.timeoutMs ||
              3000
          }
        );

      return verification;
    } catch (error) {
      return this.createVerificationResult(
        {
          success:
            false,

          confirmed:
            false,

          reason:
            error?.code ||
            "verification_error",

          error
        }
      );
    }
  }

  async recoverDevice(
    previousDeviceId = null
  ) {
    this.diagnostics.playbackRecoveries +=
      1;

    this.invalidateSelectedDevice();

    await this.sleep(400);

    const devices =
      await this.getDevices();

    const controllable =
      devices.filter(
        (device) =>
          device.id &&
          !device.isRestricted &&
          !device.isPrivateSession
      );

    let selected =
      null;

    if (
      this.quizPlayerDeviceId
    ) {
      selected =
        controllable.find(
          (device) =>
            device.id ===
            this.quizPlayerDeviceId
        );
    }

    if (
      !selected &&
      previousDeviceId
    ) {
      selected =
        controllable.find(
          (device) =>
            device.id ===
            previousDeviceId
        );
    }

    if (!selected) {
      selected =
        controllable.find(
          (device) =>
            device.isActive
        ) ||
        controllable[0] ||
        null;
    }

    if (!selected) {
      throw new SpotifyApiError(
        "Nie znaleziono sterowalnego urządzenia Spotify.",
        {
          code:
            "NO_AVAILABLE_DEVICE",
          recoverable:
            true
        }
      );
    }

    this.selectedDeviceId =
      selected.id;

    this.selectedDevice =
      selected;

    await this.transferPlayback(
      selected.id,
      false
    );

    await this.sleep(
      this.settings
        .deviceActivationDelayMs
    );

    return selected;
  }

  async stopOrphanedPlayback(
    spotifyUri = null,
    options = {}
  ) {
    try {
      const playback =
        await this.getPlaybackState();

      if (
        spotifyUri &&
        playback?.track?.uri !==
          spotifyUri
      ) {
        return {
          success: false,
          stopped: false,
          reason:
            "different_track"
        };
      }

      if (
        !playback?.isPlaying
      ) {
        return {
          success: true,
          stopped: false,
          reason:
            "already_stopped"
        };
      }

      const deviceId =
        playback?.device?.id ||
        this.selectedDeviceId;

      if (!deviceId) {
        return {
          success: false,
          stopped: false,
          reason:
            "no_device"
        };
      }

      await this.request(
        `/me/player/pause?device_id=${encodeURIComponent(
          deviceId
        )}`,
        {
          method: "PUT"
        },
        {
          maxRetries: 1
        }
      );

      this.diagnostics.orphanPlaybackStops +=
        1;

      if (
        options.invalidateDevice
      ) {
        this.invalidateSelectedDevice();
      }

      return {
        success: true,
        stopped: true,
        reason:
          "paused",
        deviceId
      };
    } catch (error) {
      return {
        success: false,
        stopped: false,
        reason:
          error?.code ||
          "pause_failed",
        error:
          this.serializeError(
            error
          )
      };
    }
  }

  async executePlayback(
    spotifyUri,
    positionMs,
    operationId
  ) {
    this.ensureCircuitAvailable();

    this.assertOperationCurrent(
      operationId
    );

    if (
      this.isTrackBlocked(
        spotifyUri
      )
    ) {
      throw new SpotifyApiError(
        "Utwór jest tymczasowo pomijany po wcześniejszych błędach.",
        {
          code:
            "TRACK_COOLDOWN",
          recoverable:
            false
        }
      );
    }

    let device =
      await this.ensureSelectedDevice(
        true
      );

    let lastError =
      null;

    this.currentPlaybackSession =
      {
        operationId,
        spotifyUri,
        positionMs,
        deviceId:
          device?.id ||
          null,
        status:
          "starting",
        startedAt:
          new Date()
            .toISOString(),
        verifiedAt:
          null,
        attempt:
          0
      };

    for (
      let attempt = 1;
      attempt <=
        this.settings
          .playbackAttempts;
      attempt += 1
    ) {
      this.assertOperationCurrent(
        operationId
      );

      this.currentPlaybackSession.attempt =
        attempt;

      try {
        if (
          !device ||
          !device.id ||
          device.isRestricted ||
          device.isPrivateSession
        ) {
          device =
            await this.recoverDevice(
              device?.id ||
              null
            );
        }

        this.assertOperationCurrent(
          operationId
        );

        if (
          !device.isActive ||
          attempt > 1
        ) {
          await this.transferPlayback(
            device.id,
            false
          );

          this.assertOperationCurrent(
            operationId
          );

          await this.sleep(
            this.settings
              .deviceActivationDelayMs
          );
        }

        this.assertOperationCurrent(
          operationId
        );

        this.currentPlaybackSession.status =
          "play-command";

        this.currentPlaybackSession.deviceId =
          device.id;

        await this.sendPlayCommand(
          spotifyUri,
          positionMs,
          device.id
        );

        this.assertOperationCurrent(
          operationId
        );

        this.currentPlaybackSession.status =
          "verifying";

        const verification =
          await this.verifyPlaybackStarted(
            spotifyUri,
            {
              operationId,
              deviceId:
                device.id,

              attempts:
                this.settings
                  .verificationAttempts,

              requiredSamples:
                this.settings
                  .verificationRequiredSamples,

              delayMs:
                this.settings
                  .verificationDelayMs,

              timeoutMs:
                this.settings
                  .playbackSyncTimeoutMs,

              minimumProgressDeltaMs:
                this.settings
                  .verificationProgressMinimumMs
            }
          );

        this.assertOperationCurrent(
          operationId
        );

        if (
          !verification.success
        ) {
          throw (
            verification.error ||
            new SpotifyApiError(
              verification.reason ===
                "progress_not_confirmed"
                ? "Spotify uruchomiło utwór, ale nie potwierdzono ruchu odtwarzania."
                : "Spotify nie potwierdziło uruchomienia właściwego utworu.",
              {
                code:
                  verification.reason ===
                  "progress_not_confirmed"
                    ? "PLAYBACK_STALLED"
                    : "PLAYBACK_NOT_VERIFIED",

                recoverable:
                  true,

                responseBody: {
                  verification: {
                    reason:
                      verification.reason,

                    attempt:
                      verification.attempt,

                    samples:
                      verification.samples,

                    uriMatches:
                      verification.uriMatches,

                    deviceMatches:
                      verification.deviceMatches,

                    progressConfirmed:
                      verification.progressConfirmed,

                    initialProgressMs:
                      verification.initialProgressMs,

                    finalProgressMs:
                      verification.finalProgressMs,

                    progressDeltaMs:
                      verification.progressDeltaMs
                  }
                }
              }
            )
          );
        }

        const actualDevice =
          verification.playback
            ?.device;

        if (
          actualDevice?.id
        ) {
          this.selectedDeviceId =
            actualDevice.id;

          this.selectedDevice =
            actualDevice;
        }

        this.clearTrackFailure(
          spotifyUri
        );

        this.registerCircuitSuccess();

        this.diagnostics.lastPlaybackAt =
          new Date()
            .toISOString();

        this.currentPlaybackSession.status =
          "verified";

        this.currentPlaybackSession.verifiedAt =
          new Date()
            .toISOString();

        return {
          success:
            true,

          verified:
            true,

          synced:
            true,

          attempt,

          recovered:
            attempt > 1,

          operationId,

          deviceId:
            this.selectedDeviceId,

          device:
            this.selectedDevice,

          spotifyUri,

          positionMs,

          playback:
            verification.playback,

          verification: {
            reason:
              verification.reason,

            attempt:
              verification.attempt,

            samples:
              verification.samples,

            uriMatches:
              verification.uriMatches,

            deviceMatches:
              verification.deviceMatches,

            progressConfirmed:
              verification.progressConfirmed,

            initialProgressMs:
              verification.initialProgressMs,

            finalProgressMs:
              verification.finalProgressMs,

            progressDeltaMs:
              verification.progressDeltaMs
          }
        };
      } catch (error) {
        if (
          error?.code ===
          "PLAYBACK_SUPERSEDED"
        ) {
          this.currentPlaybackSession =
            null;

          throw error;
        }

        lastError =
          error instanceof
          SpotifyApiError
            ? error
            : new SpotifyApiError(
                error?.message ||
                "Błąd odtwarzania Spotify.",
                {
                  code:
                    "PLAYBACK_ERROR",
                  recoverable:
                    true,
                  originalError:
                    error
                }
              );

        this.currentPlaybackSession.status =
          "recovering";

        if (
          lastError.code ===
            "RATE_LIMITED" &&
          lastError.retryAfterMs >
            0
        ) {
          this.requestBlockedUntil =
            Math.max(
              this.requestBlockedUntil,
              Date.now() +
                lastError
                  .retryAfterMs
            );
        }

        if (
          !lastError.recoverable ||
          attempt >=
            this.settings
              .playbackAttempts
        ) {
          break;
        }

        try {
          this.assertOperationCurrent(
            operationId
          );

          device =
            await this.recoverDevice(
              device?.id ||
              null
            );
        } catch (
          recoveryError
        ) {
          lastError =
            recoveryError instanceof
            SpotifyApiError
              ? recoveryError
              : new SpotifyApiError(
                  recoveryError?.message ||
                  "Nie udało się odzyskać urządzenia Spotify.",
                  {
                    code:
                      "DEVICE_RECOVERY_FAILED",
                    recoverable:
                      true,
                    originalError:
                      recoveryError
                  }
                );

          if (
            attempt >=
            this.settings
              .playbackAttempts
          ) {
            break;
          }

          await this.sleep(
            this.getRetryDelay(
              lastError,
              attempt
            )
          );
        }
      }
    }

    if (
      this.isOperationCurrent(
        operationId
      )
    ) {
      await this.stopOrphanedPlayback(
        spotifyUri
      );
    }

    const failure =
      this.registerTrackFailure(
        spotifyUri,
        lastError
      );

    this.registerCircuitFailure(
      lastError
    );

    this.currentPlaybackSession =
      {
        ...(this.currentPlaybackSession ||
          {}),

        operationId,
        spotifyUri,
        status:
          "failed",

        failedAt:
          new Date()
            .toISOString(),

        error:
          this.serializeError(
            lastError
          )
      };

    throw new SpotifyApiError(
      "Nie udało się bezpiecznie zsynchronizować odtwarzania utworu Spotify.",
      {
        status:
          lastError?.status ||
          0,

        code:
          lastError?.code ||
          "PLAYBACK_FAILED",

        reason:
          lastError?.reason ||
          "",

        retryAfterMs:
          lastError?.retryAfterMs ||
          0,

        recoverable:
          Boolean(
            lastError
              ?.recoverable
          ),

        responseBody: {
          failure,

          originalMessage:
            lastError?.message ||
            null
        },

        originalError:
          lastError
      }
    );
  }

  async playTrackVerified(
    spotifyUri,
    positionMs = 0
  ) {
    const normalizedUri =
      String(
        spotifyUri ||
        ""
      ).trim();

    if (!normalizedUri) {
      throw new Error(
        "Nie podano URI utworu Spotify."
      );
    }

    const safePosition =
      Math.max(
        0,
        Math.floor(
          Number(
            positionMs
          ) ||
          0
        )
      );

    this.diagnostics.playbackRequests +=
      1;

    const operationId =
      ++this.playbackOperationId;

    return this.enqueueCommand(
      () =>
        this.executePlayback(
          normalizedUri,
          safePosition,
          operationId
        )
    );
  }

  playTrack(
    spotifyUri,
    positionMs = 0
  ) {
    return this.playTrackVerified(
      spotifyUri,
      positionMs
    );
  }

  async verifyCurrentPlayback(
    spotifyUri,
    options = {}
  ) {
    const normalizedUri =
      String(
        spotifyUri ||
        ""
      ).trim();

    if (!normalizedUri) {
      return this.createVerificationResult(
        {
          reason:
            "missing_uri"
        }
      );
    }

    return this.isTrackActuallyPlaying(
      normalizedUri,
      {
        operationId:
          options.operationId ||
          this.playbackOperationId,

        deviceId:
          options.deviceId ||
          this.selectedDeviceId,

        attempts:
          options.attempts ||
          3,

        requiredSamples:
          options.requiredSamples ||
          2,

        delayMs:
          options.delayMs ||
          this.settings
            .verificationDelayMs,

        timeoutMs:
          options.timeoutMs ||
          3000
      }
    );
  }

  async pause() {
    ++this.playbackOperationId;

    this.currentPlaybackSession =
      null;

    return this.enqueueCommand(
      async () => {
        let device =
          null;

        try {
          device =
            await this.ensureSelectedDevice();
        } catch {
          return {
            success:
              false,

            reason:
              "no_device"
          };
        }

        try {
          await this.request(
            `/me/player/pause?device_id=${encodeURIComponent(
              device.id
            )}`,
            {
              method:
                "PUT"
            },
            {
              maxRetries:
                1
            }
          );

          return {
            success:
              true,

            deviceId:
              device.id
          };
        } catch (error) {
          if (
            error?.status ===
              403 ||
            error?.code ===
              "NO_ACTIVE_DEVICE"
          ) {
            this.invalidateSelectedDevice();

            return {
              success:
                false,

              reason:
                error.code ||
                "pause_failed"
            };
          }

          throw error;
        }
      }
    );
  }

  async healthCheck() {
    try {
      this.ensureCircuitAvailable();

      const device =
        await this.ensureSelectedDevice(
          true
        );

      const playback =
        await this.getPlaybackState();

      return {
        healthy:
          true,

        circuit:
          this.getCircuitState(),

        device,
        playback,

        playbackSession:
          this.getPlaybackSession()
      };
    } catch (error) {
      return {
        healthy:
          false,

        circuit:
          this.getCircuitState(),

        device:
          null,

        playback:
          null,

        playbackSession:
          this.getPlaybackSession(),

        error:
          this.serializeError(
            error
          )
      };
    }
  }

  serializeError(error) {
    return {
      name:
        error?.name ||
        "Error",

      message:
        error?.message ||
        "Nieznany błąd.",

      status:
        Number(
          error?.status ||
          0
        ),

      code:
        error?.code ||
        "UNKNOWN",

      reason:
        error?.reason ||
        "",

      endpoint:
        error?.endpoint ||
        "",

      method:
        error?.method ||
        "",

      retryAfterMs:
        Number(
          error?.retryAfterMs ||
          0
        ),

      recoverable:
        Boolean(
          error?.recoverable
        )
    };
  }

  getCircuitState() {
    return {
      ...this.circuit,

      remainingCooldownMs:
        this.circuit.state ===
        "OPEN"
          ? Math.max(
              0,
              this.circuit
                .blockedUntil -
              Date.now()
            )
          : 0
    };
  }

  getPlaybackSession() {
    return this.currentPlaybackSession
      ? {
          ...this.currentPlaybackSession
        }
      : null;
  }

  getPlaybackSyncState() {
    const session =
      this.getPlaybackSession();

    return {
      syncing:
        Boolean(
          session &&
          [
            "starting",
            "play-command",
            "verifying",
            "recovering"
          ].includes(
            session.status
          )
        ),

      verified:
        session?.status ===
        "verified",

      failed:
        session?.status ===
        "failed",

      status:
        session?.status ||
        "idle",

      operationId:
        session?.operationId ||
        null,

      spotifyUri:
        session?.spotifyUri ||
        null,

      deviceId:
        session?.deviceId ||
        null,

      attempt:
        Number(
          session?.attempt ||
          0
        ),

      startedAt:
        session?.startedAt ||
        null,

      verifiedAt:
        session?.verifiedAt ||
        null,

      failedAt:
        session?.failedAt ||
        null
    };
  }

  getDiagnostics() {
    return {
      ...this.diagnostics,

      circuit:
        this.getCircuitState(),

      playbackSession:
        this.getPlaybackSession(),

      playbackSync:
        this.getPlaybackSyncState(),

      lastPlaybackSnapshot:
        this.lastPlaybackSnapshot
          ? {
              isPlaying:
                this.lastPlaybackSnapshot
                  .isPlaying,

              progressMs:
                this.lastPlaybackSnapshot
                  .progressMs,

              timestamp:
                this.lastPlaybackSnapshot
                  .timestamp,

              trackUri:
                this.lastPlaybackSnapshot
                  .track?.uri ||
                null,

              deviceId:
                this.lastPlaybackSnapshot
                  .device?.id ||
                null,

              fetchedAt:
                this.lastPlaybackSnapshot
                  .fetchedAt
            }
          : null,

      requestBlockedForMs:
        Math.max(
          0,
          this.requestBlockedUntil -
          Date.now()
        ),

      failedTracks:
        this.getFailedTracks(),

      selectedPlaylistIds:
        this.getSelectedPlaylists(),

      playlistCacheEntries:
        this.playlistTrackCache
          .size
    };
  }

  getSelectedDevice() {
    return this.selectedDevice
      ? {
          ...this.selectedDevice
        }
      : null;
  }

  getQuizPlayerState() {
    return {
      ready:
        this.quizPlayerReady,

      deviceId:
        this.quizPlayerDeviceId,

      selectedDeviceId:
        this.selectedDeviceId,

      sync:
        this.getPlaybackSyncState()
    };
  }

  disconnect() {
    ++this.playbackOperationId;

    this.accessToken =
      null;

    this.refreshToken =
      null;

    this.expiresAt =
      0;

    this.profile =
      null;

    this.invalidateSelectedDevice();

    this.quizPlayerDeviceId =
      null;

    this.quizPlayerReady =
      false;

    this.cachedDevices =
      [];

    this.devicesFetchedAt =
      null;

    this.devicesFetchedAtMs =
      0;

    this.selectedPlaylistIds =
      [];

    this.playlistTrackCache
      .clear();

    this.failedTracks
      .clear();

    this.requestBlockedUntil =
      0;

    this.currentPlaybackSession =
      null;

    this.lastPlaybackSnapshot =
      null;

    this.circuit = {
      state: "CLOSED",
      failures: 0,
      openedAt: 0,
      blockedUntil: 0,
      lastError: null,
      lastSuccessAt: null
    };
  }

  getConnectionState() {
    return {
      configured:
        this.isConfigured(),

      connected:
        this.isConnected(),

      profile:
        this.profile
          ? {
              id:
                this.profile.id,

              displayName:
                this.profile
                  .display_name ||
                this.profile.id,

              image:
                this.profile
                  .images?.[0]
                  ?.url ||
                null,

              product:
                this.profile
                  .product ||
                null
            }
          : null,

      selectedDevice:
        this.getSelectedDevice(),

      quizPlayer:
        this.getQuizPlayerState(),

      selectedPlaylistIds:
        this.getSelectedPlaylists(),

      devicesFetchedAt:
        this.devicesFetchedAt,

      circuit:
        this.getCircuitState(),

      playbackSync:
        this.getPlaybackSyncState(),

      diagnostics:
        this.getDiagnostics()
    };
  }
}

SpotifyEngine.SpotifyApiError =
  SpotifyApiError;

module.exports =
  SpotifyEngine;