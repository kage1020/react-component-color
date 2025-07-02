import * as ts from "typescript"
import * as vscode from "vscode"
import { cacheManager } from "./cache"
import { resolveImportPath } from "./resolver"
import { ComponentInfo, ImportInfo } from "./types"

/**
 * ファイルがClient Componentかどうかを判定（キャッシュ付き）
 */
export async function isFileClientComponent(
  filePath: string
): Promise<boolean> {
  const cached = cacheManager.getClientFileStatus(filePath)
  if (cached !== undefined) {
    return cached
  }

  try {
    const content = await vscode.workspace.fs.readFile(
      vscode.Uri.file(filePath)
    )
    const text = Buffer.from(content).toString("utf8")
    const hasUseClient =
      text.includes("'use client'") || text.includes('"use client"')

    cacheManager.setClientFileStatus(filePath, hasUseClient)
    return hasUseClient
  } catch {
    cacheManager.setClientFileStatus(filePath, false)
    return false
  }
}

/**
 * Import文を解析してimportされたファイルの情報を取得
 */
export async function parseImports(
  text: string,
  currentFilePath: string
): Promise<ImportInfo[]> {
  const cached = cacheManager.getImports(currentFilePath)
  if (cached) {
    return cached
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

  cacheManager.setImports(currentFilePath, imports)
  return imports
}

/**
 * React componentsを検索してComponentInfo配列を返す
 */
export async function findReactComponents(
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

/**
 * コンポーネント定義にClient専用機能が含まれているかを判定
 */
function hasClientOnlyFeatures(componentDefinition: string): boolean {
  // パフォーマンス最適化: 単一のRegExパターンで全てをチェック
  const clientOnlyPatterns = [
    // 1. イベントハンドラー
    '\\bon(?:Click|Submit|Change|Input|Focus|Blur|MouseEnter|MouseLeave|MouseDown|MouseUp|MouseMove|KeyDown|KeyUp|KeyPress|TouchStart|TouchEnd|TouchMove|Scroll|Load|Error|Resize)\\b',
    
    // 2. React hooks (React 19の`use`を含む)
    '\\b(?:useState|useEffect|useContext|useReducer|useCallback|useMemo|useRef|useImperativeHandle|useLayoutEffect|useDebugValue|useDeferredValue|useTransition|useId|useSyncExternalStore|useInsertionEffect|use)\\s*\\(',
    
    // 3. カスタムhooksパターン (use で始まる関数呼び出し)
    '\\buse[A-Z][a-zA-Z0-9]*\\s*\\(',
    
    // 4. ブラウザAPI/DOM API
    '\\b(?:window|document|localStorage|sessionStorage|navigator|location|history|alert|confirm|prompt|setTimeout|setInterval|clearTimeout|clearInterval|fetch|XMLHttpRequest)\\b'
  ]
  
  // 単一のRegExで全パターンをチェック
  const combinedPattern = new RegExp(clientOnlyPatterns.join('|'), 'g')
  return combinedPattern.test(componentDefinition)
}

/**
 * JSX内で使用されているコンポーネントがClient Componentかどうかを判定
 */
async function determineComponentTypeFromUsage(
  componentName: string,
  document: vscode.TextDocument
): Promise<boolean> {
  const text = document.getText()
  const imports = await parseImports(text, document.uri.fsPath)

  // 1. このコンポーネントがimportされているかチェック
  for (const importInfo of imports) {
    if (importInfo.importedNames.includes(componentName)) {
      // importされている場合、import元のファイルをチェック
      const isImportedFromClientComponent = await isFileClientComponent(
        importInfo.filePath
      )
      // Compositionパターン対応：importされたコンポーネントの型を優先
      return isImportedFromClientComponent
    }
  }

  // 2. importされていない場合は、同じファイル内で定義されている可能性
  const componentDefinitionRegex = new RegExp(
    `(?:function\\s+${componentName}\\s*\\(|const\\s+${componentName}\\s*=|class\\s+${componentName}\\s+extends)`,
    "g"
  )

  if (componentDefinitionRegex.test(text)) {
    // 同じファイル内で定義されている場合、まずファイルの'use client'状態をチェック
    const isFileClient = await isFileClientComponent(document.uri.fsPath)
    if (isFileClient) {
      return true
    }

    // 'use client'がない場合、コンポーネント定義内でClient専用機能を使用しているかチェック
    // シンプルなアプローチでコンポーネント定義を検索
    const lines = text.split('\n')
    let componentDefinition = ''
    let inComponent = false
    let braceCount = 0
    
    for (const line of lines) {
      // コンポーネント定義の開始を検出
      if (!inComponent && new RegExp(`(?:export\\s+)?(?:const|function)\\s+${componentName}\\s*[=(:>]`).test(line)) {
        inComponent = true
        componentDefinition = line + '\n'
        // ブレースカウントを開始
        for (const char of line) {
          if (char === '{') {
            braceCount++
          } else if (char === '}') {
            braceCount--
          }
        }
        continue
      }
      
      // コンポーネント内の場合
      if (inComponent) {
        componentDefinition += line + '\n'
        
        // ブレースをカウント
        for (const char of line) {
          if (char === '{') {
            braceCount++
          } else if (char === '}') {
            braceCount--
          }
        }
        
        // コンポーネント定義の終了
        if (braceCount <= 0) {
          break
        }
      }
    }
    
    if (componentDefinition && hasClientOnlyFeatures(componentDefinition)) {
      return true
    }
  }

  // 3. どこで定義されているかわからない場合はServer Componentとして扱う
  // （React 18のデフォルトはServer Component）
  return false
}
