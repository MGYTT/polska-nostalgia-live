"use strict";

const { EventEmitter } = require("events");
const crypto = require("crypto");

class ShowMomentEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.settings = {
      minimumDurationMs: this.normalizeInteger(
        options.minimumDurationMs,
        2000,
        1000,
        60000
      ),

      maximumDurationMs: this.normalizeInteger(
        options.maximumDurationMs,
        30000,
        2000,
        120000
      ),

      maximumQueueSize: this.normalizeInteger(
        options.maximumQueueSize,
        25,
        1,
        100
      ),

      duplicateWindowMs: this.normalizeInteger(
        options.duplicateWindowMs,
        1500,
        0,
        30000
      )
    };

    this.active = null;
    this.queue = [];

    this.activeTimer = null;

    this.lastFingerprint = null;
    this.lastQueuedAt = 0;

    this.sequence = 0;
    this.lastAction = null;
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

  normalizeText(
    value,
    maximumLength = 500,
    fallback = ""
  ) {
    const normalized = String(
      value ?? ""
    )
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, maximumLength);

    return normalized || fallback;
  }

  normalizeStringArray(
    value,
    maximumItems = 20
  ) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .slice(0, maximumItems)
      .map((item) => {
        return this.normalizeText(
          item,
          20
        );
      })
      .filter(Boolean);
  }

  createEventId(type) {
    this.sequence += 1;

    return [
      type || "moment",
      Date.now(),
      this.sequence,
      crypto
        .randomBytes(4)
        .toString("hex")
    ].join("-");
  }

  getPreset(type) {
    const presets = {
      follow: {
        type: "follow",
        theme: "follow",
        priority: 40,
        duration: 7000,
        category: "LIVE MOMENT",
        icon: "❤️",
        eyebrow: "PODOBA CI SIĘ LIVE?",
        title: "ZOSTAW OBSERWACJĘ",
        description:
          "Zostań z nami na kolejne muzyczne rundy.",
        actionIcon: "+",
        actionText: "OBSERWUJ PROFIL",
        secondaryIcon: "♪",
        secondaryText: "QUIZ TRWA DALEJ",
        bottomText:
          "ZA CHWILĘ WRACAMY DO GRY",
        floatingIcons: [
          "❤️",
          "✨",
          "❤️",
          "♪"
        ],
        stage: "default"
      },

      tap: {
        type: "tap",
        theme: "tap",
        priority: 45,
        duration: 6500,
        category: "ROZGRZEWAMY LIVE",
        icon: "❤️",
        eyebrow: "POKAŻCIE ENERGIĘ!",
        title: "TAPUJ EKRAN!",
        description:
          "Zasypmy ten LIVE sercami i rozkręćmy kolejną rundę.",
        actionIcon: "❤️",
        actionText: "TAPUJ TERAZ",
        secondaryIcon: "🔥",
        secondaryText:
          "ROZGRZEWAMY POLSKĄ NOSTALGIĘ",
        bottomText:
          "CZEKAMY NA WASZE SERCA",
        floatingIcons: [
          "❤️",
          "🔥",
          "💗",
          "✨"
        ],
        stage: "tap",
        combo: 1
      },

      chat: {
        type: "chat",
        theme: "share",
        priority: 35,
        duration: 6500,
        category: "AKTYWNY CZAT",
        icon: "💬",
        eyebrow:
          "CZAT, JESTEŚCIE Z NAMI?",
        title:
          "NAPISZ COŚ NA CZACIE",
        description:
          "Napisz serce lub ogień, jeśli czekasz na kolejny hit.",
        actionIcon: "💬",
        actionText:
          "NAPISZ WIADOMOŚĆ",
        secondaryIcon: "🔥",
        secondaryText:
          "POKAŻ, ŻE JESTEŚ Z NAMI",
        bottomText:
          "CZYTAMY WASZE WIADOMOŚCI",
        floatingIcons: [
          "💬",
          "🔥",
          "❤️",
          "✨"
        ],
        stage: "default"
      },

      share: {
        type: "share",
        theme: "share",
        priority: 50,
        duration: 7000,
        category: "ZAPROŚ ZNAJOMYCH",
        icon: "↗",
        eyebrow: "GRAMY RAZEM!",
        title: "UDOSTĘPNIJ LIVE",
        description:
          "Zaproś znajomych do wspólnego zgadywania hitów.",
        actionIcon: "↗",
        actionText:
          "UDOSTĘPNIJ ZNAJOMYM",
        secondaryIcon: "👥",
        secondaryText:
          "IM WIĘCEJ NAS, TYM LEPSZA ZABAWA",
        bottomText:
          "DOŁĄCZCIE DO MUZYCZNEJ GRY",
        floatingIcons: [
          "↗",
          "👤",
          "✨",
          "👥"
        ],
        stage: "share"
      },

      invite: {
        type: "invite",
        theme: "share",
        priority: 45,
        duration: 7000,
        category: "WSPÓLNA ZABAWA",
        icon: "👥",
        eyebrow:
          "ZNASZ KOGOŚ, KTO PAMIĘTA TE HITY?",
        title: "ZAPROŚ ZNAJOMYCH",
        description:
          "Sprawdźcie razem, kto ma najlepszą muzyczną pamięć.",
        actionIcon: "+",
        actionText: "ZAPROŚ DO LIVE",
        secondaryIcon: "🏆",
        secondaryText:
          "WALCZCIE RAZEM O TOP 3",
        bottomText:
          "IM WIĘCEJ GRACZY, TYM WIĘCEJ EMOCJI",
        floatingIcons: [
          "👥",
          "🎵",
          "🏆",
          "✨"
        ],
        stage: "share"
      },

      gift: {
        type: "gift",
        theme: "gift",
        priority: 80,
        duration: 7500,
        category: "WSPARCIE LIVE",
        icon: "🎁",
        eyebrow:
          "PODOBA CI SIĘ NASZ PROJEKT?",
        title:
          "WESPRZYJ NAS GIFTEM!",
        description:
          "Każde wsparcie pomaga rozwijać Polską Nostalgię.",
        actionIcon: "🎁",
        actionText: "WYŚLIJ GIFTA",
        secondaryIcon: "💜",
        secondaryText:
          "DZIĘKUJEMY ZA WSPARCIE",
        bottomText:
          "TEN LIVE TWORZYMY RAZEM",
        floatingIcons: [
          "🎁",
          "⭐",
          "💜",
          "✨"
        ],
        stage: "gift"
      },

      record: {
        type: "record",
        theme: "record",
        priority: 70,
        duration: 8000,
        category: "SPECJALNY CEL",
        icon: "👑",
        eyebrow:
          "RAZEM MOŻEMY TO ZROBIĆ!",
        title: "WBIJAMY REKORD",
        description:
          "Zaproś znajomych i pomóż nam osiągnąć wspólny cel.",
        actionIcon: "👑",
        actionText:
          "DOŁĄCZ DO REKORDU",
        secondaryIcon: "↗",
        secondaryText:
          "UDOSTĘPNIJ LIVE",
        bottomText:
          "KAŻDA OSOBA PRZYBLIŻA NAS DO CELU",
        floatingIcons: [
          "👑",
          "🔥",
          "⭐",
          "🏆"
        ],
        stage: "record",
        recordLabel:
          "WBIJAMY REKORD",
        recordValue: 0,
        recordUnit: "GRACZY"
      },

      thanks: {
        type: "thanks",
        theme: "thanks",
        priority: 90,
        duration: 7500,
        category: "DZIĘKUJEMY",
        icon: "💜",
        eyebrow:
          "TEN LIVE TWORZYMY RAZEM",
        title:
          "DZIĘKUJEMY, ŻE JESTEŚCIE!",
        description:
          "Wasza obecność i wsparcie napędzają Polską Nostalgię.",
        actionIcon: "💜",
        actionText:
          "JESTEŚCIE NAJLEPSI",
        secondaryIcon: "✨",
        secondaryText: "GRAMY DALEJ",
        bottomText:
          "ZA CHWILĘ KOLEJNY MUZYCZNY HIT",
        floatingIcons: [
          "💜",
          "✨",
          "❤️",
          "⭐"
        ],
        stage: "thanks"
      },

      next: {
        type: "next",
        theme: "follow",
        priority: 30,
        duration: 5500,
        category:
          "POLSKA NOSTALGIA LIVE",
        icon: "🎵",
        eyebrow:
          "GOTOWI NA KOLEJNE WYZWANIE?",
        title:
          "ZA CHWILĘ KOLEJNY HIT",
        description:
          "Przygotuj swoją muzyczną pamięć i walcz o punkty.",
        actionIcon: "♪",
        actionText:
          "ZOSTAŃ Z NAMI",
        secondaryIcon: "🏆",
        secondaryText:
          "KOLEJNA SZANSA NA TOP 3",
        bottomText:
          "NOWA RUNDA JUŻ ZA MOMENT",
        floatingIcons: [
          "🎵",
          "♪",
          "🎶",
          "✨"
        ],
        stage: "default"
      },

      custom: {
        type: "custom",
        theme: "follow",
        priority: 60,
        duration: 7000,
        category: "SPECJALNY MOMENT",
        icon: "✨",
        eyebrow:
          "POLSKA NOSTALGIA LIVE",
        title:
          "SPECJALNY KOMUNIKAT",
        description:
          "Zostań z nami.",
        actionIcon: "✨",
        actionText:
          "POLSKA NOSTALGIA",
        secondaryIcon: "♪",
        secondaryText:
          "QUIZ TRWA DALEJ",
        bottomText:
          "ZA CHWILĘ WRACAMY DO GRY",
        floatingIcons: [
          "✨",
          "⭐",
          "🎵"
        ],
        stage: "default"
      }
    };

    return {
      ...(
        presets[type] ||
        presets.custom
      )
    };
  }

  normalizeMoment(payload = {}) {
    const requestedType = this.normalizeText(
      payload.type ||
      payload.preset ||
      payload.id ||
      "custom",
      30,
      "custom"
    ).toLowerCase();

    const preset =
      this.getPreset(requestedType);

    const duration = this.normalizeInteger(
      payload.duration ??
      payload.durationMs ??
      preset.duration,
      preset.duration,
      this.settings.minimumDurationMs,
      this.settings.maximumDurationMs
    );

    const priority = this.normalizeInteger(
      payload.priority ??
      preset.priority,
      preset.priority,
      0,
      1000
    );

    return {
      eventId: this.normalizeText(
        payload.eventId ||
        payload.requestId ||
        payload.instanceId ||
        this.createEventId(requestedType),
        150
      ),

      type: requestedType,

      preset: requestedType,

      theme: this.normalizeText(
        payload.theme ||
        preset.theme,
        30,
        "follow"
      ),

      priority,
      duration,

      category: this.normalizeText(
        payload.category ||
        preset.category,
        60,
        "LIVE MOMENT"
      ),

      icon: this.normalizeText(
        payload.icon ||
        preset.icon,
        20,
        "✨"
      ),

      eyebrow: this.normalizeText(
        payload.eyebrow ||
        preset.eyebrow,
        120,
        "POLSKA NOSTALGIA LIVE"
      ),

      title: this.normalizeText(
        payload.title ||
        preset.title,
        150,
        "SPECJALNY MOMENT"
      ),

      description: this.normalizeText(
        payload.description ||
        preset.description,
        350,
        "Zostań z nami."
      ),

      actionIcon: this.normalizeText(
        payload.actionIcon ||
        preset.actionIcon,
        20,
        "✨"
      ),

      actionText: this.normalizeText(
        payload.actionText ||
        preset.actionText,
        100,
        "POLSKA NOSTALGIA"
      ),

      secondaryIcon: this.normalizeText(
        payload.secondaryIcon ||
        preset.secondaryIcon,
        20,
        "♪"
      ),

      secondaryText: this.normalizeText(
        payload.secondaryText ||
        preset.secondaryText,
        140,
        "QUIZ TRWA DALEJ"
      ),

      bottomText: this.normalizeText(
        payload.bottomText ||
        preset.bottomText,
        140,
        "ZA CHWILĘ WRACAMY DO GRY"
      ),

      floatingIcons:
        this.normalizeStringArray(
          payload.floatingIcons
        ).length > 0
          ? this.normalizeStringArray(
              payload.floatingIcons
            )
          : [
              ...(
                preset.floatingIcons ||
                []
              )
            ],

      stage: this.normalizeText(
        payload.stage ||
        preset.stage ||
        "default",
        30,
        "default"
      ),

      showCounter: Boolean(
        payload.showCounter ||
        payload.counterVisible
      ),

      counterLabel: this.normalizeText(
        payload.counterLabel,
        50,
        "RAZEM"
      ),

      counterValue: this.normalizeInteger(
        payload.counterValue ??
        payload.value,
        0,
        0,
        999999999
      ),

      combo: this.normalizeInteger(
        payload.combo ??
        preset.combo,
        1,
        1,
        999999
      ),

      recordLabel: this.normalizeText(
        payload.recordLabel ||
        preset.recordLabel,
        80,
        "WBIJAMY REKORD"
      ),

      recordValue: this.normalizeInteger(
        payload.recordValue ??
        payload.value ??
        preset.recordValue,
        0,
        0,
        999999999
      ),

      recordUnit: this.normalizeText(
        payload.recordUnit ||
        preset.recordUnit,
        40,
        "GRACZY"
      ),

      createdAt:
        new Date().toISOString(),

      startedAt: null,
      endsAt: null
    };
  }

  getFingerprint(moment) {
    return [
      moment.type,
      moment.title,
      moment.description,
      moment.actionText,
      moment.recordValue,
      moment.counterValue
    ].join("|");
  }

  enqueue(payload = {}) {
    const moment =
      this.normalizeMoment(payload);

    const fingerprint =
      this.getFingerprint(moment);

    const now = Date.now();

    if (
      fingerprint ===
        this.lastFingerprint &&
      now - this.lastQueuedAt <
        this.settings.duplicateWindowMs
    ) {
      return {
        accepted: false,
        duplicate: true,
        moment: null,
        state: this.getState()
      };
    }

    const duplicateId =
      this.active?.eventId ===
        moment.eventId ||
      this.queue.some((item) => {
        return (
          item.eventId ===
          moment.eventId
        );
      });

    if (duplicateId) {
      return {
        accepted: false,
        duplicate: true,
        moment: null,
        state: this.getState()
      };
    }

    this.lastFingerprint =
      fingerprint;

    this.lastQueuedAt =
      now;

    if (
      this.queue.length >=
      this.settings.maximumQueueSize
    ) {
      this.queue.pop();
    }

    this.queue.push(moment);

    this.queue.sort(
      (left, right) => {
        if (
          right.priority !==
          left.priority
        ) {
          return (
            right.priority -
            left.priority
          );
        }

        return (
          new Date(
            left.createdAt
          ).getTime() -
          new Date(
            right.createdAt
          ).getTime()
        );
      }
    );

    this.lastAction = {
      type: "enqueue",
      eventId: moment.eventId,
      at: new Date().toISOString()
    };

    this.emitState();

    if (!this.active) {
      this.startNext();
    }

    return {
      accepted: true,
      duplicate: false,
      moment: {
        ...moment
      },
      state: this.getState()
    };
  }

  startNext() {
    if (
      this.active ||
      this.queue.length === 0
    ) {
      this.emitState();
      return null;
    }

    clearTimeout(this.activeTimer);

    const moment =
      this.queue.shift();

    const startedAt =
      Date.now();

    this.active = {
      ...moment,
      startedAt:
        new Date(
          startedAt
        ).toISOString(),
      endsAt:
        new Date(
          startedAt +
          moment.duration
        ).toISOString()
    };

    this.lastAction = {
      type: "start",
      eventId:
        this.active.eventId,
      at:
        new Date().toISOString()
    };

    this.emit(
      "show",
      {
        command: "show",
        ...this.active
      }
    );

    this.emitState();

    this.activeTimer =
      setTimeout(
        () => {
          this.completeActive(
            "timeout"
          );
        },
        this.active.duration
      );

    return {
      ...this.active
    };
  }

  completeActive(reason = "complete") {
    if (!this.active) {
      return null;
    }

    clearTimeout(this.activeTimer);
    this.activeTimer = null;

    const completed = {
      ...this.active
    };

    this.active = null;

    this.lastAction = {
      type: reason,
      eventId:
        completed.eventId,
      at:
        new Date().toISOString()
    };

    this.emit(
      "stop",
      {
        command: "stop",
        eventId:
          completed.eventId,
        reason,
        clearQueue: false
      }
    );

    this.emitState();

    setTimeout(
      () => {
        this.startNext();
      },
      700
    );

    return completed;
  }

  stop(options = {}) {
    const clearQueue =
      Boolean(
        options.clearQueue
      );

    const stopped =
      this.active
        ? {
            ...this.active
          }
        : null;

    clearTimeout(this.activeTimer);
    this.activeTimer = null;

    this.active = null;

    if (clearQueue) {
      this.queue = [];
    }

    this.lastAction = {
      type:
        clearQueue
          ? "stop-all"
          : "stop",
      eventId:
        stopped?.eventId ||
        null,
      at:
        new Date().toISOString()
    };

    this.emit(
      "stop",
      {
        command: "stop",
        eventId:
          stopped?.eventId ||
          null,
        clearQueue
      }
    );

    this.emitState();

    if (
      !clearQueue &&
      this.queue.length > 0
    ) {
      setTimeout(
        () => {
          this.startNext();
        },
        700
      );
    }

    return {
      stopped,
      state: this.getState()
    };
  }

  clearQueue() {
    const removed =
      this.queue.length;

    this.queue = [];

    this.lastAction = {
      type: "clear",
      eventId: null,
      at: new Date().toISOString()
    };

    this.emit(
      "clear",
      {
        command: "clear",
        removed
      }
    );

    this.emitState();

    return {
      removed,
      state: this.getState()
    };
  }

  update(payload = {}) {
    if (!this.active) {
      throw new Error(
        "Brak aktywnej animacji LIVE FX."
      );
    }

    const requestedId =
      this.normalizeText(
        payload.eventId,
        150
      );

    if (
      requestedId &&
      requestedId !==
        this.active.eventId
    ) {
      throw new Error(
        "Wskazana animacja nie jest obecnie aktywna."
      );
    }

    const editableTextFields = [
      ["title", 150],
      ["description", 350],
      ["actionText", 100],
      ["secondaryText", 140],
      ["bottomText", 140],
      ["counterLabel", 50],
      ["recordLabel", 80],
      ["recordUnit", 40]
    ];

    for (
      const [
        field,
        maximumLength
      ] of editableTextFields
    ) {
      if (
        payload[field] ===
        undefined
      ) {
        continue;
      }

      this.active[field] =
        this.normalizeText(
          payload[field],
          maximumLength,
          this.active[field]
        );
    }

    if (
      payload.counterValue !==
      undefined
    ) {
      this.active.counterValue =
        this.normalizeInteger(
          payload.counterValue,
          this.active.counterValue,
          0,
          999999999
        );

      this.active.showCounter =
        true;
    }

    if (
      payload.combo !==
      undefined
    ) {
      this.active.combo =
        this.normalizeInteger(
          payload.combo,
          this.active.combo,
          1,
          999999
        );
    }

    if (
      payload.recordValue !==
      undefined
    ) {
      this.active.recordValue =
        this.normalizeInteger(
          payload.recordValue,
          this.active.recordValue,
          0,
          999999999
        );
    }

    this.lastAction = {
      type: "update",
      eventId:
        this.active.eventId,
      at:
        new Date().toISOString()
    };

    this.emit(
      "update",
      {
        command: "update",
        ...this.active
      }
    );

    this.emitState();

    return {
      active: {
        ...this.active
      },
      state: this.getState()
    };
  }

  emitState() {
    this.emit(
      "state",
      this.getState()
    );
  }

  getState() {
    return {
      available: true,

      active:
        this.active
          ? {
              ...this.active
            }
          : null,

      queue:
        this.queue.map((moment) => {
          return {
            ...moment
          };
        }),

      queueCount:
        this.queue.length,

      lastAction:
        this.lastAction
          ? {
              ...this.lastAction
            }
          : null
    };
  }

  shutdown() {
    clearTimeout(this.activeTimer);

    this.activeTimer = null;
    this.active = null;
    this.queue = [];

    this.removeAllListeners();
  }
}

module.exports = ShowMomentEngine;