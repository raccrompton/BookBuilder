module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
        jest: true
    },
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
        'no-console': 'off',
        'prefer-const': 'error',
        'no-var': 'error',
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'indent': ['error', 4],
        'no-trailing-spaces': 'error',
        'eol-last': 'error'
    },
    globals: {
        'Stockfish': 'readonly',
        'Chess': 'readonly'
    }
};