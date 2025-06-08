import * as JSON5 from "json5"

/**
 * JSONCファイルを解析する関数。コメントと末尾のカンマを適切に処理します。
 */
export function parseJsonc(text: string): any {
  try {
    // まずは標準的なJSON.parseを試す
    return JSON.parse(text)
  } catch (error) {
    // 失敗した場合はJSON5を使用（JSのコメントやトレーリングカンマに対応）
    try {
      return JSON5.parse(text)
    } catch (json5Error) {
      // JSON5でも失敗した場合は手動クリーニングを試す
      try {
        const cleaned = cleanJsonc(text)
        return JSON.parse(cleaned)
      } catch (cleanError) {
        console.error("Failed to parse JSONC with all methods:", {
          originalError: error,
          json5Error,
          cleanError,
        })
        // エラーの場合は空のオブジェクトを返す
        return {}
      }
    }
  }
}

/**
 * 手動でJSONCをクリーニングする関数
 */
function cleanJsonc(text: string): string {
  let result = text

  // 1. ブロックコメント（/* */）を削除
  result = result.replace(/\/\*[\s\S]*?\*\//g, "")

  // 2. 行コメント（//）を削除（文字列内は除く）
  const lines = result.split("\n")
  const cleanedLines = lines.map((line) => {
    let inString = false
    let escapeNext = false
    let stringChar = ""
    let cleanedLine = ""

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (escapeNext) {
        cleanedLine += char
        escapeNext = false
        continue
      }

      if (char === "\\" && inString) {
        cleanedLine += char
        escapeNext = true
        continue
      }

      if (!inString && (char === '"' || char === "'")) {
        inString = true
        stringChar = char
        cleanedLine += char
        continue
      }

      if (inString && char === stringChar) {
        inString = false
        stringChar = ""
        cleanedLine += char
        continue
      }

      if (!inString && char === "/" && nextChar === "/") {
        // 行コメントの開始 - 残りの行を無視
        break
      }

      cleanedLine += char
    }

    return cleanedLine.trimEnd()
  })

  result = cleanedLines.join("\n")

  // 3. 末尾のカンマを削除（より精密なパターン）
  result = result.replace(/,(\s*\n\s*[}\]])/g, "$1")
  result = result.replace(/,(\s*[}\]])/g, "$1")

  // 4. 空行の整理
  result = result.replace(/\n\s*\n/g, "\n")

  return result
}
