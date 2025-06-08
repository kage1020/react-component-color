import * as JSON5 from "json5"
import * as path from "path"
import * as ts from "typescript"
import * as vscode from "vscode"

/**
 * JSONCファイルを解析する関数。コメントと末尾のカンマを適切に処理します。
 */
function parseJsonc(text: string): any {
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
  // 複数行にわたる場合も考慮
  result = result.replace(/,(\s*\n\s*[}\]])/g, "$1")
  result = result.replace(/,(\s*[}\]])/g, "$1")

  // 4. 空行の整理
  result = result.replace(/\n\s*\n/g, "\n")

  return result
}

interface ComponentInfo {
  range: vscode.Range
  isClientComponent: boolean
  componentName: string
}

interface ImportInfo {
  importedNames: string[]
  filePath: string
}

interface PathMapping {
  pattern: string
  replacement: string[]
}

// ファイルの'use client'状態をキャッシュ
const clientFileCache = new Map<string, boolean>()
// importの解析結果をキャッシュ
const importCache = new Map<string, ImportInfo[]>()
// tsconfig.jsonのパスマッピングをキャッシュ
const pathMappingCache = new Map<string, PathMapping[]>()

let serverComponentDecorationType: vscode.TextEditorDecorationType
let clientComponentDecorationType: vscode.TextEditorDecorationType
let isEnabled = true

