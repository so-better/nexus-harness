/* Stylelint 配置：标准规则 + Vue/Less 自定义语法。 */

export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/build/**'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html'
    },
    {
      files: ['**/*.less'],
      customSyntax: 'postcss-less'
    }
  ],
  rules: {
    'selector-class-pattern': null,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['deep'] }],
    'custom-property-pattern': null
  }
};
