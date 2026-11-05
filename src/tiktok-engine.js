const EventEmitter = require("events");
const WebSocket = require("ws");

class TikTokEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.username = this.normalizeUsername(
      options.username || ""
    );

    this.apiKey = String(
      options.apiKey || ""
    ).trim();

    this.websocketUrl = String(
      options.websocketUrl ||
      "wss://api.tik.tools"
    )
      .trim()
      .replace(/\/+$/, "");

    this.socket = null;

    this.status = "disconnected";
    this.connected = false;
    this.connecting = false;

    this.viewerCount = 0;
    this.totalLikes = 0;

    this.lastComment = null;
    this.lastEventAt = null;
    this.lastError = null;

    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    this.reconnectEnabled = true;
    this.manualDisconnect = false;

    this.maxReconnectDelay = 30000;
  }

  normalizeUsername(value) {
    return String(value || "")
      .trim()
      .replace(/^@+/, "");
  }

  setCredentials({
    username,
    apiKey
  } = {}) {
    if (username !== undefined) {
      this.username =
        this.normalizeUsername(
          username
        );
    }

    if (apiKey !== undefined) {
      this.apiKey =
        String(apiKey || "")
          .trim();
    }

    this.emitState();
  }

  isConfigured() {
    return Boolean(
      this.username &&
      this.apiKey
    );
  }

  getPublicState() {
    return {
      configured:
        this.isConfigured(),

      username:
        this.username,

      connected:
        this.connected,

      connecting:
        this.connecting,

      status:
        this.status,

      viewerCount:
        this.viewerCount,

      totalLikes:
        this.totalLikes,

      lastComment:
        this.lastComment
          ? {
              username:
                this.lastComment
                  .username,

              displayName:
                this.lastComment
                  .displayName,

              comment:
                this.lastComment
                  .comment,

              receivedAt:
                this.lastComment
                  .receivedAt
            }
          : null,

      lastEventAt:
        this.lastEventAt,

      lastError:
        this.lastError
    };
  }

  emitState() {
    this.emit(
      "state",
      this.getPublicState()
    );
  }

  buildConnectionUrl() {
    if (!this.isConfigured()) {
      throw new Error(
        "TikTok LIVE API nie jest skonfigurowane."
      );
    }

    const parameters =
      new URLSearchParams({
        uniqueId:
          this.username,

        apiKey:
          this.apiKey
      });

    return (
      `${this.websocketUrl}?` +
      parameters.toString()
    );
  }

  connect() {
    if (!this.isConfigured()) {
      this.lastError =
        "Brakuje TIKTOK_USERNAME lub TIKTOK_API_KEY.";

      this.status =
        "configuration-error";

      this.emitState();

      throw new Error(
        this.lastError
      );
    }

    if (
      this.socket &&
      (
        this.socket.readyState ===
          WebSocket.OPEN ||
        this.socket.readyState ===
          WebSocket.CONNECTING
      )
    ) {
      return;
    }

    this.manualDisconnect =
      false;

    this.reconnectEnabled =
      true;

    this.clearReconnectTimer();

    const url =
      this.buildConnectionUrl();

    this.status =
      "connecting";

    this.connecting =
      true;

    this.connected =
      false;

    this.lastError =
      null;

    this.emitState();

    const socket =
      new WebSocket(url);

    this.socket =
      socket;

    socket.on(
      "open",
      () => {
        if (
          this.socket !==
          socket
        ) {
          return;
        }

        this.connected =
          true;

        this.connecting =
          false;

        this.status =
          "connected";

        this.lastError =
          null;

        this.reconnectAttempts =
          0;

        this.lastEventAt =
          new Date()
            .toISOString();

        this.emitState();

        this.emit(
          "connected",
          this.getPublicState()
        );
      }
    );

    socket.on(
      "message",
      (rawMessage) => {
        if (
          this.socket !==
          socket
        ) {
          return;
        }

        this.handleMessage(
          rawMessage
        );
      }
    );

    socket.on(
      "error",
      (error) => {
        if (
          this.socket !==
          socket
        ) {
          return;
        }

        this.lastError =
          error.message ||
          "Błąd WebSocket.";

        this.emitState();

        this.emit(
          "connection-error",
          error
        );
      }
    );

    socket.on(
      "close",
      (
        code,
        reasonBuffer
      ) => {
        if (
          this.socket !==
          socket
        ) {
          return;
        }

        const reason =
          reasonBuffer
            ? reasonBuffer
                .toString()
                .trim()
            : "";

        this.socket =
          null;

        this.connected =
          false;

        this.connecting =
          false;

        this.status =
          this.manualDisconnect
            ? "disconnected"
            : "reconnecting";

        if (
          !this.manualDisconnect
        ) {
          this.lastError =
            reason ||
            `Połączenie zamknięte. Kod ${code}.`;
        } else {
          this.lastError =
            null;
        }

        this.emitState();

        this.emit(
          "disconnected",
          {
            code,
            reason
          }
        );

        if (
          !this.manualDisconnect &&
          this.reconnectEnabled
        ) {
          this.scheduleReconnect();
        }
      }
    );
  }

  disconnect() {
    this.manualDisconnect =
      true;

    this.reconnectEnabled =
      false;

    this.clearReconnectTimer();

    const socket =
      this.socket;

    this.socket =
      null;

    if (socket) {
      try {
        if (
          socket.readyState ===
            WebSocket.OPEN ||
          socket.readyState ===
            WebSocket.CONNECTING
        ) {
          socket.close(
            1000,
            "Manual disconnect"
          );
        }
      } catch {
        // Nie przerywamy zamykania aplikacji.
      }
    }

    this.connected =
      false;

    this.connecting =
      false;

    this.status =
      "disconnected";

    this.lastError =
      null;

    this.emitState();
  }

  scheduleReconnect() {
    if (
      this.manualDisconnect ||
      !this.reconnectEnabled
    ) {
      return;
    }

    this.clearReconnectTimer();

    this.reconnectAttempts += 1;

    const exponentialDelay =
      2000 *
      Math.pow(
        2,
        Math.min(
          this.reconnectAttempts - 1,
          4
        )
      );

    const delay =
      Math.min(
        exponentialDelay,
        this.maxReconnectDelay
      );

    this.status =
      "reconnecting";

    this.emitState();

    this.reconnectTimer =
      setTimeout(
        () => {
          this.reconnectTimer =
            null;

          try {
            this.connect();
          } catch (
            error
          ) {
            this.lastError =
              error.message;

            this.emitState();

            this.scheduleReconnect();
          }
        },
        delay
      );
  }

  clearReconnectTimer() {
    if (
      this.reconnectTimer
    ) {
      clearTimeout(
        this.reconnectTimer
      );

      this.reconnectTimer =
        null;
    }
  }

  parseMessage(rawMessage) {
    try {
      return JSON.parse(
        rawMessage.toString()
      );
    } catch {
      return null;
    }
  }

  handleMessage(rawMessage) {
    const message =
      this.parseMessage(
        rawMessage
      );

    if (!message) {
      return;
    }

    const eventType =
      String(
        message.event ||
        message.type ||
        message.eventType ||
        ""
      );

    const data =
      message.data ||
      message.payload ||
      message;

    this.lastEventAt =
      new Date()
        .toISOString();

    this.emit(
      "raw-event",
      {
        event:
          eventType,

        data
      }
    );

    if (
      eventType ===
      "chat"
    ) {
      this.handleChat(
        data
      );

      return;
    }

    if (
      eventType ===
        "roomUserSeq" ||
      eventType ===
        "roomUser"
    ) {
      this.handleViewerCount(
        data
      );

      return;
    }

    if (
      eventType ===
      "like"
    ) {
      this.handleLike(
        data
      );

      return;
    }

    if (
      eventType ===
      "roomInfo"
    ) {
      this.handleRoomInfo(
        data
      );

      return;
    }

    this.emitState();
  }

  handleChat(data) {
    const user =
      data.user ||
      data.userInfo ||
      data.author ||
      {};

    const comment =
      String(
        data.comment ||
        data.text ||
        data.message ||
        ""
      ).trim();

    if (!comment) {
      return;
    }

    const uniqueId =
      String(
        user.uniqueId ||
        user.unique_id ||
        data.user_unique_id ||
        data.uniqueId ||
        data.username ||
        ""
      ).trim();

    const numericId =
      String(
        user.id ||
        user.userId ||
        data.userId ||
        data.user_id ||
        ""
      ).trim();

    const nickname =
      String(
        user.nickname ||
        user.displayName ||
        data.nickname ||
        data.displayName ||
        uniqueId ||
        numericId ||
        "widz"
      ).trim();

    const userId =
      numericId ||
      uniqueId;

    if (!userId) {
      return;
    }

    const normalizedComment = {
      userId,
      username:
        uniqueId ||
        nickname,

      displayName:
        nickname,

      comment,

      source:
        "tiktok",

      receivedAt:
        new Date()
          .toISOString()
    };

    this.lastComment =
      normalizedComment;

    this.emitState();

    this.emit(
      "chat",
      normalizedComment
    );
  }

  handleViewerCount(data) {
    const possibleValues = [
      data.viewerCount,
      data.viewer_count,
      data.userCount,
      data.user_count,
      data.totalUser,
      data.total_user
    ];

    const value =
      possibleValues
        .map(Number)
        .find(
          (candidate) =>
            Number.isFinite(
              candidate
            ) &&
            candidate >= 0
        );

    if (
      value !== undefined
    ) {
      this.viewerCount =
        Math.floor(value);
    }

    this.emitState();

    this.emit(
      "viewer-count",
      this.viewerCount
    );
  }

  handleLike(data) {
    const possibleValues = [
      data.totalLikes,
      data.totalLikeCount,
      data.total_likes,
      data.likeCount
    ];

    const value =
      possibleValues
        .map(Number)
        .find(
          (candidate) =>
            Number.isFinite(
              candidate
            ) &&
            candidate >= 0
        );

    if (
      value !== undefined
    ) {
      this.totalLikes =
        Math.floor(value);
    }

    this.emitState();

    this.emit(
      "like",
      {
        totalLikes:
          this.totalLikes
      }
    );
  }

  handleRoomInfo(data) {
    const viewerCount =
      Number(
        data.viewerCount ||
        data.viewer_count ||
        data.userCount
      );

    if (
      Number.isFinite(
        viewerCount
      ) &&
      viewerCount >= 0
    ) {
      this.viewerCount =
        Math.floor(
          viewerCount
        );
    }

    this.emitState();

    this.emit(
      "room-info",
      data
    );
  }
}

module.exports =
  TikTokEngine;