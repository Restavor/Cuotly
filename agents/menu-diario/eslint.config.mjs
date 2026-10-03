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
      "no-restricted-globals": [
        "error",
        { name: "performance", message: "performance.now() lee el reloj del sistema. El reloj lo inyecta quien llama (decisión 158)." },
        { name: "crypto", message: "crypto da aleatoriedad: src/core es determinista." },
        { name: "process", message: "src/core no depende del entorno de ejecución. Va en src/services." },
      ],
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
        {
          selector: "CallExpression[callee.name='Date']",
          message: "Date() sin new devuelve la hora actual. El reloj lo inyecta quien llama (decisión 158).",
        },
        {
          selector: "MemberExpression[object.name='globalThis'][property.name='Date']",
          message: "No se llega a Date por globalThis para leer el reloj (decisión 158).",
        },
        {
          selector: "CallExpression[callee.property.name='format'][arguments.length=0]",
          message: "format() sin argumentos formatea la hora actual. Pasa siempre el instante (decisión 158).",
        },
      ],
    },
  },
  {
    // La prueba en seco NO escribe nada (PRD §14, Fase 1). Tercera capa, junto a la puerta de solo lectura (read-only-gate.ts)
    // y a la comprobación externa de recuentos. El robot de las fases siguientes sí escribirá, en otros archivos.
    files: [
      "src/dry-run/**/*.ts",
      "scripts/dry-run.ts",
      "src/services/dry-run-reader.ts",
      "src/services/read-only-gate.ts",
      "src/services/read-only-client.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name=/^(insert|update|delete|upsert)$/]",
          message: "La prueba en seco no escribe en la base: sin .insert / .update / .delete / .upsert.",
        },
      ],
    },
  },
);
