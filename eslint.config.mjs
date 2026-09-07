import next from "eslint-config-next"

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "supabase/migrations/**",
      "next-env.d.ts",
    ],
  },
  ...next,
  {
    rules: {
      // O CRM usa muitos objetos dinâmicos vindos do Supabase; permitimos `any`
      // pontual sem transformar o lint em ruído. A tipagem forte vive nas camadas
      // de domínio (lib/domain) e de dados (lib/data).
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      // Regras novas e opinativas do eslint-plugin-react-hooks v7 orientadas ao
      // React Compiler. Os carregadores baseados em efeito deste projeto são
      // intencionais e funcionam; mantemos como aviso em vez de erro para não
      // bloquear o build sem reescrever padrões que já operam corretamente.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]

export default config
