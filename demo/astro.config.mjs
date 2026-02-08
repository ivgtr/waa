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
            { label: 'WaaPlayer', slug: 'api/player' },
            { label: 'Function API', slug: 'api/functions' },
            { label: 'Stretcher', slug: 'api/stretcher' },
          ],
        },
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
