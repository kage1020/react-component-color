import * as vscode from "vscode"

export interface ComponentInfo {
  range: vscode.Range
  isClientComponent: boolean
  componentName: string
}

export interface ImportInfo {
  importedNames: string[]
  filePath: string
}

export interface PathMapping {
  pattern: string
  replacement: string[]
}

export interface ColorConfiguration {
  backgroundColor: string
  borderColor: string
  underlineColor: string
  textColor: string
}

export interface ComponentColors {
  server: ColorConfiguration
  client: ColorConfiguration
}
