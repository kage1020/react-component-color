import * as path from "path"
import * as vscode from "vscode"
import { cacheManager } from "./cache"
import { PathMapping } from "./types"
import { parseJsonc } from "./utils"

/**
 * Import pathを絶対パスに解決
 */
export async function resolveImportPath(
  importPath: string,
  currentFilePath: string
): Promise<string | null> {
  if (importPath.startsWith(".")) {
    // 相対パス
    const currentDir = path.dirname(currentFilePath)
    const resolvedPath = path.resolve(currentDir, importPath)
    return await resolveFilePath(resolvedPath)
  }

  // エイリアスパス（@/, ~/ など）を解決
  return await resolveAliasPath(importPath, currentFilePath)
}

/**
 * 現在のファイルに最も近いtsconfig.jsonを探す
 */
export async function findNearestTsConfig(
  currentFilePath: string
): Promise<string | null> {
  let currentDir = path.dirname(currentFilePath)
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(currentFilePath)
  )

  if (!workspaceFolder) {
    return null
  }

  const workspaceRoot = workspaceFolder.uri.fsPath

  // 現在のディレクトリからワークスペースルートまで遡って tsconfig.json を探す
  while (currentDir.startsWith(workspaceRoot) || currentDir === workspaceRoot) {
    const tsconfigPath = path.join(currentDir, "tsconfig.json")

    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(tsconfigPath))
      return tsconfigPath
    } catch {
      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) {
        break
      }
      currentDir = parentDir
    }
  }

  return null
}

/**
 * tsconfig.jsonからパスマッピングを取得
 */
export async function getPathMappings(
  currentFilePath: string
): Promise<PathMapping[]> {
  const tsconfigPath = await findNearestTsConfig(currentFilePath)

  if (!tsconfigPath) {
    return getDefaultAliases(currentFilePath)
  }

  // キャッシュチェック
  const cached = cacheManager.getPathMappings(tsconfigPath)
  if (cached) {
    return cached
  }

  const pathMappings: PathMapping[] = []

  try {
    const tsconfigContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(tsconfigPath)
    )
    const tsconfigText = Buffer.from(tsconfigContent).toString("utf8")
    const tsconfig = parseJsonc(tsconfigText)

    if (tsconfig.compilerOptions?.paths) {
      const baseUrl = tsconfig.compilerOptions.baseUrl || "."
      const tsconfigDir = path.dirname(tsconfigPath)
      const basePath = path.resolve(tsconfigDir, baseUrl)

      for (const [pattern, replacements] of Object.entries(
        tsconfig.compilerOptions.paths
      )) {
        if (Array.isArray(replacements)) {
          const resolvedReplacements = replacements.map((replacement: string) =>
            path.resolve(basePath, replacement)
          )
          pathMappings.push({
            pattern,
            replacement: resolvedReplacements,
          })
        }
      }
    }

    // extendsがある場合は親のtsconfig.jsonも読み込む
    if (tsconfig.extends) {
      const parentMappings = await getParentPathMappings(
        tsconfig.extends,
        tsconfigPath
      )
      pathMappings.unshift(...parentMappings)
    }
  } catch (error) {
    console.warn(`Failed to parse tsconfig.json at ${tsconfigPath}:`, error)
  }

  // デフォルトのエイリアスパターンも追加
  const defaultAliases = getDefaultAliases(currentFilePath)
  for (const alias of defaultAliases) {
    if (!pathMappings.some((mapping) => mapping.pattern === alias.pattern)) {
      pathMappings.push(alias)
    }
  }

  cacheManager.setPathMappings(tsconfigPath, pathMappings)
  return pathMappings
}

/**
 * 親のtsconfig.jsonからパスマッピングを取得
 */
