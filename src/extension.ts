import * as vscode from "vscode";
import { transformCode } from "./transformer";

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand(
    "rn-style-refactor.refactor",
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) return;

      const document = editor.document;

      // Only JS/JSX files
      if (
        !document.fileName.endsWith(".js") &&
        !document.fileName.endsWith(".jsx")
      ) {
        vscode.window.showErrorMessage("Only JS/JSX supported");
        return;
      }

      const code = document.getText();

      if (!code.includes("style={{")) {
        vscode.window.showInformationMessage("No inline styles found");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        "Refactor inline styles?",
        "Yes",
        "No"
      );

      if (confirm !== "Yes") return;

      try {
        const newCode = transformCode(code);

        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(code.length)
        );

        edit.replace(document.uri, fullRange, newCode);

        await vscode.workspace.applyEdit(edit);

        vscode.window.showInformationMessage("Refactored successfully 🚀");
      } catch (e) {
        vscode.window.showErrorMessage("Error during refactor");
        console.error(e);
      }
    }
  );
console.log("🔥 Extension Activated Created By Mayur Dhole.");
  context.subscriptions.push(command);
}

export function deactivate() {}