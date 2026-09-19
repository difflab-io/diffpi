import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const privateUtilsLastRule = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      privateUtilsLast: 'Place exported functions before private function declarations; keep private utilities last.',
    },
  },
  create(context) {
    return {
      Program(node) {
        let privateFunction;
        for (const statement of node.body) {
          if (statement.type === 'FunctionDeclaration') privateFunction ??= statement;
          if (
            privateFunction &&
            statement.type === 'ExportNamedDeclaration' &&
            statement.declaration?.type === 'FunctionDeclaration'
          ) {
            context.report({ node: statement, messageId: 'privateUtilsLast' });
          }
        }
      },
    };
  },
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    plugins: {
      'diffpi-layout': {
        rules: { 'private-utils-last': privateUtilsLastRule },
      },
    },
    rules: {
      'diffpi-layout/private-utils-last': 'error',
    },
  },
  {
    ignores: ['**/dist/', '**/node_modules/'],
  },
);
