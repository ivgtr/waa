import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import path from 'node:path';

export default defineConfig({
  site: 'https://ivgtr.github.io',
  base: '/waa',
  integrations: [
    react(),
    starlight({
      title: 'waa-play',
      social: {
        github: 'https://github.com/ivgtr/waa',
      },
      customCss: ['./src/styles/custom.css'],
      defaultLocale: 'root',
      locales: {
        root: { label: '日本語', lang: 'ja' },
        en: { label: 'English', lang: 'en' },
        'zh-cn': { label: '简体中文', lang: 'zh-CN' },
      },
      sidebar: [
        {
          label: 'ガイド',
          translations: { en: 'Guide', 'zh-CN': '指南' },
          items: [
            { label: 'はじめに', translations: { en: 'Getting Started', 'zh-CN': '快速开始' }, slug: 'guide/getting-started' },
            { label: 'コアコンセプト', translations: { en: 'Core Concepts', 'zh-CN': '核心概念' }, slug: 'guide/core-concepts' },
            { label: 'Stretcher Engine', translations: { en: 'Stretcher Engine', 'zh-CN': 'Stretcher Engine' }, slug: 'guide/stretcher-engine' },
            { label: 'Chunk Buffering', translations: { en: 'Chunk Buffering', 'zh-CN': 'Chunk Buffering' }, slug: 'guide/chunk-buffering' },
            { label: 'Status Management', translations: { en: 'Status Management', 'zh-CN': 'Status Management' }, slug: 'guide/status-management' },
          ],
        },
        {
          label: 'API リファレンス',
          translations: { en: 'API Reference', 'zh-CN': 'API 参考' },
          items: [
            { label: 'WaaPlayer', slug: 'api/player' },
            { label: '関数 API', translations: { en: 'Function API', 'zh-CN': '函数 API' }, slug: 'api/functions' },
            { label: 'Stretcher', slug: 'api/stretcher' },
          ],
        },
        {
          label: 'ユースケースと例',
          translations: { en: 'Use Cases & Demos', 'zh-CN': '使用场景与演示' },
          items: [
            { label: '基本再生', translations: { en: 'Basic Playback', 'zh-CN': '基本播放' }, slug: 'examples/basic-playback' },
            { label: 'エフェクトとフェード', translations: { en: 'Effects & Fade', 'zh-CN': '效果与淡化' }, slug: 'examples/effects-and-fade' },
            { label: 'ビジュアライゼーション', translations: { en: 'Visualization', 'zh-CN': '可视化' }, slug: 'examples/visualization' },
            { label: 'テンポ変更', translations: { en: 'Tempo Change', 'zh-CN': '节奏变更' }, slug: 'examples/tempo-change' },
            { label: 'フレームワーク統合', translations: { en: 'Framework Integration', 'zh-CN': '框架集成' }, slug: 'examples/framework-integration' },
          ],
        },
      ],
    }),
  ],
  vite: {
    resolve: {
      alias: {
        waa: path.resolve(import.meta.dirname, '../src'),
      },
    },
  },
});