export function activate(context: vscode.ExtensionContext) {
  console.log("React Component Color extension is now active!")

  // 初期化
  updateDecorationTypes()

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
        clearAllDecorations()
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
        updateDecorationTypes()
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

function updateDecorationTypes() {
  const config = vscode.workspace.getConfiguration("reactComponentColor")

  // Server Component の色設定を取得
  const serverBgColor = config.get<string>(
    "serverComponent.backgroundColor",
    ""
  )
  const serverBorderColor = config.get<string>(
    "serverComponent.borderColor",
    ""
  )
  const serverUnderlineColor = config.get<string>(
    "serverComponent.underlineColor",
    ""
  )
  const serverTextColor = config.get<string>(
    "serverComponent.textColor",
    "#4EC9B0"
  )

  // Client Component の色設定を取得
  const clientBgColor = config.get<string>(
    "clientComponent.backgroundColor",
    ""
  )
  const clientBorderColor = config.get<string>(
    "clientComponent.borderColor",
    ""
  )
  const clientUnderlineColor = config.get<string>(
    "clientComponent.underlineColor",
    ""
  )
  const clientTextColor = config.get<string>(
    "clientComponent.textColor",
    "#FF719B"
  )

  // 既存のデコレーションタイプを破棄
  if (serverComponentDecorationType) {
    serverComponentDecorationType.dispose()
  }
  if (clientComponentDecorationType) {
    clientComponentDecorationType.dispose()
  }

  // デコレーションオプションを作成する関数
  const createDecorationOptions = (
    bgColor: string,
    borderColor: string,
    underlineColor: string,
    textColor: string
  ): vscode.DecorationRenderOptions => {
    const options: vscode.DecorationRenderOptions = {}

    // 背景色
    if (bgColor) {
      options.backgroundColor = bgColor + "30" // 透明度30%
    }

    // ボーダー色
    if (borderColor) {
      options.border = `2px solid ${borderColor}`
      options.borderRadius = "3px"
    }

    // アンダーライン色
    if (underlineColor) {
      options.textDecoration = `underline; text-decoration-color: ${underlineColor}; text-decoration-thickness: 2px;`
    }

    // テキスト色
    if (textColor) {
      options.color = textColor
    }

    return options
  }

  // 新しいデコレーションタイプを作成
  serverComponentDecorationType = vscode.window.createTextEditorDecorationType(
    createDecorationOptions(
      serverBgColor,
      serverBorderColor,
      serverUnderlineColor,
      serverTextColor
    )
  )

  clientComponentDecorationType = vscode.window.createTextEditorDecorationType(
    createDecorationOptions(
      clientBgColor,
      clientBorderColor,
      clientUnderlineColor,
      clientTextColor
    )
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

function clearAllDecorations() {
  vscode.window.visibleTextEditors.forEach((editor) => {
    editor.setDecorations(serverComponentDecorationType, [])
    editor.setDecorations(clientComponentDecorationType, [])
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
    editor.setDecorations(serverComponentDecorationType, serverComponents)
    editor.setDecorations(clientComponentDecorationType, clientComponents)
  }
}

async function findReactComponents(
  text: string,
  document: vscode.TextDocument
): Promise<ComponentInfo[]> {
  const componentInfos: Array<{
    fullComponentName: string
    baseComponentName: string
    range: vscode.Range
  }> = []

  // TypeScript ASTを作成
  const sourceFile = ts.createSourceFile(
    document.fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    document.fileName.endsWith(".tsx") || document.fileName.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS
  )

  // ASTを走査してJSXエレメントを検出
  function visit(node: ts.Node) {
    // JSX開始エレメント (<Component> または <Component />)
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName
      if (ts.isIdentifier(tagName) || ts.isPropertyAccessExpression(tagName)) {
        const componentName = getComponentName(tagName)
        if (componentName && /^[A-Z]/.test(componentName)) {
          addComponentInfo(node, componentName, tagName)
        }
      }
    }

    // JSX閉じエレメント (</Component>)
    if (ts.isJsxClosingElement(node)) {
      const tagName = node.tagName
      if (ts.isIdentifier(tagName) || ts.isPropertyAccessExpression(tagName)) {
        const componentName = getComponentName(tagName)
        if (componentName && /^[A-Z]/.test(componentName)) {
          addComponentInfo(node, componentName, tagName)
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  // コンポーネント名を取得
  function getComponentName(tagName: ts.JsxTagNameExpression): string {
    if (ts.isIdentifier(tagName)) {
      return tagName.text
    }
    if (ts.isPropertyAccessExpression(tagName)) {
      return tagName.getText(sourceFile)
    }
    return ""
  }

  // コンポーネント情報を収集（同期）
  function addComponentInfo(
    node: ts.Node,
    fullComponentName: string,
    tagNameNode: ts.JsxTagNameExpression
  ) {
    const baseComponentName = fullComponentName.split(".")[0]
    const start = tagNameNode.getStart(sourceFile)
    const end = tagNameNode.getEnd()

    const startPos = document.positionAt(start)
    const endPos = document.positionAt(end)

    componentInfos.push({
      fullComponentName,
      baseComponentName,
      range: new vscode.Range(startPos, endPos),
    })
  }

  // AST走査を開始
  visit(sourceFile)

  // 非同期でコンポーネントタイプを判定
  const components: ComponentInfo[] = await Promise.all(
    componentInfos.map(async (info) => {
      const componentIsClientComponent = await determineComponentTypeFromUsage(
        info.baseComponentName,
        document
      )

      return {
        range: info.range,
        isClientComponent: componentIsClientComponent,
        componentName: info.fullComponentName,
      }
    })
  )

  return components
}

// ファイルがClient Componentかどうかを判定（キャッシュ付き）
async function isFileClientComponent(filePath: string): Promise<boolean> {
  if (clientFileCache.has(filePath)) {
    return clientFileCache.get(filePath)!
  }

  try {
    const content = await vscode.workspace.fs.readFile(
      vscode.Uri.file(filePath)
    )
    const text = Buffer.from(content).toString("utf8")
    const hasUseClient =
      text.includes("'use client'") || text.includes('"use client"')

    clientFileCache.set(filePath, hasUseClient)
    return hasUseClient
  } catch {
    clientFileCache.set(filePath, false)
    return false
  }
}

// Import文を解析してimportされたファイルの情報を取得
async function parseImports(
  text: string,
  currentFilePath: string
): Promise<ImportInfo[]> {
  if (importCache.has(currentFilePath)) {
    return importCache.get(currentFilePath)!
  }

  const imports: ImportInfo[] = []

  // 様々なimport文のパターンをマッチ
  const importRegexes = [
    // import { Component } from './path'
    /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g,
    // import Component from './path'
    /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s*['"]([^'"]+)['"]/g,
    // import * as Components from './path'
    /import\s*\*\s*as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s*['"]([^'"]+)['"]/g,
  ]

  for (const regex of importRegexes) {
    let match
    while ((match = regex.exec(text)) !== null) {
      const importPath = match[2]
      const resolvedPath = await resolveImportPath(importPath, currentFilePath)

      if (resolvedPath) {
        let importedNames: string[] = []

        if (regex.source.includes("\\{")) {
          // Named imports: { Component1, Component2 }
          importedNames = match[1]
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
        } else if (regex.source.includes("\\*")) {
          // Namespace import: * as Components
          importedNames = [match[1]]
        } else {
          // Default import: Component
          importedNames = [match[1]]
        }

        imports.push({
          importedNames,
          filePath: resolvedPath,
        })
      }
    }
  }

  importCache.set(currentFilePath, imports)
  return imports
}

// Import pathを絶対パスに解決
async function resolveImportPath(
  importPath: string,
  currentFilePath: string
): Promise<string | null> {
  if (importPath.startsWith(".")) {
    // 相対パス
    const currentDir = path.dirname(currentFilePath)
    const resolvedPath = path.resolve(currentDir, importPath)

    // ファイルまたはディレクトリの存在確認
    const foundPath = await resolveFilePath(resolvedPath)
    if (foundPath) {
      return foundPath
    }

    return null
  }

  // エイリアスパス（@/, ~/ など）を解決
  const aliasResolved = await resolveAliasPath(importPath, currentFilePath)
  if (aliasResolved) {
    return aliasResolved
  }

  // node_modules等の外部パッケージは現在対象外
  return null
}

// 現在のファイルに最も近いtsconfig.jsonを探す
async function findNearestTsConfig(
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
      // ファイルが存在しない場合は親ディレクトリに移動
      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) {
        // ルートディレクトリに達した場合は終了
        break
      }
      currentDir = parentDir
    }
  }

  return null
}

// tsconfig.jsonからパスマッピングを取得
async function getPathMappings(
  currentFilePath: string
): Promise<PathMapping[]> {
  // 最も近いtsconfig.jsonを探す
  const tsconfigPath = await findNearestTsConfig(currentFilePath)

  if (!tsconfigPath) {
    // tsconfig.jsonが見つからない場合はデフォルトのエイリアスのみ返す
    return getDefaultAliases(currentFilePath)
  }

  // キャッシュキーとしてtsconfig.jsonのパスを使用
  if (pathMappingCache.has(tsconfigPath)) {
    return pathMappingCache.get(tsconfigPath)!
  }

  const pathMappings: PathMapping[] = []

  try {
    const tsconfigContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(tsconfigPath)
    )
    const tsconfigText = Buffer.from(tsconfigContent).toString("utf8")

    // JSONをパース（コメントを除去）
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
      // 親の設定を先に追加（子の設定で上書き可能にするため）
      pathMappings.unshift(...parentMappings)
    }
  } catch (error) {
    console.warn(`Failed to parse tsconfig.json at ${tsconfigPath}:`, error)
  }

  // デフォルトのエイリアスパターンも追加
  const defaultAliases = getDefaultAliases(currentFilePath)

  // 既に設定されていないエイリアスのみ追加
  for (const alias of defaultAliases) {
    if (!pathMappings.some((mapping) => mapping.pattern === alias.pattern)) {
      pathMappings.push(alias)
    }
  }

  pathMappingCache.set(tsconfigPath, pathMappings)
  return pathMappings
}

// 親のtsconfig.jsonからパスマッピングを取得
async function getParentPathMappings(
  extendsPath: string,
  currentTsconfigPath: string
): Promise<PathMapping[]> {
  try {
    const currentTsconfigDir = path.dirname(currentTsconfigPath)
    const parentTsconfigPath = path.resolve(currentTsconfigDir, extendsPath)

    // .jsonが省略されている場合は追加
    const resolvedParentPath = parentTsconfigPath.endsWith(".json")
      ? parentTsconfigPath
      : parentTsconfigPath + ".json"

    const parentContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(resolvedParentPath)
    )
    const parentText = Buffer.from(parentContent).toString("utf8")

    // より包括的なJSONC（JSON with Comments）の解析
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

    // 親もextendsがある場合は再帰的に処理
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

// デフォルトのエイリアスパターンを取得
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

// エイリアスパスを実際のパスに解決
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

        // パターンの * を実際の値に置換
        if (match[1] !== undefined) {
          resolvedPath = replacement.replace(/\*/g, match[1])
        }

        // ファイルまたはディレクトリの存在確認
        const foundPath = await resolveFilePath(resolvedPath)
        if (foundPath) {
          return foundPath
        }
      }
    }
  }

  return null
}