async function getParentPathMappings(
  extendsPath: string,
  currentTsconfigPath: string
): Promise<PathMapping[]> {
  try {
    const currentTsconfigDir = path.dirname(currentTsconfigPath)
    const parentTsconfigPath = path.resolve(currentTsconfigDir, extendsPath)
    const resolvedParentPath = parentTsconfigPath.endsWith(".json")
      ? parentTsconfigPath
      : parentTsconfigPath + ".json"

    const parentContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(resolvedParentPath)
    )
    const parentText = Buffer.from(parentContent).toString("utf8")
    const parentTsconfig = parseJsonc(parentText)

    const pathMappings: PathMapping[] = []

    if (parentTsconfig.compilerOptions?.paths) {
      const baseUrl = parentTsconfig.compilerOptions.baseUrl || "."
      const parentDir = path.dirname(resolvedParentPath)
      const basePath = path.resolve(parentDir, baseUrl)

      for (const [pattern, replacements] of Object.entries(
        parentTsconfig.compilerOptions.paths
      )) {
        if (Array.isArray(replacements)) {
          const resolvedReplacements = replacements.map((replacement: string) =>
            path.resolve(basePath, replacement)
          )
          pathMappings.push({
            pattern,
            replacement: resolvedReplacements,
          })
        }
      }
    }

    // 再帰的に親のextendsも処理
    if (parentTsconfig.extends) {
      const grandParentMappings = await getParentPathMappings(
        parentTsconfig.extends,
        resolvedParentPath
      )
      pathMappings.unshift(...grandParentMappings)
    }

    return pathMappings
  } catch (error) {
    console.warn(`Failed to parse parent tsconfig.json: ${extendsPath}`, error)
    return []
  }
}

/**
 * デフォルトのエイリアスパターンを取得
 */
function getDefaultAliases(currentFilePath: string): PathMapping[] {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(currentFilePath)
  )

  if (!workspaceFolder) {
    return []
  }

  const workspacePath = workspaceFolder.uri.fsPath

  return [
    { pattern: "@/*", replacement: [path.join(workspacePath, "src", "*")] },
    { pattern: "~/*", replacement: [path.join(workspacePath, "*")] },
    {
      pattern: "components/*",
      replacement: [path.join(workspacePath, "src", "components", "*")],
    },
    {
      pattern: "lib/*",
      replacement: [path.join(workspacePath, "src", "lib", "*")],
    },
    {
      pattern: "utils/*",
      replacement: [path.join(workspacePath, "src", "utils", "*")],
    },
  ]
}

/**
 * エイリアスパスを実際のパスに解決
 */
async function resolveAliasPath(
  importPath: string,
  currentFilePath: string
): Promise<string | null> {
  const pathMappings = await getPathMappings(currentFilePath)

  for (const mapping of pathMappings) {
    const pattern = mapping.pattern.replace(/\*/g, "(.*)")
    const regex = new RegExp(`^${pattern}$`)
    const match = importPath.match(regex)

    if (match) {
      for (const replacement of mapping.replacement) {
        let resolvedPath = replacement

        if (match[1] !== undefined) {
          resolvedPath = replacement.replace(/\*/g, match[1])
        }

        const foundPath = await resolveFilePath(resolvedPath)
        if (foundPath) {
          return foundPath
        }
      }
    }
  }

  return null
}

/**
 * ファイルパスを解決（拡張子補完やindex.js解決を含む）
 */
export async function resolveFilePath(
  basePath: string
): Promise<string | null> {
  const extensions = [".tsx", ".ts", ".jsx", ".js"]

  // 1. 完全なファイルパスとして試す
  for (const ext of extensions) {
    const fullPath = basePath + ext
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fullPath))
      if (stat.type === vscode.FileType.File) {
        return fullPath
      }
    } catch {
      continue
    }
  }

  // 2. 拡張子なしでファイルとして試す
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(basePath))
    if (stat.type === vscode.FileType.File) {
      return basePath
    }
  } catch {
    // ファイルが存在しない
  }

  // 3. ディレクトリとして扱い、index.js系を探す
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(basePath))
    if (stat.type === vscode.FileType.Directory) {
      const indexFiles = ["index.tsx", "index.ts", "index.jsx", "index.js"]

      for (const indexFile of indexFiles) {
        const indexPath = path.join(basePath, indexFile)
        try {
          const indexStat = await vscode.workspace.fs.stat(
            vscode.Uri.file(indexPath)
          )
          if (indexStat.type === vscode.FileType.File) {
            return indexPath
          }
        } catch {
          continue
        }
      }
    }
  } catch {
    // ディレクトリが存在しない
  }

  return null
}
