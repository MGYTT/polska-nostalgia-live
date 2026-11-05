"use strict";

(() => {
  const VERSION = "8.0.0";

  const CONNECTION = Object.freeze({
    initialReconnectDelayMs: 1000,
    maximumReconnectDelayMs: 15000,
    staleConnectionMs: 30000,
    stateRefreshMs: 20000,
    requestTimeoutMs: 12000
  });

  const ENDPOINTS = Object.freeze({
    state: "/api/state",
    events: "/api/events",

    playlists: "/api/spotify/playlists",
    selectPlaylist: "/api/spotify/select-playlist",
    playback: "/api/spotify/playback",
    disconnectSpotify: "/api/spotify/disconnect",

    quizStart: "/api/quiz/start",
    quizPause: "/api/quiz/pause",
    quizResume: "/api/quiz/resume",
    quizNext: "/api/quiz/next",
    quizReveal: "/api/quiz/reveal",
    quizStop: "/api/quiz/stop",
    quizTestComment: "/api/quiz/test-comment",

    streamReset: "/api/streamtoearn/reset-status",

    showMoment: "/api/show-moment",
    showMomentStop: "/api/show-moment/stop",
    showMomentClear: "/api/show-moment/clear"
  });

  const elements = {
    spotifyStatus:
      document.querySelector("#spotifyStatus"),

    streamToEarnStatus:
      document.querySelector("#streamToEarnStatus"),

    quizStatus:
      document.querySelector("#quizStatus"),

    liveFxStatus:
      document.querySelector("#liveFxStatus"),

    spotifyMiniStatus:
      document.querySelector("#spotifyMiniStatus"),

    streamMiniStatus:
      document.querySelector("#streamMiniStatus"),

    liveFxMiniStatus:
      document.querySelector("#liveFxMiniStatus"),

    spotifyDisconnected:
      document.querySelector("#spotifyDisconnected"),

    spotifyConnected:
      document.querySelector("#spotifyConnected"),

    profileAvatar:
      document.querySelector("#profileAvatar"),

    profileName:
      document.querySelector("#profileName"),

    profileProduct:
      document.querySelector("#profileProduct"),

    deviceName:
      document.querySelector("#deviceName"),

    deviceDetails:
      document.querySelector("#deviceDetails"),

    refreshPlaybackButton:
      document.querySelector("#refreshPlaybackButton"),

    disconnectButton:
      document.querySelector("#disconnectButton"),

    streamRequests:
      document.querySelector("#streamRequests"),

    streamAccepted:
      document.querySelector("#streamAccepted"),

    streamRejected:
      document.querySelector("#streamRejected"),

    lastStreamEvent:
      document.querySelector("#lastStreamEvent"),

    resetStreamStatusButton:
      document.querySelector("#resetStreamStatusButton"),

    playlistSelect:
      document.querySelector("#playlistSelect"),

    loadPlaylistButton:
      document.querySelector("#loadPlaylistButton"),

    playlistInformation:
      document.querySelector("#playlistInformation"),

    playlistImage:
      document.querySelector("#playlistImage"),

    playlistName:
      document.querySelector("#playlistName"),

    playlistStatistics:
      document.querySelector("#playlistStatistics"),

    automationBadge:
      document.querySelector("#automationBadge"),

    startQuizButton:
      document.querySelector("#startQuizButton"),

    runningControls:
      document.querySelector("#runningControls"),

    pauseQuizButton:
      document.querySelector("#pauseQuizButton"),

    resumeQuizButton:
      document.querySelector("#resumeQuizButton"),

    nextQuizButton:
      document.querySelector("#nextQuizButton"),

    revealQuizButton:
      document.querySelector("#revealQuizButton"),

    stopQuizButton:
      document.querySelector("#stopQuizButton"),

    roundHeading:
      document.querySelector("#roundHeading"),

    roundNumber:
      document.querySelector("#roundNumber"),

    stageName:
      document.querySelector("#stageName"),

    emptyRound:
      document.querySelector("#emptyRound"),

    activeRound:
      document.querySelector("#activeRound"),

    roundCover:
      document.querySelector("#roundCover"),

    coverQuestion:
      document.querySelector("#coverQuestion"),

    playbackState:
      document.querySelector("#playbackState"),

    remainingTime:
      document.querySelector("#remainingTime"),

    correctCounter:
      document.querySelector("#correctCounter"),

    questionText:
      document.querySelector("#questionText"),

    answers:
      document.querySelector("#answers"),

    hintBox:
      document.querySelector("#hintBox"),

    hintText:
      document.querySelector("#hintText"),

    progressValue:
      document.querySelector("#progressValue"),

    voteBars:
      document.querySelector("#voteBars"),

    revealBox:
      document.querySelector("#revealBox"),

    testUsername:
      document.querySelector("#testUsername"),

    testComment:
      document.querySelector("#testComment"),

    sendTestCommentButton:
      document.querySelector("#sendTestCommentButton"),

    recentVotes:
      document.querySelector("#recentVotes"),

    leaderboard:
      document.querySelector("#leaderboard"),

    errorBox:
      document.querySelector("#errorBox"),

    toast:
      document.querySelector("#toast"),

    showMomentDuration:
      document.querySelector("#showMomentDuration"),

    showMomentPriority:
      document.querySelector("#showMomentPriority"),

    showMomentRecordValue:
      document.querySelector("#showMomentRecordValue"),

    showMomentRecordUnit:
      document.querySelector("#showMomentRecordUnit"),

    liveFxInformation:
      document.querySelector("#liveFxInformation"),

    liveFxCurrentMoment:
      document.querySelector("#liveFxCurrentMoment"),

    liveFxQueueInformation:
      document.querySelector("#liveFxQueueInformation"),

    stopShowMomentButton:
      document.querySelector("#stopShowMomentButton"),

    clearShowMomentQueueButton:
      document.querySelector("#clearShowMomentQueueButton"),

    stopAllShowMomentsButton:
      document.querySelector("#stopAllShowMomentsButton"),

    customMomentTheme:
      document.querySelector("#customMomentTheme"),

    customMomentIcon:
      document.querySelector("#customMomentIcon"),

    customMomentCategory:
      document.querySelector("#customMomentCategory"),

    customMomentEyebrow:
      document.querySelector("#customMomentEyebrow"),

    customMomentTitle:
      document.querySelector("#customMomentTitle"),

    customMomentDescription:
      document.querySelector("#customMomentDescription"),

    customMomentActionIcon:
      document.querySelector("#customMomentActionIcon"),

    customMomentActionText:
      document.querySelector("#customMomentActionText"),

    customMomentSecondaryIcon:
      document.querySelector("#customMomentSecondaryIcon"),

    customMomentSecondaryText:
      document.querySelector("#customMomentSecondaryText"),

    customMomentDuration:
      document.querySelector("#customMomentDuration"),

    customMomentPriority:
      document.querySelector("#customMomentPriority"),

    showCustomMomentButton:
      document.querySelector("#showCustomMomentButton"),

    resetCustomMomentButton:
      document.querySelector("#resetCustomMomentButton")
  };

  let currentState = null;
  let playlistsLoaded = false;

  let eventSource = null;

  let reconnectTimer = null;
  let connectionWatchdogTimer = null;
  let stateRefreshTimer = null;
  let toastTimer = null;

  let reconnectAttempt = 0;
  let lastServerMessageAt = 0;

  let liveFxRequestInProgress = false;

  let liveFxState = {
    available: true,
    active: null,
    queue: [],
    lastAction: null
  };

  let destroyed = false;

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

  function array(value) {
    return Array.isArray(value)
      ? value
      : [];
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

  function stringValue(
    value,
    fallback = ""
  ) {
    const normalized =
      String(
        value ??
        ""
      )
        .replace(/\u0000/g, "")
        .trim();

    return normalized ||
      fallback;
  }

  function booleanValue(
    value,
    fallback = false
  ) {
    if (
      typeof value === "boolean"
    ) {
      return value;
    }

    if (
      value === 1 ||
      value === "1" ||
      value === "true"
    ) {
      return true;
    }

    if (
      value === 0 ||
      value === "0" ||
      value === "false"
    ) {
      return false;
    }

    return fallback;
  }

  function safeBackgroundUrl(value) {
    return String(
      value ||
      ""
    )
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "")
      .replace(/\r/g, "");
  }

  function bind(
    element,
    eventName,
    handler
  ) {
    if (!element) {
      return;
    }

    element.addEventListener(
      eventName,
      handler
    );
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
      stringValue(
        value,
        fallback
      );
  }

  function setStatus(
    element,
    label,
    statusClass
  ) {
    if (!element) {
      return;
    }

    setText(
      element,
      label
    );

    element.classList.remove(
      "online",
      "offline",
      "waiting",
      "warning"
    );

    element.classList.add(
      statusClass
    );
  }

  function setButtonLoading(
    button,
    loading,
    loadingText = "Przetwarzanie..."
  ) {
    if (!button) {
      return;
    }

    if (loading) {
      if (
        !button.dataset.originalHtml
      ) {
        button.dataset.originalHtml =
          button.innerHTML;
      }

      button.textContent =
        loadingText;

      button.disabled =
        true;

      return;
    }

    if (
      button.dataset.originalHtml
    ) {
      button.innerHTML =
        button.dataset.originalHtml;

      delete button.dataset
        .originalHtml;
    }

    button.disabled =
      false;
  }

  function showToast(
    message,
    variant = "success"
  ) {
    clearTimeout(
      toastTimer
    );

    if (!elements.toast) {
      return;
    }

    elements.toast.textContent =
      stringValue(message);

    elements.toast.className =
      `toast visible ${variant}`;

    toastTimer =
      setTimeout(
        () => {
          elements.toast
            ?.classList
            .remove("visible");
        },
        3500
      );
  }

  function showError(message) {
    if (!elements.errorBox) {
      return;
    }

    setText(
      elements.errorBox,
      message
    );

    elements.errorBox
      .classList
      .remove("hidden");
  }

  function hideError() {
    if (!elements.errorBox) {
      return;
    }

    elements.errorBox
      .classList
      .add("hidden");

    elements.errorBox.textContent =
      "";
  }

  async function request(
    url,
    options = {}
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        CONNECTION.requestTimeoutMs
      );

    try {
      const response =
        await fetch(
          url,
          {
            ...options,

            cache:
              options.cache ||
              "no-store",

            credentials:
              "same-origin",

            headers: {
              Accept:
                "application/json",

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

      const data =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (!response.ok) {
        const error =
          new Error(
            data.error ||
            data.message ||
            `Błąd HTTP ${response.status}`
          );

        error.code =
          data.code ||
          "HTTP_ERROR";

        error.status =
          response.status;

        throw error;
      }

      return data;
    } catch (error) {
      if (
        error.name ===
        "AbortError"
      ) {
        const timeoutError =
          new Error(
            "Serwer nie odpowiedział w wymaganym czasie."
          );

        timeoutError.code =
          "REQUEST_TIMEOUT";

        throw timeoutError;
      }

      throw error;
    } finally {
      clearTimeout(
        timeout
      );
    }
  }

  function renderSpotify(
    spotifyValue
  ) {
    const spotify =
      object(
        spotifyValue
      );

    const connected =
      booleanValue(
        spotify.connected
      );

    setStatus(
      elements.spotifyStatus,
      connected
        ? "Spotify online"
        : "Spotify offline",
      connected
        ? "online"
        : "offline"
    );

    setStatus(
      elements.spotifyMiniStatus,
      connected
        ? "ONLINE"
        : "OFFLINE",
      connected
        ? "online"
        : "offline"
    );

    elements.spotifyDisconnected
      ?.classList
      .toggle(
        "hidden",
        connected
      );

    elements.spotifyConnected
      ?.classList
      .toggle(
        "hidden",
        !connected
      );

    if (
      elements.playlistSelect
    ) {
      elements.playlistSelect.disabled =
        !connected;
    }

    if (
      !connected ||
      !spotify.profile
    ) {
      playlistsLoaded =
        false;

      return;
    }

    const profile =
      object(
        spotify.profile
      );

    setText(
      elements.profileName,
      profile.displayName ||
      profile.id,
      "Spotify"
    );

    setText(
      elements.profileProduct,
      profile.product
        ? `Plan: ${profile.product}`
        : "Połączono"
    );

    if (!elements.profileAvatar) {
      return;
    }

    if (profile.image) {
      elements.profileAvatar.textContent =
        "";

      elements.profileAvatar
        .style
        .backgroundImage =
        `url("${safeBackgroundUrl(
          profile.image
        )}")`;
    } else {
      elements.profileAvatar
        .style
        .backgroundImage =
        "";

      elements.profileAvatar.textContent =
        stringValue(
          profile.displayName ||
          profile.id,
          "S"
        )
          .slice(0, 1)
          .toUpperCase();
    }
  }

  function renderPlayerRuntime(
    runtimeValue
  ) {
    const runtime =
      object(
        runtimeValue
      );

    const ready =
      Boolean(
        runtime.registered &&
        runtime.ready &&
        !runtime.stale
      );

    if (ready) {
      setText(
        elements.deviceName,
        runtime.deviceId
          ? "POLSKA NOSTALGIA PLAYER"
          : "Player gotowy"
      );

      setText(
        elements.deviceDetails,
        runtime.paused
          ? "Player online • odtwarzanie wstrzymane"
          : "Player online • odtwarzanie aktywne"
      );

      return;
    }

    if (
      runtime.registered &&
      runtime.stale
    ) {
      setText(
        elements.deviceName,
        "Heartbeat Playera wygasł"
      );

      setText(
        elements.deviceDetails,
        "System oczekuje na automatyczne ponowne połączenie."
      );

      return;
    }

    setText(
      elements.deviceName,
      "Player nie jest gotowy"
    );

    setText(
      elements.deviceDetails,
      "Otwórz stronę Playera przed uruchomieniem quizu."
    );
  }

  function renderStreamToEarn(
    streamValue
  ) {
    const stream =
      object(
        streamValue
      );

    const connected =
      booleanValue(
        stream.connected
      );

    setStatus(
      elements.streamToEarnStatus,
      connected
        ? "StreamToEarn odbiera"
        : "StreamToEarn oczekuje",
      connected
        ? "online"
        : "waiting"
    );

    setStatus(
      elements.streamMiniStatus,
      connected
        ? "RECEIVING"
        : "WAITING",
      connected
        ? "online"
        : "waiting"
    );

    setText(
      elements.streamRequests,
      integer(
        stream.totalRequests
      )
    );

    setText(
      elements.streamAccepted,
      integer(
        stream.acceptedRequests
      )
    );

    setText(
      elements.streamRejected,
      integer(
        stream.rejectedRequests
      )
    );

    if (!elements.lastStreamEvent) {
      return;
    }

    const lastEvent =
      object(
        stream.lastEvent
      );

    elements.lastStreamEvent
      .replaceChildren();

    const label =
      document.createElement(
        "span"
      );

    label.className =
      "information-label";

    label.textContent =
      "OSTATNIE ZDARZENIE";

    if (
      Object.keys(
        lastEvent
      ).length === 0
    ) {
      const title =
        document.createElement(
          "strong"
        );

      title.textContent =
        "Brak komentarzy";

      const description =
        document.createElement(
          "span"
        );

      description.textContent =
        "StreamToEarn oczekuje na pierwsze żądanie HTTP";

      elements.lastStreamEvent
        .append(
          label,
          title,
          description
        );

      return;
    }

    const statusIcon =
      lastEvent.accepted
        ? lastEvent.isCorrect
          ? "✅"
          : "❌"
        : "⏳";

    const title =
      document.createElement(
        "strong"
      );

    title.textContent =
      `${statusIcon} @${
        lastEvent.displayName ||
        lastEvent.username ||
        "widz"
      }`;

    const comment =
      document.createElement(
        "span"
      );

    comment.textContent =
      `"${stringValue(
        lastEvent.comment
      )}"`;

    elements.lastStreamEvent
      .append(
        label,
        title,
        comment
      );
  }

  function renderPlaylist(state) {
    const playlist =
      state.selectedPlaylist;

    elements.playlistInformation
      ?.classList
      .toggle(
        "hidden",
        !playlist
      );

    if (!playlist) {
      if (
        elements.startQuizButton
      ) {
        elements.startQuizButton.disabled =
          true;
      }

      return;
    }

    setText(
      elements.playlistName,
      playlist.name,
      "Playlista"
    );

    setText(
      elements.playlistStatistics,
      `${integer(
        state.library?.trackCount
      )} utworów • ${integer(
        state.library?.artistCount
      )} wykonawców`
    );

    if (
      elements.playlistImage
    ) {
      elements.playlistImage
        .style
        .backgroundImage =
        playlist.image
          ? `url("${safeBackgroundUrl(
              playlist.image
            )}")`
          : "";
    }

    const playerRuntime =
      object(
        state.playerRuntime
      );

    const playerReady =
      Boolean(
        playerRuntime.registered &&
        playerRuntime.ready &&
        !playerRuntime.stale
      );

    const canStart =
      Boolean(
        state.spotify?.connected
      ) &&
      playerReady &&
      integer(
        state.library?.trackCount
      ) >= 4 &&
      !state.quiz?.running;

    if (
      elements.startQuizButton
    ) {
      elements.startQuizButton.disabled =
        !canStart;
    }
  }

  function getQuestionType(quiz) {
    return stringValue(
      quiz?.questionType ||
      quiz?.stage ||
      quiz?.question?.type,
      "artist"
    );
  }

  function getQuestionTypeLabel(
    quiz
  ) {
    return getQuestionType(
      quiz
    ) === "title"
      ? "ZGADNIJ TYTUŁ"
      : "ZGADNIJ WYKONAWCĘ";
  }

  function getPhaseLabel(quiz) {
    const phase =
      stringValue(
        quiz?.phase,
        "idle"
      );

    const labels = {
      idle:
        "IDLE",

      preparing:
        "PRZYGOTOWANIE",

      starting:
        "SYNCHRONIZACJA",

      question:
        getQuestionTypeLabel(
          quiz
        ),

      "round-reveal":
        "ODPOWIEDŹ",

      "promo-break":
        "AUTO RECOVERY",

      returning:
        "POWRÓT",

      paused:
        "PAUZA"
    };

    return (
      labels[phase] ||
      phase.toUpperCase()
    );
  }

  function renderAnswers(
    questionValue
  ) {
    if (!elements.answers) {
      return;
    }

    const question =
      object(
        questionValue
      );

    elements.answers
      .replaceChildren();

    for (
      const optionValue of
      array(
        question.options
      )
    ) {
      const option =
        object(
          optionValue
        );

      const answer =
        document.createElement(
          "div"
        );

      answer.className =
        "answer";

      const letter =
        document.createElement(
          "strong"
        );

      letter.textContent =
        stringValue(
          option.letter,
          "?"
        );

      const label =
        document.createElement(
          "span"
        );

      label.textContent =
        stringValue(
          option.text,
          "-"
        );

      answer.append(
        letter,
        label
      );

      elements.answers
        .appendChild(
          answer
        );
    }
  }

  function renderVoteBars(quiz) {
    if (!elements.voteBars) {
      return;
    }

    elements.voteBars
      .replaceChildren();

    const letters = [
      "A",
      "B",
      "C",
      "D"
    ];

    const votes =
      object(
        quiz?.votes
      );

    const total =
      letters.reduce(
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
      letters
    ) {
      const amount =
        Math.max(
          0,
          integer(
            votes[letter]
          )
        );

      const width =
        total > 0
          ? amount /
            total *
            100
          : 0;

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "vote-row";

      const label =
        document.createElement(
          "strong"
        );

      label.textContent =
        letter;

      const track =
        document.createElement(
          "div"
        );

      track.className =
        "vote-track";

      const value =
        document.createElement(
          "div"
        );

      value.className =
        "vote-value";

      value.style.width =
        `${width}%`;

      const counter =
        document.createElement(
          "span"
        );

      counter.textContent =
        String(amount);

      track.appendChild(
        value
      );

      row.append(
        label,
        track,
        counter
      );

      elements.voteBars
        .appendChild(
          row
        );
    }
  }

  function renderRecentVotes(
    votesValue
  ) {
    if (!elements.recentVotes) {
      return;
    }

    const votes =
      array(
        votesValue
      );

    elements.recentVotes
      .replaceChildren();

    if (
      votes.length === 0
    ) {
      const empty =
        document.createElement(
          "p"
        );

      empty.className =
        "muted";

      empty.textContent =
        "Brak odpowiedzi w aktualnej rundzie.";

      elements.recentVotes
        .appendChild(
          empty
        );

      return;
    }

    for (
      const voteValue of
      votes.slice(0, 12)
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

      const icon =
        document.createElement(
          "span"
        );

      icon.textContent =
        vote.isCorrect
          ? "✅"
          : "❌";

      const username =
        document.createElement(
          "strong"
        );

      username.textContent =
        `@${
          vote.displayName ||
          vote.username ||
          "widz"
        }`;

      const letter =
        document.createElement(
          "b"
        );

      letter.textContent =
        stringValue(
          vote.letter ||
          vote.answer,
          "?"
        );

      row.append(
        icon,
        username,
        letter
      );

      elements.recentVotes
        .appendChild(
          row
        );
    }
  }

  function renderLeaderboard(
    playersValue
  ) {
    if (!elements.leaderboard) {
      return;
    }

    const players =
      array(
        playersValue
      );

    elements.leaderboard
      .replaceChildren();

    if (
      players.length === 0
    ) {
      const empty =
        document.createElement(
          "p"
        );

      empty.className =
        "muted";

      empty.textContent =
        "Ranking pojawi się po pierwszych poprawnych odpowiedziach.";

      elements.leaderboard
        .appendChild(
          empty
        );

      return;
    }

    players
      .slice(0, 10)
      .forEach(
        (
          playerValue,
          index
        ) => {
          const player =
            object(
              playerValue
            );

          const row =
            document.createElement(
              "div"
            );

          row.className =
            "leaderboard-row";

          const position =
            document.createElement(
              "span"
            );

          position.textContent =
            index === 0
              ? "🥇"
              : index === 1
                ? "🥈"
                : index === 2
                  ? "🥉"
                  : `${index + 1}.`;

          const username =
            document.createElement(
              "strong"
            );

          username.textContent =
            `@${
              player.displayName ||
              player.username ||
              "gracz"
            }`;

          const points =
            document.createElement(
              "b"
            );

          points.textContent =
            `${integer(
              player.points
            )} pkt`;

          row.append(
            position,
            username,
            points
          );

          elements.leaderboard
            .appendChild(
              row
            );
        }
      );
  }

  function renderPlayback(
    playbackValue
  ) {
    if (!elements.playbackState) {
      return;
    }

    const playback =
      object(
        playbackValue
      );

    const playing =
      booleanValue(
        playback.playing
      );

    const recovering =
      booleanValue(
        playback.recovering
      );

    const verifying =
      booleanValue(
        playback.verifying
      );

    const status =
      stringValue(
        playback.status,
        "idle"
      );

    elements.playbackState
      .classList
      .toggle(
        "playing",
        playing
      );

    elements.playbackState
      .classList
      .toggle(
        "recovering",
        recovering
      );

    elements.playbackState
      .classList
      .toggle(
        "error",
        status === "failed"
      );

    const label =
      elements.playbackState
        .querySelector(
          "span:last-child"
        );

    if (!label) {
      return;
    }

    if (recovering) {
      label.textContent =
        "Automatyczne odzyskiwanie odtwarzania";

      return;
    }

    if (playing) {
      label.textContent =
        playback.deviceName
          ? `Odtwarzanie aktywne • ${playback.deviceName}`
          : "Odtwarzanie aktywne";

      return;
    }

    if (
      status ===
        "syncing" ||
      status ===
        "starting" ||
      verifying
    ) {
      label.textContent =
        "Uruchamianie i weryfikowanie utworu";

      return;
    }

    if (
      status === "failed"
    ) {
      label.textContent =
        "Utwór pominięty, automat przygotowuje kolejny";

      return;
    }

    if (
      status === "paused"
    ) {
      label.textContent =
        "Odtwarzanie wstrzymane";

      return;
    }

    label.textContent =
      playback.requested
        ? "Odtwarzanie zatrzymane"
        : "Przygotowywanie rundy";
  }

  function renderReveal(quiz) {
    if (
      !elements.revealBox ||
      !elements.roundCover ||
      !elements.coverQuestion
    ) {
      return;
    }

    const revealed =
      quiz?.phase ===
      "round-reveal";

    elements.revealBox
      .classList
      .toggle(
        "hidden",
        !revealed
      );

    elements.roundCover
      .classList
      .toggle(
        "blurred",
        !revealed
      );

    elements.coverQuestion
      .classList
      .toggle(
        "hidden",
        revealed
      );

    elements.revealBox
      .replaceChildren();

    if (!revealed) {
      return;
    }

    const answer =
      document.createElement(
        "strong"
      );

    answer.textContent =
      `✅ ${
        quiz.correctLetter ||
        ""
      }. ${
        quiz.correctAnswer ||
        ""
      }`;

    const description =
      document.createElement(
        "span"
      );

    const revealTrack =
      object(
        quiz.reveal?.track
      );

    const currentTrack =
      object(
        quiz.currentTrack
      );

    const artist =
      revealTrack.artist ||
      currentTrack.artist ||
      currentTrack.primaryArtist;

    const title =
      revealTrack.title ||
      currentTrack.title;

    const year =
      revealTrack.year ||
      currentTrack.year;

    description.textContent =
      [
        artist,
        title,
        year
      ]
        .filter(Boolean)
        .join(" • ");

    const countdown =
      document.createElement(
        "small"
      );

    countdown.textContent =
      quiz.countdown != null
        ? `Następna runda za ${quiz.countdown} s`
        : "Przygotowywanie następnej rundy";

    elements.revealBox
      .append(
        answer,
        description,
        countdown
      );
  }

  function renderQuiz(quizValue) {
    const quiz =
      object(
        quizValue
      );

    const running =
      booleanValue(
        quiz.running
      );

    const paused =
      booleanValue(
        quiz.paused
      );

    const recovering =
      booleanValue(
        quiz.recovery?.active
      ) ||
      [
        "promo-break",
        "returning",
        "preparing",
        "starting"
      ].includes(
        quiz.phase
      );

    setStatus(
      elements.quizStatus,
      !running
        ? "Quiz zatrzymany"
        : paused
          ? "Quiz wstrzymany"
          : recovering
            ? "Automat przygotowuje rundę"
            : "Auto Quiz aktywny",
      !running
        ? "waiting"
        : paused
          ? "warning"
          : recovering
            ? "warning"
            : "online"
    );

    if (
      elements.automationBadge
    ) {
      elements.automationBadge.textContent =
        !running
          ? "ZATRZYMANY"
          : paused
            ? "PAUZA"
            : recovering
              ? "AUTO RECOVERY"
              : "AUTOMAT AKTYWNY";

      elements.automationBadge.className =
        `automation-badge ${
          !running
            ? "offline"
            : paused ||
              recovering
              ? "warning"
              : "online"
        }`;
    }

    elements.startQuizButton
      ?.classList
      .toggle(
        "hidden",
        running
      );

    elements.runningControls
      ?.classList
      .toggle(
        "hidden",
        !running
      );

    elements.pauseQuizButton
      ?.classList
      .toggle(
        "hidden",
        paused
      );

    elements.resumeQuizButton
      ?.classList
      .toggle(
        "hidden",
        !paused
      );

    setText(
      elements.roundNumber,
      `RUNDA ${integer(
        quiz.round
      )}`
    );

    setText(
      elements.stageName,
      getPhaseLabel(
        quiz
      )
    );

    const active =
      Boolean(
        running &&
        quiz.currentTrack &&
        quiz.question
      );

    elements.emptyRound
      ?.classList
      .toggle(
        "hidden",
        active
      );

    elements.activeRound
      ?.classList
      .toggle(
        "hidden",
        !active
      );

    if (!active) {
      setText(
        elements.roundHeading,
        running
          ? recovering
            ? "Automat przygotowuje bezpieczny powrót"
            : "Przygotowywanie nowej rundy"
          : "Quiz oczekuje"
      );

      renderRecentVotes(
        []
      );

      renderReveal(
        quiz
      );

      return;
    }

    setText(
      elements.roundHeading,
      getQuestionTypeLabel(
        quiz
      )
    );

    setText(
      elements.questionText,
      quiz.question?.question,
      getQuestionType(
        quiz
      ) === "title"
        ? "Jaki jest tytuł tego utworu?"
        : "Kto wykonuje ten utwór?"
    );

    const revealed =
      quiz.phase ===
      "round-reveal";

    const cover =
      stringValue(
        quiz.currentTrack?.cover ||
        quiz.reveal?.track?.cover
      );

    if (
      elements.roundCover &&
      cover &&
      elements.roundCover
        .getAttribute("src") !==
        cover
    ) {
      elements.roundCover.src =
        cover;
    }

    if (
      elements.remainingTime
    ) {
      elements.remainingTime.textContent =
        quiz.phase ===
          "question" &&
        quiz.remainingSeconds != null
          ? `${Math.max(
              0,
              integer(
                quiz.remainingSeconds
              )
            )} s`
          : quiz.countdown != null
            ? `${Math.max(
                0,
                integer(
                  quiz.countdown
                )
              )} s`
            : "-";
    }

    const correctCount =
      Math.max(
        0,
        integer(
          quiz.correctCount
        )
      );

    const requiredCorrect =
      Math.max(
        1,
        integer(
          quiz.requiredCorrect,
          10
        )
      );

    setText(
      elements.correctCounter,
      `${correctCount} / ${requiredCorrect}`
    );

    if (
      elements.progressValue
    ) {
      elements.progressValue
        .style
        .width =
        `${Math.min(
          100,
          correctCount /
          requiredCorrect *
          100
        )}%`;
    }

    renderAnswers(
      quiz.question
    );

    renderVoteBars(
      quiz
    );

    renderRecentVotes(
      quiz.recentVotes
    );

    renderPlayback(
      quiz.playback
    );

    renderReveal(
      quiz
    );

    const hint =
      object(
        quiz.hint
      );

    const hintMessage =
      typeof quiz.hint ===
        "string"
        ? quiz.hint
        : stringValue(
            hint.message
          );

    elements.hintBox
      ?.classList
      .toggle(
        "hidden",
        !hintMessage
      );

    setText(
      elements.hintText,
      hintMessage
    );

    if (
      elements.revealQuizButton
    ) {
      elements.revealQuizButton.disabled =
        quiz.phase !==
          "question" ||
        booleanValue(
          quiz.locked
        );
    }

    if (
      elements.nextQuizButton
    ) {
      elements.nextQuizButton.disabled =
        !running;
    }

    if (
      elements.pauseQuizButton
    ) {
      elements.pauseQuizButton.disabled =
        !running ||
        paused;
    }

    if (
      elements.resumeQuizButton
    ) {
      elements.resumeQuizButton.disabled =
        !running ||
        !paused;
    }

    elements.roundCover
      ?.classList
      .toggle(
        "blurred",
        !revealed
      );

    elements.coverQuestion
      ?.classList
      .toggle(
        "hidden",
        revealed
      );
  }

  function normalizeLiveFxState(
    state
  ) {
    const source =
      object(
        state?.showMoment ||
        state?.showMoments ||
        state?.liveFx ||
        state?.liveFX
      );

    let active =
      null;

    if (
      source.active &&
      typeof source.active ===
        "object"
    ) {
      active =
        source.active;
    } else if (
      source.current &&
      typeof source.current ===
        "object"
    ) {
      active =
        source.current;
    }

    return {
      available:
        source.available !==
        false,

      active,

      queue:
        array(
          source.queue
        ),

      lastAction:
        source.lastAction ||
        null
    };
  }

  function renderLiveFx(state) {
    liveFxState =
      normalizeLiveFxState(
        state
      );

    const active =
      liveFxState.active;

    const queueCount =
      liveFxState.queue.length;

    const available =
      liveFxState.available;

    setStatus(
      elements.liveFxStatus,
      !available
        ? "LIVE FX niedostępny"
        : active
          ? "LIVE FX aktywny"
          : queueCount > 0
            ? "LIVE FX w kolejce"
            : "LIVE FX gotowy",
      !available
        ? "offline"
        : active
          ? "online"
          : queueCount > 0
            ? "warning"
            : "waiting"
    );

    setStatus(
      elements.liveFxMiniStatus,
      !available
        ? "OFFLINE"
        : active
          ? "AKTYWNY"
          : queueCount > 0
            ? "QUEUE"
            : "GOTOWY",
      !available
        ? "offline"
        : active
          ? "online"
          : queueCount > 0
            ? "warning"
            : "online"
    );

    setText(
      elements.liveFxCurrentMoment,
      active
        ? active.title ||
          active.type ||
          active.preset ||
          "Aktywna animacja"
        : "Brak aktywnej animacji"
    );

    setText(
      elements.liveFxQueueInformation,
      `Kolejka: ${queueCount}`
    );

    const canControl =
      available &&
      !liveFxRequestInProgress;

    document
      .querySelectorAll(
        "[data-show-moment]"
      )
      .forEach(
        (button) => {
          button.disabled =
            !canControl;
        }
      );

    if (
      elements.stopShowMomentButton
    ) {
      elements.stopShowMomentButton.disabled =
        !active ||
        !canControl;
    }

    if (
      elements.clearShowMomentQueueButton
    ) {
      elements.clearShowMomentQueueButton.disabled =
        queueCount === 0 ||
        !canControl;
    }

    if (
      elements.stopAllShowMomentsButton
    ) {
      elements.stopAllShowMomentsButton.disabled =
        (
          !active &&
          queueCount === 0
        ) ||
        !canControl;
    }

    if (
      elements.showCustomMomentButton
    ) {
      elements.showCustomMomentButton.disabled =
        !canControl;
    }
  }

  function renderState(stateValue) {
    const state =
      object(
        stateValue
      );

    currentState =
      state;

    renderSpotify(
      state.spotify
    );

    renderPlayerRuntime(
      state.playerRuntime
    );

    renderStreamToEarn(
      state.streamToEarn
    );

    renderPlaylist(
      state
    );

    renderQuiz(
      state.quiz
    );

    renderLeaderboard(
      state.leaderboard
    );

    renderLiveFx(
      state
    );
  }

  async function loadPlaylists(
    force = false
  ) {
    if (
      playlistsLoaded &&
      !force
    ) {
      return;
    }

    const result =
      await request(
        ENDPOINTS.playlists
      );

    if (
      !elements.playlistSelect
    ) {
      return;
    }

    elements.playlistSelect
      .replaceChildren();

    const placeholder =
      document.createElement(
        "option"
      );

    placeholder.value =
      "";

    placeholder.textContent =
      "Wybierz playlistę Spotify";

    elements.playlistSelect
      .appendChild(
        placeholder
      );

    for (
      const playlistValue of
      array(
        result.playlists
      )
    ) {
      const playlist =
        object(
          playlistValue
        );

      const option =
        document.createElement(
          "option"
        );

      option.value =
        stringValue(
          playlist.id
        );

      option.textContent =
        playlist.totalTracks != null
          ? `${playlist.name} (${playlist.totalTracks})`
          : stringValue(
              playlist.name,
              "Playlista"
            );

      elements.playlistSelect
        .appendChild(
          option
        );
    }

    elements.playlistSelect.disabled =
      false;

    playlistsLoaded =
      true;
  }

  async function refreshPlayback() {
    try {
      const result =
        await request(
          ENDPOINTS.playback
        );

      const playback =
        object(
          result.playback
        );

      const runtime =
        object(
          result.runtime
        );

      if (
        runtime.registered &&
        runtime.ready &&
        !runtime.stale
      ) {
        setText(
          elements.deviceName,
          "POLSKA NOSTALGIA PLAYER"
        );

        setText(
          elements.deviceDetails,
          playback.device?.name
            ? `${playback.device.name} • ${
                playback.isPlaying
                  ? "odtwarza"
                  : "wstrzymane"
              }`
            : "Quiz Player online i gotowy"
        );

        return;
      }

      if (!playback.device) {
        setText(
          elements.deviceName,
          "Brak aktywnego urządzenia"
        );

        setText(
          elements.deviceDetails,
          "Otwórz stronę Playera i poczekaj na rejestrację urządzenia."
        );

        return;
      }

      setText(
        elements.deviceName,
        playback.device.name,
        "Urządzenie Spotify"
      );

      const restrictions =
        playback.device
          .isRestricted
          ? " • ograniczone"
          : "";

      setText(
        elements.deviceDetails,
        `${
          playback.device.type ||
          "Urządzenie"
        } • ${
          playback.isPlaying
            ? "odtwarza"
            : "wstrzymane"
        }${restrictions}`
      );
    } catch (error) {
      setText(
        elements.deviceName,
        "Nie udało się pobrać urządzenia"
      );

      setText(
        elements.deviceDetails,
        error.message
      );
    }
  }

  function getShowMomentOptions() {
    const duration =
      integer(
        elements.showMomentDuration
          ?.value
      );

    const priority =
      integer(
        elements.showMomentPriority
          ?.value
      );

    return {
      ...(duration > 0
        ? {
            duration,
            durationMs:
              duration
          }
        : {}),

      ...(priority > 0
        ? {
            priority
          }
        : {})
    };
  }

  function createEventId(type) {
    const random =
      Math.random()
        .toString(36)
        .slice(2, 9);

    return [
      type ||
      "moment",
      Date.now(),
      random
    ].join("-");
  }

  async function sendShowMoment(
    type,
    overrides = {},
    button = null
  ) {
    if (
      liveFxRequestInProgress
    ) {
      showToast(
        "Poczekaj na zakończenie poprzedniego polecenia LIVE FX.",
        "warning"
      );

      return null;
    }

    liveFxRequestInProgress =
      true;

    renderLiveFx(
      currentState ||
      {}
    );

    setButtonLoading(
      button,
      true,
      "Wysyłanie..."
    );

    hideError();

    const payload = {
      command:
        "show",

      type,

      preset:
        type,

      eventId:
        createEventId(
          type
        ),

      ...getShowMomentOptions(),

      ...overrides
    };

    if (
      payload.duration &&
      !payload.durationMs
    ) {
      payload.durationMs =
        payload.duration;
    }

    try {
      const result =
        await request(
          ENDPOINTS.showMoment,
          {
            method:
              "POST",

            body:
              JSON.stringify(
                payload
              )
          }
        );

      if (
        result.accepted ===
        false
      ) {
        showToast(
          result.duplicate
            ? "Ten LIVE FX został już wysłany."
            : "LIVE FX nie został przyjęty.",
          "warning"
        );

        return result;
      }

      showToast(
        overrides.title
          ? `LIVE FX: ${overrides.title}`
          : `LIVE FX „${type}” został wysłany na overlay.`
      );

      if (result.state) {
        renderState(
          result.state
        );
      }

      return result;
    } catch (error) {
      showError(
        error.message
      );

      showToast(
        error.message,
        "error"
      );

      throw error;
    } finally {
      liveFxRequestInProgress =
        false;

      setButtonLoading(
        button,
        false
      );

      renderLiveFx(
        currentState ||
        {}
      );
    }
  }

  async function stopShowMoment(
    clearQueue = false,
    button = null
  ) {
    if (
      liveFxRequestInProgress
    ) {
      return;
    }

    liveFxRequestInProgress =
      true;

    setButtonLoading(
      button,
      true,
      "Zatrzymywanie..."
    );

    try {
      const result =
        await request(
          ENDPOINTS.showMomentStop,
          {
            method:
              "POST",

            body:
              JSON.stringify({
                clearQueue
              })
          }
        );

      if (result.state) {
        renderState(
          result.state
        );
      }

      showToast(
        clearQueue
          ? "Zatrzymano wszystkie LIVE FX i wyczyszczono kolejkę."
          : "Aktywna animacja LIVE FX została zatrzymana.",
        "warning"
      );
    } catch (error) {
      showToast(
        error.message,
        "error"
      );
    } finally {
      liveFxRequestInProgress =
        false;

      setButtonLoading(
        button,
        false
      );

      renderLiveFx(
        currentState ||
        {}
      );
    }
  }

  async function clearShowMomentQueue(
    button = null
  ) {
    if (
      liveFxRequestInProgress
    ) {
      return;
    }

    liveFxRequestInProgress =
      true;

    setButtonLoading(
      button,
      true,
      "Czyszczenie..."
    );

    try {
      const result =
        await request(
          ENDPOINTS.showMomentClear,
          {
            method:
              "POST",

            body:
              JSON.stringify({})
          }
        );

      if (result.state) {
        renderState(
          result.state
        );
      }

      showToast(
        "Kolejka LIVE FX została wyczyszczona."
      );
    } catch (error) {
      showToast(
        error.message,
        "error"
      );
    } finally {
      liveFxRequestInProgress =
        false;

      setButtonLoading(
        button,
        false
      );

      renderLiveFx(
        currentState ||
        {}
      );
    }
  }

  function getCustomShowMomentPayload() {
    const title =
      stringValue(
        elements.customMomentTitle
          ?.value
      );

    if (!title) {
      throw new Error(
        "Wpisz główny nagłówek Custom LIVE FX."
      );
    }

    const duration =
      Math.max(
        1000,
        integer(
          elements.customMomentDuration
            ?.value,
          7000
        )
      );

    return {
      theme:
        stringValue(
          elements.customMomentTheme
            ?.value,
          "follow"
        ),

      icon:
        stringValue(
          elements.customMomentIcon
            ?.value,
          "✨"
        ),

      category:
        stringValue(
          elements.customMomentCategory
            ?.value,
          "SPECJALNY MOMENT"
        ),

      eyebrow:
        stringValue(
          elements.customMomentEyebrow
            ?.value,
          "POLSKA NOSTALGIA LIVE"
        ),

      title,

      description:
        stringValue(
          elements.customMomentDescription
            ?.value,
          "Zostań z nami."
        ),

      actionIcon:
        stringValue(
          elements.customMomentActionIcon
            ?.value,
          "↗"
        ),

      actionText:
        stringValue(
          elements.customMomentActionText
            ?.value,
          "POLSKA NOSTALGIA"
        ),

      secondaryIcon:
        stringValue(
          elements.customMomentSecondaryIcon
            ?.value,
          "❤️"
        ),

      secondaryText:
        stringValue(
          elements.customMomentSecondaryText
            ?.value,
          "QUIZ TRWA DALEJ"
        ),

      duration,

      durationMs:
        duration,

      priority:
        integer(
          elements.customMomentPriority
            ?.value,
          60
        )
    };
  }

  function resetCustomMomentForm() {
    if (
      elements.customMomentTheme
    ) {
      elements.customMomentTheme.value =
        "follow";
    }

    if (
      elements.customMomentIcon
    ) {
      elements.customMomentIcon.value =
        "✨";
    }

    if (
      elements.customMomentCategory
    ) {
      elements.customMomentCategory.value =
        "SPECJALNY MOMENT";
    }

    if (
      elements.customMomentEyebrow
    ) {
      elements.customMomentEyebrow.value =
        "POLSKA NOSTALGIA LIVE";
    }

    if (
      elements.customMomentTitle
    ) {
      elements.customMomentTitle.value =
        "";
    }

    if (
      elements.customMomentDescription
    ) {
      elements.customMomentDescription.value =
        "";
    }

    if (
      elements.customMomentActionIcon
    ) {
      elements.customMomentActionIcon.value =
        "↗";
    }

    if (
      elements.customMomentActionText
    ) {
      elements.customMomentActionText.value =
        "UDOSTĘPNIJ LIVE";
    }

    if (
      elements.customMomentSecondaryIcon
    ) {
      elements.customMomentSecondaryIcon.value =
        "❤️";
    }

    if (
      elements.customMomentSecondaryText
    ) {
      elements.customMomentSecondaryText.value =
        "DZIĘKUJEMY ZA WSPARCIE";
    }

    if (
      elements.customMomentDuration
    ) {
      elements.customMomentDuration.value =
        "7000";
    }

    if (
      elements.customMomentPriority
    ) {
      elements.customMomentPriority.value =
        "60";
    }

    showToast(
      "Formularz Custom LIVE FX został wyczyszczony."
    );
  }

  function parseEventData(event) {
    try {
      return JSON.parse(
        event.data
      );
    } catch {
      return null;
    }
  }

  function handleStateEvent(event) {
    const payload =
      parseEventData(
        event
      );

    if (!payload) {
      return;
    }

    lastServerMessageAt =
      Date.now();

    reconnectAttempt =
      0;

    renderState(
      payload
    );
  }

  function mergeShowMomentState(
    payload
  ) {
    if (
      !payload ||
      typeof payload !==
        "object"
    ) {
      return;
    }

    const nextState = {
      ...(currentState ||
        {}),

      showMoment: {
        ...object(
          currentState
            ?.showMoment
        ),

        ...payload
      }
    };

    currentState =
      nextState;

    renderLiveFx(
      nextState
    );
  }

  function handleShowMomentStateEvent(
    event
  ) {
    const payload =
      parseEventData(
        event
      );

    if (!payload) {
      return;
    }

    lastServerMessageAt =
      Date.now();

    mergeShowMomentState(
      payload
    );
  }

  function handleShowMomentEvent(
    event
  ) {
    const payload =
      parseEventData(
        event
      );

    if (!payload) {
      return;
    }

    lastServerMessageAt =
      Date.now();

    mergeShowMomentState({
      active:
        payload
    });
  }

  function handleShowMomentStopEvent(
    event
  ) {
    lastServerMessageAt =
      Date.now();

    const payload =
      parseEventData(
        event
      ) ||
      {};

    mergeShowMomentState({
      ...payload,
      active:
        null
    });
  }

  function getReconnectDelay() {
    const delay =
      CONNECTION
        .initialReconnectDelayMs *
      Math.pow(
        2,
        Math.max(
          0,
          reconnectAttempt
        )
      );

    return Math.min(
      CONNECTION
        .maximumReconnectDelayMs,
      delay +
      Math.floor(
        Math.random() *
        400
      )
    );
  }

  function scheduleReconnect() {
    if (destroyed) {
      return;
    }

    clearTimeout(
      reconnectTimer
    );

    const delay =
      getReconnectDelay();

    reconnectAttempt +=
      1;

    reconnectTimer =
      setTimeout(
        connectEvents,
        delay
      );
  }

  function closeEventSource() {
    if (!eventSource) {
      return;
    }

    try {
      eventSource.close();
    } catch {
      // Połączenie jest już zamknięte.
    }

    eventSource =
      null;
  }

  function connectEvents() {
    if (destroyed) {
      return;
    }

    clearTimeout(
      reconnectTimer
    );

    closeEventSource();

    eventSource =
      new EventSource(
        ENDPOINTS.events
      );

    eventSource.onopen =
      () => {
        reconnectAttempt =
          0;

        lastServerMessageAt =
          Date.now();

        void refreshState();
      };

    eventSource.onmessage =
      handleStateEvent;

    eventSource.addEventListener(
      "state",
      handleStateEvent
    );

    eventSource.addEventListener(
      "heartbeat",
      () => {
        lastServerMessageAt =
          Date.now();
      }
    );

    eventSource.addEventListener(
      "show-moment",
      handleShowMomentEvent
    );

    eventSource.addEventListener(
      "show-moment-update",
      handleShowMomentEvent
    );

    eventSource.addEventListener(
      "show-moment-state",
      handleShowMomentStateEvent
    );

    eventSource.addEventListener(
      "show-moment-stop",
      handleShowMomentStopEvent
    );

    eventSource.addEventListener(
      "show-moment-clear",
      handleShowMomentStopEvent
    );

    eventSource.addEventListener(
      "player-ready",
      () => {
        lastServerMessageAt =
          Date.now();

        void refreshState();
      }
    );

    eventSource.addEventListener(
      "player-offline",
      () => {
        lastServerMessageAt =
          Date.now();

        void refreshState();
      }
    );

    eventSource.addEventListener(
      "shutdown",
      () => {
        setStatus(
          elements.quizStatus,
          "Serwer jest zatrzymywany",
          "warning"
        );

        setStatus(
          elements.liveFxStatus,
          "LIVE FX: serwer wyłączany",
          "warning"
        );
      }
    );

    eventSource.onerror =
      () => {
        setStatus(
          elements.quizStatus,
          "Łączenie z serwerem...",
          "warning"
        );

        setStatus(
          elements.liveFxStatus,
          "LIVE FX: ponowne łączenie...",
          "warning"
        );

        closeEventSource();

        scheduleReconnect();
      };
  }

  async function refreshState() {
    try {
      const state =
        await request(
          ENDPOINTS.state
        );

      renderState(
        state
      );

      lastServerMessageAt =
        Date.now();

      return state;
    } catch {
      return null;
    }
  }

  function startConnectionWatchdog() {
    clearInterval(
      connectionWatchdogTimer
    );

    connectionWatchdogTimer =
      setInterval(
        () => {
          if (
            destroyed ||
            !lastServerMessageAt
          ) {
            return;
          }

          const staleFor =
            Date.now() -
            lastServerMessageAt;

          if (
            staleFor <
            CONNECTION
              .staleConnectionMs
          ) {
            return;
          }

          closeEventSource();

          void refreshState();

          scheduleReconnect();
        },
        5000
      );
  }

  function startStateRefresh() {
    clearInterval(
      stateRefreshTimer
    );

    stateRefreshTimer =
      setInterval(
        () => {
          if (
            destroyed ||
            document.hidden
          ) {
            return;
          }

          void refreshState();
        },
        CONNECTION
          .stateRefreshMs
      );
  }

  async function runQuizAction(
    endpoint,
    successMessage,
    button = null,
    loadingText = "Przetwarzanie..."
  ) {
    hideError();

    setButtonLoading(
      button,
      true,
      loadingText
    );

    try {
      const result =
        await request(
          endpoint,
          {
            method:
              "POST",

            body:
              JSON.stringify({})
          }
        );

      if (result.state) {
        renderState(
          result.state
        );
      }

      showToast(
        successMessage
      );

      return result;
    } catch (error) {
      showError(
        error.message
      );

      showToast(
        error.message,
        "error"
      );

      throw error;
    } finally {
      setButtonLoading(
        button,
        false
      );
    }
  }

  function attachEventHandlers() {
    bind(
      elements.playlistSelect,
      "change",
      () => {
        if (
          elements.loadPlaylistButton
        ) {
          elements.loadPlaylistButton.disabled =
            !elements
              .playlistSelect
              ?.value;
        }
      }
    );

    bind(
      elements.loadPlaylistButton,
      "click",
      async () => {
        const playlistId =
          elements.playlistSelect
            ?.value;

        if (!playlistId) {
          return;
        }

        hideError();

        setButtonLoading(
          elements.loadPlaylistButton,
          true,
          "Wczytywanie..."
        );

        try {
          const result =
            await request(
              ENDPOINTS.selectPlaylist,
              {
                method:
                  "POST",

                body:
                  JSON.stringify({
                    playlistId
                  })
              }
            );

          showToast(
            `Wczytano ${
              result.imported
                ?.tracks ||
              0
            } utworów.`
          );

          if (result.state) {
            renderState(
              result.state
            );
          } else {
            await refreshState();
          }
        } catch (error) {
          showError(
            error.message
          );

          showToast(
            error.message,
            "error"
          );
        } finally {
          setButtonLoading(
            elements.loadPlaylistButton,
            false
          );
        }
      }
    );

    bind(
      elements.startQuizButton,
      "click",
      async () => {
        try {
          await runQuizAction(
            ENDPOINTS.quizStart,
            "AUTO QUIZ v8 został uruchomiony.",
            elements.startQuizButton,
            "Uruchamianie..."
          );
        } catch {
          // Komunikat został już pokazany.
        }
      }
    );

    bind(
      elements.pauseQuizButton,
      "click",
      async () => {
        try {
          await runQuizAction(
            ENDPOINTS.quizPause,
            "Quiz został wstrzymany.",
            elements.pauseQuizButton,
            "Wstrzymywanie..."
          );
        } catch {
          // Komunikat został już pokazany.
        }
      }
    );

    bind(
      elements.resumeQuizButton,
      "click",
      async () => {
        try {
          await runQuizAction(
            ENDPOINTS.quizResume,
            "Quiz został wznowiony.",
            elements.resumeQuizButton,
            "Wznawianie..."
          );
        } catch {
          // Komunikat został już pokazany.
        }
      }
    );

    bind(
      elements.nextQuizButton,
      "click",
      async () => {
        try {
          await runQuizAction(
            ENDPOINTS.quizNext,
            "Przechodzimy do nowego utworu i nowej rundy.",
            elements.nextQuizButton,
            "Pomijanie..."
          );
        } catch {
          // Komunikat został już pokazany.
        }
      }
    );

    bind(
      elements.revealQuizButton,
      "click",
      async () => {
        try {
          await runQuizAction(
            ENDPOINTS.quizReveal,
            "Odpowiedź została pokazana.",
            elements.revealQuizButton,
            "Ujawnianie..."
          );
        } catch {
          // Komunikat został już pokazany.
        }
      }
    );

    bind(
      elements.stopQuizButton,
      "click",
      async () => {
        try {
          await runQuizAction(
            ENDPOINTS.quizStop,
            "AUTO QUIZ został zatrzymany.",
            elements.stopQuizButton,
            "Zatrzymywanie..."
          );
        } catch {
          // Komunikat został już pokazany.
        }
      }
    );

    bind(
      elements.sendTestCommentButton,
      "click",
      async () => {
        const username =
          stringValue(
            elements.testUsername
              ?.value
          );

        const comment =
          stringValue(
            elements.testComment
              ?.value
          );

        if (
          !username ||
          !comment
        ) {
          showToast(
            "Podaj nazwę użytkownika i komentarz.",
            "error"
          );

          return;
        }

        setButtonLoading(
          elements.sendTestCommentButton,
          true,
          "Wysyłanie..."
        );

        try {
          const result =
            await request(
              ENDPOINTS.quizTestComment,
              {
                method:
                  "POST",

                body:
                  JSON.stringify({
                    username,
                    comment
                  })
              }
            );

          if (
            result.state
          ) {
            renderState(
              result.state
            );
          }

          if (
            !result.result
              ?.accepted
          ) {
            const reasons = {
              already_voted:
                "Ten użytkownik już zagłosował.",

              invalid_answer:
                "Komentarz nie zawiera odpowiedzi A, B, C lub D.",

              quiz_inactive:
                "Quiz nie przyjmuje teraz odpowiedzi.",

              time_expired:
                "Czas na odpowiedź minął."
            };

            showToast(
              reasons[
                result.result
                  ?.reason
              ] ||
              "Głos został odrzucony.",
              "error"
            );

            return;
          }

          if (
            elements.testComment
          ) {
            elements.testComment.value =
              "";
          }

          showToast(
            result.result.vote
              ?.isCorrect
              ? `Poprawna odpowiedź! +${
                  result.result
                    .earnedPoints ||
                  0
                } pkt`
              : "Głos przyjęty, odpowiedź błędna.",
            result.result.vote
              ?.isCorrect
              ? "success"
              : "warning"
          );
        } catch (error) {
          showToast(
            error.message,
            "error"
          );
        } finally {
          setButtonLoading(
            elements.sendTestCommentButton,
            false
          );
        }
      }
    );

    bind(
      elements.testComment,
      "keydown",
      (event) => {
        if (
          event.key ===
          "Enter"
        ) {
          elements
            .sendTestCommentButton
            ?.click();
        }
      }
    );

    bind(
      elements.refreshPlaybackButton,
      "click",
      async () => {
        setButtonLoading(
          elements.refreshPlaybackButton,
          true,
          "Sprawdzanie..."
        );

        await refreshPlayback();

        setButtonLoading(
          elements.refreshPlaybackButton,
          false
        );
      }
    );

    bind(
      elements.resetStreamStatusButton,
      "click",
      async () => {
        try {
          const result =
            await request(
              ENDPOINTS.streamReset,
              {
                method:
                  "POST",

                body:
                  JSON.stringify({})
              }
            );

          if (
            result.state
          ) {
            renderState(
              result.state
            );
          }

          showToast(
            "Statystyki StreamToEarn zostały wyczyszczone."
          );
        } catch (error) {
          showToast(
            error.message,
            "error"
          );
        }
      }
    );

    bind(
      elements.disconnectButton,
      "click",
      async () => {
        setButtonLoading(
          elements.disconnectButton,
          true,
          "Rozłączanie..."
        );

        try {
          await request(
            ENDPOINTS.disconnectSpotify,
            {
              method:
                "POST",

              body:
                JSON.stringify({})
            }
          );

          window.location.href =
            "/";
        } catch (error) {
          showToast(
            error.message,
            "error"
          );

          setButtonLoading(
            elements.disconnectButton,
            false
          );
        }
      }
    );

    document
      .querySelectorAll(
        "[data-show-moment]"
      )
      .forEach(
        (button) => {
          bind(
            button,
            "click",
            async () => {
              const type =
                stringValue(
                  button.dataset
                    .showMoment
                );

              if (!type) {
                return;
              }

              const overrides =
                {};

              if (
                type ===
                "record"
              ) {
                overrides.recordValue =
                  Math.max(
                    0,
                    integer(
                      elements
                        .showMomentRecordValue
                        ?.value
                    )
                  );

                overrides.recordUnit =
                  stringValue(
                    elements
                      .showMomentRecordUnit
                      ?.value,
                    "GRACZY"
                  );
              }

              try {
                await sendShowMoment(
                  type,
                  overrides,
                  button
                );
              } catch {
                // Komunikat został już pokazany.
              }
            }
          );
        }
      );

    bind(
      elements.showCustomMomentButton,
      "click",
      async () => {
        try {
          const payload =
            getCustomShowMomentPayload();

          await sendShowMoment(
            "custom",
            payload,
            elements.showCustomMomentButton
          );
        } catch (error) {
          showToast(
            error.message,
            "error"
          );
        }
      }
    );

    bind(
      elements.resetCustomMomentButton,
      "click",
      resetCustomMomentForm
    );

    bind(
      elements.stopShowMomentButton,
      "click",
      async () => {
        await stopShowMoment(
          false,
          elements.stopShowMomentButton
        );
      }
    );

    bind(
      elements.clearShowMomentQueueButton,
      "click",
      async () => {
        await clearShowMomentQueue(
          elements.clearShowMomentQueueButton
        );
      }
    );

    bind(
      elements.stopAllShowMomentsButton,
      "click",
      async () => {
        await stopShowMoment(
          true,
          elements.stopAllShowMomentsButton
        );
      }
    );
  }

  async function initialize() {
    hideError();

    attachEventHandlers();

    const state =
      await request(
        ENDPOINTS.state
      );

    renderState(
      state
    );

    lastServerMessageAt =
      Date.now();

    if (
      state.spotify
        ?.connected
    ) {
      try {
        await loadPlaylists();
      } catch (error) {
        showToast(
          `Nie udało się pobrać playlist: ${error.message}`,
          "error"
        );
      }

      await refreshPlayback();
    }

    connectEvents();
    startConnectionWatchdog();
    startStateRefresh();

    console.info(
      `[CONTROL CENTER] Polska Nostalgia LIVE v${VERSION} uruchomiony.`
    );
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        destroyed ||
        document.hidden
      ) {
        return;
      }

      void refreshState();

      if (
        !eventSource ||
        eventSource.readyState ===
          EventSource.CLOSED
      ) {
        connectEvents();
      }
    }
  );

  window.addEventListener(
    "online",
    () => {
      if (destroyed) {
        return;
      }

      void refreshState();

      connectEvents();
    }
  );

  window.addEventListener(
    "offline",
    () => {
      setStatus(
        elements.quizStatus,
        "Brak połączenia z siecią",
        "warning"
      );

      setStatus(
        elements.liveFxStatus,
        "LIVE FX: brak połączenia",
        "warning"
      );
    }
  );

  window.addEventListener(
    "beforeunload",
    () => {
      destroyed =
        true;

      clearTimeout(
        reconnectTimer
      );

      clearInterval(
        connectionWatchdogTimer
      );

      clearInterval(
        stateRefreshTimer
      );

      clearTimeout(
        toastTimer
      );

      closeEventSource();
    },
    {
      once: true
    }
  );

  initialize()
    .catch(
      (error) => {
        showError(
          error.message
        );

        showToast(
          error.message,
          "error"
        );

        setStatus(
          elements.quizStatus,
          "Błąd połączenia",
          "offline"
        );

        scheduleReconnect();
      }
    );
})();