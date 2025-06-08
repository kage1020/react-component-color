import { ImportInfo, PathMapping } from "./types"

class CacheManager {
  private clientFileCache = new Map<string, boolean>()
  private importCache = new Map<string, ImportInfo[]>()
  private pathMappingCache = new Map<string, PathMapping[]>()

  // Client Component ファイルキャッシュ
  getClientFileStatus(filePath: string): boolean | undefined {
    return this.clientFileCache.get(filePath)
  }

  setClientFileStatus(filePath: string, isClient: boolean): void {
    this.clientFileCache.set(filePath, isClient)
  }

  // Import情報キャッシュ
  getImports(filePath: string): ImportInfo[] | undefined {
    return this.importCache.get(filePath)
  }

  setImports(filePath: string, imports: ImportInfo[]): void {
    this.importCache.set(filePath, imports)
  }

  // パスマッピングキャッシュ
  getPathMappings(tsconfigPath: string): PathMapping[] | undefined {
    return this.pathMappingCache.get(tsconfigPath)
  }

  setPathMappings(tsconfigPath: string, mappings: PathMapping[]): void {
    this.pathMappingCache.set(tsconfigPath, mappings)
  }

  // 全キャッシュクリア
  clearAll(): void {
    this.clientFileCache.clear()
    this.importCache.clear()
    this.pathMappingCache.clear()
  }

  // 特定ファイルのキャッシュクリア
  clearFileCache(filePath: string): void {
    this.clientFileCache.delete(filePath)
    this.importCache.delete(filePath)
  }
}

export const cacheManager = new CacheManager()
