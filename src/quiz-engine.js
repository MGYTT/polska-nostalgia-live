"use strict";

/*
 * POLSKA NOSTALGIA LIVE
 * QuizEngine v8.0
 *
 * FINAL SINGLE-QUESTION ROUND MODEL
 *
 * Główna zasada:
 *
 * 1 utwór
 *   ->
 * 1 losowy typ pytania
 *   ->
 * wykonawca LUB tytuł
 *   ->
 * 1 głosowanie
 *   ->
 * reveal pełnej odpowiedzi
 *   ->
 * nowy utwór
 *
 * Silnik odpowiada za:
 *
 * - walidację biblioteki,
 * - normalizację utworów,
 * - bezpieczną kolejkę,
 * - unikanie natychmiastowych powtórek,
 * - losowanie typu pytania,
 * - balans ARTIST / TITLE,
 * - tworzenie odpowiedzi A/B/C/D,
 * - unikanie duplikatów odpowiedzi,
 * - generowanie sensownych błędnych odpowiedzi,
 * - statystyki sesji,
 * - obsługę utworów podanych bezpośrednio przez SpotifyEngine,
 * - zgodność z auto-recovery LiveControllera.
 */

class QuizEngine {
  constructor(options = {}) {
    this.settings = {
      minimumTracks: this.normalizeInteger(
        options.minimumTracks,
        4,
        4,
        100
      ),

      minimumArtists: this.normalizeInteger(
        options.minimumArtists,
        4,
        4,
        100
      ),

      optionCount: 4,

      recentTrackLimit: this.normalizeInteger(
        options.recentTrackLimit,
        8,
        1,
        100
      ),

      recentQuestionTypeLimit: this.normalizeInteger(
        options.recentQuestionTypeLimit,
        3,
        1,
        20
      ),

      maximumSameQuestionTypeStreak: this.normalizeInteger(
        options.maximumSameQuestionTypeStreak,
        2,
        1,
        10
      ),

      artistQuestionWeight: this.normalizeNumber(
        options.artistQuestionWeight,
        1,
        0.1,
        100
      ),

      titleQuestionWeight: this.normalizeNumber(
        options.titleQuestionWeight,
        1,
        0.1,
        100
      ),

      preferSameArtistTitleDistractors:
        options.preferSameArtistTitleDistractors !== false
    };

    this.tracks = [];
    this.queue = [];

    this.currentTrack = null;
    this.currentQuestion = null;
    this.currentRound = null;

    this.recentTrackIds = [];
    this.recentQuestionTypes = [];

    this.questionTypeCounts = {
      artist: 0,
      title: 0
    };

    this.roundCounter = 0;

    this.libraryRevision = 0;

    this.lastLoadStats = null;
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

  normalizeNumber(
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
        parsed
      )
    );
  }

  normalizeText(
    value,
    maximumLength = 500
  ) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, maximumLength);
  }

  normalizeComparableText(value) {
    return this.normalizeText(
      value,
      500
    )
      .toLocaleLowerCase("pl-PL")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
  }

  clone(value) {
    if (
      typeof structuredClone ===
      "function"
    ) {
      return structuredClone(
        value
      );
    }

    return JSON.parse(
      JSON.stringify(value)
    );
  }

  shuffle(items) {
    const result =
      Array.isArray(items)
        ? [...items]
        : [];

    for (
      let index =
        result.length - 1;
      index > 0;
      index -= 1
    ) {
      const randomIndex =
        Math.floor(
          Math.random() *
          (index + 1)
        );

      [
        result[index],
        result[randomIndex]
      ] = [
        result[randomIndex],
        result[index]
      ];
    }

    return result;
  }

  unique(values) {
    const output = [];
    const used = new Set();

    for (
      const rawValue of
      Array.isArray(values)
        ? values
        : []
    ) {
      const value =
        this.normalizeText(
          rawValue,
          500
        );

      if (!value) {
        continue;
      }

      const key =
        this.normalizeComparableText(
          value
        );

      if (
        !key ||
        used.has(key)
      ) {
        continue;
      }

      used.add(key);

      output.push(value);
    }

    return output;
  }

  normalizeTrack(track) {
    if (
      !track ||
      typeof track !== "object"
    ) {
      return null;
    }

    const id =
      this.normalizeText(
        track.id,
        250
      );

    const uri =
      this.normalizeText(
        track.uri,
        500
      );

    const title =
      this.normalizeText(
        track.title ||
        track.name,
        300
      );

    const primaryArtist =
      this.normalizeText(
        track.primaryArtist ||
        track.artist ||
        track.artists?.[0]?.name,
        300
      );

    if (
      !id ||
      !uri ||
      !title ||
      !primaryArtist
    ) {
      return null;
    }

    const artists =
      Array.isArray(track.artists)
        ? track.artists
            .map((artist) => {
              if (
                typeof artist ===
                "string"
              ) {
                return this.normalizeText(
                  artist,
                  300
                );
              }

              return this.normalizeText(
                artist?.name,
                300
              );
            })
            .filter(Boolean)
        : [primaryArtist];

    const uniqueArtists =
      this.unique([
        primaryArtist,
        ...artists
      ]);

    return {
      ...track,

      id,
      uri,
      title,
      primaryArtist,

      artist:
        this.normalizeText(
          track.artist,
          300
        ) ||
        uniqueArtists.join(", "),

      artists:
        uniqueArtists,

      album:
        this.normalizeText(
          track.album,
          300
        ) ||
        null,

      year:
        this.normalizeTrackYear(
          track.year ||
          track.releaseYear ||
          track.releaseDate
        ),

      cover:
        this.normalizeText(
          track.cover ||
          track.coverUrl ||
          track.image ||
          track.imageUrl,
          2000
        ) ||
        null,

      durationMs:
        Math.max(
          0,
          this.normalizeInteger(
            track.durationMs,
            0,
            0,
            24 * 60 * 60 * 1000
          )
        )
    };
  }

  normalizeTrackYear(value) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return null;
    }

    const stringValue =
      String(value);

    const match =
      stringValue.match(
        /\b(19|20)\d{2}\b/
      );

    if (!match) {
      return null;
    }

    const year =
      Number(match[0]);

    if (
      !Number.isFinite(year)
    ) {
      return null;
    }

    return year;
  }

  loadTracks(tracks) {
    if (
      !Array.isArray(tracks)
    ) {
      throw new Error(
        "Nieprawidłowa lista utworów."
      );
    }

    const normalizedTracks =
      tracks
        .map((track) => {
          return this.normalizeTrack(
            track
          );
        })
        .filter(Boolean);

    const uniqueTracks = [];
    const usedIds = new Set();
    const usedUris = new Set();

    for (
      const track of
      normalizedTracks
    ) {
      if (
        usedIds.has(track.id) ||
        usedUris.has(track.uri)
      ) {
        continue;
      }

      usedIds.add(
        track.id
      );

      usedUris.add(
        track.uri
      );

      uniqueTracks.push(
        track
      );
    }

    if (
      uniqueTracks.length <
      this.settings.minimumTracks
    ) {
      throw new Error(
        `Playlista musi zawierać co najmniej ${this.settings.minimumTracks} poprawne utwory.`
      );
    }

    const artists =
      this.unique(
        uniqueTracks.map(
          (track) =>
            track.primaryArtist
        )
      );

    if (
      artists.length <
      this.settings.minimumArtists
    ) {
      throw new Error(
        `Playlista musi zawierać co najmniej ${this.settings.minimumArtists} różnych wykonawców.`
      );
    }

    const titles =
      this.unique(
        uniqueTracks.map(
          (track) =>
            track.title
        )
      );

    if (
      titles.length <
      this.settings.optionCount
    ) {
      throw new Error(
        "Playlista nie zawiera wystarczającej liczby różnych tytułów do utworzenia quizu."
      );
    }

    this.tracks =
      uniqueTracks;

    this.libraryRevision += 1;

    this.resetSessionState();

    this.lastLoadStats = {
      tracks:
        uniqueTracks.length,

      artists:
        artists.length,

      titles:
        titles.length,

      rejected:
        Math.max(
          0,
          tracks.length -
          normalizedTracks.length
        ),

      duplicates:
        Math.max(
          0,
          normalizedTracks.length -
          uniqueTracks.length
        ),

      libraryRevision:
        this.libraryRevision
    };

    return {
      ...this.lastLoadStats
    };
  }

  resetSessionState() {
    this.queue = [];

    this.currentTrack = null;
    this.currentQuestion = null;
    this.currentRound = null;

    this.recentTrackIds = [];
    this.recentQuestionTypes = [];

    this.questionTypeCounts = {
      artist: 0,
      title: 0
    };

    this.roundCounter = 0;

    this.refillQueue();
  }

  resetQueue() {
    this.queue = [];

    this.currentTrack = null;
    this.currentQuestion = null;
    this.currentRound = null;

    this.refillQueue();
  }

  refillQueue() {
    if (
      this.tracks.length === 0
    ) {
      this.queue = [];
      return;
    }

    let candidates =
      this.shuffle(
        this.tracks
      );

    if (
      this.currentTrack &&
      candidates.length > 1 &&
      candidates[0]?.id ===
      this.currentTrack.id
    ) {
      const replacementIndex =
        candidates.findIndex(
          (track) => {
            return (
              track.id !==
              this.currentTrack.id
            );
          }
        );

      if (
        replacementIndex > 0
      ) {
        [
          candidates[0],
          candidates[replacementIndex]
        ] = [
          candidates[replacementIndex],
          candidates[0]
        ];
      }
    }

    this.queue =
      candidates;
  }

  rememberTrack(track) {
    if (
      !track?.id
    ) {
      return;
    }

    this.recentTrackIds =
      this.recentTrackIds.filter(
        (id) =>
          id !== track.id
      );

    this.recentTrackIds.push(
      track.id
    );

    while (
      this.recentTrackIds.length >
      this.settings.recentTrackLimit
    ) {
      this.recentTrackIds.shift();
    }
  }

  isRecentlyUsedTrack(track) {
    return Boolean(
      track?.id &&
      this.recentTrackIds.includes(
        track.id
      )
    );
  }

  takeNextTrack() {
    if (
      this.tracks.length === 0
    ) {
      throw new Error(
        "Najpierw wczytaj playlistę Spotify."
      );
    }

    if (
      this.queue.length === 0
    ) {
      this.refillQueue();
    }

    if (
      this.queue.length === 0
    ) {
      throw new Error(
        "Brak utworów dostępnych do quizu."
      );
    }

    let selectedIndex =
      this.queue.findIndex(
        (track) => {
          return (
            !this.isRecentlyUsedTrack(
              track
            ) &&
            (
              !this.currentTrack ||
              track.id !==
              this.currentTrack.id
            )
          );
        }
      );

    /*
     * Przy małej bibliotece może nie być
     * możliwe zachowanie całego recentTrackLimit.
     * Wtedy nadal bezwzględnie unikamy
     * powtórzenia bezpośrednio po sobie.
     */
    if (
      selectedIndex === -1
    ) {
      selectedIndex =
        this.queue.findIndex(
          (track) => {
            return (
              !this.currentTrack ||
              track.id !==
              this.currentTrack.id
            );
          }
        );
    }

    if (
      selectedIndex === -1
    ) {
      selectedIndex = 0;
    }

    const [
      track
    ] =
      this.queue.splice(
        selectedIndex,
        1
      );

    if (!track) {
      throw new Error(
        "Nie udało się pobrać kolejnego utworu."
      );
    }

    this.currentTrack =
      track;

    this.rememberTrack(
      track
    );

    return this.clone(
      track
    );
  }

  normalizeQuestionType(type) {
    const normalized =
      this.normalizeText(
        type,
        30
      ).toLowerCase();

    if (
      normalized === "artist"
    ) {
      return "artist";
    }

    if (
      normalized === "title"
    ) {
      return "title";
    }

    return null;
  }

  getQuestionTypeStreak() {
    if (
      this.recentQuestionTypes
        .length === 0
    ) {
      return {
        type: null,
        length: 0
      };
    }

    const lastType =
      this.recentQuestionTypes[
        this.recentQuestionTypes.length -
        1
      ];

    let length = 0;

    for (
      let index =
        this.recentQuestionTypes.length -
        1;
      index >= 0;
      index -= 1
    ) {
      if (
        this.recentQuestionTypes[index] !==
        lastType
      ) {
        break;
      }

      length += 1;
    }

    return {
      type: lastType,
      length
    };
  }

  rememberQuestionType(type) {
    const normalized =
      this.normalizeQuestionType(
        type
      );

    if (!normalized) {
      return;
    }

    this.recentQuestionTypes.push(
      normalized
    );

    while (
      this.recentQuestionTypes.length >
      this.settings.recentQuestionTypeLimit
    ) {
      this.recentQuestionTypes.shift();
    }

    this.questionTypeCounts[
      normalized
    ] =
      Number(
        this.questionTypeCounts[
          normalized
        ] || 0
      ) + 1;
  }

  canCreateArtistQuestion(track) {
    if (!track) {
      return false;
    }

    const wrongArtists =
      this.getArtistDistractors(
        track
      );

    return (
      wrongArtists.length >=
      this.settings.optionCount -
      1
    );
  }

  canCreateTitleQuestion(track) {
    if (!track) {
      return false;
    }

    const wrongTitles =
      this.getTitleDistractors(
        track
      );

    return (
      wrongTitles.length >=
      this.settings.optionCount -
      1
    );
  }

  chooseQuestionType(
    track,
    preferredType = null
  ) {
    const preferred =
      this.normalizeQuestionType(
        preferredType
      );

    const artistAvailable =
      this.canCreateArtistQuestion(
        track
      );

    const titleAvailable =
      this.canCreateTitleQuestion(
        track
      );

    if (
      !artistAvailable &&
      !titleAvailable
    ) {
      throw new Error(
        "Dla tego utworu nie można utworzyć poprawnego pytania A/B/C/D."
      );
    }

    if (
      preferred === "artist" &&
      artistAvailable
    ) {
      return "artist";
    }

    if (
      preferred === "title" &&
      titleAvailable
    ) {
      return "title";
    }

    if (
      artistAvailable &&
      !titleAvailable
    ) {
      return "artist";
    }

    if (
      titleAvailable &&
      !artistAvailable
    ) {
      return "title";
    }

    const streak =
      this.getQuestionTypeStreak();

    if (
      streak.length >=
      this.settings.maximumSameQuestionTypeStreak
    ) {
      return streak.type === "artist"
        ? "title"
        : "artist";
    }

    /*
     * Balansujemy liczbę pytań.
     *
     * Gdy jednego rodzaju było mniej,
     * lekko preferujemy właśnie ten typ.
     */
    const artistCount =
      Number(
        this.questionTypeCounts.artist ||
        0
      );

    const titleCount =
      Number(
        this.questionTypeCounts.title ||
        0
      );

    let artistWeight =
      this.settings.artistQuestionWeight;

    let titleWeight =
      this.settings.titleQuestionWeight;

    if (
      artistCount < titleCount
    ) {
      artistWeight *= 1.35;
    }

    if (
      titleCount < artistCount
    ) {
      titleWeight *= 1.35;
    }

    /*
     * Dodatkowo delikatnie preferujemy
     * zmianę rodzaju pytania po poprzedniej
     * rundzie.
     */
    if (
      streak.type === "artist"
    ) {
      titleWeight *= 1.2;
    }

    if (
      streak.type === "title"
    ) {
      artistWeight *= 1.2;
    }

    const totalWeight =
      artistWeight +
      titleWeight;

    const roll =
      Math.random() *
      totalWeight;

    return roll <
      artistWeight
      ? "artist"
      : "title";
  }

  getArtistDistractors(track) {
    const correctKey =
      this.normalizeComparableText(
        track.primaryArtist
      );

    return this.unique(
      this.tracks
        .filter((candidate) => {
          if (
            !candidate ||
            candidate.id === track.id
          ) {
            return false;
          }

          const candidateKey =
            this.normalizeComparableText(
              candidate.primaryArtist
            );

          return (
            candidateKey &&
            candidateKey !==
            correctKey
          );
        })
        .map(
          (candidate) =>
            candidate.primaryArtist
        )
    );
  }

  getTitleDistractors(track) {
    const correctTitleKey =
      this.normalizeComparableText(
        track.title
      );

    const artistKey =
      this.normalizeComparableText(
        track.primaryArtist
      );

    const sameArtist =
      [];

    const otherArtists =
      [];

    for (
      const candidate of
      this.tracks
    ) {
      if (
        !candidate ||
        candidate.id === track.id
      ) {
        continue;
      }

      const candidateTitle =
        this.normalizeText(
          candidate.title,
          300
        );

      const candidateTitleKey =
        this.normalizeComparableText(
          candidateTitle
        );

      if (
        !candidateTitleKey ||
        candidateTitleKey ===
        correctTitleKey
      ) {
        continue;
      }

      const candidateArtistKey =
        this.normalizeComparableText(
          candidate.primaryArtist
        );

      if (
        candidateArtistKey ===
        artistKey
      ) {
        sameArtist.push(
          candidateTitle
        );
      } else {
        otherArtists.push(
          candidateTitle
        );
      }
    }

    const uniqueSameArtist =
      this.unique(
        sameArtist
      );

    const uniqueOtherArtists =
      this.unique(
        otherArtists
      );

    if (
      !this.settings
        .preferSameArtistTitleDistractors
    ) {
      return this.shuffle(
        this.unique([
          ...uniqueSameArtist,
          ...uniqueOtherArtists
        ])
      );
    }

    /*
     * Przy pytaniu o tytuł próbujemy
     * najpierw używać innych utworów
     * tego samego wykonawcy.
     *
     * Dzięki temu odpowiedzi są mniej
     * przypadkowe, jeżeli biblioteka
     * pozwala na taki wybór.
     */
    const preferred =
      this.shuffle(
        uniqueSameArtist
      );

    const fallback =
      this.shuffle(
        uniqueOtherArtists
      );

    return this.unique([
      ...preferred,
      ...fallback
    ]);
  }

  buildQuestion({
    type,
    question,
    correctAnswer,
    wrongAnswers,
    track = null
  }) {
    const normalizedType =
      this.normalizeQuestionType(
        type
      );

    if (!normalizedType) {
      throw new Error(
        "Nieprawidłowy typ pytania."
      );
    }

    const normalizedQuestion =
      this.normalizeText(
        question,
        300
      );

    const normalizedCorrect =
      this.normalizeText(
        correctAnswer,
        300
      );

    if (!normalizedQuestion) {
      throw new Error(
        "Pytanie nie może być puste."
      );
    }

    if (!normalizedCorrect) {
      throw new Error(
        "Poprawna odpowiedź nie może być pusta."
      );
    }

    const correctKey =
      this.normalizeComparableText(
        normalizedCorrect
      );

    const candidates =
      this.shuffle(
        this.unique(
          wrongAnswers
        ).filter(
          (answer) => {
            return (
              this.normalizeComparableText(
                answer
              ) !== correctKey
            );
          }
        )
      )
        .slice(
          0,
          this.settings.optionCount -
          1
        );

    if (
      candidates.length <
      this.settings.optionCount -
      1
    ) {
      throw new Error(
        "Nie udało się wygenerować trzech unikalnych błędnych odpowiedzi."
      );
    }

    const optionTexts =
      this.shuffle([
        normalizedCorrect,
        ...candidates
      ]);

    const letters =
      [
        "A",
        "B",
        "C",
        "D"
      ];

    const options =
      optionTexts.map(
        (
          optionText,
          index
        ) => {
          return {
            letter:
              letters[index],

            text:
              optionText
          };
        }
      );

    const correctOption =
      options.find(
        (option) => {
          return (
            this.normalizeComparableText(
              option.text
            ) ===
            correctKey
          );
        }
      );

    if (!correctOption) {
      throw new Error(
        "Nie udało się oznaczyć poprawnej odpowiedzi."
      );
    }

    const result = {
      type:
        normalizedType,

      question:
        normalizedQuestion,

      options,

      correctLetter:
        correctOption.letter,

      correctAnswer:
        normalizedCorrect,

      trackId:
        track?.id ||
        this.currentTrack?.id ||
        null,

      createdAt:
        new Date().toISOString()
    };

    this.currentQuestion =
      result;

    return this.clone(
      result
    );
  }

  createArtistQuestion(track) {
    const normalizedTrack =
      this.normalizeTrack(
        track
      );

    if (!normalizedTrack) {
      throw new Error(
        "Nie można utworzyć pytania o wykonawcę bez poprawnego utworu."
      );
    }

    const wrongArtists =
      this.getArtistDistractors(
        normalizedTrack
      );

    return this.buildQuestion({
      type:
        "artist",

      question:
        "Kto wykonuje ten utwór?",

      correctAnswer:
        normalizedTrack.primaryArtist,

      wrongAnswers:
        wrongArtists,

      track:
        normalizedTrack
    });
  }

  createTitleQuestion(track) {
    const normalizedTrack =
      this.normalizeTrack(
        track
      );

    if (!normalizedTrack) {
      throw new Error(
        "Nie można utworzyć pytania o tytuł bez poprawnego utworu."
      );
    }

    const wrongTitles =
      this.getTitleDistractors(
        normalizedTrack
      );

    return this.buildQuestion({
      type:
        "title",

      question:
        "Jaki jest tytuł tego utworu?",

      correctAnswer:
        normalizedTrack.title,

      wrongAnswers:
        wrongTitles,

      track:
        normalizedTrack
    });
  }

  createQuestionForTrack(
    track,
    options = {}
  ) {
    if (!track) {
      throw new Error(
        "Brak utworu dla pytania."
      );
    }

    const type =
      this.chooseQuestionType(
        track,
        options.type ||
        options.preferredType ||
        null
      );

    let question;

    if (
      type === "artist"
    ) {
      question =
        this.createArtistQuestion(
          track
        );
    } else {
      question =
        this.createTitleQuestion(
          track
        );
    }

    this.rememberQuestionType(
      type
    );

    return question;
  }

  createRound(options = {}) {
    const maximumAttempts =
      Math.max(
        1,
        Math.min(
          this.tracks.length,
          25
        )
      );

    let lastError =
      null;

    for (
      let attempt = 1;
      attempt <= maximumAttempts;
      attempt += 1
    ) {
      let track;

      try {
        track =
          this.takeNextTrack();

        const question =
          this.createQuestionForTrack(
            track,
            {
              preferredType:
                options.type ||
                options.preferredType ||
                null
            }
          );

        this.roundCounter += 1;

        const round = {
          roundId:
            [
              "round",
              this.roundCounter,
              track.id,
              Date.now()
            ].join("-"),

          number:
            this.roundCounter,

          track,

          question,

          questionType:
            question.type,

          createdAt:
            new Date().toISOString()
        };

        this.currentRound =
          round;

        return this.clone(
          round
        );
      } catch (error) {
        lastError =
          error;

        /*
         * Jeżeli konkretny utwór nie pozwala
         * zbudować pytania danego typu,
         * nie zatrzymujemy całego quizu.
         *
         * Przechodzimy do następnego utworu.
         */
        continue;
      }
    }

    throw (
      lastError ||
      new Error(
        "Nie udało się utworzyć poprawnej rundy quizu."
      )
    );
  }

  createRoundFromTrack(
    track,
    options = {}
  ) {
    const normalizedTrack =
      this.normalizeTrack(
        track
      );

    if (!normalizedTrack) {
      throw new Error(
        "SpotifyEngine przekazał nieprawidłowy utwór."
      );
    }

    /*
     * Utwór może pochodzić z automatycznego
     * fallbacku SpotifyEngine.
     *
     * Jeżeli nie istnieje jeszcze w lokalnej
     * bibliotece, możemy wykorzystać go jako
     * aktualny utwór, ale błędne odpowiedzi
     * nadal generujemy z załadowanej biblioteki.
     */
    this.currentTrack =
      normalizedTrack;

    const question =
      this.createQuestionForTrack(
        normalizedTrack,
        options
      );

    this.rememberTrack(
      normalizedTrack
    );

    this.roundCounter += 1;

    const round = {
      roundId:
        [
          "round",
          this.roundCounter,
          normalizedTrack.id,
          Date.now()
        ].join("-"),

      number:
        this.roundCounter,

      track:
        normalizedTrack,

      question,

      questionType:
        question.type,

      fallbackTrack:
        !this.tracks.some(
          (item) =>
            item.id ===
            normalizedTrack.id
        ),

      createdAt:
        new Date().toISOString()
    };

    this.currentRound =
      round;

    return this.clone(
      round
    );
  }

  /*
   * Zgodność przejściowa.
   *
   * W finalnym LiveController v8
   * ta metoda NIE będzie już używana.
   *
   * Pozostawiamy ją wyłącznie po to,
   * żeby podczas etapowego wdrażania
   * aplikacja nie wywaliła się przez
   * brak metody.
   */
  createTitleStage() {
    if (!this.currentTrack) {
      throw new Error(
        "Brak aktywnego utworu."
      );
    }

    return this.createTitleQuestion(
      this.currentTrack
    );
  }

  getCurrentRound() {
    return this.currentRound
      ? this.clone(
          this.currentRound
        )
      : null;
  }

  getCurrentTrack() {
    return this.currentTrack
      ? this.clone(
          this.currentTrack
        )
      : null;
  }

  getCurrentQuestion() {
    return this.currentQuestion
      ? this.clone(
          this.currentQuestion
        )
      : null;
  }

  getQuestionTypeStats() {
    const artist =
      Number(
        this.questionTypeCounts.artist ||
        0
      );

    const title =
      Number(
        this.questionTypeCounts.title ||
        0
      );

    return {
      artist,
      title,
      total:
        artist +
        title
    };
  }

  getLibraryStats() {
    const artists =
      this.unique(
        this.tracks.map(
          (track) =>
            track.primaryArtist
        )
      );

    const titles =
      this.unique(
        this.tracks.map(
          (track) =>
            track.title
        )
      );

    const albums =
      this.unique(
        this.tracks.map(
          (track) =>
            track.album
        )
      );

    const years =
      this.unique(
        this.tracks
          .map(
            (track) =>
              track.year
                ? String(
                    track.year
                  )
                : ""
          )
      );

    return {
      trackCount:
        this.tracks.length,

      artistCount:
        artists.length,

      titleCount:
        titles.length,

      albumCount:
        albums.length,

      yearCount:
        years.length
    };
  }

  getStats() {
    const library =
      this.getLibraryStats();

    const questionTypes =
      this.getQuestionTypeStats();

    return {
      ...library,

      queueRemaining:
        this.queue.length,

      roundsCreated:
        this.roundCounter,

      questionTypes,

      recentTrackCount:
        this.recentTrackIds.length,

      recentQuestionTypes: [
        ...this.recentQuestionTypes
      ],

      currentRound:
        this.currentRound
          ? {
              number:
                this.currentRound.number,

              questionType:
                this.currentRound
                  .questionType,

              trackId:
                this.currentRound
                  .track?.id ||
                null
            }
          : null,

      libraryRevision:
        this.libraryRevision
    };
  }

  getDiagnostics() {
    return {
      ready:
        this.tracks.length >=
        this.settings.minimumTracks,

      settings: {
        ...this.settings
      },

      library:
        this.getLibraryStats(),

      queue: {
        remaining:
          this.queue.length,

        nextTrackId:
          this.queue[0]?.id ||
          null
      },

      session: {
        roundsCreated:
          this.roundCounter,

        currentTrackId:
          this.currentTrack?.id ||
          null,

        currentQuestionType:
          this.currentQuestion?.type ||
          null,

        recentTrackIds: [
          ...this.recentTrackIds
        ],

        recentQuestionTypes: [
          ...this.recentQuestionTypes
        ],

        questionTypeCounts: {
          ...this.questionTypeCounts
        }
      },

      lastLoadStats:
        this.lastLoadStats
          ? {
              ...this.lastLoadStats
            }
          : null
    };
  }
}

module.exports = QuizEngine;