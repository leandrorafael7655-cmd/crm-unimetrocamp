import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Resolve o alias "@/..." (o mesmo do tsconfig) para os testes, permitindo que
// módulos sob teste importem por caminho absoluto do projeto.
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
})
