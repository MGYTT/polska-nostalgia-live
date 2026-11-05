"use strict";

const EventEmitter = require("events");

class LiveController extends EventEmitter {
  constructor({
    spotify,
    quizEngine,
    voteEngine,
    settings = {}
  }) {
    super();

    if (!spotify) {
      throw new Error(
        "LiveController wymaga instancji SpotifyEngine."
      );
    }

    if (!quizEngine) {
      throw new Error(
        "LiveController wymaga instancji QuizEngine."
      );
    }

    if (!voteEngine) {
      throw new Error(
        "LiveController wymaga instancji VoteEngine."
      );
    }

    this.spotify = spotify;
    this.quizEngine = quizEngine;
    this.voteEngine = voteEngine;

    this.settings = {
      requiredCorrect: this.normalizeInteger(
        settings.requiredCorrect,
        10,
        1,
        1000000
      ),

      artistDurationSeconds: this.normalizeInteger(
        settings.artistDurationSeconds,
        45,
        10,
        600
      ),

      titleDurationSeconds: this.normalizeInteger(
        settings.titleDurationSeconds,
        45,
        10,
        600
      ),

      roundRevealSeconds: this.normalizeInteger(
        settings.roundRevealSeconds,
        6,
        1,
        60
      ),

      hintOneSeconds: this.normalizeInteger(
        settings.hintOneSeconds,
        15,
        1,
        600
      ),

      hintTwoSeconds: this.normalizeInteger(
        settings.hintTwoSeconds,
        30,
        1,
        600
      ),

      playbackMaxAttempts: this.normalizeInteger(
        settings.playbackMaxAttempts,
        3,
        1,
        10
      ),

      playbackSyncTimeoutSeconds: this.normalizeInteger(
        settings.playbackSyncTimeoutSeconds,
        15,
        5,
        60
      ),

      playbackSyncPollMs: this.normalizeInteger(
        settings.playbackSyncPollMs,
        500,
        200,
        3000
      ),

      playbackRequiredConfirmations: this.normalizeInteger(
        settings.playbackRequiredConfirmations,
        2,
        1,
        5
      ),

      playbackMinimumProgressMs: this.normalizeInteger(
        settings.playbackMinimumProgressMs,
        120,
        1,
        5000
      ),

      maxRoundSelectionAttempts: this.normalizeInteger(
        settings.maxRoundSelectionAttempts,
        25,
        3,
        500
      ),

      maxConsecutiveSkippedRounds: this.normalizeInteger(
        settings.maxConsecutiveSkippedRounds,
        5,
        1,
        50
      ),

      recoveryBreakSeconds: this.normalizeInteger(
        settings.recoveryBreakSeconds,
        7,
        2,
        120
      ),

      criticalRecoveryBreakSeconds: this.normalizeInteger(
        settings.criticalRecoveryBreakSeconds,
        20,
        5,
        300
      ),

      returningCountdownSeconds: this.normalizeInteger(
        settings.returningCountdownSeconds,
        3,
        1,
        10
      ),

      healthCheckIntervalSeconds: this.normalizeInteger(
        settings.healthCheckIntervalSeconds,
        15,
        5,
        300
      ),

      watchdogIntervalSeconds: this.normalizeInteger(
        settings.watchdogIntervalSeconds,
        8,
        3,
        120
      ),

      watchdogFailureThreshold: this.normalizeInteger(
        settings.watchdogFailureThreshold,
        2,
        1,
        10
      ),

      watchdogPositionToleranceMs: this.normalizeInteger(
        settings.watchdogPositionToleranceMs,
        8000,
        1000,
        60000
      ),

      watchdogMinimumAdvanceMs: this.normalizeInteger(
        settings.watchdogMinimumAdvanceMs,
        500,
        100,
        10000
      ),

      recentlyPlayedLimit: this.normalizeInteger(
        settings.recentlyPlayedLimit,
        20,
        1,
        500
      ),

      baseCorrectPoints: this.normalizeInteger(
        settings.baseCorrectPoints,
        100,
        1,
        100000
      ),

      firstPlaceBonus: this.normalizeInteger(
        settings.firstPlaceBonus,
        50,
        0,
        100000
      ),

      secondPlaceBonus: this.normalizeInteger(
        settings.secondPlaceBonus,
        30,
        0,
        100000
      ),

      thirdPlaceBonus: this.normalizeInteger(
        settings.thirdPlaceBonus,
        20,
        0,
        100000
      )
    };

    this.leaderboard = new Map();

    this.stageTimeout = null;
    this.clockInterval = null;
    this.transitionInterval = null;
    this.watchdogInterval = null;

    this.stageGeneration = 0;
    this.recoverySequence = 0;

    this.stageStartedAt = null;
    this.stageDurationSeconds = null;

    this.transitionInProgress = false;
    this.recoveryInProgress = false;
    this.roundSelectionInProgress = false;
    this.playbackStartInProgress = false;
    this.stoppedExplicitly = false;

    this.consecutiveSkippedRounds = 0;
    this.watchdogFailures = 0;

    this.lastWatchdogProgressMs = null;
    this.lastWatchdogCheckedAt = null;
    this.lastWatchdogDeviceId = null;

    this.recentlyPlayedUris = [];
    this.sessionFailedUris = new Set();

    this.promoRotationIndex = 0;

    this.promoBreaks = [
      {
        type: "follow",
        icon: "❤️",
        eyebrow: "PODOBA CI SIĘ QUIZ?",
        title: "ZOSTAW OBSERWACJĘ",
        description:
          "Dzięki temu nie przegapisz kolejnego muzycznego LIVE.",
        callToAction:
          "OBSERWUJ PROFIL"
      },
      {
        type: "support",
        icon: "💜",
        eyebrow:
          "ROZWIJAMY TEN PROJEKT",
        title:
          "WESPRZYJ NASZE LIVE",
        description:
          "Każde wsparcie pomaga tworzyć jeszcze lepsze rundy.",
        callToAction:
          "DZIĘKUJEMY, ŻE JESTEŚ"
      },
      {
        type: "chat",
        icon: "💬",
        eyebrow:
          "CZAT, JESTEŚCIE Z NAMI?",
        title:
          "NAPISZ COŚ NA CZACIE",
        description:
          "Wyślij serce lub ogień, jeśli czekasz na kolejny hit.",
        callToAction:
          "CZEKAMY NA WIADOMOŚĆ"
      },
      {
        type: "project",
        icon: "🎵",
        eyebrow:
          "POLSKA NOSTALGIA LIVE",
        title:
          "TWORZYMY TO DLA WAS",
        description:
          "Przed nami kolejny hit i kolejna szansa na punkty.",
        callToAction:
          "ZOSTAŃ Z NAMI"
      }
    ];

    this.state =
      this.createInitialState();
  }

