module.exports = {
  extends: ['taro/react'],
  parser: '@typescript-eslint/parser',
  ignorePatterns: ['dist/', 'node_modules/', 'backend/'],
  rules: {
    'react/jsx-uses-react': 'off',
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // 金額計算のバグを生みやすいので、暗黙の型変換を禁止する
    eqeqeq: ['error', 'always'],
  },
}
