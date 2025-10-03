import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import path from 'path';
import { walk } from 'estree-walker';
import type { LoaderContext } from 'webpack';

const VALID_EXTENSIONS = new Set(['.jsx', '.tsx']);

function ideavorTaggerLoader(this: LoaderContext<any>, code: string): void {
  const callback = this.async();
  
  const transform = async () => {
    try {
      if (!VALID_EXTENSIONS.has(path.extname(this.resourcePath)) || this.resourcePath.includes('node_modules')) {
        return null;
      }

      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        sourceFilename: this.resourcePath
      });

      const ms = new MagicString(code);
      const fileRelative = path.relative(this.rootContext, this.resourcePath);
      let transformCount = 0;

      walk(ast as any, {
        enter: (node: any) => {
          try {
            if (node.type !== 'JSXOpeningElement') return;
            if (node.name?.type !== 'JSXIdentifier') return;

            const tagName = node.name.name;
            if (!tagName) return;

            const alreadyTagged = node.attributes?.some(
              (attr: any) => attr.type === 'JSXAttribute' && attr.name?.name === 'ideavo-tag-id'
            );
            if (alreadyTagged) return;

            const loc = node.loc?.start;
            if (!loc) return;

            const ideavo = `${fileRelative}:${loc.line}:${loc.column}`;

            // Check if className is static (true) or dynamic with {} (false)
            let stylesEditable = 'true';
            const classNameAttr = node.attributes?.find(
              (attr: any) => attr.type === 'JSXAttribute' && attr.name?.name === 'className'
            );

            // If className has {} expression, it's not editable
            if (classNameAttr?.value?.type === 'JSXExpressionContainer') {
              stylesEditable = 'false';
            }

            if (node.name.end != null) {
              ms.appendLeft(
                node.name.end,
                ` ideavo-tag-id="${ideavo}" ideavo-tag-name="${tagName}" ideavo-styles-editable="${stylesEditable}"`
              );
              transformCount++;
            }
          } catch (error) {
            console.warn(
              `[ideavo-tagger] Warning: Failed to process JSX node in ${this.resourcePath}:`,
              error
            );
          }
        }
      });

      if (transformCount === 0) {
        return null;
      }

      const transformedCode = ms.toString();
      return {
        code: transformedCode,
        map: ms.generateMap({ hires: true })
      };
    } catch (error) {
      console.warn(
        `[ideavo-tagger] Warning: Failed to transform ${this.resourcePath}:`,
        error
      );
      return null;
    }
  };

  transform().then((result) => {
    if (result) {
      callback(null, result.code, result.map);
    } else {
      callback(null, code);
    }
  }).catch((err) => {
    console.error(`[ideavo-tagger] ERROR in ${this.resourcePath}:`, err);
    callback(null, code);
  });
}

export default ideavorTaggerLoader;
