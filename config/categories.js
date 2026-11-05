"use strict";

/*
 * POLSKA NOSTALGIA LIVE
 * config/categories.js
 * VERSION 1.0.0
 *
 * Centralna konfiguracja systemu kategorii.
 *
 * Założenia:
 * - jedna aktywna kategoria na blok rund,
 * - domyślnie 20 zakończonych rund na kategorię,
 * - po bloku automat uruchamia głosowanie widzów,
 * - do głosowania trafiają maksymalnie 4 kategorie,
 * - aktualna kategoria nie jest ponownie proponowana,
 * - ostatnio używane kategorie mają cooldown,
 * - każda kategoria może posiadać kilka playlist,
 * - pierwsza playlista jest główna,
 * - kolejne playlisty pełnią funkcję fallback,
 * - kategoria general jest globalnym fallbackiem,
 * - brak działającej kategorii nie może zatrzymać quizu.
 */

const CATEGORIES_VERSION = "1.0.0";

const CATEGORY_VOTING_CONFIG = Object.freeze({
  enabled: true,

  roundsPerCategory: 20,

  votingDurationSeconds: 20,

  resultDurationSeconds: 6,

  loadingTimeoutSeconds: 30,

  availableOptionCount: 4,

  minimumOptionCount: 2,

  minimumVotes: 1,

  allowVoteChange: true,

  excludeCurrentCategory: true,

  recentCategoryCooldown: 2,

  allowAutomaticFallback: true,

  allowRandomFallback: true,

  automaticallyStartNextRound: true,

  preloadLibraries: true,

  refreshLibrariesInBackground: true,

  libraryRefreshIntervalMinutes: 30,

  persistState: true,

  stateFile:
    "data/category-state.json",

  logPrefix:
    "[CATEGORY]",

  fallbackCategoryId:
    "general"
});

const CATEGORY_IDS = Object.freeze({
  GENERAL:
    "general",

  HIPHOP:
    "hiphop",

  OLDIES:
    "oldies",

  ROCK:
    "rock",

  EIGHTIES_NINETIES:
    "eighties-nineties",

  TWO_THOUSANDS:
    "two-thousands",

  PARTY:
    "party",

  BALLADS:
    "ballads"
});

