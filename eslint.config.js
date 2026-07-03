// ESLint flat config (ESLint v9)
// 目的: app.js の「未定義参照バグ」（no-undef / react/jsx-no-undef）を静的検出する。
// app.js は CDN UMD + Babel Standalone のビルドレス構成（import/export なし・グローバルスクリプト）。
// このファイルは CI の静的検査専用であり、配信物（app.js / index.html）のランタイムには一切影響しない。

const babelParser = require("@babel/eslint-parser");
const reactPlugin = require("eslint-plugin-react");

module.exports = [
  {
    files: ["app.js"],
    languageOptions: {
      // app.js は import/export を使わないグローバルスクリプト
      sourceType: "script",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-react"],
        },
      },
      globals: {
        // --- CDN で読み込まれるグローバル ---
        React: "readonly",
        ReactDOM: "readonly",
        firebase: "readonly",
        ExcelJS: "readonly",
        html2canvas: "readonly",
        jspdf: "readonly",
        jsPDF: "readonly",
        posthog: "readonly",
        gtag: "readonly",
        dataLayer: "readonly",
        // --- ブラウザ標準グローバル ---
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        history: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        Blob: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        Image: "readonly",
        atob: "readonly",
        btoa: "readonly",
        crypto: "readonly",
        performance: "readonly",
        screen: "readonly",
        getComputedStyle: "readonly",
        CSS: "readonly",
        matchMedia: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        structuredClone: "readonly",
        queueMicrotask: "readonly",
      },
    },
    plugins: {
      react: reactPlugin,
    },
    settings: {
      react: {
        version: "18",
      },
    },
    rules: {
      // --- 本命: 未定義参照の検出 ---
      "no-undef": "error",
      "react/jsx-no-undef": "error",
      // --- デッドコードが既知で存在するため error にはしない ---
      "no-unused-vars": "warn",
    },
  },
];
