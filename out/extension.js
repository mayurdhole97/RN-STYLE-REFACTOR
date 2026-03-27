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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const transformer_1 = require("./transformer");
function activate(context) {
    const command = vscode.commands.registerCommand("rn-style-refactor.refactor", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const document = editor.document;
        // Only JS/JSX files
        if (!document.fileName.endsWith(".js") &&
            !document.fileName.endsWith(".jsx")) {
            vscode.window.showErrorMessage("Only JS/JSX supported");
            return;
        }
        const code = document.getText();
        if (!code.includes("style={{")) {
            vscode.window.showInformationMessage("No inline styles found");
            return;
        }
        const confirm = await vscode.window.showWarningMessage("Refactor inline styles?", "Yes", "No");
        if (confirm !== "Yes")
            return;
        try {
            const newCode = (0, transformer_1.transformCode)(code);
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(code.length));
            edit.replace(document.uri, fullRange, newCode);
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage("Refactored successfully 🚀");
        }
        catch (e) {
            vscode.window.showErrorMessage("Error during refactor");
            console.error(e);
        }
    });
    console.log("🔥 Extension Activated Created By Mayur Dhole.");
    context.subscriptions.push(command);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map