const CATEGORIES = Object.freeze({
  [CATEGORY_IDS.GENERAL]:
    createCategory({
      id:
        CATEGORY_IDS.GENERAL,

      name:
        "OGÓLNE HITY",

      shortName:
        "OGÓLNE",

      description:
        "Największe polskie hity z różnych lat i gatunków.",

      icon:
        "🎵",

      color:
        "#9b55ff",

      accentColor:
        "#50eaff",

      enabled:
        true,

      default:
        true,

      fallbackCategoryId:
        null,

      playlistIds: [
      ]
    }),

  [CATEGORY_IDS.HIPHOP]:
    createCategory({
      id:
        CATEGORY_IDS.HIPHOP,

      name:
        "POLSKI HIP-HOP",

      shortName:
        "HIP-HOP",

      description:
        "Polski rap i hip-hop z różnych okresów.",

      icon:
        "🎤",

      color:
        "#ff315f",

      accentColor:
        "#ff913d",

      enabled:
        true,

      fallbackCategoryId:
        CATEGORY_IDS.GENERAL,

      playlistIds: [
      ]
    }),

  [CATEGORY_IDS.OLDIES]:
    createCategory({
      id:
        CATEGORY_IDS.OLDIES,

      name:
        "STARE HITY",

      shortName:
        "STARE HITY",

      description:
        "Klasyczne polskie utwory i największe muzyczne wspomnienia.",

      icon:
        "📻",

      color:
        "#ffc857",

      accentColor:
        "#ff913d",

      enabled:
        true,

      fallbackCategoryId:
        CATEGORY_IDS.GENERAL,

      playlistIds: [
      ]
    }),

  [CATEGORY_IDS.ROCK]:
    createCategory({
      id:
        CATEGORY_IDS.ROCK,

      name:
        "POLSKI ROCK",

      shortName:
        "ROCK",

      description:
        "Polskie rockowe klasyki i popularne gitarowe hity.",

      icon:
        "🎸",

      color:
        "#ff4e9b",

      accentColor:
        "#9b55ff",

      enabled:
        true,

      fallbackCategoryId:
        CATEGORY_IDS.GENERAL,

      playlistIds: [
      ]
    }),

  [CATEGORY_IDS.EIGHTIES_NINETIES]:
    createCategory({
      id:
        CATEGORY_IDS.EIGHTIES_NINETIES,

      name:
        "LATA 80. I 90.",

      shortName:
        "80. I 90.",

      description:
        "Polskie hity lat osiemdziesiątych i dziewięćdziesiątych.",

      icon:
        "💿",

      color:
        "#50eaff",

      accentColor:
        "#9b55ff",

      enabled:
        true,

      fallbackCategoryId:
        CATEGORY_IDS.GENERAL,

      playlistIds: [
      ]
    }),

  [CATEGORY_IDS.TWO_THOUSANDS]:
    createCategory({
      id:
        CATEGORY_IDS.TWO_THOUSANDS,

      name:
        "LATA 2000.",

      shortName:
        "2000.",

      description:
        "Polskie przeboje i nostalgiczne hity lat dwutysięcznych.",

      icon:
        "📀",

      color:
        "#35b8ff",

      accentColor:
        "#50eaff",

      enabled:
        true,

      fallbackCategoryId:
        CATEGORY_IDS.GENERAL,

      playlistIds: [
      ]
    }),

  [CATEGORY_IDS.PARTY]:
    createCategory({
      id:
        CATEGORY_IDS.PARTY,

      name:
        "IMPREZOWE HITY",

      shortName:
        "IMPREZOWE",

      description:
        "Energetyczne polskie utwory kojarzone z imprezami i zabawą.",

      icon:
        "🔥",

      color:
        "#ff913d",

      accentColor:
        "#ff315f",

      enabled:
        true,

      fallbackCategoryId:
        CATEGORY_IDS.GENERAL,

      playlistIds: [
      ]
    }),

  [CATEGORY_IDS.BALLADS]:
    createCategory({
      id:
        CATEGORY_IDS.BALLADS,

      name:
        "POLSKIE BALLADY",

      shortName:
        "BALLADY",

      description:
        "Spokojniejsze i nostalgiczne polskie utwory.",

      icon:
        "❤️",

      color:
        "#ff4e9b",

      accentColor:
        "#9b55ff",

      enabled:
        true,

      fallbackCategoryId:
        CATEGORY_IDS.GENERAL,

      playlistIds: [
      ]
    })
});

function createCategory(options = {}) {
  const id =
    normalizeId(
      options.id
    );

  if (!id) {
    throw new Error(
      "Category requires a valid id."
    );
  }

  const name =
    normalizeText(
      options.name,
      id.toUpperCase()
    );

  const shortName =
    normalizeText(
      options.shortName,
      name
    );

  const playlistIds =
    normalizePlaylistIds(
      options.playlistIds
    );

  const minimumTracks =
    Math.max(
      4,
      normalizeInteger(
        options.minimumTracks,
        20
      )
    );

  const weight =
    Math.max(
      1,
      normalizeInteger(
        options.weight,
        100
      )
    );

  return Object.freeze({
    id,

    name,

    shortName,

    description:
      normalizeText(
        options.description
      ),

    icon:
      normalizeText(
        options.icon,
        "🎵"
      ),

    color:
      normalizeColor(
        options.color,
        "#9b55ff"
      ),

    accentColor:
      normalizeColor(
        options.accentColor,
        "#50eaff"
      ),

    enabled:
      options.enabled !==
      false,

    default:
      options.default ===
      true,

    voteEligible:
      options.voteEligible !==
      false,

    allowAutomaticSelection:
      options.allowAutomaticSelection !==
      false,

    fallbackCategoryId:
      normalizeOptionalId(
        options.fallbackCategoryId
      ),

    playlistIds:
      Object.freeze(
        playlistIds
      ),

    minimumTracks,

    cooldownBlocks:
      Math.max(
        0,
        normalizeInteger(
          options.cooldownBlocks,
          CATEGORY_VOTING_CONFIG
            .recentCategoryCooldown
        )
      ),

    weight,

    metadata:
      Object.freeze({
        createdFor:
          "polska-nostalgia-live",

        schemaVersion:
          CATEGORIES_VERSION
      })
  });
}