  normalizeInteger(
    value,
    fallback,
    minimum,
    maximum
  ) {
    const parsed =
      Number(value);

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

  clone(value) {
    if (
      typeof structuredClone ===
      "function"
    ) {
      return structuredClone(value);
    }

    return JSON.parse(
      JSON.stringify(value)
    );
  }

  createInitialPlaybackState() {
    return {
      status: "idle",

      requested: false,
      syncing: false,
      verifying: false,
      verified: false,
      playing: false,
      recovering: false,

      attempt: 0,

      maxAttempts:
        this.settings.playbackMaxAttempts,

      operationId: null,

      positionMs: 0,
      progressMs: 0,
      progressDeltaMs: 0,

      verificationSamples: 0,

      expectedTrackUri: null,
      actualTrackUri: null,

      deviceId: null,
      deviceName: null,

      syncStartedAt: null,
      syncDeadlineAt: null,
      verifiedAt: null,

      failureCode: null,
      failureCount: 0,

      recoveryAction: null,
      nextRetryAt: null,

      lastError: null,
      lastSuccessAt: null,

      watchdogStatus: "idle",
      watchdogFailures: 0,
      lastWatchdogAt: null
    };
  }

  createInitialRecoveryState() {
    return {
      active: false,
      kind: null,
      sequence: 0,
      attempt: 0,

      reason: null,
      code: null,

      startedAt: null,
      nextRetryAt: null,

      skippable: false,
      critical: false,

      promo: null,
      diagnostics: null
    };
  }

  createInitialState() {
    return {
      version: "8.0",

      running: false,
      paused: false,
      locked: false,

      phase: "idle",
      stage: null,

      round: 0,
      roundId: null,

      currentTrack: null,
      question: null,

      votes: {
        A: 0,
        B: 0,
        C: 0,
        D: 0
      },

      requiredCorrect:
        this.settings.requiredCorrect,

      correctCount: 0,
      totalVotes: 0,
      uniquePlayers: 0,

      recentVotes: [],
      winners: [],

      hint: null,
      hintLevel: 0,

      remainingSeconds: null,
      countdown: null,

      playback:
        this.createInitialPlaybackState(),

      recovery:
        this.createInitialRecoveryState(),

      reveal: null,

      correctLetter: null,
      correctAnswer: null,

      skippedRounds: 0,
      consecutiveSkippedRounds: 0,

      recentTrackUris: [],

      lastTransitionAt: null
    };
  }

  getState() {
    return this.clone(
      this.state
    );
  }

  getLeaderboard() {
    return [
      ...this.leaderboard.values()
    ]
      .sort(
        (left, right) => {
          const pointsDifference =
            Number(
              right.points
            ) -
            Number(
              left.points
            );

          if (
            pointsDifference !== 0
          ) {
            return pointsDifference;
          }

          const correctDifference =
            Number(
              right.correctAnswers
            ) -
            Number(
              left.correctAnswers
            );

          if (
            correctDifference !== 0
          ) {
            return correctDifference;
          }

          const firstPlacesDifference =
            Number(
              right.firstPlaces
            ) -
            Number(
              left.firstPlaces
            );

          if (
            firstPlacesDifference !== 0
          ) {
            return firstPlacesDifference;
          }

          return String(
            left.displayName ||
            left.username ||
            ""
          ).localeCompare(
            String(
              right.displayName ||
              right.username ||
              ""
            ),
            "pl"
          );
        }
      )
      .map(
        (player) => ({
          ...player
        })
      );
  }

  emitState() {
    this.emit(
      "state",
      this.getState()
    );
  }

  emitDiagnostic(
    type,
    payload = {}
  ) {
    this.emit(
      "diagnostic",
      {
        type,

        timestamp:
          new Date().toISOString(),

        ...payload
      }
    );
  }

  updateLastTransition() {
    this.state.lastTransitionAt =
      new Date().toISOString();
  }

  isGenerationCurrent(
    generation
  ) {
    return Boolean(
      generation ===
        this.stageGeneration &&
      !this.stoppedExplicitly
    );
  }

  clearStageTimers() {
    if (this.stageTimeout) {
      clearTimeout(
        this.stageTimeout
      );

      this.stageTimeout =
        null;
    }

    if (this.clockInterval) {
      clearInterval(
        this.clockInterval
      );

      this.clockInterval =
        null;
    }

    this.stageStartedAt =
      null;

    this.stageDurationSeconds =
      null;
  }

  clearTransitionTimer() {
    if (
      this.transitionInterval
    ) {
      clearInterval(
        this.transitionInterval
      );

      this.transitionInterval =
        null;
    }
  }

  stopWatchdog() {
    if (
      this.watchdogInterval
    ) {
      clearInterval(
        this.watchdogInterval
      );

      this.watchdogInterval =
        null;
    }

    this.watchdogFailures =
      0;

    this.lastWatchdogProgressMs =
      null;

    this.lastWatchdogCheckedAt =
      null;

    this.lastWatchdogDeviceId =
      null;
  }

  clearTimers() {
    this.clearStageTimers();
    this.clearTransitionTimer();
    this.stopWatchdog();
  }

  resetVotes() {
    this.voteEngine.reset();

    this.state.votes = {
      A: 0,
      B: 0,
      C: 0,
      D: 0
    };

    this.state.correctCount = 0;
    this.state.totalVotes = 0;
    this.state.uniquePlayers = 0;

    this.state.recentVotes = [];
    this.state.winners = [];
  }

  resetRoundPresentation() {
    this.state.hint = null;
    this.state.hintLevel = 0;

    this.state.remainingSeconds = null;
    this.state.countdown = null;

    this.state.reveal = null;

    this.state.correctLetter = null;
    this.state.correctAnswer = null;
  }

  updateSettings(
    payload = {}
  ) {
    const mappings = [
      [
        "requiredCorrect",
        1,
        1000000
      ],
      [
        "artistDurationSeconds",
        10,
        600
      ],
      [
        "titleDurationSeconds",
        10,
        600
      ],
      [
        "roundRevealSeconds",
        1,
        60
      ],
      [
        "hintOneSeconds",
        1,
        600
      ],
      [
        "hintTwoSeconds",
        1,
        600
      ],
      [
        "playbackMaxAttempts",
        1,
        10
      ],
      [
        "playbackSyncTimeoutSeconds",
        5,
        60
      ],
      [
        "playbackSyncPollMs",
        200,
        3000
      ],
      [
        "playbackRequiredConfirmations",
        1,
        5
      ],
      [
        "playbackMinimumProgressMs",
        1,
        5000
      ],
      [
        "maxRoundSelectionAttempts",
        3,
        500
      ],
      [
        "maxConsecutiveSkippedRounds",
        1,
        50
      ],
      [
        "recoveryBreakSeconds",
        2,
        120
      ],
      [
        "criticalRecoveryBreakSeconds",
        5,
        300
      ],
      [
        "returningCountdownSeconds",
        1,
        10
      ],
      [
        "healthCheckIntervalSeconds",
        5,
        300
      ],
      [
        "watchdogIntervalSeconds",
        3,
        120
      ],
      [
        "watchdogFailureThreshold",
        1,
        10
      ],
      [
        "watchdogPositionToleranceMs",
        1000,
        60000
      ],
      [
        "watchdogMinimumAdvanceMs",
        100,
        10000
      ],
      [
        "recentlyPlayedLimit",
        1,
        500
      ],
      [
        "baseCorrectPoints",
        1,
        100000
      ],
      [
        "firstPlaceBonus",
        0,
        100000
      ],
      [
        "secondPlaceBonus",
        0,
        100000
      ],
      [
        "thirdPlaceBonus",
        0,
        100000
      ]
    ];

    for (
      const [
        key,
        minimum,
        maximum
      ] of mappings
    ) {
      if (
        payload[key] ===
        undefined
      ) {
        continue;
      }

      this.settings[key] =
        this.normalizeInteger(
          payload[key],
          this.settings[key],
          minimum,
          maximum
        );
    }

    this.state.requiredCorrect =
      this.settings.requiredCorrect;

    this.state.playback.maxAttempts =
      this.settings.playbackMaxAttempts;

    this.emitState();

    return {
      ...this.settings
    };
  }

  getRoundDuration() {
    return (
      this.state.stage ===
      "title"
        ? this.settings
            .titleDurationSeconds
        : this.settings
            .artistDurationSeconds
    );
  }

  getTrackUri(track) {
    return String(
      track?.uri ||
      ""
    ).trim();
  }

  calculateStartPosition(
    track
  ) {
    const durationMs =
      Number(
        track?.durationMs ||
        0
      );

    if (
      durationMs <= 0
    ) {
      return 0;
    }

    const requiredAudioMs =
      this.getRoundDuration() *
      1000;

    const maximumStart =
      Math.max(
        0,
        durationMs -
        requiredAudioMs -
        6000
      );

    if (
      maximumStart <= 0
    ) {
      return 0;
    }

    const preferredRatio =
      this.state.stage ===
      "title"
        ? 0.45
        : 0.12;

    return Math.min(
      Math.floor(
        durationMs *
        preferredRatio
      ),
      maximumStart
    );
  }

  rememberTrack(track) {
    const uri =
      this.getTrackUri(
        track
      );

    if (!uri) {
      return;
    }

    this.recentlyPlayedUris =
      this.recentlyPlayedUris
        .filter(
          (savedUri) =>
            savedUri !== uri
        );

    this.recentlyPlayedUris
      .push(uri);

    while (
      this.recentlyPlayedUris
        .length >
      this.settings
        .recentlyPlayedLimit
    ) {
      this.recentlyPlayedUris
        .shift();
    }

    this.state.recentTrackUris = [
      ...this.recentlyPlayedUris
    ];
  }

  isTrackAllowed(track) {
    const uri =
      this.getTrackUri(
        track
      );

    if (!uri) {
      return false;
    }

    if (
      this.sessionFailedUris
        .has(uri)
    ) {
      return false;
    }

    if (
      this.recentlyPlayedUris
        .includes(uri)
    ) {
      return false;
    }

    if (
      typeof this.spotify
        .isTrackBlocked ===
        "function" &&
      this.spotify
        .isTrackBlocked(uri)
    ) {
      return false;
    }

    return true;
  }

  markTrackFailed(
    track,
    error = null
  ) {
    const uri =
      this.getTrackUri(
        track
      );

    if (!uri) {
      return;
    }

    this.sessionFailedUris
      .add(uri);

    if (
      typeof this.spotify
        .registerTrackFailure ===
        "function"
    ) {
      this.spotify
        .registerTrackFailure(
          uri,
          error
        );
    }
  }

  normalizeSpotifyError(
    error
  ) {
    const source =
      error?.originalError ||
      error ||
      {};

    return {
      name:
        source.name ||
        "Error",

      message:
        source.message ||
        "Nieznany błąd Spotify.",

      status:
        Number(
          source.status ||
          error?.status ||
          0
        ),

      code:
        String(
          source.code ||
          error?.code ||
          "PLAYBACK_FAILED"
        ),

      reason:
        String(
          source.reason ||
          error?.reason ||
          ""
        ),

      retryAfterMs:
        Math.max(
          0,
          Number(
            source.retryAfterMs ||
            error?.retryAfterMs ||
            0
          )
        ),

      recoverable:
        source.recoverable !==
        undefined
          ? Boolean(
              source.recoverable
            )
          : error?.recoverable !==
            undefined
            ? Boolean(
                error.recoverable
              )
            : true
    };
  }

  getPromoBreak(
    critical = false
  ) {
    const promo =
      this.promoBreaks[
        this.promoRotationIndex %
        this.promoBreaks.length
      ];

    this.promoRotationIndex +=
      1;

    return {
      ...promo,

      critical:
        Boolean(critical),

      progress: 0
    };
  }

  async start() {
    if (
      this.state.running &&
      !this.state.paused
    ) {
      return this.getState();
    }

    if (
      this.state.running &&
      this.state.paused
    ) {
      return this.resume();
    }

    this.stoppedExplicitly =
      false;

    await this.startNewRound({
      reason: "start"
    });

    return this.getState();
  }

  async stop() {
    this.stoppedExplicitly =
      true;

    this.stageGeneration += 1;
    this.recoverySequence += 1;

    this.transitionInProgress =
      false;

    this.recoveryInProgress =
      false;

    this.roundSelectionInProgress =
      false;

    this.playbackStartInProgress =
      false;

    this.clearTimers();

    await this.pauseSpotify(
      false
    );

    this.voteEngine.reset();

    const previousRound =
      this.state.round;

    this.state =
      this.createInitialState();

    this.state.round =
      previousRound;

    this.emitState();

    return this.getState();
  }

  async pause() {
    if (!this.state.running) {
      return this.getState();
    }

    this.stageGeneration += 1;
    this.recoverySequence += 1;

    this.clearTimers();

    this.transitionInProgress =
      false;

    this.recoveryInProgress =
      false;

    this.playbackStartInProgress =
      false;

    this.state.paused =
      true;

    this.state.locked =
      true;

    this.state.phase =
      "paused";

    this.state.remainingSeconds =
      null;

    this.state.countdown =
      null;

    await this.pauseSpotify(
      false
    );

    this.updateLastTransition();
    this.emitState();

    return this.getState();
  }

  async resume() {
    if (
      !this.state.running ||
      !this.state.paused
    ) {
      return this.getState();
    }

    this.stoppedExplicitly =
      false;

    this.state.paused =
      false;

    this.state.locked =
      true;

    this.stageGeneration += 1;

    const generation =
      this.stageGeneration;

    this.updateLastTransition();
    this.emitState();

    await this.startRoundPlayback(
      generation
    );

    return this.getState();
  }

  async skip() {
    if (!this.state.running) {
      throw new Error(
        "Quiz nie jest uruchomiony."
      );
    }

    this.stageGeneration += 1;
    this.recoverySequence += 1;

    this.clearTimers();

    this.transitionInProgress =
      false;

    this.recoveryInProgress =
      false;

    this.playbackStartInProgress =
      false;

    this.state.locked =
      true;

    await this.pauseSpotify(
      false
    );

    await this.startNewRound({
      reason: "manual-skip"
    });

    return this.getState();
  }

  async reveal() {
    if (
      this.state.phase !==
        "question" ||
      this.state.locked
    ) {
      throw new Error(
        "Aktualnej rundy nie można teraz ujawnić."
      );
    }

    await this.completeRound(
      true
    );

    return this.getState();
  }

  async createSafeRound() {
    let lastError =
      null;

    for (
      let attempt = 1;
      attempt <=
      this.settings
        .maxRoundSelectionAttempts;
      attempt += 1
    ) {
      try {
        const round =
          this.quizEngine
            .createRound();

        if (
          !round?.track ||
          !round?.question
        ) {
          throw new Error(
            "QuizEngine nie zwrócił kompletnej rundy."
          );
        }

        if (
          !this.isTrackAllowed(
            round.track
          )
        ) {
          continue;
        }

        return round;
      } catch (error) {
        lastError =
          error;
      }
    }

    if (
      typeof this.spotify
        .getAutomaticTrack ===
        "function" &&
      typeof this.quizEngine
        .createRoundFromTrack ===
        "function"
    ) {
      const track =
        await this.spotify
          .getAutomaticTrack({
            excludedUris: [
              ...this.recentlyPlayedUris,
              ...this.sessionFailedUris
            ]
          });

      const round =
        this.quizEngine
          .createRoundFromTrack(
            track
          );

      if (
        round?.track &&
        round?.question &&
        this.isTrackAllowed(
          round.track
        )
      ) {
        return round;
      }
    }

    throw (
      lastError ||
      new Error(
        "Nie udało się wybrać dostępnego utworu."
      )
    );
  }

  async startNewRound(
    options = {}
  ) {
    if (
      this.roundSelectionInProgress ||
      this.stoppedExplicitly
    ) {
      return;
    }

    this.roundSelectionInProgress =
      true;

    this.stageGeneration += 1;

    const generation =
      this.stageGeneration;

    this.transitionInProgress =
      false;

    this.playbackStartInProgress =
      false;

    this.clearTimers();
    this.resetVotes();

    this.state.playback =
      this.createInitialPlaybackState();

    this.state.recovery =
      this.createInitialRecoveryState();

    this.resetRoundPresentation();

    this.state.running =
      true;

    this.state.paused =
      false;

    this.state.locked =
      true;

    this.state.phase =
      "preparing";

    this.state.stage =
      null;

    this.updateLastTransition();
    this.emitState();

    try {
      const round =
        await this.createSafeRound();

      if (
        !this.isGenerationCurrent(
          generation
        )
      ) {
        return;
      }

      this.state.round += 1;

      this.state.roundId =
        round.roundId ||
        [
          "round",
          this.state.round,
          Date.now()
        ].join("-");

      this.state.currentTrack =
        round.track;

      this.state.question =
        round.question;

      /*
       * stage oznacza teraz wyłącznie
       * rodzaj bieżącego pytania.
       *
       * Nie oznacza drugiego etapu
       * tej samej piosenki.
       */
      this.state.stage =
        round.question.type;

      this.state.requiredCorrect =
        this.settings.requiredCorrect;

      this.state.phase =
        "starting";

      this.updateLastTransition();
      this.emitState();

      await this.startRoundPlayback(
        generation
      );
    } catch (error) {
      if (
        this.isGenerationCurrent(
          generation
        )
      ) {
        await this.startCriticalRecovery(
          error,
          {
            source:
              options.reason ||
              "round-selection",

            track: null
          }
        );
      }
    } finally {
      this.roundSelectionInProgress =
        false;
    }
  }

  preparePlaybackState(
    uri,
    positionMs
  ) {
    const now =
      Date.now();

    Object.assign(
      this.state.playback,
      {
        status: "syncing",

        requested: true,
        syncing: true,
        verifying: true,
        verified: false,
        playing: false,
        recovering: false,

        attempt: 1,

        operationId: null,

        positionMs,
        progressMs: 0,
        progressDeltaMs: 0,

        verificationSamples: 0,

        expectedTrackUri:
          uri,

        actualTrackUri:
          null,

        deviceId: null,
        deviceName: null,

        syncStartedAt:
          new Date(
            now
          ).toISOString(),

        syncDeadlineAt:
          new Date(
            now +
            this.settings
              .playbackSyncTimeoutSeconds *
            1000
          ).toISOString(),

        verifiedAt: null,

        failureCode: null,

        recoveryAction: null,
        nextRetryAt: null,

        lastError: null
      }
    );

    this.state.phase =
      "starting";

    this.state.locked =
      true;

    this.state.remainingSeconds =
      null;

    this.state.countdown =
      null;
  }

  validatePlaybackResult(
    result,
    expectedUri
  ) {
    if (
      !result?.success ||
      result.verified === false ||
      result.synced === false
    ) {
      throw Object.assign(
        new Error(
          "Spotify nie potwierdziło startu odtwarzania."
        ),
        {
          code:
            "PLAYBACK_NOT_SYNCED",

          recoverable:
            true
        }
      );
    }

    if (
      !result.playback?.isPlaying
    ) {
      throw Object.assign(
        new Error(
          "Spotify nie rozpoczęło odtwarzania."
        ),
        {
          code:
            "PLAYBACK_NOT_PLAYING",

          recoverable:
            true
        }
      );
    }

    if (
      result.playback
        .track?.uri !==
      expectedUri
    ) {
      throw Object.assign(
        new Error(
          "Spotify odtwarza inny utwór."
        ),
        {
          code:
            "PLAYBACK_WRONG_TRACK",

          recoverable:
            true
        }
      );
    }

    if (
      result.verification
        ?.progressConfirmed ===
      false
    ) {
      throw Object.assign(
        new Error(
          "Nie potwierdzono ruchu postępu odtwarzania."
        ),
        {
          code:
            "PLAYBACK_PROGRESS_NOT_CONFIRMED",

          recoverable:
            true
        }
      );
    }
  }

  applyVerifiedPlayback(
    result,
    uri
  ) {
    const playback =
      result.playback ||
      {};

    const verification =
      result.verification ||
      {};

    Object.assign(
      this.state.playback,
      {
        status:
          "playing",

        syncing:
          false,

        verifying:
          false,

        verified:
          true,

        playing:
          true,

        recovering:
          false,

        attempt:
          Number(
            result.attempt ||
            1
          ),

        operationId:
          result.operationId ||
          null,

        progressMs:
          Number(
            playback.progressMs ||
            verification
              .finalProgressMs ||
            0
          ),

        progressDeltaMs:
          Number(
            verification
              .progressDeltaMs ||
            0
          ),

        verificationSamples:
          Number(
            verification.samples ||
            0
          ),

        expectedTrackUri:
          uri,

        actualTrackUri:
          playback.track?.uri ||
          null,

        deviceId:
          result.deviceId ||
          playback.device?.id ||
          null,

        deviceName:
          result.device?.name ||
          playback.device?.name ||
          null,

        failureCode:
          null,

        failureCount:
          0,

        recoveryAction:
          null,

        nextRetryAt:
          null,

        lastError:
          null,

        lastSuccessAt:
          new Date()
            .toISOString(),

        verifiedAt:
          new Date()
            .toISOString(),

        watchdogStatus:
          "healthy",

        watchdogFailures:
          0
      }
    );
  }

  async checkAlreadyPlaying(
    uri,
    generation
  ) {
    if (
      typeof this.spotify
        .verifyCurrentPlayback !==
        "function"
    ) {
      return null;
    }

    try {
      const verification =
        await this.spotify
          .verifyCurrentPlayback(
            uri,
            {
              attempts: 2,

              requiredSamples:
                this.settings
                  .playbackRequiredConfirmations,

              delayMs:
                this.settings
                  .playbackSyncPollMs,

              timeoutMs:
                Math.min(
                  3000,
                  this.settings
                    .playbackSyncTimeoutSeconds *
                  1000
                )
            }
          );

      if (
        !this.isGenerationCurrent(
          generation
        )
      ) {
        return null;
      }

      if (
        verification?.success &&
        verification.playback
          ?.isPlaying &&
        verification.playback
          .track?.uri ===
          uri
      ) {
        return {
          success: true,
          verified: true,
          synced: true,
          recovered: true,

          attempt: 0,
          operationId: null,

          deviceId:
            verification.playback
              .device?.id ||
            null,

          device:
            verification.playback
              .device ||
            null,

          playback:
            verification.playback,

          verification
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  async startRoundPlayback(
    generation
  ) {
    if (
      !this.isGenerationCurrent(
        generation
      ) ||
      this.playbackStartInProgress
    ) {
      return;
    }

    this.playbackStartInProgress =
      true;

    const track =
      this.state.currentTrack;

    const uri =
      this.getTrackUri(
        track
      );

    if (
      !track ||
      !uri
    ) {
      this.playbackStartInProgress =
        false;

      await this.handlePlaybackFailure(
        Object.assign(
          new Error(
            "Brak poprawnego URI aktualnego utworu."
          ),
          {
            code:
              "MISSING_TRACK_URI",

            recoverable:
              false
          }
        ),
        generation
      );

      return;
    }

    if (
      typeof this.spotify
        .isTrackBlocked ===
        "function" &&
      this.spotify
        .isTrackBlocked(uri)
    ) {
      this.playbackStartInProgress =
        false;

      await this.handlePlaybackFailure(
        Object.assign(
          new Error(
            "Utwór jest tymczasowo zablokowany po wcześniejszych błędach."
          ),
          {
            code:
              "TRACK_COOLDOWN",

            recoverable:
              false
          }
        ),
        generation
      );

      return;
    }

    const positionMs =
      this.calculateStartPosition(
        track
      );

    this.preparePlaybackState(
      uri,
      positionMs
    );

    this.updateLastTransition();
    this.emitState();

    this.emitDiagnostic(
      "playback-sync-started",
      {
        trackUri: uri,

        questionType:
          this.state.stage,

        positionMs,
        generation
      }
    );

    try {
      let result =
        await this.checkAlreadyPlaying(
          uri,
          generation
        );

      if (
        !result &&
        this.isGenerationCurrent(
          generation
        )
      ) {
        result =
          await this.spotify
            .playTrackVerified(
              uri,
              positionMs
            );
      }

      if (
        !this.isGenerationCurrent(
          generation
        )
      ) {
        if (
          typeof this.spotify
            .stopOrphanedPlayback ===
            "function"
        ) {
          await this.spotify
            .stopOrphanedPlayback(
              uri
            );
        }

        return;
      }

      this.validatePlaybackResult(
        result,
        uri
      );

      this.applyVerifiedPlayback(
        result,
        uri
      );

      this.state.phase =
        "question";

      this.state.locked =
        false;

      this.state.remainingSeconds =
        null;

      this.state.countdown =
        null;

      this.consecutiveSkippedRounds =
        0;

      this.state.consecutiveSkippedRounds =
        0;

      this.state.recovery =
        this.createInitialRecoveryState();

      this.rememberTrack(
        track
      );

      this.lastWatchdogProgressMs =
        Number(
          result.playback
            ?.progressMs ||
          0
        );

      this.lastWatchdogCheckedAt =
        Date.now();

      this.lastWatchdogDeviceId =
        result.deviceId ||
        result.playback
          ?.device?.id ||
        null;

      this.updateLastTransition();
      this.emitState();

      this.emitDiagnostic(
        "playback-synchronized",
        {
          trackUri: uri,

          questionType:
            this.state.stage,

          deviceId:
            this.state.playback
              .deviceId,

          progressMs:
            this.state.playback
              .progressMs,

          recovered:
            Boolean(
              result.recovered
            )
        }
      );

      this.scheduleRound(
        generation
      );

      this.startPlaybackWatchdog(
        generation
      );
    } catch (error) {
      if (
        this.isGenerationCurrent(
          generation
        )
      ) {
        if (
          typeof this.spotify
            .stopOrphanedPlayback ===
            "function"
        ) {
          await this.spotify
            .stopOrphanedPlayback(
              uri
            );
        }

        await this.handlePlaybackFailure(
          error,
          generation
        );
      }
    } finally {
      this.playbackStartInProgress =
        false;
    }
  }

  async handlePlaybackFailure(
    error,
    generation
  ) {
    if (
      !this.isGenerationCurrent(
        generation
      ) ||
      this.recoveryInProgress
    ) {
      return;
    }

    const normalized =
      this.normalizeSpotifyError(
        error
      );

    this.clearStageTimers();
    this.stopWatchdog();

    Object.assign(
      this.state.playback,
      {
        status:
          "failed",

        syncing:
          false,

        verifying:
          false,

        verified:
          false,

        playing:
          false,

        recovering:
          true,

        failureCode:
          normalized.code,

        failureCount:
          Number(
            this.state.playback
              .failureCount ||
            0
          ) + 1,

        recoveryAction:
          "skip-and-recover",

        nextRetryAt:
          normalized.retryAfterMs > 0
            ? new Date(
                Date.now() +
                normalized.retryAfterMs
              ).toISOString()
            : null,

        lastError:
          normalized.message
      }
    );

    this.state.locked =
      true;

    this.state.remainingSeconds =
      null;

    this.state.countdown =
      null;

    this.markTrackFailed(
      this.state.currentTrack,
      normalized
    );

    this.consecutiveSkippedRounds +=
      1;

    this.state.skippedRounds =
      Number(
        this.state.skippedRounds ||
        0
      ) + 1;

    this.state.consecutiveSkippedRounds =
      this.consecutiveSkippedRounds;

    this.emitDiagnostic(
      "playback-failed",
      {
        error:
          normalized,

        track:
          this.state.currentTrack,

        questionType:
          this.state.stage,

        consecutiveSkippedRounds:
          this.consecutiveSkippedRounds
      }
    );

    if (
      this.consecutiveSkippedRounds >=
      this.settings
        .maxConsecutiveSkippedRounds
    ) {
      await this.startCriticalRecovery(
        normalized,
        {
          source:
            "playback",

          track:
            this.state.currentTrack
        }
      );

      return;
    }

    await this.startRecoveryBreak(
      normalized,
      false
    );
  }

  async startRecoveryBreak(
    error,
    critical = false
  ) {
    if (
      this.recoveryInProgress ||
      this.stoppedExplicitly
    ) {
      return;
    }

    this.recoveryInProgress =
      true;

    this.playbackStartInProgress =
      false;

    this.stageGeneration += 1;
    this.recoverySequence += 1;

    const sequence =
      this.recoverySequence;

    this.clearTimers();

    await this.pauseSpotify(
      false
    );

    const normalized =
      this.normalizeSpotifyError(
        error
      );

    const configuredSeconds =
      critical
        ? this.settings
            .criticalRecoveryBreakSeconds
        : this.settings
            .recoveryBreakSeconds;

    const retryAfterSeconds =
      normalized.retryAfterMs > 0
        ? Math.ceil(
            normalized.retryAfterMs /
            1000
          )
        : 0;

    const effectiveSeconds =
      Math.max(
        configuredSeconds,
        retryAfterSeconds
      );

    this.state.phase =
      "promo-break";

    this.state.locked =
      true;

    this.state.remainingSeconds =
      null;

    this.state.countdown =
      effectiveSeconds;

    Object.assign(
      this.state.playback,
      {
        status:
          "recovering",

        syncing:
          false,

        playing:
          false,

        verifying:
          false,

        verified:
          false,

        recovering:
          true,

        recoveryAction:
          critical
            ? "health-check"
            : "next-track"
      }
    );

    this.state.recovery = {
      active: true,

      kind:
        critical
          ? "critical"
          : "track-skip",

      sequence,
      attempt: 0,

      reason:
        critical
          ? "System sprawdza gotowość odtwarzacza."
          : "Trwa przygotowanie kolejnego utworu.",

      code:
        normalized.code,

      startedAt:
        new Date()
          .toISOString(),

      nextRetryAt:
        new Date(
          Date.now() +
          effectiveSeconds *
          1000
        ).toISOString(),

      skippable:
        !critical,

      critical,

      promo:
        this.getPromoBreak(
          critical
        ),

      diagnostics:
        typeof this.spotify
          .getDiagnostics ===
          "function"
          ? this.spotify
              .getDiagnostics()
          : null
    };

    this.updateLastTransition();
    this.emitState();

    this.startCountdown(
      effectiveSeconds,
      sequence,
      async () => {
        if (critical) {
          await this
            .performCriticalHealthCheck(
              sequence
            );
        } else {
          await this
            .returnFromRecovery(
              sequence
            );
        }
      },
      true
    );
  }

  async startCriticalRecovery(
    error,
    context = {}
  ) {
    const normalized =
      this.normalizeSpotifyError(
        error
      );

    this.emitDiagnostic(
      "critical-recovery-started",
      {
        error:
          normalized,

        context
      }
    );

    await this.startRecoveryBreak(
      normalized,
      true
    );
  }

  startCountdown(
    seconds,
    sequence,
    callback,
    recovery = false
  ) {
    this.clearTransitionTimer();

    const total =
      Math.max(
        0,
        Math.floor(
          Number(seconds) ||
          0
        )
      );

    let remaining =
      total;

    this.state.countdown =
      remaining;

    if (recovery) {
      this.updateRecoveryProgress(
        remaining,
        total
      );
    }

    this.emitState();

    if (
      remaining <= 0
    ) {
      void Promise.resolve()
        .then(callback)
        .catch(
          (error) => {
            this.handleTransitionError(
              error
            );
          }
        );

      return;
    }

    this.transitionInterval =
      setInterval(
        () => {
          if (
            this.stoppedExplicitly ||
            (
              recovery &&
              sequence !==
                this.recoverySequence
            )
          ) {
            this.clearTransitionTimer();
            return;
          }

          remaining -= 1;

          this.state.countdown =
            Math.max(
              0,
              remaining
            );

          if (recovery) {
            this.updateRecoveryProgress(
              remaining,
              total
            );
          }

          this.emitState();

          if (
            remaining > 0
          ) {
            return;
          }

          this.clearTransitionTimer();

          void Promise.resolve()
            .then(callback)
            .catch(
              (error) => {
                this.handleTransitionError(
                  error
                );
              }
            );
        },
        1000
      );
  }

  updateRecoveryProgress(
    remaining,
    total
  ) {
    if (
      !this.state.recovery
        ?.promo
    ) {
      return;
    }

    this.state.recovery
      .promo
      .progress =
      Math.max(
        0,
        Math.min(
          100,
          (
            1 -
            remaining /
            Math.max(
              1,
              total
            )
          ) *
          100
        )
      );
  }

  async performCriticalHealthCheck(
    sequence
  ) {
    if (
      sequence !==
        this.recoverySequence ||
      this.stoppedExplicitly
    ) {
      return;
    }

    this.state.recovery
      .attempt += 1;

    this.state.recovery
      .reason =
      "Sprawdzamy gotowość odtwarzacza.";

    this.emitState();

    let result;

    try {
      result =
        typeof this.spotify
          .healthCheck ===
          "function"
          ? await this.spotify
              .healthCheck()
          : {
              healthy: true
            };
    } catch (error) {
      result = {
        healthy: false,

        error:
          this.normalizeSpotifyError(
            error
          )
      };
    }

    if (
      sequence !==
        this.recoverySequence ||
      this.stoppedExplicitly
    ) {
      return;
    }

    if (
      result?.healthy
    ) {
      this.consecutiveSkippedRounds =
        0;

      this.state
        .consecutiveSkippedRounds =
        0;

      await this.returnFromRecovery(
        sequence
      );

      return;
    }

    this.state.recovery
      .reason =
      "Odtwarzacz potrzebuje jeszcze chwili.";

    this.state.recovery
      .diagnostics =
      result;

    this.startCountdown(
      this.settings
        .healthCheckIntervalSeconds,
      sequence,
      async () => {
        await this
          .performCriticalHealthCheck(
            sequence
          );
      },
      true
    );
  }

  async returnFromRecovery(
    sequence
  ) {
    if (
      sequence !==
        this.recoverySequence ||
      this.stoppedExplicitly
    ) {
      return;
    }

    this.clearTransitionTimer();

    this.state.phase =
      "returning";

    this.state.locked =
      true;

    this.state.countdown =
      this.settings
        .returningCountdownSeconds;

    this.state.playback
      .status =
      "ready";

    this.state.playback
      .recovering =
      false;

    this.state.playback
      .recoveryAction =
      "returning";

    this.state.recovery
      .reason =
      "Wszystko gotowe. Quiz wraca.";

    this.updateLastTransition();
    this.emitState();

    this.startCountdown(
      this.settings
        .returningCountdownSeconds,
      sequence,
      async () => {
        this.recoveryInProgress =
          false;

        this.state.recovery =
          this.createInitialRecoveryState();

        await this.startNewRound({
          reason:
            "recovery-complete"
        });
      }
    );
  }

  startPlaybackWatchdog(
    generation
  ) {
    this.stopWatchdog();

    if (
      this.state.phase !==
        "question" ||
      !this.state.currentTrack ||
      !this.state.playback
        .verified
    ) {
      return;
    }

    const expectedUri =
      this.getTrackUri(
        this.state.currentTrack
      );

    this.lastWatchdogProgressMs =
      Number(
        this.state.playback
          .progressMs ||
        0
      );

    this.lastWatchdogCheckedAt =
      Date.now();

    this.lastWatchdogDeviceId =
      this.state.playback
        .deviceId ||
      null;

    this.state.playback
      .watchdogStatus =
      "monitoring";

    this.watchdogInterval =
      setInterval(
        () => {
          void this
            .runPlaybackWatchdog(
              generation,
              expectedUri
            );
        },
        this.settings
          .watchdogIntervalSeconds *
        1000
      );
  }

  async runPlaybackWatchdog(
    generation,
    expectedUri
  ) {
    if (
      !this.isGenerationCurrent(
        generation
      ) ||
      this.state.paused ||
      this.state.locked ||
      this.state.phase !==
        "question" ||
      this.recoveryInProgress ||
      !this.state.playback
        .verified
    ) {
      return;
    }

    try {
      const playback =
        await this.spotify
          .getPlaybackState();

      if (
        !this.isGenerationCurrent(
          generation
        ) ||
        this.state.phase !==
          "question"
      ) {
        return;
      }

      const now =
        Date.now();

      const progressMs =
        Number(
          playback?.progressMs ||
          0
        );

      const actualUri =
        playback?.track?.uri ||
        null;

      const actualDeviceId =
        playback?.device?.id ||
        null;

      const elapsed =
        this.lastWatchdogCheckedAt
          ? now -
            this.lastWatchdogCheckedAt
          : 0;

      const actualAdvance =
        this.lastWatchdogProgressMs ===
        null
          ? 0
          : progressMs -
            this.lastWatchdogProgressMs;

      const expectedAdvance =
        Math.max(
          this.settings
            .watchdogMinimumAdvanceMs,
          elapsed -
          this.settings
            .watchdogPositionToleranceMs
        );

      const progressHealthy =
        this.lastWatchdogProgressMs ===
          null ||
        actualAdvance >=
          expectedAdvance ||
        actualAdvance >
          this.settings
            .watchdogMinimumAdvanceMs;

      const playing =
        Boolean(
          playback?.isPlaying
        );

      const correctTrack =
        actualUri ===
        expectedUri;

      const correctDevice =
        !this.lastWatchdogDeviceId ||
        !actualDeviceId ||
        actualDeviceId ===
          this.lastWatchdogDeviceId;

      const healthy =
        playing &&
        correctTrack &&
        correctDevice &&
        progressHealthy;

      this.lastWatchdogProgressMs =
        progressMs;

      this.lastWatchdogCheckedAt =
        now;

      this.state.playback.progressMs =
        progressMs;

      this.state.playback.actualTrackUri =
        actualUri;

      this.state.playback.lastWatchdogAt =
        new Date()
          .toISOString();

      if (healthy) {
        this.watchdogFailures =
          0;

        this.state.playback
          .watchdogStatus =
          "healthy";

        this.state.playback
          .watchdogFailures =
          0;

        this.emitState();

        return;
      }

      this.watchdogFailures +=
        1;

      this.state.playback
        .watchdogStatus =
        "warning";

      this.state.playback
        .watchdogFailures =
        this.watchdogFailures;

      this.emitDiagnostic(
        "playback-watchdog-warning",
        {
          expectedUri,
          actualUri,

          expectedDeviceId:
            this.lastWatchdogDeviceId,

          actualDeviceId,

          playing,
          correctTrack,
          correctDevice,
          progressHealthy,

          progressMs,
          actualAdvance,

          failures:
            this.watchdogFailures
        }
      );

      this.emitState();

      if (
        this.watchdogFailures <
        this.settings
          .watchdogFailureThreshold
      ) {
        return;
      }

      const error =
        Object.assign(
          new Error(
            !playing
              ? "Odtwarzanie zostało zatrzymane."
              : !correctTrack
                ? "Spotify odtwarza inny utwór."
                : !correctDevice
                  ? "Spotify zmieniło aktywne urządzenie."
                  : "Postęp odtwarzania zatrzymał się."
          ),
          {
            code:
              !playing
                ? "WATCHDOG_NOT_PLAYING"
                : !correctTrack
                  ? "WATCHDOG_WRONG_TRACK"
                  : !correctDevice
                    ? "WATCHDOG_WRONG_DEVICE"
                    : "WATCHDOG_STALLED",

            recoverable:
              true
          }
        );

      await this.handlePlaybackFailure(
        error,
        generation
      );
    } catch (error) {
      this.watchdogFailures +=
        1;

      this.state.playback
        .watchdogStatus =
        "warning";

      this.state.playback
        .watchdogFailures =
        this.watchdogFailures;

      this.emitState();

      if (
        this.watchdogFailures >=
        this.settings
          .watchdogFailureThreshold
      ) {
        await this.handlePlaybackFailure(
          error,
          generation
        );
      }
    }
  }

  scheduleRound(
    generation
  ) {
    this.clearStageTimers();

    if (
      !this.isGenerationCurrent(
        generation
      ) ||
      this.state.phase !==
        "question" ||
      this.state.locked ||
      !this.state.playback
        .verified ||
      !this.state.playback
        .playing
    ) {
      return;
    }

    const durationSeconds =
      this.getRoundDuration();

    this.stageStartedAt =
      Date.now();

    this.stageDurationSeconds =
      durationSeconds;

    this.state.remainingSeconds =
      durationSeconds;

    this.state.countdown =
      null;

    this.emitState();

    this.clockInterval =
      setInterval(
        () => {
          if (
            !this.isGenerationCurrent(
              generation
            ) ||
            this.state.paused ||
            this.state.locked ||
            this.state.phase !==
              "question" ||
            !this.state.playback
              .verified
          ) {
            return;
          }

          const elapsedSeconds =
            Math.floor(
              (
                Date.now() -
                this.stageStartedAt
              ) /
              1000
            );

          const remaining =
            Math.max(
              0,
              durationSeconds -
              elapsedSeconds
            );

          if (
            remaining ===
            this.state
              .remainingSeconds
          ) {
            return;
          }

          this.state.remainingSeconds =
            remaining;

          this.updateHintState(
            durationSeconds -
            remaining
          );

          this.emitState();
        },
        250
      );

    this.stageTimeout =
      setTimeout(
        () => {
          if (
            !this.isGenerationCurrent(
              generation
            ) ||
            this.state.paused ||
            this.state.locked ||
            this.state.phase !==
              "question" ||
            !this.state.playback
              .verified
          ) {
            return;
          }

          this.state.remainingSeconds =
            0;

          this.emitState();

          void this.completeRound(
            false
          );
        },
        durationSeconds *
        1000
      );
  }

  updateHintState(
    elapsedSeconds
  ) {
    let hintLevel =
      0;

    if (
      elapsedSeconds >=
      this.settings
        .hintTwoSeconds
    ) {
      hintLevel =
        2;
    } else if (
      elapsedSeconds >=
      this.settings
        .hintOneSeconds
    ) {
      hintLevel =
        1;
    }

    if (
      hintLevel ===
      this.state.hintLevel
    ) {
      return;
    }

    this.state.hintLevel =
      hintLevel;

    if (
      hintLevel === 1
    ) {
      this.state.hint = {
        level: 1,

        message:
          "Przyjrzyj się odpowiedziom i odrzuć najmniej prawdopodobną."
      };

      return;
    }

    if (
      hintLevel === 2
    ) {
      this.state.hint = {
        level: 2,

        message:
          "Zostało coraz mniej czasu. Oddaj swój głos."
      };

      return;
    }

    this.state.hint =
      null;
  }

  handleVote(voteData) {
    if (
      !this.state.running ||
      this.state.paused ||
      this.state.locked ||
      this.state.phase !==
        "question" ||
      !this.state.question ||
      !this.state.playback
        .verified ||
      !this.state.playback
        .playing
    ) {
      return {
        accepted: false,
        reason:
          "quiz_inactive"
      };
    }

    if (
      Number(
        this.state
          .remainingSeconds
      ) <= 0
    ) {
      return {
        accepted: false,
        reason:
          "time_expired"
      };
    }

    const result =
      this.voteEngine
        .registerVote({
          ...voteData,

          correctLetter:
            this.state.question
              .correctLetter
        });

    if (
      !result.accepted
    ) {
      return result;
    }

    const stats =
      result.stats ||
      {};

    this.state.votes = {
      A:
        Number(
          stats.votes?.A ||
          0
        ),

      B:
        Number(
          stats.votes?.B ||
          0
        ),

      C:
        Number(
          stats.votes?.C ||
          0
        ),

      D:
        Number(
          stats.votes?.D ||
          0
        )
    };

    this.state.correctCount =
      Number(
        stats.correctCount ||
        0
      );

    this.state.totalVotes =
      Number(
        stats.totalVotes ||
        0
      );

    this.state.uniquePlayers =
      Number(
        stats.uniquePlayers ||
        0
      );

    this.state.recentVotes =
      Array.isArray(
        stats.recentVotes
      )
        ? stats.recentVotes
        : [];

    this.state.winners =
      Array.isArray(
        stats.correctOrder
      )
        ? [
            ...stats.correctOrder
          ]
        : [];

    if (
      result.vote?.isCorrect
    ) {
      const position =
        Array.isArray(
          stats.correctOrder
        )
          ? stats.correctOrder
              .length
          : this.state
              .correctCount;

      result.earnedPoints =
        this.applyPoints(
          result.vote,
          position
        );
    } else {
      result.earnedPoints =
        0;
    }

    this.emitState();

    return result;
  }

  applyPoints(
    vote,
    position
  ) {
    const player =
      this.leaderboard.get(
        vote.userId
      ) || {
        userId:
          vote.userId,

        username:
          vote.username,

        displayName:
          vote.displayName,

        points: 0,
        correctAnswers: 0,
        firstPlaces: 0
      };

    let points =
      this.settings
        .baseCorrectPoints;

    if (
      position === 1
    ) {
      points +=
        this.settings
          .firstPlaceBonus;

      player.firstPlaces +=
        1;
    } else if (
      position === 2
    ) {
      points +=
        this.settings
          .secondPlaceBonus;
    } else if (
      position === 3
    ) {
      points +=
        this.settings
          .thirdPlaceBonus;
    }

    player.username =
      vote.username;

    player.displayName =
      vote.displayName;

    player.points =
      Number(
        player.points ||
        0
      ) +
      points;

    player.correctAnswers =
      Number(
        player.correctAnswers ||
        0
      ) +
      1;

    this.leaderboard.set(
      vote.userId,
      player
    );

    this.emit(
      "leaderboard",
      this.getLeaderboard()
    );

    return points;
  }

  async pauseSpotify(
    emitState = true
  ) {
    try {
      const result =
        await this.spotify
          .pause();

      this.state.playback
        .playing =
        false;

      this.state.playback
        .syncing =
        false;

      this.state.playback
        .verifying =
        false;

      this.state.playback
        .verified =
        false;

      if (
        [
          "playing",
          "syncing",
          "starting"
        ].includes(
          this.state.playback
            .status
        )
      ) {
        this.state.playback
          .status =
          "paused";
      }

      return result;
    } catch (error) {
      const normalized =
        this.normalizeSpotifyError(
          error
        );

      this.state.playback
        .playing =
        false;

      this.state.playback
        .syncing =
        false;

      this.state.playback
        .verifying =
        false;

      this.state.playback
        .verified =
        false;

      this.state.playback
        .lastError =
        normalized.message;

      return null;
    } finally {
      if (emitState) {
        this.emitState();
      }
    }
  }

  async completeRound(
    forced = false
  ) {
    if (
      this.transitionInProgress
    ) {
      return;
    }

    if (
      this.state.locked ||
      this.state.phase !==
        "question"
    ) {
      return;
    }

    this.transitionInProgress =
      true;

    this.stageGeneration += 1;

    this.clearStageTimers();
    this.stopWatchdog();

    this.state.locked =
      true;

    this.state.remainingSeconds =
      0;

    this.state.correctLetter =
      this.state.question
        ?.correctLetter ||
      null;

    this.state.correctAnswer =
      this.state.question
        ?.correctAnswer ||
      null;

    await this.pauseSpotify(
      false
    );

    /*
     * Każde pytanie kończy całą rundę.
     *
     * Nie ma już stage-reveal,
     * startTitleStage ani ponownego
     * uruchamiania tej samej piosenki.
     */
    this.state.phase =
      "round-reveal";

    this.state.reveal = {
      type:
        "round",

      questionType:
        this.state.stage,

      forced:
        Boolean(forced),

      message:
        forced
          ? "Odpowiedź została ujawniona przez operatora."
          : "Czas minął.",

      track:
        this.state.currentTrack
          ? {
              artist:
                this.state
                  .currentTrack
                  .artist ||
                this.state
                  .currentTrack
                  .primaryArtist,

              title:
                this.state
                  .currentTrack
                  .title,

              year:
                this.state
                  .currentTrack
                  .year,

              cover:
                this.state
                  .currentTrack
                  .cover
            }
          : null
    };

    this.state.countdown =
      this.settings
        .roundRevealSeconds;

    this.updateLastTransition();
    this.emitState();

    const sequence =
      this.recoverySequence;

    this.transitionInProgress =
      false;

    this.startCountdown(
      this.settings
        .roundRevealSeconds,
      sequence,
      async () => {
        await this.startNewRound({
          reason:
            "round-complete"
        });
      }
    );
  }

  handleTransitionError(
    error
  ) {
    this.clearTimers();

    this.transitionInProgress =
      false;

    if (
      this.stoppedExplicitly ||
      this.state.paused
    ) {
      return;
    }

    void this.startCriticalRecovery(
      error,
      {
        source:
          "transition"
      }
    );
  }

  getRuntimeDiagnostics() {
    return {
      version:
        "8.0",

      model:
        "single-question-round",

      generation:
        this.stageGeneration,

      recoverySequence:
        this.recoverySequence,

      transitionInProgress:
        this.transitionInProgress,

      recoveryInProgress:
        this.recoveryInProgress,

      roundSelectionInProgress:
        this.roundSelectionInProgress,

      playbackStartInProgress:
        this.playbackStartInProgress,

      consecutiveSkippedRounds:
        this.consecutiveSkippedRounds,

      stageStartedAt:
        this.stageStartedAt
          ? new Date(
              this.stageStartedAt
            ).toISOString()
          : null,

      stageDurationSeconds:
        this.stageDurationSeconds,

      recentlyPlayedUris: [
        ...this.recentlyPlayedUris
      ],

      sessionFailedUris: [
        ...this.sessionFailedUris
      ],

      quiz:
        typeof this.quizEngine
          .getDiagnostics ===
          "function"
          ? this.quizEngine
              .getDiagnostics()
          : null,

      spotify:
        typeof this.spotify
          .getDiagnostics ===
          "function"
          ? this.spotify
              .getDiagnostics()
          : null
    };
  }

  clearSessionTrackFailures() {
    this.sessionFailedUris.clear();

    this.consecutiveSkippedRounds =
      0;

    this.state
      .consecutiveSkippedRounds =
      0;

    return {
      success: true
    };
  }
}

module.exports = LiveController;