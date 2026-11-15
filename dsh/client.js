// Browser half of the adapter: a "Design Studio" tab in the DSH right sidebar.
// Hand-written in the bundle form DSH loads, so the adapter needs no build step.
window.__ModuleLoader__.load({
  id: '@kolezka/design-studio-dsh',
  factory: (require) => {
    const { jsx } = require('react/jsx-runtime')

    const TAB_ID = '@kolezka/design-studio-dsh'
    const TAB_KIND = 'design-studio'
    const TITLE = 'Design Studio'
    const FRAME_STYLE = { border: 0, width: '100%', height: '100%', display: 'block' }

    const inject = ['slots', 'sidebarRightTabs']

    // No leading slash: the address follows the DSH page, also behind a path prefix.
    function canvasAddress(sessionId) {
      const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      return `design-studio/${encodeURIComponent(sessionId)}/?theme=${theme}`
    }

    function CanvasBody({ address }) {
      return jsx('iframe', { src: address, title: TITLE, style: FRAME_STYLE })
    }

    function apply(ctx) {
      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: () => TITLE,
            guide: [{ id: 'open', order: 40, title: () => TITLE, description: () => 'Review design drafts on the canvas' }],
          }),
        'design-studio: tab type',
      )
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              { name: 'sidebar.right.pane.tab', key: TAB_ID, inject: (sessionId) => ({ address: canvasAddress(sessionId) }) },
              CanvasBody,
            ),
          ),
        'design-studio: tab body',
      )
    }

    return { apply, inject }
  },
})
