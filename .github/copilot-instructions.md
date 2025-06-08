# Copilot Instructions

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a VS Code extension project. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references.

## Project Overview

This VSCode extension provides color coding for JSX/TSX components based on whether they are Server Components or Client Components in React applications.

## Key Features

- Detects JSX components in `.jsx` and `.tsx` files
- Identifies Client Components by the presence of `'use client'` directive
- Color codes components:
  - Server Components: one color (configurable)
  - Client Components: another color (configurable)
- User-configurable colors through VSCode settings

## Technical Implementation

- Uses VSCode's TextEditorDecorationType API for syntax highlighting
- Monitors file changes and updates decorations dynamically
- Parses JSX/TSX syntax to identify component definitions
- Provides configuration options for customizing colors
- Don't create test files
