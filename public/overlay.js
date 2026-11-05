"use strict";

(() => {
  const VERSION = "8.4.0";

  const CONFIG = Object.freeze({
    stateUrl: "/api/state",
    eventsUrl: "/api/events",

    pollMs: 3000,
    staleMs: 18000,
    requestTimeoutMs: 7000,

    reconnectMinMs: 1500,
    reconnectMaxMs: 15000,

    timerRingLength: 320.44,

    recentVotesLimit: 6
  });

  const byId = (id) => {
    return document.getElementById(id);
  };

  const elementIds = [
    "overlay",
    "backgroundCover",
    "particleLayer",
    "musicParticleLayer",
    "celebrationLayer",

    "screenFlash",
    "transitionCurtain",

    "connectionBanner",
    "connectionBannerText",

    "spotifyIndicator",
    "spotifyIndicatorText",

    "playerIndicator",
    "playerIndicatorText",

    "idleScreen",
    "idleStatusText",

    "preparingScreen",
    "preparingEyebrow",
    "preparingTitle",
    "preparingDescription",
    "preparingProgressValue",
    "preparingProgressText",

    "syncingScreen",
    "syncingTitle",
    "syncingDescription",

    "syncTrackCheck",
    "syncDeviceCheck",
    "syncProgressCheck",

    "syncingStatusText",

    "questionScreen",

    "roundLabel",
    "stageLabel",
    "questionLiveStatus",

    "trackArtworkFrame",
    "trackCover",
    "trackCoverShield",

    "trackPlaybackBadge",
    "trackPlaybackText",

    "questionCategory",
    "questionText",
    "questionInstruction",

    "timeRingValue",
    "remainingTime",

    "correctCounter",
    "stageProgressValue",

    "totalVotesText",
    "uniquePlayersText",

    "hintPanel",
    "hintLevel",
    "hintText",

    "recentVotesStatus",
    "recentVotes",

    "miniLeaderboard",

    "leaderboardFirstName",
    "leaderboardFirstPoints",

    "leaderboardSecondName",
    "leaderboardSecondPoints",

    "leaderboardThirdName",
    "leaderboardThirdPoints",

    "revealScreen",
    "revealCelebration",

    "revealEyebrow",
    "revealTitle",

    "revealCover",

    "revealAnswerLetter",
    "revealAnswer",

    "revealedTrackArtist",
    "revealedTrackTitle",
    "revealedTrackYear",

    "revealCorrectCount",
    "revealPlayerCount",
    "revealFastestPlayer",

    "revealCountdownLabel",
    "revealCountdown",

    "recoveryScreen",

    "recoveryIcon",
    "recoveryEyebrow",
    "recoveryTitle",
    "recoveryDescription",

    "recoveryPlayerStep",
    "recoveryMusicStep",
    "recoveryReturnStep",

    "recoveryPlayerStepText",
    "recoveryMusicStepText",
    "recoveryReturnStepText",

    "recoveryProgressValue",
    "recoveryStatusText",
    "recoveryCountdown",

    "recoveryPromo",
    "recoveryPromoIcon",
    "recoveryPromoEyebrow",
    "recoveryPromoTitle",
    "recoveryPromoDescription",

    "returningScreen",
    "returningCountdown",

    "pausedScreen",

    "playerOfflineScreen",
    "playerOfflineStatus",

    "showMoment",
    "showMomentBackdrop",
    "showMomentParticles",
    "showMomentFloatingIcons",
    "showMomentAura",

    "showMomentIcon",

    "showMomentCombo",
    "showMomentComboValue",

    "showMomentCategory",
    "showMomentEyebrow",
    "showMomentTitle",
    "showMomentDescription",

    "showMomentRecord",
    "showMomentRecordLabel",
    "showMomentRecordValue",
    "showMomentRecordUnit",

    "showMomentCounter",
    "showMomentCounterLabel",
    "showMomentCounterValue",

    "showMomentActionIcon",
    "showMomentActionText",

    "showMomentSecondaryIcon",
    "showMomentSecondaryText",

    "showMomentProgressValue",
    "showMomentBottomText",

    "footerSystemDot",
    "footerSystemText",

    "toastLayer",

    "debugPanel",
    "debugConnection",
    "debugPhase",
    "debugPlayer",
    "debugTrack",
    "debugVersion"
  ];

  const elements =
    Object.fromEntries(
      elementIds.map(
        (id) => [
          id,
          byId(id)
        ]
      )
    );

  const answers =
    Object.fromEntries(
      [
        "A",
        "B",
        "C",
        "D"
      ].map(
        (letter) => [
          letter,
          {
            card:
              byId(
                `answer${letter}`
              ),

            text:
              byId(
                `answer${letter}Text`
              ),

            progress:
              byId(
                `answer${letter}Progress`
              ),

            count:
              byId(
                `answer${letter}Count`
              )
          }
        ]
      )
    );

  const screens = {
    idle:
      elements.idleScreen,

    preparing:
      elements.preparingScreen,

    syncing:
      elements.syncingScreen,

    question:
      elements.questionScreen,

    reveal:
      elements.revealScreen,

    recovery:
      elements.recoveryScreen,

    returning:
      elements.returningScreen,

    paused:
      elements.pausedScreen,

    playerOffline:
      elements.playerOfflineScreen
  };

  const runtime = {
    destroyed: false,

    screen: "idle",
    phase: "idle",

    source: null,

    reconnectTimer: null,
    pollTimer: null,
    healthTimer: null,
    transitionTimer: null,

    failures: 0,
    lastStateAt: 0,

    timerFrame: null,

    timer: {
      duration: 45,
      remaining: 45,
      receivedAt: 0,
      running: false
    },

    revealKey: "",

    liveFx: {
      active: false,

      eventId: "",

      startedAt: 0,
      endsAt: 0,

      frame: null
    }
  };

  function object(value) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value;
    }

    return {};
  }

  function list(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function text(
    value,
    fallback = ""
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      return fallback;
    }

    const result =
      String(value)
        .replace(
          /\u0000/g,
          ""
        )
        .trim();

    return result ||
      fallback;
  }

  function number(
    value,
    fallback = 0
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  function integer(
    value,
    fallback = 0
  ) {
    return Math.floor(
      number(
        value,
        fallback
      )
    );
  }

  function clamp(
    value,
    minimum,
    maximum
  ) {
    return Math.max(
      minimum,
      Math.min(
        maximum,
        number(
          value,
          minimum
        )
      )
    );
  }

  function boolean(
    value,
    fallback = false
  ) {
    if (
      typeof value ===
      "boolean"
    ) {
      return value;
    }

    if (
      value === 1 ||
      value === "1" ||
      value === "true" ||
      value === "yes"
    ) {
      return true;
    }

    if (
      value === 0 ||
      value === "0" ||
      value === "false" ||
      value === "no"
    ) {
      return false;
    }

    return fallback;
  }

  function setText(
    element,
    value,
    fallback = ""
  ) {
    if (!element) {
      return;
    }

    element.textContent =
      text(
        value,
        fallback
      );
  }

  function setVisible(
    element,
    visible
  ) {
    if (!element) {
      return;
    }

    element.classList.toggle(
      "hidden",
      !visible
    );
  }

  function setWidth(
    element,
    value
  ) {
    if (!element) {
      return;
    }

    element.style.width =
      `${clamp(
        value,
        0,
        100
      )}%`;
  }

  function setStatus(
    element,
    status
  ) {
    if (!element) {
      return;
    }

    [
      "waiting",
      "ready",
      "success",
      "connected",
      "playing",
      "active",
      "completed",
      "paused",
      "offline",
      "error",
      "warning"
    ].forEach(
      (name) => {
        element.classList.remove(
          name
        );
      }
    );

    if (status) {
      element.classList.add(
        status
      );
    }
  }

  function safeUrl(value) {
    const candidate =
      text(value);

    if (!candidate) {
      return "";
    }

    try {
      const url =
        new URL(
          candidate,
          window.location.href
        );

      if (
        ![
          "http:",
          "https:",
          "data:"
        ].includes(
          url.protocol
        )
      ) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function setImage(
    element,
    value
  ) {
    if (!element) {
      return;
    }

    const url =
      safeUrl(value);

    if (!url) {
      element.removeAttribute(
        "src"
      );

      element.classList.remove(
        "image-ready"
      );

      element.classList.add(
        "image-unavailable"
      );

      return;
    }

    if (
      element.dataset.url ===
      url
    ) {
      return;
    }

    element.dataset.url =
      url;

    const probe =
      new Image();

    probe.decoding =
      "async";

    probe.onload = () => {
      if (
        element.dataset.url !==
        url
      ) {
        return;
      }

      element.src =
        url;

      element.classList.remove(
        "image-unavailable"
      );

      element.classList.add(
        "image-ready"
      );
    };

    probe.onerror = () => {
      if (
        element.dataset.url !==
        url
      ) {
        return;
      }

      element.classList.remove(
        "image-ready"
      );

      element.classList.add(
        "image-unavailable"
      );
    };

    probe.src =
      url;
  }

  function setBackground(value) {
    if (
      !elements.backgroundCover
    ) {
      return;
    }

    const url =
      safeUrl(value);

    if (!url) {
      elements
        .backgroundCover
        .style
        .backgroundImage =
        "none";

      return;
    }

    const escapedUrl =
      url.replace(
        /"/g,
        '\\"'
      );

    elements
      .backgroundCover
      .style
      .backgroundImage =
      `url("${escapedUrl}")`;
  }

  function normalizePhase(
    quiz,
    player
  ) {
    const phase =
      text(
        quiz.phase,
        "idle"
      );

    if (
      quiz.running &&
      phase !==
        "promo-break" &&
      player.registered &&
      (
        player.stale ||
        !player.ready
      )
    ) {
      return "playerOffline";
    }

    const mapping = {
      idle:
        "idle",

      preparing:
        "preparing",

      starting:
        "syncing",

      question:
        "question",

      "round-reveal":
        "reveal",

      "promo-break":
        "recovery",

      returning:
        "returning",

      paused:
        "paused"
    };

    return (
      mapping[phase] ||
      (
        quiz.running
          ? "preparing"
          : "idle"
      )
    );
  }

  function switchScreen(name) {
    if (!screens[name]) {
      name =
        "idle";
    }

    if (
      runtime.screen ===
      name
    ) {
      return;
    }

    runtime.screen =
      name;

    for (
      const [
        key,
        element
      ] of
      Object.entries(screens)
    ) {
      if (!element) {
        continue;
      }

      const active =
        key === name;

      element.classList.toggle(
        "active",
        active
      );

      element.classList.toggle(
        "hidden",
        !active
      );

      element.setAttribute(
        "aria-hidden",
        active
          ? "false"
          : "true"
      );
    }

    if (elements.overlay) {
      [
        ...elements
          .overlay
          .classList
      ]
        .filter(
          (className) =>
            className.startsWith(
              "phase-"
            )
        )
        .forEach(
          (className) => {
            elements
              .overlay
              .classList
              .remove(
                className
              );
          }
        );

      elements
        .overlay
        .classList
        .add(
          `phase-${name}`
        );
    }

    showTransition();
  }

  function setStage(stage) {
    if (
      !elements.overlay
    ) {
      return;
    }

    [
      ...elements
        .overlay
        .classList
    ]
      .filter(
        (className) =>
          className.startsWith(
            "stage-"
          )
      )
      .forEach(
        (className) => {
          elements
            .overlay
            .classList
            .remove(
              className
            );
        }
      );

    const normalized =
      stage === "title"
        ? "title"
        : stage === "artist"
          ? "artist"
          : "none";

    elements
      .overlay
      .classList
      .add(
        `stage-${normalized}`
      );
  }

  function showTransition() {
    if (
      !elements.transitionCurtain
    ) {
      return;
    }

    elements
      .transitionCurtain
      .classList
      .remove("hidden");

    clearTimeout(
      runtime.transitionTimer
    );

    runtime.transitionTimer =
      setTimeout(
        () => {
          elements
            .transitionCurtain
            ?.classList
            .add("hidden");
        },
        420
      );
  }

  function flash() {
    if (
      !elements.screenFlash
    ) {
      return;
    }

    elements
      .screenFlash
      .classList
      .remove("active");

    void elements
      .screenFlash
      .offsetWidth;

    elements
      .screenFlash
      .classList
      .add("active");
  }

  function renderState(
    rawState
  ) {
    const state =
      object(rawState);

    const quiz =
      object(
        state.quiz
      );

    const player =
      object(
        state.playerRuntime
      );

    const spotify =
      object(
        state.spotify
      );

    const playback =
      object(
        quiz.playback
      );

    runtime.lastStateAt =
      Date.now();

    runtime.phase =
      text(
        quiz.phase,
        "idle"
      );

    const screen =
      normalizePhase(
        quiz,
        player
      );

    setStage(
      text(
        quiz.questionType ||
        quiz.stage
      )
    );

    switchScreen(
      screen
    );

    renderHeader(
      spotify,
      player,
      playback
    );

    renderFooter(
      spotify,
      player
    );

    const track =
      object(
        quiz.currentTrack
      );

    const revealTrack =
      object(
        object(
          quiz.reveal
        ).track
      );

    const cover =
      track.cover ||
      revealTrack.cover;

    setImage(
      elements.trackCover,
      cover
    );

    setImage(
      elements.revealCover,
      cover
    );

    setBackground(
      cover
    );

    if (
      screen === "idle"
    ) {
      renderIdle(
        state
      );
    }

    if (
      screen === "preparing"
    ) {
      renderPreparing();
    }

    if (
      screen === "syncing"
    ) {
      renderSyncing(
        quiz,
        player
      );
    }

    if (
      screen === "question"
    ) {
      renderQuestion(
        state,
        quiz
      );
    }

    if (
      screen === "reveal"
    ) {
      renderReveal(
        state,
        quiz
      );
    }

    if (
      screen === "recovery"
    ) {
      renderRecovery(
        quiz
      );
    }

    if (
      screen === "returning"
    ) {
      renderReturning(
        quiz
      );
    }

    if (
      [
        "idle",
        "preparing",
        "syncing",
        "reveal",
        "recovery",
        "returning",
        "paused",
        "playerOffline"
      ].includes(screen)
    ) {
      stopQuestionTimer();
    }

    if (
      screen ===
      "playerOffline"
    ) {
      setText(
        elements.playerOfflineStatus,
        player.lastOfflineReason ===
          "heartbeat_timeout"
          ? "ODNAWIAMY PLAYER"
          : "PONOWNE ŁĄCZENIE"
      );
    }

    renderDebug(
      quiz,
      player
    );
  }

  function renderHeader(
    spotify,
    player,
    playback
  ) {
    const spotifyConnected =
      boolean(
        spotify.connected
      );

    const spotifyConfigured =
      boolean(
        spotify.configured,
        spotifyConnected
      );

    setStatus(
      elements.spotifyIndicator,
      spotifyConnected
        ? "connected"
        : spotifyConfigured
          ? "waiting"
          : "offline"
    );

    setText(
      elements.spotifyIndicatorText,
      spotifyConnected
        ? "ONLINE"
        : spotifyConfigured
          ? "ŁĄCZENIE"
          : "NIEGOTOWE"
    );

    const playerReady =
      boolean(
        player.ready
      ) &&
      !player.stale;

    const playing =
      boolean(
        playback.playing
      );

    setStatus(
      elements.playerIndicator,
      playing
        ? "playing"
        : playerReady
          ? "ready"
          : "waiting"
    );

    setText(
      elements.playerIndicatorText,
      playing
        ? "ODTWARZA"
        : playerReady
          ? "GOTOWY"
          : "OCZEKUJE"
    );
  }

  function renderFooter(
    spotify,
    player
  ) {
    const ready =
      boolean(
        spotify.connected
      ) &&
      boolean(
        player.ready
      ) &&
      !player.stale;

    setStatus(
      elements.footerSystemDot,
      ready
        ? "ready"
        : "waiting"
    );

    setText(
      elements.footerSystemText,
      ready
        ? "SYSTEM ONLINE"
        : "SYSTEM ŁĄCZY SIĘ"
    );
  }

  function renderIdle(state) {
    const ready =
      Boolean(
        state.selectedPlaylist
      ) &&
      number(
        object(
          state.library
        ).trackCount
      ) >= 4;

    setText(
      elements.idleStatusText,
      ready
        ? "GOTOWY DO STARTU"
        : "AUTOMAT OCZEKUJE NA START"
    );
  }

  function renderPreparing() {
    setText(
      elements.preparingEyebrow,
      "NOWA RUNDA"
    );

    setText(
      elements.preparingTitle,
      "WYBIERAMY KOLEJNY HIT"
    );

    setText(
      elements.preparingDescription,
      "Automat losuje nowy utwór i przygotowuje jedno pytanie o wykonawcę albo tytuł."
    );

    setWidth(
      elements.preparingProgressValue,
      42
    );

    setText(
      elements.preparingProgressText,
      "ANALIZA BIBLIOTEKI MUZYCZNEJ"
    );
  }

  function renderSyncing(
    quiz,
    player
  ) {
    const playback =
      object(
        quiz.playback
      );

    const expectedUri =
      text(
        playback.expectedTrackUri
      );

    const actualUri =
      text(
        playback.actualTrackUri
      );

    const trackReady =
      Boolean(
        expectedUri &&
        (
          !actualUri ||
          expectedUri ===
            actualUri
        )
      );

    const deviceReady =
      boolean(
        player.ready
      ) &&
      !player.stale;

    const progressReady =
      boolean(
        playback.verified
      ) ||
      boolean(
        playback.playing
      );

    setText(
      elements.syncingTitle,
      "SYNCHRONIZUJEMY UTWÓR"
    );

    setText(
      elements.syncingDescription,
      "Automat sprawdza właściwy utwór, aktywny player i rzeczywisty postęp odtwarzania."
    );

    setStatus(
      elements.syncTrackCheck,
      playback.failureCode
        ? "error"
        : trackReady
          ? "success"
          : "waiting"
    );

    setStatus(
      elements.syncDeviceCheck,
      deviceReady
        ? "success"
        : "waiting"
    );

    setStatus(
      elements.syncProgressCheck,
      playback.failureCode
        ? "error"
        : progressReady
          ? "success"
          : "waiting"
    );

    setText(
      elements.syncingStatusText,
      playback.failureCode
        ? "AUTOMATYCZNA NAPRAWA"
        : playback.verifying
          ? "WERYFIKACJA ODTWARZANIA"
          : "BEZPIECZNE URUCHAMIANIE"
    );
  }

  function renderQuestion(
    state,
    quiz
  ) {
    const question =
      object(
        quiz.question
      );

    const playback =
      object(
        quiz.playback
      );

    const questionType =
      text(
        quiz.questionType ||
        quiz.stage ||
        question.type,
        "artist"
      );

    setText(
      elements.roundLabel,
      `RUNDA ${Math.max(
        1,
        integer(
          quiz.round,
          1
        )
      )}`
    );

    setText(
      elements.stageLabel,
      questionType === "title"
        ? "ZGADNIJ TYTUŁ"
        : "ZGADNIJ WYKONAWCĘ"
    );

    setText(
      elements.questionCategory,
      "POLSKI HIT"
    );

    setText(
      elements.questionText,
      question.question,
      questionType === "title"
        ? "Jaki jest tytuł tego utworu?"
        : "Kto wykonuje ten utwór?"
    );

    setText(
      elements.questionInstruction,
      "Napisz na czacie A, B, C lub D"
    );

    elements
      .trackArtworkFrame
      ?.classList
      .add("concealed");

    setVisible(
      elements.trackCoverShield,
      true
    );

    setStatus(
      elements.trackPlaybackBadge,
      playback.playing
        ? "playing"
        : playback.verifying
          ? "waiting"
          : "offline"
    );

    setText(
      elements.trackPlaybackText,
      playback.playing
        ? "MUZYKA GRA"
        : playback.verifying
          ? "SPRAWDZANIE"
          : "PRZYGOTOWANIE"
    );

    renderAnswers(
      question.options,
      quiz.votes
    );

    renderProgress(
      quiz
    );

    renderHint(
      quiz
    );

    renderRecentVotes(
      quiz.recentVotes
    );

    renderLeaderboard(
      state.leaderboard
    );

    syncQuestionTimer(
      state.settings,
      quiz
    );
  }

  function renderAnswers(
    optionsValue,
    votesValue
  ) {
    const options =
      new Map(
        list(
          optionsValue
        ).map(
          (item) => [
            text(
              item?.letter
            ).toUpperCase(),

            object(item)
          ]
        )
      );

    const votes =
      object(
        votesValue
      );

    const total =
      [
        "A",
        "B",
        "C",
        "D"
      ].reduce(
        (
          result,
          letter
        ) =>
          result +
          Math.max(
            0,
            integer(
              votes[letter]
            )
          ),
        0
      );

    for (
      const letter of
      [
        "A",
        "B",
        "C",
        "D"
      ]
    ) {
      const nodes =
        answers[letter];

      const option =
        options.get(
          letter
        );

      const count =
        Math.max(
          0,
          integer(
            votes[letter]
          )
        );

      setText(
        nodes.text,
        option?.text,
        `Odpowiedź ${letter}`
      );

      setText(
        nodes.count,
        count
      );

      setWidth(
        nodes.progress,
        total > 0
          ? (
              count /
              total
            ) *
            100
          : 0
      );

      nodes.card
        ?.classList
        .remove(
          "correct",
          "incorrect",
          "wrong"
        );
    }
  }

  function renderProgress(
    quiz
  ) {
    const correct =
      Math.max(
        0,
        integer(
          quiz.correctCount
        )
      );

    const required =
      Math.max(
        1,
        integer(
          quiz.requiredCorrect,
          10
        )
      );

    setText(
      elements.correctCounter,
      `${correct} / ${required}`
    );

    setWidth(
      elements.stageProgressValue,
      (
        correct /
        required
      ) *
      100
    );

    setText(
      elements.totalVotesText,
      `${Math.max(
        0,
        integer(
          quiz.totalVotes
        )
      )} GŁOSÓW`
    );

    setText(
      elements.uniquePlayersText,
      `${Math.max(
        0,
        integer(
          quiz.uniquePlayers
        )
      )} GRACZY`
    );
  }

  function renderHint(
    quiz
  ) {
    const hint =
      object(
        quiz.hint
      );

    const message =
      text(
        hint.message
      );

    setVisible(
      elements.hintPanel,
      Boolean(message)
    );

    if (!message) {
      return;
    }

    const level =
      Math.max(
        1,
        integer(
          hint.level ||
          quiz.hintLevel,
          1
        )
      );

    setText(
      elements.hintLevel,
      level > 1
        ? "OSTATNIA PODPOWIEDŹ"
        : "PODPOWIEDŹ"
    );

    setText(
      elements.hintText,
      message
    );
  }

  function renderRecentVotes(
    value
  ) {
    if (
      !elements.recentVotes
    ) {
      return;
    }

    const votes =
      list(value)
        .slice(
          0,
          CONFIG.recentVotesLimit
        );

    elements
      .recentVotes
      .replaceChildren();

    if (
      votes.length === 0
    ) {
      const empty =
        document.createElement(
          "div"
        );

      empty.className =
        "empty-mini-state";

      empty.textContent =
        "Pierwsze odpowiedzi pojawią się tutaj";

      elements
        .recentVotes
        .appendChild(empty);

      return;
    }

    for (
      const voteValue of
      votes
    ) {
      const vote =
        object(
          voteValue
        );

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "recent-vote";

      const name =
        document.createElement(
          "strong"
        );

      name.textContent =
        text(
          vote.displayName ||
          vote.username,
          "Gracz"
        );

      const answer =
        document.createElement(
          "span"
        );

      answer.textContent =
        text(
          vote.letter ||
          vote.answer,
          "?"
        ).toUpperCase();

      if (
        vote.isCorrect ===
        true
      ) {
        answer.classList.add(
          "correct"
        );
      }

      row.append(
        name,
        answer
      );

      elements
        .recentVotes
        .appendChild(row);
    }

    setText(
      elements.recentVotesStatus,
      "LIVE"
    );
  }

  function renderLeaderboard(
    value
  ) {
    const leaderboard =
      list(value);

    const slots = [
      [
        elements.leaderboardFirstName,
        elements.leaderboardFirstPoints
      ],
      [
        elements.leaderboardSecondName,
        elements.leaderboardSecondPoints
      ],
      [
        elements.leaderboardThirdName,
        elements.leaderboardThirdPoints
      ]
    ];

    slots.forEach(
      (
        [
          nameElement,
          pointsElement
        ],
        index
      ) => {
        const player =
          object(
            leaderboard[index]
          );

        setText(
          nameElement,
          player.displayName ||
          player.username,
          "Czekamy…"
        );

        setText(
          pointsElement,
          `${Math.max(
            0,
            integer(
              player.points
            )
          )} pkt`
        );
      }
    );
  }

  function renderReveal(
    state,
    quiz
  ) {
    const reveal =
      object(
        quiz.reveal
      );

    const revealTrack =
      object(
        reveal.track
      );

    const track = {
      ...object(
        quiz.currentTrack
      ),

      ...revealTrack
    };

    const questionType =
      text(
        quiz.questionType ||
        quiz.stage ||
        reveal.questionType,
        "artist"
      );

    const revealKey = [
      quiz.roundId ||
      quiz.round,

      quiz.correctLetter,

      quiz.correctAnswer
    ].join("|");

    if (
      runtime.revealKey !==
      revealKey
    ) {
      runtime.revealKey =
        revealKey;

      flash();
      createCelebration();
    }

    setImage(
      elements.revealCover,
      track.cover
    );

    setBackground(
      track.cover
    );

    setText(
      elements.revealEyebrow,
      "POPRAWNA ODPOWIEDŹ"
    );

    setText(
      elements.revealTitle,
      questionType === "title"
        ? "ZNAMY TYTUŁ!"
        : "ZNAMY WYKONAWCĘ!"
    );

    setText(
      elements.revealAnswerLetter,
      text(
        quiz.correctLetter,
        "?"
      ).toUpperCase()
    );

    setText(
      elements.revealAnswer,
      quiz.correctAnswer,
      "Poprawna odpowiedź"
    );

    setText(
      elements.revealedTrackArtist,
      track.artist ||
      track.primaryArtist,
      "Wykonawca"
    );

    setText(
      elements.revealedTrackTitle,
      track.title,
      "Tytuł"
    );

    setText(
      elements.revealedTrackYear,
      track.year,
      ""
    );

    setText(
      elements.revealCorrectCount,
      Math.max(
        0,
        integer(
          quiz.correctCount
        )
      )
    );

    setText(
      elements.revealPlayerCount,
      Math.max(
        0,
        integer(
          quiz.uniquePlayers
        )
      )
    );

    const fastestPlayer =
      object(
        list(
          quiz.winners
        )[0]
      );

    setText(
      elements.revealFastestPlayer,
      fastestPlayer.displayName ||
      fastestPlayer.username ||
      fastestPlayer.name,
      "Brak"
    );

    setText(
      elements.revealCountdownLabel,
      "NOWA RUNDA ZA"
    );

    setText(
      elements.revealCountdown,
      Math.max(
        0,
        integer(
          quiz.countdown
        )
      )
    );
  }

  function renderRecovery(
    quiz
  ) {
    const recovery =
      object(
        quiz.recovery
      );

    const promo =
      object(
        recovery.promo
      );

    const critical =
      boolean(
        recovery.critical
      );

    const attempt =
      Math.max(
        0,
        integer(
          recovery.attempt
        )
      );

    setText(
      elements.recoveryIcon,
      promo.icon,
      critical
        ? "⚡"
        : "♪"
    );

    setText(
      elements.recoveryEyebrow,
      promo.eyebrow,
      "POLSKA NOSTALGIA LIVE"
    );

    setText(
      elements.recoveryTitle,
      critical
        ? "SPRAWDZAMY SYSTEM"
        : "PRZYGOTOWUJEMY KOLEJNY HIT"
    );

    setText(
      elements.recoveryDescription,
      recovery.reason,
      "Automat przygotowuje bezpieczny powrót do quizu."
    );

    setStatus(
      elements.recoveryPlayerStep,
      attempt > 0
        ? "completed"
        : "active"
    );

    setStatus(
      elements.recoveryMusicStep,
      attempt > 0
        ? "active"
        : "waiting"
    );

    setStatus(
      elements.recoveryReturnStep,
      "waiting"
    );

    setText(
      elements.recoveryPlayerStepText,
      attempt > 0
        ? "SPRAWDZONO"
        : "SPRAWDZANIE"
    );

    setText(
      elements.recoveryMusicStepText,
      critical
        ? "DIAGNOSTYKA"
        : "NOWY UTWÓR"
    );

    setText(
      elements.recoveryReturnStepText,
      "ZA CHWILĘ"
    );

    setWidth(
      elements.recoveryProgressValue,
      number(
        promo.progress
      )
    );

    setText(
      elements.recoveryStatusText,
      critical
        ? "AUTOMATYCZNA DIAGNOSTYKA"
        : "AUTOMATYCZNA OCHRONA TRANSMISJI"
    );

    setText(
      elements.recoveryCountdown,
      Math.max(
        0,
        integer(
          quiz.countdown
        )
      )
    );

    const hasPromo =
      Object.keys(
        promo
      ).length > 0;

    setVisible(
      elements.recoveryPromo,
      hasPromo
    );

    setText(
      elements.recoveryPromoIcon,
      promo.icon,
      "❤️"
    );

    setText(
      elements.recoveryPromoEyebrow,
      promo.eyebrow,
      "PODOBA CI SIĘ QUIZ?"
    );

    setText(
      elements.recoveryPromoTitle,
      promo.title,
      "ZOSTAW OBSERWACJĘ"
    );

    setText(
      elements.recoveryPromoDescription,
      promo.description,
      "Za chwilę wracamy do gry."
    );
  }

  function renderReturning(
    quiz
  ) {
    setText(
      elements.returningCountdown,
      Math.max(
        0,
        integer(
          quiz.countdown,
          3
        )
      )
    );
  }

  function syncQuestionTimer(
    settingsValue,
    quiz
  ) {
    const settings =
      object(
        settingsValue
      );

    const questionType =
      text(
        quiz.questionType ||
        quiz.stage,
        "artist"
      );

    const duration =
      Math.max(
        1,
        number(
          questionType === "title"
            ? settings.titleDurationSeconds
            : settings.artistDurationSeconds,
          45
        )
      );

    runtime.timer = {
      duration,

      remaining:
        clamp(
          quiz.remainingSeconds,
          0,
          duration
        ),

      receivedAt:
        Date.now(),

      running:
        quiz.phase ===
          "question" &&
        !quiz.locked &&
        boolean(
          object(
            quiz.playback
          ).playing
        )
    };

    if (
      !runtime.timerFrame
    ) {
      runtime.timerFrame =
        requestAnimationFrame(
          timerLoop
        );
    }
  }

  function timerLoop() {
    runtime.timerFrame =
      null;

    if (
      runtime.destroyed ||
      runtime.screen !==
        "question"
    ) {
      return;
    }

    const elapsed =
      runtime.timer.running
        ? (
            Date.now() -
            runtime.timer.receivedAt
          ) /
          1000
        : 0;

    const remaining =
      Math.max(
        0,
        runtime.timer.remaining -
        elapsed
      );

    renderTimer(
      remaining,
      runtime.timer.duration
    );

    runtime.timerFrame =
      requestAnimationFrame(
        timerLoop
      );
  }

  function renderTimer(
    remaining,
    duration
  ) {
    const safeDuration =
      Math.max(
        1,
        number(
          duration,
          1
        )
      );

    const safeRemaining =
      clamp(
        remaining,
        0,
        safeDuration
      );

    const offset =
      CONFIG.timerRingLength *
      (
        1 -
        safeRemaining /
        safeDuration
      );

    setText(
      elements.remainingTime,
      Math.ceil(
        safeRemaining
      )
    );

    if (
      elements.timeRingValue
    ) {
      elements
        .timeRingValue
        .style
        .strokeDasharray =
        String(
          CONFIG.timerRingLength
        );

      elements
        .timeRingValue
        .style
        .strokeDashoffset =
        String(offset);

      elements
        .timeRingValue
        .classList
        .toggle(
          "warning",
          safeRemaining <= 10 &&
          safeRemaining > 5
        );

      elements
        .timeRingValue
        .classList
        .toggle(
          "danger",
          safeRemaining <= 5
        );
    }

    elements
      .questionScreen
      ?.classList
      .toggle(
        "time-warning",
        safeRemaining <= 10
      );

    elements
      .questionScreen
      ?.classList
      .toggle(
        "time-critical",
        safeRemaining <= 5
      );
  }

  function stopQuestionTimer() {
    if (
      runtime.timerFrame
    ) {
      cancelAnimationFrame(
        runtime.timerFrame
      );
    }

    runtime.timerFrame =
      null;

    runtime.timer.running =
      false;
  }

  function normalizeMoment(value) {
    const source =
      object(value);

    const duration =
      Math.max(
        1000,
        integer(
          source.durationMs ??
          source.duration,
          7000
        )
      );

    const parsedStartedAt =
      Date.parse(
        source.startedAt ||
        ""
      );

    const startedAt =
      Number.isFinite(
        parsedStartedAt
      )
        ? parsedStartedAt
        : Date.now();

    const parsedEndsAt =
      Date.parse(
        source.endsAt ||
        ""
      );

    const endsAt =
      Number.isFinite(
        parsedEndsAt
      )
        ? parsedEndsAt
        : startedAt +
          duration;

    return {
      eventId:
        text(
          source.eventId ||
          source.id
        ),

      type:
        text(
          source.type,
          "custom"
        )
          .toLowerCase()
          .replace(
            /[^a-z0-9_-]/g,
            ""
          ),

      theme:
        text(
          source.theme,
          "default"
        )
          .toLowerCase()
          .replace(
            /[^a-z0-9_-]/g,
            ""
          ),

      startedAt,
      endsAt,

      category:
        text(
          source.category,
          "SPECJALNY MOMENT"
        ),

      icon:
        text(
          source.icon,
          "✨"
        ),

      eyebrow:
        text(
          source.eyebrow,
          "POLSKA NOSTALGIA LIVE"
        ),

      title:
        text(
          source.title,
          "SPECJALNY MOMENT"
        ),

      description:
        text(
          source.description,
          "Zostań z nami."
        ),

      actionIcon:
        text(
          source.actionIcon,
          "↗"
        ),

      actionText:
        text(
          source.actionText,
          "UDOSTĘPNIJ LIVE"
        ),

      secondaryIcon:
        text(
          source.secondaryIcon,
          "❤️"
        ),

      secondaryText:
        text(
          source.secondaryText,
          "DZIĘKUJEMY ZA WSPARCIE"
        ),

      bottomText:
        text(
          source.bottomText,
          "ZA CHWILĘ WRACAMY DO GRY"
        ),

      floatingIcons:
        list(
          source.floatingIcons
        )
          .map(
            (item) =>
              text(item)
          )
          .filter(Boolean),

      combo:
        Math.max(
          1,
          integer(
            source.combo,
            1
          )
        ),

      showCounter:
        boolean(
          source.showCounter
        ),

      counterLabel:
        text(
          source.counterLabel,
          "RAZEM"
        ),

      counterValue:
        Math.max(
          0,
          integer(
            source.counterValue
          )
        ),

      recordLabel:
        text(
          source.recordLabel,
          "WBIJAMY REKORD"
        ),

      recordValue:
        Math.max(
          0,
          integer(
            source.recordValue
          )
        ),

      recordUnit:
        text(
          source.recordUnit,
          "GRACZY"
        )
    };
  }

  function showMoment(value) {
    const moment =
      normalizeMoment(
        value
      );

    /*
     * Każdy poprawny LIVE FX
     * musi mieć własne eventId.
     */
    if (
      !moment.eventId ||
      moment.endsAt <=
        Date.now()
    ) {
      return;
    }

    /*
     * Ten sam eventId nie może
     * uruchomić animacji ponownie.
     */
    if (
      runtime.liveFx.active &&
      runtime.liveFx.eventId ===
        moment.eventId
    ) {
      updateMoment(
        value
      );

      return;
    }

    stopMoment(
      true
    );

    runtime.liveFx.active =
      true;

    runtime.liveFx.eventId =
      moment.eventId;

    runtime.liveFx.startedAt =
      moment.startedAt;

    runtime.liveFx.endsAt =
      moment.endsAt;

    renderMoment(
      moment
    );

    if (
      elements.showMoment
    ) {
      elements.showMoment
        .className =
        [
          "show-moment",
          "active",
          `show-moment-${moment.type}`,
          `theme-${moment.theme}`
        ].join(" ");

      elements.showMoment
        .setAttribute(
          "aria-hidden",
          "false"
        );
    }

    createMomentIcons(
      moment
    );

    runtime.liveFx.frame =
      requestAnimationFrame(
        momentLoop
      );
  }

  function renderMoment(moment) {
    setText(
      elements.showMomentIcon,
      moment.icon
    );

    setText(
      elements.showMomentCategory,
      moment.category
    );

    setText(
      elements.showMomentEyebrow,
      moment.eyebrow
    );

    setText(
      elements.showMomentTitle,
      moment.title
    );

    setText(
      elements.showMomentDescription,
      moment.description
    );

    setText(
      elements.showMomentActionIcon,
      moment.actionIcon
    );

    setText(
      elements.showMomentActionText,
      moment.actionText
    );

    setText(
      elements.showMomentSecondaryIcon,
      moment.secondaryIcon
    );

    setText(
      elements.showMomentSecondaryText,
      moment.secondaryText
    );

    setText(
      elements.showMomentBottomText,
      moment.bottomText
    );

    setVisible(
      elements.showMomentCombo,
      moment.type === "tap" ||
      moment.combo > 1
    );

    setText(
      elements.showMomentComboValue,
      `×${moment.combo}`
    );

    setVisible(
      elements.showMomentRecord,
      moment.type ===
        "record"
    );

    setText(
      elements.showMomentRecordLabel,
      moment.recordLabel
    );

    setText(
      elements.showMomentRecordValue,
      moment.recordValue
    );

    setText(
      elements.showMomentRecordUnit,
      moment.recordUnit
    );

    setVisible(
      elements.showMomentCounter,
      moment.showCounter
    );

    setText(
      elements.showMomentCounterLabel,
      moment.counterLabel
    );

    setText(
      elements.showMomentCounterValue,
      moment.counterValue
    );
  }

  function updateMoment(value) {
    if (
      !runtime.liveFx.active
    ) {
      return;
    }

    const moment =
      normalizeMoment(
        value
      );

    if (
      moment.eventId &&
      moment.eventId !==
        runtime.liveFx.eventId
    ) {
      return;
    }

    renderMoment(
      moment
    );

    if (
      moment.endsAt >
      Date.now()
    ) {
      runtime.liveFx.endsAt =
        moment.endsAt;
    }
  }

  function momentLoop() {
    runtime.liveFx.frame =
      null;

    if (
      !runtime.liveFx.active ||
      runtime.destroyed
    ) {
      return;
    }

    const total =
      Math.max(
        1,
        runtime.liveFx.endsAt -
        runtime.liveFx.startedAt
      );

    const progress =
      clamp(
        (
          Date.now() -
          runtime.liveFx.startedAt
        ) /
        total *
        100,
        0,
        100
      );

    setWidth(
      elements.showMomentProgressValue,
      progress
    );

    if (
      Date.now() >=
      runtime.liveFx.endsAt
    ) {
      stopMoment(
        false
      );

      return;
    }

    runtime.liveFx.frame =
      requestAnimationFrame(
        momentLoop
      );
  }

  function stopMoment(
    clearIdentity = true
  ) {
    if (
      runtime.liveFx.frame
    ) {
      cancelAnimationFrame(
        runtime.liveFx.frame
      );
    }

    runtime.liveFx.frame =
      null;

    runtime.liveFx.active =
      false;

    runtime.liveFx.startedAt =
      0;

    runtime.liveFx.endsAt =
      0;

    if (clearIdentity) {
      runtime.liveFx.eventId =
        "";
    }

    elements
      .showMoment
      ?.classList
      .remove("active");

    elements
      .showMoment
      ?.classList
      .add("hidden");

    elements
      .showMoment
      ?.setAttribute(
        "aria-hidden",
        "true"
      );

    setWidth(
      elements.showMomentProgressValue,
      0
    );

    elements
      .showMomentFloatingIcons
      ?.replaceChildren();
  }

  function createMomentIcons(moment) {
    if (
      !elements
        .showMomentFloatingIcons
    ) {
      return;
    }

    elements
      .showMomentFloatingIcons
      .replaceChildren();

    const icons =
      moment.floatingIcons.length
        ? moment.floatingIcons
        : [
            moment.icon,
            "✨",
            "♪"
          ];

    for (
      let index = 0;
      index < 14;
      index += 1
    ) {
      const icon =
        document.createElement(
          "span"
        );

      icon.textContent =
        icons[
          index %
          icons.length
        ];

      icon.style.left =
        `${Math.random() * 100}%`;

      icon.style.top =
        `${95 + Math.random() * 20}%`;

      icon.style.fontSize =
        `${18 + Math.random() * 28}px`;

      icon.style.animation =
        `pnMomentFloat ${
          5 +
          Math.random() *
          4
        }s linear ${
          Math.random()
        }s infinite`;

      elements
        .showMomentFloatingIcons
        .appendChild(icon);
    }
  }

  function createCelebration() {
    if (
      !elements.celebrationLayer
    ) {
      return;
    }

    elements
      .celebrationLayer
      .replaceChildren();

    const colors = [
      "#ff315f",
      "#9b55ff",
      "#35b8ff",
      "#34eba1",
      "#ffc857",
      "#ffffff"
    ];

    for (
      let index = 0;
      index < 28;
      index += 1
    ) {
      const particle =
        document.createElement(
          "span"
        );

      particle.style.left =
        `${Math.random() * 100}%`;

      particle.style.background =
        colors[
          index %
          colors.length
        ];

      particle.style.setProperty(
        "--pn-drift",
        `${
          -100 +
          Math.random() *
          200
        }px`
      );

      particle.style.animation =
        `pnConfettiFall ${
          2.5 +
          Math.random() *
          2
        }s linear ${
          Math.random() *
          0.8
        }s forwards`;

      elements
        .celebrationLayer
        .appendChild(
          particle
        );
    }

    setTimeout(
      () => {
        elements
          .celebrationLayer
          ?.replaceChildren();
      },
      5500
    );
  }

  function injectAnimations() {
    const style =
      document.createElement(
        "style"
      );

    style.textContent = `
      @keyframes pnConfettiFall {
        0% {
          transform:
            translate3d(0, -10vh, 0)
            rotate(0deg);
          opacity: 1;
        }

        100% {
          transform:
            translate3d(
              var(--pn-drift, 40px),
              110vh,
              0
            )
            rotate(780deg);
          opacity: 0;
        }
      }

      @keyframes pnMomentFloat {
        0% {
          transform:
            translateY(0)
            rotate(0deg);
          opacity: 0;
        }

        15% {
          opacity: 0.65;
        }

        100% {
          transform:
            translateY(-120vh)
            rotate(360deg);
          opacity: 0;
        }
      }

      #celebrationLayer > span {
        position: absolute;
        top: -5%;
        width: 10px;
        height: 16px;
        border-radius: 3px;
      }

      #showMomentFloatingIcons > span {
        position: absolute;
        opacity: 0.55;
      }
    `;

    document.head.appendChild(
      style
    );
  }

  function setConnection(
    status,
    label
  ) {
    setText(
      elements.connectionBannerText,
      label
    );

    setText(
      elements.debugConnection,
      status.toUpperCase()
    );

    if (
      elements.overlay
    ) {
      [
        ...elements
          .overlay
          .classList
      ]
        .filter(
          (className) =>
            className.startsWith(
              "connection-"
            )
        )
        .forEach(
          (className) => {
            elements
              .overlay
              .classList
              .remove(
                className
              );
          }
        );

      elements
        .overlay
        .classList
        .add(
          `connection-${status}`
        );
    }
  }

  function showConnection(
    label
  ) {
    setText(
      elements.connectionBannerText,
      label
    );

    setVisible(
      elements.connectionBanner,
      true
    );
  }

  function hideConnection() {
    setVisible(
      elements.connectionBanner,
      false
    );
  }

  function parseState(data) {
    try {
      const state =
        JSON.parse(data);

      window.__pnState =
        state;

      renderState(
        state
      );
    } catch (error) {
      console.warn(
        "[OVERLAY] Nieprawidłowy stan:",
        error.message
      );
    }
  }

  function connectEvents() {
    if (
      runtime.destroyed ||
      typeof EventSource !==
        "function"
    ) {
      return;
    }

    closeEvents();

    showConnection(
      "ŁĄCZENIE Z SERWEREM"
    );

    setConnection(
      "waiting",
      "ŁĄCZENIE Z SERWEREM"
    );

    const source =
      new EventSource(
        CONFIG.eventsUrl
      );

    runtime.source =
      source;

    source.onopen = () => {
      if (
        runtime.source !==
        source
      ) {
        return;
      }

      runtime.failures =
        0;

      runtime.lastStateAt =
        Date.now();

      setConnection(
        "connected",
        "SYSTEM ONLINE"
      );

      setTimeout(
        () => {
          if (
            runtime.source ===
            source
          ) {
            hideConnection();
          }
        },
        900
      );
    };

    source.onmessage = (
      event
    ) => {
      parseState(
        event.data
      );
    };

    source.addEventListener(
      "heartbeat",
      () => {
        runtime.lastStateAt =
          Date.now();
      }
    );

    /*
     * LIVE FX uruchamia wyłącznie
     * dedykowany event show-moment.
     *
     * Snapshot /api/state nigdy
     * nie uruchamia pełnoekranowej animacji.
     */
    source.addEventListener(
      "show-moment",
      (event) => {
        try {
          showMoment(
            JSON.parse(
              event.data
            )
          );
        } catch (error) {
          console.warn(
            "[OVERLAY] Błędny LIVE FX:",
            error.message
          );
        }
      }
    );

    source.addEventListener(
      "show-moment-update",
      (event) => {
        try {
          updateMoment(
            JSON.parse(
              event.data
            )
          );
        } catch (error) {
          console.warn(
            "[OVERLAY] Błędna aktualizacja LIVE FX:",
            error.message
          );
        }
      }
    );

    source.addEventListener(
      "show-moment-stop",
      () => {
        stopMoment(
          true
        );
      }
    );

    source.addEventListener(
      "show-moment-clear",
      () => {
        stopMoment(
          true
        );
      }
    );

    source.addEventListener(
      "show-moment-state",
      (event) => {
        try {
          const value =
            JSON.parse(
              event.data
            );

          /*
           * Stan LIVE FX może go zamknąć,
           * ale nie może go uruchomić.
           */
          if (
            value.active === null ||
            value.active === false
          ) {
            stopMoment(
              true
            );
          }
        } catch (error) {
          console.warn(
            "[OVERLAY] Błędny stan LIVE FX:",
            error.message
          );
        }
      }
    );

    source.addEventListener(
      "player-offline",
      () => {
        schedulePoll(
          true
        );
      }
    );

    source.addEventListener(
      "shutdown",
      () => {
        showConnection(
          "SERWER JEST ZATRZYMYWANY"
        );

        setConnection(
          "waiting",
          "SERWER JEST ZATRZYMYWANY"
        );
      }
    );

    source.onerror = () => {
      if (
        runtime.source !==
        source
      ) {
        return;
      }

      closeEvents();

      runtime.failures +=
        1;

      showConnection(
        "ODZYSKIWANIE POŁĄCZENIA"
      );

      setConnection(
        "waiting",
        "ODZYSKIWANIE POŁĄCZENIA"
      );

      schedulePoll(
        true
      );

      scheduleReconnect();
    };
  }

  function closeEvents() {
    if (
      runtime.source
    ) {
      try {
        runtime.source.close();
      } catch {
        // Połączenie jest już zamknięte.
      }
    }

    runtime.source =
      null;
  }

  function scheduleReconnect() {
    clearTimeout(
      runtime.reconnectTimer
    );

    if (
      runtime.destroyed
    ) {
      return;
    }

    const delay =
      Math.min(
        CONFIG.reconnectMaxMs,
        CONFIG.reconnectMinMs *
        2 **
        Math.min(
          runtime.failures,
          4
        )
      ) +
      Math.floor(
        Math.random() *
        500
      );

    runtime.reconnectTimer =
      setTimeout(
        connectEvents,
        delay
      );
  }

  async function fetchState() {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        CONFIG.requestTimeoutMs
      );

    try {
      const response =
        await fetch(
          CONFIG.stateUrl,
          {
            headers: {
              Accept:
                "application/json",

              "Cache-Control":
                "no-cache"
            },

            cache:
              "no-store",

            credentials:
              "same-origin",

            signal:
              controller.signal
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const state =
        await response.json();

      window.__pnState =
        state;

      renderState(
        state
      );

      return true;
    } catch (error) {
      console.warn(
        "[OVERLAY] Pobieranie stanu nie powiodło się:",
        error.message
      );

      return false;
    } finally {
      clearTimeout(
        timeout
      );
    }
  }

  function schedulePoll(
    immediate = false
  ) {
    clearTimeout(
      runtime.pollTimer
    );

    if (
      runtime.destroyed
    ) {
      return;
    }

    runtime.pollTimer =
      setTimeout(
        async () => {
          await fetchState();

          schedulePoll(
            false
          );
        },
        immediate
          ? 0
          : CONFIG.pollMs
      );
  }

  function healthCheck() {
    if (
      !runtime.lastStateAt
    ) {
      return;
    }

    if (
      Date.now() -
      runtime.lastStateAt <=
      CONFIG.staleMs
    ) {
      return;
    }

    showConnection(
      "ODZYSKIWANIE DANYCH"
    );

    setConnection(
      "waiting",
      "ODZYSKIWANIE DANYCH"
    );

    schedulePoll(
      true
    );

    if (
      !runtime.source
    ) {
      scheduleReconnect();
    }
  }

  function renderDebug(
    quiz,
    player
  ) {
    setText(
      elements.debugPhase,
      text(
        quiz.phase,
        "idle"
      ).toUpperCase()
    );

    setText(
      elements.debugPlayer,
      player.ready &&
      !player.stale
        ? "READY"
        : "OFFLINE"
    );

    setText(
      elements.debugTrack,
      text(
        quiz.currentTrack?.id ||
        quiz.currentTrack?.uri,
        "NONE"
      )
    );

    setText(
      elements.debugVersion,
      VERSION
    );
  }

  async function initialize() {
    if (
      !elements.overlay
    ) {
      console.error(
        "[OVERLAY] Brak elementu #overlay."
      );

      return;
    }

    injectAnimations();

    for (
      const [
        name,
        element
      ] of
      Object.entries(screens)
    ) {
      if (!element) {
        continue;
      }

      const active =
        name === "idle";

      element.classList.toggle(
        "active",
        active
      );

      element.classList.toggle(
        "hidden",
        !active
      );

      element.setAttribute(
        "aria-hidden",
        active
          ? "false"
          : "true"
      );
    }

    runtime.screen =
      "idle";

    stopMoment(
      true
    );

    const params =
      new URLSearchParams(
        window.location.search
      );

    setVisible(
      elements.debugPanel,
      params.get("debug") ===
      "1"
    );

    setText(
      elements.debugVersion,
      VERSION
    );

    showConnection(
      "ŁĄCZENIE Z SERWEREM"
    );

    setConnection(
      "waiting",
      "ŁĄCZENIE Z SERWEREM"
    );

    /*
     * Snapshot początkowy pokazuje
     * aktualny ekran quizu.
     *
     * Nie uruchamia LIVE FX.
     */
    await fetchState();

    connectEvents();

    /*
     * Polling jest zabezpieczeniem
     * na wypadek niedostępności SSE.
     */
    schedulePoll(
      false
    );

    runtime.healthTimer =
      setInterval(
        healthCheck,
        3000
      );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (
          !document.hidden
        ) {
          schedulePoll(
            true
          );
        }
      }
    );

    window.addEventListener(
      "beforeunload",
      destroy,
      {
        once: true
      }
    );

    console.info(
      `[OVERLAY] Polska Nostalgia LIVE ${VERSION} uruchomiony.`
    );
  }

  function destroy() {
    runtime.destroyed =
      true;

    closeEvents();

    stopQuestionTimer();

    stopMoment(
      true
    );

    clearTimeout(
      runtime.reconnectTimer
    );

    clearTimeout(
      runtime.pollTimer
    );

    clearTimeout(
      runtime.transitionTimer
    );

    clearInterval(
      runtime.healthTimer
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once: true
      }
    );
  } else {
    void initialize();
  }
})();