// ファイルパスを解決（拡張子補完やindex.js解決を含む）
async function resolveFilePath(basePath: string): Promise<string | null> {
  // 拡張子が省略されている場合は推測
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
      // ファイルが存在しない場合は次の拡張子を試す
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
          // indexファイルが存在しない場合は次を試す
          continue
        }
      }
    }
  } catch {
    // ディレクトリが存在しない
  }

  return null
}

// JSX内で使用されているコンポーネントがClient Componentかどうかを判定
async function determineComponentTypeFromUsage(
  componentName: string,
  document: vscode.TextDocument
): Promise<boolean> {
  const text = document.getText()
  const imports = await parseImports(text, document.uri.fsPath)

  // 1. まず、このコンポーネントがimportされているかチェック
  for (const importInfo of imports) {
    if (importInfo.importedNames.includes(componentName)) {
      // importされている場合、import元のファイルをチェック
      const isImportedFromClientComponent = await isFileClientComponent(
        importInfo.filePath
      )
      // Compositionパターン対応：importされたコンポーネントの型を優先
      // Client ComponentファイルでもServer Componentをimportして使用できる
      return isImportedFromClientComponent
    }
  }

  // 2. importされていない場合は、同じファイル内で定義されている可能性
  // 同じファイル内でのコンポーネント定義をチェック
  const componentDefinitionRegex = new RegExp(
    `(?:function\\s+${componentName}\\s*\\(|const\\s+${componentName}\\s*=|class\\s+${componentName}\\s+extends)`,
    "g"
  )

  if (componentDefinitionRegex.test(text)) {
    // 同じファイル内で定義されている場合、そのファイルの'use client'状態に従う
    const isCurrentFileClientComponent = await isFileClientComponent(
      document.uri.fsPath
    )
    return isCurrentFileClientComponent
  }

  // 3. どこで定義されているかわからない場合はServer Componentとして扱う
  // （React 18のデフォルトはServer Component）
  return false
}

// コンポーネントがClient Componentかどうかを判定（import chain含む）- 旧関数（削除予定）
async function determineComponentType(
  componentName: string,
  document: vscode.TextDocument,
  isCurrentFileClientComponent: boolean
): Promise<boolean> {
  // 現在のファイルが既にClient Componentなら、そのファイル内のコンポーネントもClient Component
  if (isCurrentFileClientComponent) {
    return true
  }

  const text = document.getText()
  const imports = await parseImports(text, document.uri.fsPath)

  // このコンポーネントがimportされているかチェック
  for (const importInfo of imports) {
    if (importInfo.importedNames.includes(componentName)) {
      // importされている場合、import元のファイルをチェック
      const isImportedFromClientComponent = await isFileClientComponent(
        importInfo.filePath
      )
      if (isImportedFromClientComponent) {
        return true
      }
    }
  }

  // importされていない、または全てのimport元がServer Componentの場合
  return false
}

// キャッシュをクリア
function clearCaches() {
  clientFileCache.clear()
  importCache.clear()
  pathMappingCache.clear()
}

export function deactivate() {
  if (serverComponentDecorationType) {
    serverComponentDecorationType.dispose()
  }
  if (clientComponentDecorationType) {
    clientComponentDecorationType.dispose()
  }
}
