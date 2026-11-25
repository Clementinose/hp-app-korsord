import type { Register, ThemeSetArgs, ThemeStyle } from 'claude-code'

import { makeColors } from './make-colors.js'

// A neutral, near-monochrome chat look: white page by day, charcoal by night,
// soft gray rounded bubble for your own messages, plain text for replies.
const { theme, problems } = makeColors({
  label: 'Neutral chat',
  roles: { accent: '#10a37f', danger: '#d93c3c', success: '#2e9a5c', warning: '#c98a12', pro: '#7c5cd6' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f9f9f9',
        'surface-1': '#fcfcfc',
        'surface-2': '#ffffff',
        'surface-3': '#ffffff',
        'text-primary': '#0d0d0d',
        'text-secondary': '#3d3d3d',
        'text-muted': '#5d5d5d',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#171717',
        'surface-1': '#212121',
        'surface-2': '#262626',
        'surface-3': '#2a2a2a',
        'text-primary': '#ececec',
        'text-secondary': '#c8c8c8',
        'text-muted': '#a3a3a3',
      },
    },
  },
})

const colors = {
  ...theme,
  inputs: {
    ...theme.inputs,
    light: {
      ...theme.inputs?.light,
      'bg-user-message': '#f0f0f0',
      'text-user-message': '#0d0d0d',
      'bg-assistant-message': '#ffffff',
      'text-assistant-message': '#0d0d0d',
    },
    dark: {
      ...theme.inputs?.dark,
      'bg-user-message': '#303030',
      'text-user-message': '#ececec',
      'bg-assistant-message': '#212121',
      'text-assistant-message': '#ececec',
    },
  },
} as ThemeSetArgs['colors']

const STYLE: ThemeStyle = {
  Text: { fontFamily: ['sans'], fontSize: 16, lineHeight: 28 },
  Heading: { fontFamily: ['sans'], fontWeight: 'semibold' },
  UserMessage: {
    backgroundColor: 'bg-user-message',
    color: 'text-user-message',
    radius: 24,
    paddingX: 20,
    paddingY: 10,
    shadow: 'none',
  },
  ToolUse: { fontFamily: ['sans'] },
}

const BASE: ThemeSetArgs = { colors }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }

    let set
    try {
      set = await $.theme.set({ ...BASE, style: STYLE })
    } catch (error) {
      $.ui.log(String(error))
      set = await $.theme.set(BASE)
    }

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }

    return next(e)
  })
}
