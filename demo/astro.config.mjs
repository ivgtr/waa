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
          label: 'ユースケース',
          translations: { en: 'Use Cases', 'zh-CN': '使用场景' },
          items: [
            { label: 'エフェクトとフェード', translations: { en: 'Effects & Fade', 'zh-CN': '效果与淡化' }, slug: 'use-cases/effects-and-fade' },
            { label: 'ビジュアライゼーション', translations: { en: 'Visualization', 'zh-CN': '可视化' }, slug: 'use-cases/visualization' },
            { label: 'テンポ変更とリズム', translations: { en: 'Tempo & Rhythm', 'zh-CN': '节奏与韵律' }, slug: 'use-cases/tempo-and-rhythm' },
            { label: 'フレームワーク統合', translations: { en: 'Framework Integration', 'zh-CN': '框架集成' }, slug: 'use-cases/framework-integration' },
          ],
        },
        {
          label: 'デモ',
          translations: { en: 'Demos', 'zh-CN': '演示' },
          items: [
            { label: '基本再生', translations: { en: 'Basic Playback', 'zh-CN': '基本播放' }, slug: 'demos/basic-playback' },
            { label: 'エフェクトとフェード', translations: { en: 'Effects & Fade', 'zh-CN': '效果与淡化' }, slug: 'demos/effects-and-fade' },
            { label: 'ビジュアライゼーション', translations: { en: 'Visualization', 'zh-CN': '可视化' }, slug: 'demos/visualization' },
            { label: 'テンポ変更', translations: { en: 'Tempo Change', 'zh-CN': '节奏变更' }, slug: 'demos/tempo-change' },
            { label: 'React 統合', translations: { en: 'React Integration', 'zh-CN': 'React 集成' }, slug: 'demos/react-integration' },
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
