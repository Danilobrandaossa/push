import type { NitroGraphQLOptions } from 'nitro-graphql'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: [
    'abckit',
  ],
  ssr: false,
  css: [
    '~/assets/css/tailwind.css',
    'notivue/notification.css',
    'notivue/animations.css',
  ],
  abckit: {
    modules: {
      graphql: true,
    },
  },

  vite: {
    resolve: {
      alias: {
        'nitroping': resolve(fileURLToPath(import.meta.url), '../sdk/dist/index.js'),
      },
    },
  },

  nitro: {
    experimental: {
      tasks: true,
    },
    modules: ['nitro-graphql'],
    graphql: {
      framework: 'graphql-yoga',
      codegen: {
        server: {
          scalars: {
            Timestamp: 'string',
            File: 'File',
          },
        },
        client: {
          scalars: {
            Timestamp: 'string',
            File: 'File',
          },
        },
      },
    } as NitroGraphQLOptions,
  },
})
