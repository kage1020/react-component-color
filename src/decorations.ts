import * as vscode from "vscode"
import { ColorConfiguration, ComponentColors } from "./types"

class DecorationManager {
  private serverComponentDecorationType?: vscode.TextEditorDecorationType
  private clientComponentDecorationType?: vscode.TextEditorDecorationType

  /**
   * 設定から色情報を取得
   */
  private getColorsFromConfig(): ComponentColors {
    const config = vscode.workspace.getConfiguration("reactComponentColor")

    return {
      server: {
        backgroundColor: config.get<string>(
          "serverComponent.backgroundColor",
          ""
        ),
        borderColor: config.get<string>("serverComponent.borderColor", ""),
        underlineColor: config.get<string>(
          "serverComponent.underlineColor",
          ""
        ),
        textColor: config.get<string>("serverComponent.textColor", "#4CAF50"),
      },
      client: {
        backgroundColor: config.get<string>(
          "clientComponent.backgroundColor",
          ""
        ),
        borderColor: config.get<string>("clientComponent.borderColor", ""),
        underlineColor: config.get<string>(
          "clientComponent.underlineColor",
          ""
        ),
        textColor: config.get<string>("clientComponent.textColor", "#FF5722"),
      },
    }
  }

  /**
   * デコレーションオプションを作成
   */
  private createDecorationOptions(
    colors: ColorConfiguration
  ): vscode.DecorationRenderOptions {
    const options: vscode.DecorationRenderOptions = {}

    if (colors.backgroundColor) {
      options.backgroundColor = colors.backgroundColor + "30" // 透明度30%
    }

    if (colors.borderColor) {
      options.border = `2px solid ${colors.borderColor}`
      options.borderRadius = "3px"
    }

    if (colors.underlineColor) {
      options.textDecoration = `underline; text-decoration-color: ${colors.underlineColor}; text-decoration-thickness: 2px;`
    }

    if (colors.textColor) {
      options.color = colors.textColor
    }

    return options
  }

  /**
   * デコレーションタイプを更新
   */
  updateDecorationTypes(): void {
    // 既存のデコレーションタイプを破棄
    this.dispose()

    const colors = this.getColorsFromConfig()

    // 新しいデコレーションタイプを作成
    this.serverComponentDecorationType =
      vscode.window.createTextEditorDecorationType(
        this.createDecorationOptions(colors.server)
      )

    this.clientComponentDecorationType =
      vscode.window.createTextEditorDecorationType(
        this.createDecorationOptions(colors.client)
      )
  }

  /**
   * デコレーションを適用
   */
  applyDecorations(
    editor: vscode.TextEditor,
    serverRanges: vscode.Range[],
    clientRanges: vscode.Range[]
  ): void {
    if (
      this.serverComponentDecorationType &&
      this.clientComponentDecorationType
    ) {
      editor.setDecorations(this.serverComponentDecorationType, serverRanges)
      editor.setDecorations(this.clientComponentDecorationType, clientRanges)
    }
  }

  /**
   * 全てのデコレーションをクリア
   */
  clearAllDecorations(): void {
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (
        this.serverComponentDecorationType &&
        this.clientComponentDecorationType
      ) {
        editor.setDecorations(this.serverComponentDecorationType, [])
        editor.setDecorations(this.clientComponentDecorationType, [])
      }
    })
  }

  /**
   * デコレーションタイプを破棄
   */
  dispose(): void {
    if (this.serverComponentDecorationType) {
      this.serverComponentDecorationType.dispose()
      this.serverComponentDecorationType = undefined
    }
    if (this.clientComponentDecorationType) {
      this.clientComponentDecorationType.dispose()
      this.clientComponentDecorationType = undefined
    }
  }
}

export const decorationManager = new DecorationManager()
