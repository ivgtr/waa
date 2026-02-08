import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import path from 'node:path';

export default defineConfig({
  site: 'https://ivgtr.github.io',
  base: '/waa',
  integrations: [
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
        { label: 'デモ', translations: { en: 'Demo', 'zh-CN': '演示' }, link: '/demo' },
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
