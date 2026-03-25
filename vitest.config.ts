import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts", "plugins/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["plugins/**/*.ts"],
			exclude: ["**/*.test.ts", "**/node_modules/**", "plugins/*/index.ts"],
			thresholds: {
				lines: 60,
				branches: 70,
				functions: 60,
				statements: 60,
			},
		},
	},
});