function normalizeText(
  value,
  fallback = ""
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  const normalized =
    String(value)
      .replace(
        /\u0000/g,
        ""
      )
      .trim();

  return normalized ||
    fallback;
}

function normalizeId(value) {
  const normalized =
    normalizeText(value)
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^-|-$/g,
        ""
      );

  return normalized;
}

function normalizeOptionalId(value) {
  const normalized =
    normalizeId(value);

  return normalized ||
    null;
}

function normalizeInteger(
  value,
  fallback = 0
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return fallback;
  }

  return Math.floor(
    parsed
  );
}

function normalizeColor(
  value,
  fallback
) {
  const color =
    normalizeText(
      value
    );

  if (
    /^#[0-9a-f]{6}$/i.test(
      color
    )
  ) {
    return color;
  }

  return fallback;
}

function normalizePlaylistIds(value) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  const seen =
    new Set();

  const result =
    [];

  for (
    const item of value
  ) {
    const playlistId =
      normalizeText(item);

    if (!playlistId) {
      continue;
    }

    if (
      seen.has(
        playlistId
      )
    ) {
      continue;
    }

    seen.add(
      playlistId
    );

    result.push(
      playlistId
    );
  }

  return result;
}

function getCategory(categoryId) {
  const id =
    normalizeId(
      categoryId
    );

  if (!id) {
    return null;
  }

  return (
    CATEGORIES[id] ||
    null
  );
}

function hasCategory(categoryId) {
  return Boolean(
    getCategory(
      categoryId
    )
  );
}

function getAllCategories() {
  return Object.values(
    CATEGORIES
  );
}

function getEnabledCategories() {
  return getAllCategories()
    .filter(
      (category) =>
        category.enabled
    );
}

function getVoteEligibleCategories() {
  return getEnabledCategories()
    .filter(
      (category) =>
        category.voteEligible
    );
}

function getAutomaticCategories() {
  return getEnabledCategories()
    .filter(
      (category) =>
        category.allowAutomaticSelection
    );
}

function getConfiguredCategories() {
  return getEnabledCategories()
    .filter(
      (category) =>
        category.playlistIds
          .length > 0
    );
}

function getUnconfiguredCategories() {
  return getEnabledCategories()
    .filter(
      (category) =>
        category.playlistIds
          .length === 0
    );
}

function getDefaultCategory() {
  const explicitDefault =
    getAllCategories()
      .find(
        (category) =>
          category.default &&
          category.enabled
      );

  if (explicitDefault) {
    return explicitDefault;
  }

  return (
    getCategory(
      CATEGORY_VOTING_CONFIG
        .fallbackCategoryId
    ) ||
    getEnabledCategories()[0] ||
    null
  );
}

function getFallbackCategory(
  categoryId
) {
  const category =
    getCategory(
      categoryId
    );

  if (!category) {
    return getDefaultCategory();
  }

  if (
    category.fallbackCategoryId
  ) {
    const categoryFallback =
      getCategory(
        category.fallbackCategoryId
      );

    if (
      categoryFallback &&
      categoryFallback.enabled
    ) {
      return categoryFallback;
    }
  }

  const globalFallback =
    getCategory(
      CATEGORY_VOTING_CONFIG
        .fallbackCategoryId
    );

  if (
    globalFallback &&
    globalFallback.enabled
  ) {
    return globalFallback;
  }

  return getDefaultCategory();
}

function getCategoryPlaylistIds(
  categoryId
) {
  const category =
    getCategory(
      categoryId
    );

  if (!category) {
    return [];
  }

  return [
    ...category.playlistIds
  ];
}

