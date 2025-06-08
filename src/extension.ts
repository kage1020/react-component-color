import * as vscode from "vscode"
import { cacheManager } from "./cache"
import { decorationManager } from "./decorations"
import { findReactComponents } from "./parser"

let isEnabled = true

export function activate(context: vscode.ExtensionContext) {
  console.log("React Component Color extension is now active!")

  // 初期化
  decorationManager.updateDecorationTypes()

  // コマンドの登録
  const toggleCommand = vscode.commands.registerCommand(
    "react-component-color.toggleHighlight",
    () => {
      isEnabled = !isEnabled
      if (isEnabled) {
        updateAllActiveEditors()
        vscode.window.showInformationMessage(
          "React Component highlighting enabled"
        )
      } else {
        decorationManager.clearAllDecorations()
        vscode.window.showInformationMessage(
          "React Component highlighting disabled"
        )
      }
    }
  )

  // 設定変更の監視
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("reactComponentColor")) {
        decorationManager.updateDecorationTypes()
        if (isEnabled) {
          updateAllActiveEditors()
        }
      }
    }
  )

  // ファイル変更の監視
  const textChangeListener = vscode.workspace.onDidChangeTextDocument(
    async (event) => {
      if (isEnabled && isReactFile(event.document)) {
        // ファイルが変更された場合、そのファイルのキャッシュをクリア
        cacheManager.clearFileCache(event.document.uri.fsPath)
        await updateDecorationsForDocument(event.document)
      }
    }
  )

  // アクティブエディタ変更の監視
  const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(
    async (editor) => {
      if (isEnabled && editor && isReactFile(editor.document)) {
        await updateDecorationsForDocument(editor.document)
      }
    }
  )

  // 既存の開いているエディタを処理
  updateAllActiveEditors()

  context.subscriptions.push(
    toggleCommand,
    configChangeListener,
    textChangeListener,
    activeEditorChangeListener
  )
}

function isReactFile(document: vscode.TextDocument): boolean {
  const fileName = document.fileName.toLowerCase()
  return (
    fileName.endsWith(".jsx") ||
    fileName.endsWith(".tsx") ||
    fileName.endsWith(".js") ||
    fileName.endsWith(".ts")
  )
}

function updateAllActiveEditors() {
  vscode.window.visibleTextEditors.forEach(async (editor) => {
    if (isReactFile(editor.document)) {
      await updateDecorationsForDocument(editor.document)
    }
  })
}

async function updateDecorationsForDocument(document: vscode.TextDocument) {
  const config = vscode.workspace.getConfiguration("reactComponentColor")
  if (!config.get<boolean>("enable", true)) {
    return
  }

  const text = document.getText()
  const components = await findReactComponents(text, document)

  const serverComponents = components
    .filter((comp) => !comp.isClientComponent)
    .map((comp) => comp.range)

  const clientComponents = components
    .filter((comp) => comp.isClientComponent)
    .map((comp) => comp.range)

  // アクティブエディタに装飾を適用
  const editor = vscode.window.activeTextEditor
  if (editor && editor.document === document) {
    decorationManager.applyDecorations(editor, serverComponents, clientComponents)
  }
}

export function deactivate() {
  decorationManager.dispose()
  cacheManager.clearAll()
}
