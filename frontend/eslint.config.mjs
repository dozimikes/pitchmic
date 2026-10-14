import coreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...coreWebVitals,
  {
    rules: {
      'no-unused-vars': 'off',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'] },
];