function isCategoryConfigured(
  categoryId
) {
  const category =
    getCategory(
      categoryId
    );

  if (!category) {
    return false;
  }

  return (
    category.enabled &&
    category.playlistIds
      .length > 0
  );
}

function isCategoryVoteEligible(
  categoryId
) {
  const category =
    getCategory(
      categoryId
    );

  if (!category) {
    return false;
  }

  return (
    category.enabled &&
    category.voteEligible &&
    category.playlistIds
      .length > 0
  );
}

function sanitizeRecentCategoryIds(
  recentCategoryIds
) {
  if (
    !Array.isArray(
      recentCategoryIds
    )
  ) {
    return [];
  }

  const output =
    [];

  const seen =
    new Set();

  for (
    const value of
    recentCategoryIds
  ) {
    const id =
      normalizeId(
        value
      );

    if (
      !id ||
      seen.has(id) ||
      !hasCategory(id)
    ) {
      continue;
    }

    seen.add(id);

    output.push(id);
  }

  return output;
}

function getCategoryCooldownSet(
  currentCategoryId,
  recentCategoryIds = []
) {
  const cooldown =
    new Set();

  const currentId =
    normalizeId(
      currentCategoryId
    );

  if (
    currentId &&
    CATEGORY_VOTING_CONFIG
      .excludeCurrentCategory
  ) {
    cooldown.add(
      currentId
    );
  }

  const recent =
    sanitizeRecentCategoryIds(
      recentCategoryIds
    );

  for (
    let index = 0;
    index < recent.length;
    index += 1
  ) {
    const category =
      getCategory(
        recent[index]
      );

    if (!category) {
      continue;
    }

    const cooldownBlocks =
      Math.max(
        0,
        category.cooldownBlocks
      );

    if (
      index <
      cooldownBlocks
    ) {
      cooldown.add(
        category.id
      );
    }
  }

  return cooldown;
}

function getEligibleVotePool({
  currentCategoryId = null,

  recentCategoryIds = [],

  requireConfigured = true,

  includeCooldown = false
} = {}) {
  const cooldown =
    getCategoryCooldownSet(
      currentCategoryId,
      recentCategoryIds
    );

  return getVoteEligibleCategories()
    .filter(
      (category) => {
        if (
          requireConfigured &&
          category.playlistIds
            .length === 0
        ) {
          return false;
        }

        if (
          !includeCooldown &&
          cooldown.has(
            category.id
          )
        ) {
          return false;
        }

        return true;
      }
    );
}

function shuffleCategories(
  categories,
  random = Math.random
) {
  const output = [
    ...categories
  ];

  for (
    let index =
      output.length - 1;
    index > 0;
    index -= 1
  ) {
    const target =
      Math.floor(
        random() *
        (index + 1)
      );

    [
      output[index],
      output[target]
    ] = [
      output[target],
      output[index]
    ];
  }

  return output;
}

function selectVoteCategories({
  currentCategoryId = null,

  recentCategoryIds = [],

  optionCount =
    CATEGORY_VOTING_CONFIG
      .availableOptionCount,

  requireConfigured = true,

  random = Math.random
} = {}) {
  const desiredCount =
    Math.max(
      CATEGORY_VOTING_CONFIG
        .minimumOptionCount,

      Math.min(
        4,
        normalizeInteger(
          optionCount,
          CATEGORY_VOTING_CONFIG
            .availableOptionCount
        )
      )
    );

  const selected =
    [];

  const selectedIds =
    new Set();

  function addCategories(
    categories
  ) {
    for (
      const category of
      shuffleCategories(
        categories,
        random
      )
    ) {
      if (
        selected.length >=
        desiredCount
      ) {
        return;
      }

      if (
        selectedIds.has(
          category.id
        )
      ) {
        continue;
      }

      selectedIds.add(
        category.id
      );

      selected.push(
        category
      );
    }
  }

  addCategories(
    getEligibleVotePool({
      currentCategoryId,
      recentCategoryIds,
      requireConfigured,
      includeCooldown:
        false
    })
  );

  if (
    selected.length <
    desiredCount
  ) {
    addCategories(
      getEligibleVotePool({
        currentCategoryId,
        recentCategoryIds,
        requireConfigured,
        includeCooldown:
          true
      })
    );
  }

  if (
    selected.length <
    desiredCount &&
    currentCategoryId
  ) {
    const current =
      getCategory(
        currentCategoryId
      );

    if (
      current &&
      current.enabled &&
      current.voteEligible &&
      (
        !requireConfigured ||
        current.playlistIds
          .length > 0
      )
    ) {
      addCategories([
        current
      ]);
    }
  }

  return selected
    .slice(
      0,
      desiredCount
    );
}

