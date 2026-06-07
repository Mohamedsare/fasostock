import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Allow intentionally-unused bindings prefixed with `_`
      // (placeholder destructuring, unused callback args, caught errors).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // `set-state-in-effect` est un diagnostic du React Compiler. Le compilateur
      // n'est PAS activé ici (pas de `reactCompiler` dans next.config.ts), donc
      // il n'a aucun effet à l'exécution. La plupart des cas restants sont des
      // patterns d'effet légitimes (lecture localStorage à l'hydratation,
      // fermeture du menu au changement de route, sync breakpoint) où l'effet
      // est la forme React correcte et un init paresseux casserait le SSR.
      // Conservé en `warn` (signal visible) plutôt qu'`error` (bloque le CI).
      // → repasser à `error` le jour où l'on active le React Compiler.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
