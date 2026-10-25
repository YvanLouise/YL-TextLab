import { Component, type ReactNode } from 'react'

export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page-shell route-status" role="alert">
        <h1>页面暂时无法打开</h1>
        <p>可能是页面资源加载失败或发生异常。请重新加载后再试。</p>
        <div className="route-actions">
          <button className="button button-primary" onClick={() => window.location.reload()}>重新加载</button>
          <a className="button" href={import.meta.env.BASE_URL}>返回首页</a>
        </div>
      </main>
    )
  }
}
