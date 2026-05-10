import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Unhandled render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-shell">
          <div className="app-error-card">
            <div className="app-error-title">Flowtrades failed to render</div>
            <div className="app-error-body">
              The app mounted, but a client-side error stopped the chart from drawing.
              Reload after the next patch, or check the browser console for the first exception.
            </div>
            <pre className="app-error-stack">
              {this.state.error?.message || 'Unknown render error'}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
