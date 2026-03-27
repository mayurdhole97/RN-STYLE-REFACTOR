import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

// 🔥 Dedup map
const styleMap = new Map<string, string>();

// 🔥 Normalize object for dedupe
function normalizeStyleObject(obj: any) {
  if (!t.isObjectExpression(obj)) return "";

  const clean: any = {};

  obj.properties.forEach((prop: any) => {
    if (!t.isObjectProperty(prop)) return;

    let key = "";
    if (t.isIdentifier(prop.key)) key = prop.key.name;
    else if (t.isStringLiteral(prop.key)) key = prop.key.value;
    else return;

    if (t.isStringLiteral(prop.value)) clean[key] = prop.value.value;
    else if (t.isNumericLiteral(prop.value)) clean[key] = prop.value.value;
    else clean[key] = "dynamic";
  });

  const sorted = Object.keys(clean)
    .sort()
    .reduce((acc: any, k) => {
      acc[k] = clean[k];
      return acc;
    }, {});

  return JSON.stringify(sorted);
}

// 🔥 safer key extraction
function getKeyName(key: any): string | null {
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key)) return key.value;
  return null;
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// 🔥 naming
function getBaseNameFromProps(props: any[]) {
  const keys = props
    .map((p: any) => getKeyName(p.key))
    .filter(Boolean);

  if (keys.includes("color") || keys.includes("fontSize")) return "text";
  if (keys.includes("backgroundColor")) return "container";
  if (keys.includes("padding") || keys.includes("margin")) return "container";

  return "base"; // ❌ instead of "style"
}

// 🔥 dedupe + naming
function addStyle(obj: any, baseName: string, newStyles: any) {
  const key = normalizeStyleObject(obj);

  if (styleMap.has(key)) return styleMap.get(key)!;

  let name = baseName;
  let i = 1;

  while (newStyles[name]) {
    name = `${baseName}${i}`;
    i++;
  }

  newStyles[name] = obj;
  styleMap.set(key, name);

  return name;
}

// 🔥 remove duplicates
function removeDuplicateStyles(arr: any[]) {
  const seen = new Set<string>();

  return arr.filter((item) => {
    const key = generate(item).code.replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeProperties(props: any[]) {
  const map = new Map<string, any>();

  props.forEach((prop: any) => {
    if (!t.isObjectProperty(prop)) return;

    let key = "";
    if (t.isIdentifier(prop.key)) key = prop.key.name;
    else if (t.isStringLiteral(prop.key)) key = prop.key.value;
    else return;

    // overwrite → last wins
    map.set(key, prop);
  });

  return Array.from(map.values());
}

export function transformCode(code: string) {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx"],
  });

  const newStyles: Record<string, any> = {};

  let hasStyleSheetImport = false;
  let reactNativeImportPath: any = null;

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value === "react-native") {
        reactNativeImportPath = path;

        path.node.specifiers.forEach((spec) => {
          if (
            t.isImportSpecifier(spec) &&
            t.isIdentifier(spec.imported) &&
            spec.imported.name === "StyleSheet"
          ) {
            hasStyleSheetImport = true;
          }
        });
      }
    },

    JSXAttribute(path) {
      if (path.node.name.name !== "style") return;

      const value = path.node.value;
      if (!t.isJSXExpressionContainer(value)) return;

      const expr = value.expression;

      let elements: any[] = [];

      if (t.isObjectExpression(expr)) elements = [expr];
      else if (t.isArrayExpression(expr)) elements = expr.elements.filter(Boolean);
      else return;

      const finalStyles: any[] = [];
      let baseStyles: any[] = [];

      elements.forEach((el) => {
        if (t.isObjectExpression(el)) {
          let handled = false;

          el.properties.forEach((prop: any) => {
            if (!t.isObjectProperty(prop)) return;

            // 🔥 CONDITIONAL FIX (CORE FIX)
            if (t.isConditionalExpression(prop.value)) {
              handled = true;

              const condition = prop.value.test;

              const activeStyle = t.objectExpression([
                t.objectProperty(prop.key, prop.value.consequent),
              ]);

              const baseName = getBaseNameFromProps([prop]);
              const activeName = addStyle(activeStyle, `active${capitalize(baseName)}`, newStyles);

              finalStyles.push(
                t.logicalExpression(
                  "&&",
                  condition,
                  t.memberExpression(
                    t.identifier("styles"),
                    t.identifier(activeName)
                  )
                )
              );
            }
          });

          // ✅ BASE STYLE
          if (!handled) {
            baseStyles.push(el);
          }
        }

        // logical expression
        else if (
          t.isLogicalExpression(el) &&
          el.operator === "&&" &&
          t.isObjectExpression(el.right)
        ) {
          const name = addStyle(el.right, "conditional", newStyles);

          finalStyles.push(
            t.logicalExpression(
              "&&",
              el.left,
              t.memberExpression(t.identifier("styles"), t.identifier(name))
            )
          );
        }

        else {
          finalStyles.push(el);
        }
      });

      // 🔥 merge base styles into one
      if (baseStyles.length > 0) {
        const mergedProps = dedupeProperties(
          baseStyles.flatMap((b) => b.properties)
        );

        const merged = t.objectExpression(mergedProps);

        const baseName = getBaseNameFromProps(merged.properties);
        const name = addStyle(merged, baseName, newStyles);

        finalStyles.unshift(
          t.memberExpression(t.identifier("styles"), t.identifier(name))
        );
      }

      const cleaned = removeDuplicateStyles(finalStyles);

      path.node.value = t.jsxExpressionContainer(
        cleaned.length === 1 ? cleaned[0] : t.arrayExpression(cleaned)
      );
    },
  });

  // 🔥 create stylesheet
  const styleEntries = Object.entries(newStyles).map(([key, value]: any) =>
    t.objectProperty(t.identifier(key), value)
  );

  if (styleEntries.length > 0) {
    ast.program.body.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(
          t.identifier("styles"),
          t.callExpression(
            t.memberExpression(
              t.identifier("StyleSheet"),
              t.identifier("create")
            ),
            [t.objectExpression(styleEntries)]
          )
        ),
      ])
    );
  }

  // 🔥 import fix
  if (styleEntries.length > 0) {
    if (reactNativeImportPath) {
      if (!hasStyleSheetImport) {
        reactNativeImportPath.node.specifiers.push(
          t.importSpecifier(
            t.identifier("StyleSheet"),
            t.identifier("StyleSheet")
          )
        );
      }
    } else {
      ast.program.body.unshift(
        t.importDeclaration(
          [t.importSpecifier(t.identifier("StyleSheet"), t.identifier("StyleSheet"))],
          t.stringLiteral("react-native")
        )
      );
    }
  }

  return generate(ast).code;
}