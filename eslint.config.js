// Dev-only ESLint flat config, the gate the other tower mods use. Not shipped in release artifacts.

const ENGINE_GLOBALS = {
  Game: "readonly",
  GameContext: "readonly",
  Online: "readonly",
  Players: "readonly",
  GameInfo: "readonly",
  GameplayMap: "readonly",
  Configuration: "readonly",
  Locale: "readonly",
  engine: "readonly",
  Database: "readonly",
  Controls: "readonly",
  Cities: "readonly",
  Districts: "readonly",
  ComponentID: "readonly",
  Modding: "readonly",
  UI: "readonly",
  WorldUI: "readonly",
  Loading: "readonly",
  InputActionStatuses: "readonly",
  SpriteMode: "readonly",
  RiverTypes: "readonly",
  // Engine surfaces the Dam path uses: river reads, the placement wraps, the Levee
  // placement and the drawn dam.
  Constructibles: "readonly",
  MapConstructibles: "readonly",
  MapRivers: "readonly",
  Units: "readonly",
  MapUnits: "readonly",
  FeatureTypes: "readonly",
  DirectionTypes: "readonly",
  PlacementMode: "readonly",
  CityOperationTypes: "readonly",
  CityCommandTypes: "readonly",
  CityQueryType: "readonly",
  ResourceTypes: "readonly",
  UnitOperationTypes: "readonly",
  WorldBuilder: "readonly",
  Network: "readonly",
  UIGameLoadingState: "readonly",
  SaveLocations: "readonly",
  SaveLocationCategories: "readonly",
  SaveTypes: "readonly",
  SaveFileTypes: "readonly",
  YieldTypes: "readonly"
};

const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  localStorage: "readonly",
  globalThis: "readonly",
  structuredClone: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  MutationObserver: "readonly",
  CustomEvent: "readonly"
};

export default [
  {
    files: ["ui/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...ENGINE_GLOBALS, ...BROWSER_GLOBALS }
    },
    rules: {
      complexity: ["error", 10],
      "max-statements": ["error", 18],
      "max-depth": ["error", 4],
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }
      ],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-len": [
        "error",
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true
        }
      ],
      "max-params": ["error", 5],
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      eqeqeq: ["error", "always", { null: "ignore" }]
    }
  }
];
