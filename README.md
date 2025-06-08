# React Component Color

React ComponentをServer/Client Componentで色分けするVSCode拡張機能です。

## 機能

- JSX/TSXファイル内のReactコンポーネントを自動検出
- `'use client'`ディレクティブの有無でServer/Client Componentを判定
- コンポーネントを設定可能な色で視覚的に区別
- リアルタイムでの色付け更新

## 使用方法

1. 拡張機能をインストール
2. `.jsx`または`.tsx`ファイルを開く
3. Reactコンポーネントが自動的に色分けされます

### コンポーネントタイプ

- **Server Component**: `'use client'`ディレクティブがないコンポーネント（デフォルト: 緑色）
- **Client Component**: `'use client'`ディレクティブがあるファイル内のコンポーネント（デフォルト: 赤色）

## 設定

VSCodeの設定（settings.json）で以下の項目をカスタマイズできます：

```json
{
  "reactComponentColor.enable": true,
  "reactComponentColor.serverComponentColor": "#4CAF50",
  "reactComponentColor.clientComponentColor": "#FF5722",
  "reactComponentColor.highlightStyle": "background"
}
```

### 設定項目

- `reactComponentColor.enable`: 拡張機能の有効/無効
- `reactComponentColor.serverComponentColor`: Server Componentの色（16進カラーコード）
- `reactComponentColor.clientComponentColor`: Client Componentの色（16進カラーコード）
- `reactComponentColor.highlightStyle`: ハイライトスタイル（`background`, `border`, `underline`）

## コマンド

- `Toggle React Component Highlighting`: コンポーネントハイライトの切り替え

## サポートファイル

- `.jsx` - JavaScript + JSX
- `.tsx` - TypeScript + JSX
- `.js` - JavaScript（JSXを含む場合）
- `.ts` - TypeScript（JSXを含む場合）

## 検出されるコンポーネント

### 関数コンポーネント
```jsx
function MyComponent() {
  return <div>Hello</div>;
}

const AnotherComponent = () => {
  return <span>World</span>;
};
```

### クラスコンポーネント
```jsx
class MyClassComponent extends React.Component {
  render() {
    return <div>Hello Class</div>;
  }
}
```

## 要件

- Visual Studio Code ^1.100.0

## 既知の問題

- 複雑にネストされたコンポーネントの一部で検出精度が低下する場合があります
- 動的に生成されるコンポーネント名は検出されません

## リリースノート

### 0.0.1

初回リリース
- 基本的なServer/Client Component検出機能
- カスタマイズ可能な色設定
- リアルタイムハイライト更新

## 開発

### 拡張機能のテスト

1. F5を押して新しいVSCodeウィンドウを開く
2. テスト用のReactファイルを作成
3. コンポーネントが適切に色分けされることを確認

### デバッグ

- `src/extension.ts`でブレークポイントを設定
- デバッグコンソールで出力を確認

**Enjoy!**
