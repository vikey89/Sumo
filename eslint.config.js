import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist', 'server/target', 'docs', 'eslint.config.js', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } }, rules: { '@typescript-eslint/no-unused-vars': 'off', eqeqeq: 'error' } },
);
