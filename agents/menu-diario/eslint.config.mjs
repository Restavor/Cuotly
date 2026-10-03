import tseslint from "typescript-eslint";

// Reglas de CLAUDE.md hechas cumplir por máquina:
//  - TypeScript estricto y sin `any`.
//  - src/core es lógica pura: sin Supabase, Next, React, Playwright ni IA, sin adaptadores, sin
//    textos de pantalla (van en src/i18n) y sin leer el reloj del sistema (el reloj lo inyecta quien llama,
//    decisión 158 de docs/DECISIONES.md).
const NO_IO_IN_CORE = [
  { group: ["@supabase/*"], message: "src/core no depende de Supabase. Va en src/services." },
  { group: ["next", "next/*", "react", "react-dom", "react/*"], message: "src/core no depende de Next ni de React." },
  { group: ["playwright", "playwright-core", "@playwright/*"], message: "src/core no maneja navegadores. Va en src/services." },
  { group: ["@anthropic-ai/*"], message: "src/core no llama a la IA. Va en src/services." },
  { group: ["**/services/**", "**/i18n/**"], message: "src/core no importa adaptadores ni textos de pantalla: devuelve códigos." },
];

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "coverage/**"] },
  ...tseslint.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: NO_IO_IN_CORE }],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "El reloj lo inyecta quien llama (decisión 158). No leas Date.now() en src/core." },
        { object: "Math", property: "random", message: "src/core es determinista: sin Math.random()." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "new Date() sin argumentos lee el reloj del sistema. El reloj lo inyecta quien llama (decisión 158).",
        },
      ],
    },
  },
);
