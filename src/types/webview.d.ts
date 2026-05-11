import type * as React from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string
        partition?: string
        allowpopups?: boolean | string
        webpreferences?: string
        useragent?: string
        preload?: string
      }
    }
  }
}

export {}
