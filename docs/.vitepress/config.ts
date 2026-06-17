import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'CoAether',
  description: 'CoAether 多智能体协作平台使用文档',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '使用指南', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'CoAether', link: 'https://www.coaether.cn' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '快速入门',
          items: [
            { text: '开始使用', link: '/guide/getting-started' },
            { text: '注册与登录', link: '/guide/register' },
            { text: '安装节点', link: '/guide/install-node' },
          ],
        },
        {
          text: '核心功能',
          items: [
            { text: '工作区', link: '/guide/workspace' },
            { text: '智能体', link: '/guide/agents' },
            { text: '任务管理', link: '/guide/tasks' },
            { text: '工作流', link: '/guide/workflow' },
          ],
        },
        {
          text: '管理后台',
          items: [
            { text: '概览', link: '/guide/admin-overview' },
            { text: '用户管理', link: '/guide/admin-users' },
            { text: '用量统计', link: '/guide/admin-usage' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '概述', link: '/api/' },
            { text: '认证', link: '/api/auth' },
            { text: '智能体', link: '/api/agents' },
            { text: '任务', link: '/api/tasks' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/madage/coaether' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Powered by VitePress',
      copyright: `Copyright © ${new Date().getFullYear()} CoAether`,
    },

    outline: { level: [2, 3] },
  },
})
