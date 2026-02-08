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
      sidebar: [
        {
          label: 'Guide',
          items: [
            { label: 'Getting Started', slug: 'guide/getting-started' },
            { label: 'Core Concepts', slug: 'guide/core-concepts' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'Overview', slug: 'api' },
            { label: 'WaaPlayer', slug: 'api/player' },
            { label: 'context', slug: 'api/context' },
            { label: 'buffer', slug: 'api/buffer' },
            { label: 'play', slug: 'api/play' },
            { label: 'emitter', slug: 'api/emitter' },
            { label: 'nodes', slug: 'api/nodes' },
            { label: 'waveform', slug: 'api/waveform' },
            { label: 'fade', slug: 'api/fade' },
            { label: 'scheduler', slug: 'api/scheduler' },
            { label: 'synth', slug: 'api/synth' },
            { label: 'adapters', slug: 'api/adapters' },
            { label: 'stretcher', slug: 'api/stretcher' },
          ],
        },
        { label: 'Types', slug: 'api/types' },
        { label: 'Demo', link: '/demo' },
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
