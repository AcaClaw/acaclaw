import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts", "plugins/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["plugins/**/*.ts"],
			exclude: ["**/*.test.ts", "**/node_modules/**"],
			thresholds: {
				lines: 70,
				branches: 70,
				functions: 70,
				statements: 70,
			},
		},
	},
});