function assignVoteLetters(
  categories
) {
  const letters = [
    "A",
    "B",
    "C",
    "D"
  ];

  return arrayValue(
    categories
  )
    .slice(
      0,
      letters.length
    )
    .map(
      (
        category,
        index
      ) => ({
        letter:
          letters[index],

        categoryId:
          category.id,

        name:
          category.name,

        shortName:
          category.shortName,

        icon:
          category.icon,

        color:
          category.color,

        accentColor:
          category.accentColor
      })
    );
}

function arrayValue(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function selectAutomaticFallbackCategory({
  currentCategoryId = null,

  excludedCategoryIds = [],

  recentCategoryIds = [],

  random = Math.random
} = {}) {
  const excluded =
    new Set(
      arrayValue(
        excludedCategoryIds
      )
        .map(
          normalizeId
        )
        .filter(Boolean)
    );

  const currentId =
    normalizeId(
      currentCategoryId
    );

  if (currentId) {
    excluded.add(
      currentId
    );
  }

  const recent =
    new Set(
      sanitizeRecentCategoryIds(
        recentCategoryIds
      )
    );

  const configured =
    getAutomaticCategories()
      .filter(
        (category) =>
          category.playlistIds
            .length > 0
      )
      .filter(
        (category) =>
          !excluded.has(
            category.id
          )
      );

  const fresh =
    configured.filter(
      (category) =>
        !recent.has(
          category.id
        )
    );

  const pool =
    fresh.length > 0
      ? fresh
      : configured;

  if (
    pool.length > 0
  ) {
    return shuffleCategories(
      pool,
      random
    )[0];
  }

  const fallback =
    getDefaultCategory();

  if (
    fallback &&
    fallback.playlistIds
      .length > 0
  ) {
    return fallback;
  }

  return null;
}

function validateCategoryConfiguration() {
  const errors =
    [];

  const warnings =
    [];

  const categories =
    getAllCategories();

  if (
    categories.length === 0
  ) {
    errors.push(
      "No categories have been configured."
    );
  }

  const ids =
    new Set();

  let defaultCount =
    0;

  for (
    const category of
    categories
  ) {
    if (
      ids.has(
        category.id
      )
    ) {
      errors.push(
        `Duplicate category id: ${category.id}`
      );
    }

    ids.add(
      category.id
    );

    if (
      category.default
    ) {
      defaultCount += 1;
    }

    if (
      category.enabled &&
      category.playlistIds
        .length === 0
    ) {
      warnings.push(
        `Category "${category.id}" is enabled but has no playlistIds.`
      );
    }

    if (
      category.fallbackCategoryId &&
      !hasCategory(
        category.fallbackCategoryId
      )
    ) {
      errors.push(
        `Category "${category.id}" points to unknown fallback category "${category.fallbackCategoryId}".`
      );
    }

    if (
      category.fallbackCategoryId ===
      category.id
    ) {
      errors.push(
        `Category "${category.id}" cannot use itself as fallback.`
      );
    }
  }

  if (
    defaultCount === 0
  ) {
    warnings.push(
      "No category is explicitly marked as default."
    );
  }

  if (
    defaultCount > 1
  ) {
    errors.push(
      "More than one category is marked as default."
    );
  }

  const globalFallback =
    getCategory(
      CATEGORY_VOTING_CONFIG
        .fallbackCategoryId
    );

  if (!globalFallback) {
    errors.push(
      `Global fallback category "${CATEGORY_VOTING_CONFIG.fallbackCategoryId}" does not exist.`
    );
  }

  const configuredCategories =
    getConfiguredCategories();

  if (
    CATEGORY_VOTING_CONFIG
      .enabled &&
    configuredCategories.length <
      CATEGORY_VOTING_CONFIG
        .minimumOptionCount
  ) {
    warnings.push(
      "Category voting does not currently have enough configured categories."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    warnings,

    categoryCount:
      categories.length,

    enabledCount:
      getEnabledCategories()
        .length,

    configuredCount:
      configuredCategories
        .length,

    voteEligibleCount:
      getVoteEligibleCategories()
        .length
  };
}

function getPublicCategory(
  categoryValue
) {
  const category =
    typeof categoryValue ===
      "string"
      ? getCategory(
          categoryValue
        )
      : categoryValue;

  if (!category) {
    return null;
  }

  return {
    id:
      category.id,

    name:
      category.name,

    shortName:
      category.shortName,

    description:
      category.description,

    icon:
      category.icon,

    color:
      category.color,

    accentColor:
      category.accentColor,

    enabled:
      category.enabled,

    voteEligible:
      category.voteEligible,

    configured:
      category.playlistIds
        .length > 0,

    minimumTracks:
      category.minimumTracks,

    cooldownBlocks:
      category.cooldownBlocks
  };
}

function getPublicCategories() {
  return getAllCategories()
    .map(
      getPublicCategory
    )
    .filter(Boolean);
}

function getConfigurationSnapshot() {
  const validation =
    validateCategoryConfiguration();

  return {
    version:
      CATEGORIES_VERSION,

    voting: {
      enabled:
        CATEGORY_VOTING_CONFIG
          .enabled,

      roundsPerCategory:
        CATEGORY_VOTING_CONFIG
          .roundsPerCategory,

      votingDurationSeconds:
        CATEGORY_VOTING_CONFIG
          .votingDurationSeconds,

      resultDurationSeconds:
        CATEGORY_VOTING_CONFIG
          .resultDurationSeconds,

      optionCount:
        CATEGORY_VOTING_CONFIG
          .availableOptionCount,

      minimumOptionCount:
        CATEGORY_VOTING_CONFIG
          .minimumOptionCount,

      allowVoteChange:
        CATEGORY_VOTING_CONFIG
          .allowVoteChange,

      recentCategoryCooldown:
        CATEGORY_VOTING_CONFIG
          .recentCategoryCooldown,

      fallbackCategoryId:
        CATEGORY_VOTING_CONFIG
          .fallbackCategoryId
    },

    categories:
      getPublicCategories(),

    validation
  };
}

const INITIAL_VALIDATION =
  validateCategoryConfiguration();

if (
  !INITIAL_VALIDATION.valid
) {
  console.error(
    CATEGORY_VOTING_CONFIG.logPrefix,
    "Category configuration contains errors:",
    INITIAL_VALIDATION.errors
  );
}

if (
  INITIAL_VALIDATION.warnings
    .length > 0
) {
  console.warn(
    CATEGORY_VOTING_CONFIG.logPrefix,
    "Category configuration warnings:",
    INITIAL_VALIDATION.warnings
  );
}

module.exports = {
  CATEGORIES_VERSION,

  CATEGORY_IDS,

  CATEGORY_VOTING_CONFIG,

  CATEGORIES,

  createCategory,

  getCategory,

  hasCategory,

  getAllCategories,

  getEnabledCategories,

  getVoteEligibleCategories,

  getAutomaticCategories,

  getConfiguredCategories,

  getUnconfiguredCategories,

  getDefaultCategory,

  getFallbackCategory,

  getCategoryPlaylistIds,

  isCategoryConfigured,

  isCategoryVoteEligible,

  sanitizeRecentCategoryIds,

  getCategoryCooldownSet,

  getEligibleVotePool,

  selectVoteCategories,

  assignVoteLetters,

  selectAutomaticFallbackCategory,

  validateCategoryConfiguration,

  getPublicCategory,

  getPublicCategories,

  getConfigurationSnapshot
};