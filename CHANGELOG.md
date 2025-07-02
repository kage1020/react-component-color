# Change Log

All notable changes to the "react-component-color" extension will be documented in this file.

## [1.0.2] - 2025-07-02

### Added

- React hooks detection for client components (including React 19 `use` hook)
- Custom hook pattern detection (hooks starting with "use")
- Enhanced client-only feature detection for improved accuracy

### Fixed

- Fixed unexpected server component colorization for components with client-only features
- Components with event handlers, React hooks, or browser APIs are now correctly identified as client components

## [1.0.1] - 2025-06-09

### Fixed

- Updated extension icon

## [1.0.0] - 2025-06-09

### Added

- Initial release of React Component Color extension
- Server/Client Component detection and visual color coding
- Support for JSX/TSX files (.jsx, .tsx, .js, .ts)
- Smart import chain analysis for component type determination
- TypeScript path mapping support (@/, ~/, custom aliases)
- Configurable color settings for background, border, underline, and text
- Real-time color updates as code changes
- Performance-optimized caching system
- Toggle command for enabling/disabling highlighting
- Support for various import patterns (named, default, namespace)
- Automatic index file resolution
- Configuration validation and error handling

### Features

- Visual distinction between Server Components (default: teal) and Client Components (default: pink)
- Intelligent AST-based component parsing using TypeScript compiler API
- Follows 'use client' directive detection across file boundaries
- Respects tsconfig.json path mappings and extends configurations
- Memory-efficient caching for imports, file status, and path mappings
- Command palette integration for easy toggling

### Requirements

- VS Code 1.100.0 or higher
- Compatible with React 18+ Server/Client Component patterns

### Technical Details

- Modular architecture with separated concerns (parser, cache, decorations, resolver)
- TypeScript implementation with strict type checking
- ESBuild-based bundling for optimal performance
- Comprehensive error handling and graceful degradationLog

All notable changes to the "react-component-color" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release
