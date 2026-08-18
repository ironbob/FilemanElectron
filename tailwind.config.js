/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,vue}",
    "./index.html"
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Background colors
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-sidebar': 'var(--bg-sidebar)',
        'bg-toolbar': 'var(--bg-toolbar)',
        'bg-statusbar': 'var(--bg-statusbar)',
        'bg-selected': 'var(--bg-selected)',
        'bg-hover': 'var(--bg-hover)',
        'bg-active': 'var(--bg-active)',

        // Text colors
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-accent': 'var(--text-accent)',

        // Border colors
        'border': 'var(--border-color)',
        'border-light': 'var(--border-light)',
        'border-focus': 'var(--border-focus)',

        // Accent colors - macOS style
        'accent': 'var(--accent-blue)',
        'accent-blue': 'var(--accent-blue)',
        'accent-hover': 'var(--accent-blue-hover)',
        'accent-purple': 'var(--accent-purple)',
        'accent-pink': 'var(--accent-pink)',
        'accent-red': 'var(--accent-red)',
        'accent-orange': 'var(--accent-orange)',
        'accent-yellow': 'var(--accent-yellow)',
        'accent-green': 'var(--accent-green)',
        'accent-teal': 'var(--accent-teal)',
        'accent-indigo': 'var(--accent-indigo)',

        // Icon colors
        'icon-folder': 'var(--icon-folder)',
        'icon-document': 'var(--icon-document)',
        'icon-image': 'var(--icon-image)',
        'icon-video': 'var(--icon-video)',
        'icon-audio': 'var(--icon-audio)',
        'icon-code': 'var(--icon-code)',
        'icon-archive': 'var(--icon-archive)',

        // Legacy aliases for backward compatibility
        'sidebar': 'var(--bg-sidebar)',
        'tab-active': 'var(--bg-primary)',
        'tab-inactive': 'var(--bg-secondary)',
        'status-bar': 'var(--bg-statusbar)',
        'hover': 'var(--bg-hover)',
        'selected': 'var(--bg-selected)',
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'glow': 'var(--shadow-glow)',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
      },
      fontFamily: {
        'sans': ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'PingFang SC', 'Helvetica Neue', 'sans-serif'],
      },
      fontSize: {
        'xs': '11px',
        'sm': '12px',
        'base': '13px',
        'lg': '15px',
        'xl': '17px',
      },
      zIndex: {
        'base': '0',
        'sidebar': '10',
        'dropdown': '20',
        'sticky': '30',
        'overlay': '40',
        'modal': '50',
        'toast': '100',
      },
    },
  },
  plugins: [],
}
