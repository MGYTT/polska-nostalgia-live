class VoteEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.userVotes = new Map();

    this.votes = {
      A: 0,
      B: 0,
      C: 0,
      D: 0
    };

    this.correctVotes = [];
    this.recentVotes = [];
  }

  normalizeText(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  extractAnswer(comment) {
    const normalized = this.normalizeText(comment);

    if (!normalized) {
      return null;
    }

    if (/^[ABCD][!?.:,;)\]❤️🔥]*$/u.test(normalized)) {
      return normalized[0];
    }

    const patterns = [
      /^(?:ODP(?:OWIEDŹ)?|ODPOWIEDZ)\s*[:\-]?\s*([ABCD])[!?.:,;)\]❤️🔥]*$/u,
      /^(?:STAWIAM|WYBIERAM|TYPUJĘ|TYPUJE)\s+(?:NA\s+)?([ABCD])[!?.:,;)\]❤️🔥]*$/u,
      /^(?:CHYBA|MOIM ZDANIEM)\s+([ABCD])[!?.:,;)\]❤️🔥]*$/u
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);

      if (match) {
        return match[1];
      }
    }

    const standaloneMatches =
      normalized.match(/(?:^|[^A-ZĄĆĘŁŃÓŚŹŻ])([ABCD])(?:$|[^A-ZĄĆĘŁŃÓŚŹŻ])/gu) ||
      [];

    const letters = standaloneMatches
      .map((match) => {
        const letter = match.match(/[ABCD]/u);
        return letter ? letter[0] : null;
      })
      .filter(Boolean);

    const uniqueLetters = [...new Set(letters)];

    return uniqueLetters.length === 1
      ? uniqueLetters[0]
      : null;
  }

  registerVote({
    userId,
    username,
    displayName,
    comment,
    correctLetter
  }) {
    const normalizedUserId = String(
      userId || username || displayName || ""
    )
      .trim()
      .toLowerCase();

    if (!normalizedUserId) {
      return {
        accepted: false,
        reason: "missing_user"
      };
    }

    const letter = this.extractAnswer(comment);

    if (!letter) {
      return {
        accepted: false,
        reason: "invalid_answer"
      };
    }

    if (this.userVotes.has(normalizedUserId)) {
      return {
        accepted: false,
        reason: "already_voted",
        previousVote: this.userVotes.get(normalizedUserId)
      };
    }

    const vote = {
      userId: normalizedUserId,
      username: String(username || normalizedUserId),
      displayName: String(
        displayName || username || normalizedUserId
      ),
      letter,
      isCorrect: letter === correctLetter,
      comment: String(comment || ""),
      createdAt: new Date().toISOString()
    };

    this.userVotes.set(normalizedUserId, vote);
    this.votes[letter] += 1;

    if (vote.isCorrect) {
      this.correctVotes.push(vote);
    }

    this.recentVotes.unshift(vote);
    this.recentVotes = this.recentVotes.slice(0, 20);

    return {
      accepted: true,
      vote,
      stats: this.getStats()
    };
  }

  getStats() {
    return {
      votes: {
        ...this.votes
      },
      totalVotes: this.userVotes.size,
      correctCount: this.correctVotes.length,
      uniquePlayers: this.userVotes.size,
      correctOrder: [...this.correctVotes],
      recentVotes: [...this.recentVotes]
    };
  }
}

module.exports = VoteEngine;