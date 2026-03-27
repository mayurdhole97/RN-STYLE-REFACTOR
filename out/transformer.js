"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformCode = transformCode;
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const generator_1 = __importDefault(require("@babel/generator"));
const t = __importStar(require("@babel/types"));
// 🔥 Dedup map
const styleMap = new Map();
// 🔥 Normalize object for dedupe
function normalizeStyleObject(obj) {
    if (!t.isObjectExpression(obj))
        return "";
    const clean = {};
    obj.properties.forEach((prop) => {
        if (!t.isObjectProperty(prop))
            return;
        let key = "";
        if (t.isIdentifier(prop.key))
            key = prop.key.name;
        else if (t.isStringLiteral(prop.key))
            key = prop.key.value;
        else
            return;
        if (t.isStringLiteral(prop.value))
            clean[key] = prop.value.value;
        else if (t.isNumericLiteral(prop.value))
            clean[key] = prop.value.value;
        else
            clean[key] = "dynamic";
    });
    const sorted = Object.keys(clean)
        .sort()
        .reduce((acc, k) => {
        acc[k] = clean[k];
        return acc;
    }, {});
    return JSON.stringify(sorted);
}
// 🔥 safer key extraction
function getKeyName(key) {
    if (t.isIdentifier(key))
        return key.name;
    if (t.isStringLiteral(key))
        return key.value;
    return null;
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
// 🔥 naming
function getBaseNameFromProps(props) {
    const keys = props
        .map((p) => getKeyName(p.key))
        .filter(Boolean);
    if (keys.includes("color") || keys.includes("fontSize"))
        return "text";
    if (keys.includes("backgroundColor"))
        return "container";
    if (keys.includes("padding") || keys.includes("margin"))
        return "container";
    return "base"; // ❌ instead of "style"
}
// 🔥 dedupe + naming
function addStyle(obj, baseName, newStyles) {
    const key = normalizeStyleObject(obj);
    if (styleMap.has(key))
        return styleMap.get(key);
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
function removeDuplicateStyles(arr) {
    const seen = new Set();
    return arr.filter((item) => {
        const key = (0, generator_1.default)(item).code.replace(/\s+/g, "");
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function dedupeProperties(props) {
    const map = new Map();
    props.forEach((prop) => {
        if (!t.isObjectProperty(prop))
            return;
        let key = "";
        if (t.isIdentifier(prop.key))
            key = prop.key.name;
        else if (t.isStringLiteral(prop.key))
            key = prop.key.value;
        else
            return;
        // overwrite → last wins
        map.set(key, prop);
    });
    return Array.from(map.values());
}
function transformCode(code) {
    const ast = (0, parser_1.parse)(code, {
        sourceType: "module",
        plugins: ["jsx"],
    });
    const newStyles = {};
    let hasStyleSheetImport = false;
    let reactNativeImportPath = null;
    (0, traverse_1.default)(ast, {
        ImportDeclaration(path) {
            if (path.node.source.value === "react-native") {
                reactNativeImportPath = path;
                path.node.specifiers.forEach((spec) => {
                    if (t.isImportSpecifier(spec) &&
                        t.isIdentifier(spec.imported) &&
                        spec.imported.name === "StyleSheet") {
                        hasStyleSheetImport = true;
                    }
                });
            }
        },
        JSXAttribute(path) {
            if (path.node.name.name !== "style")
                return;
            const value = path.node.value;
            if (!t.isJSXExpressionContainer(value))
                return;
            const expr = value.expression;
            let elements = [];
            if (t.isObjectExpression(expr))
                elements = [expr];
            else if (t.isArrayExpression(expr))
                elements = expr.elements.filter(Boolean);
            else
                return;
            const finalStyles = [];
            let baseStyles = [];
            elements.forEach((el) => {
                if (t.isObjectExpression(el)) {
                    let handled = false;
                    el.properties.forEach((prop) => {
                        if (!t.isObjectProperty(prop))
                            return;
                        // 🔥 CONDITIONAL FIX (CORE FIX)
                        if (t.isConditionalExpression(prop.value)) {
                            handled = true;
                            const condition = prop.value.test;
                            const activeStyle = t.objectExpression([
                                t.objectProperty(prop.key, prop.value.consequent),
                            ]);
                            const baseName = getBaseNameFromProps([prop]);
                            const activeName = addStyle(activeStyle, `active${capitalize(baseName)}`, newStyles);
                            finalStyles.push(t.logicalExpression("&&", condition, t.memberExpression(t.identifier("styles"), t.identifier(activeName))));
                        }
                    });
                    // ✅ BASE STYLE
                    if (!handled) {
                        baseStyles.push(el);
                    }
                }
                // logical expression
                else if (t.isLogicalExpression(el) &&
                    el.operator === "&&" &&
                    t.isObjectExpression(el.right)) {
                    const name = addStyle(el.right, "conditional", newStyles);
                    finalStyles.push(t.logicalExpression("&&", el.left, t.memberExpression(t.identifier("styles"), t.identifier(name))));
                }
                else {
                    finalStyles.push(el);
                }
            });
            // 🔥 merge base styles into one
            if (baseStyles.length > 0) {
                const mergedProps = dedupeProperties(baseStyles.flatMap((b) => b.properties));
                const merged = t.objectExpression(mergedProps);
                const baseName = getBaseNameFromProps(merged.properties);
                const name = addStyle(merged, baseName, newStyles);
                finalStyles.unshift(t.memberExpression(t.identifier("styles"), t.identifier(name)));
            }
            const cleaned = removeDuplicateStyles(finalStyles);
            path.node.value = t.jsxExpressionContainer(cleaned.length === 1 ? cleaned[0] : t.arrayExpression(cleaned));
        },
    });
    // 🔥 create stylesheet
    const styleEntries = Object.entries(newStyles).map(([key, value]) => t.objectProperty(t.identifier(key), value));
    if (styleEntries.length > 0) {
        ast.program.body.push(t.variableDeclaration("const", [
            t.variableDeclarator(t.identifier("styles"), t.callExpression(t.memberExpression(t.identifier("StyleSheet"), t.identifier("create")), [t.objectExpression(styleEntries)])),
        ]));
    }
    // 🔥 import fix
    if (styleEntries.length > 0) {
        if (reactNativeImportPath) {
            if (!hasStyleSheetImport) {
                reactNativeImportPath.node.specifiers.push(t.importSpecifier(t.identifier("StyleSheet"), t.identifier("StyleSheet")));
            }
        }
        else {
            ast.program.body.unshift(t.importDeclaration([t.importSpecifier(t.identifier("StyleSheet"), t.identifier("StyleSheet"))], t.stringLiteral("react-native")));
        }
    }
    return (0, generator_1.default)(ast).code;
}
//# sourceMappingURL=transformer.js.map