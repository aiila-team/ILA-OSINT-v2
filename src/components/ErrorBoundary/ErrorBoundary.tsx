import React from 'react';

type State = { hasError: boolean; error?: Error | null };

class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Uncaught error in React component tree:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #071226)',
          color: 'var(--text-high, #fff)',
          padding: 20,
        }}>
          <div style={{ maxWidth: 900 }}>
            <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
            <p>
              A runtime error prevented the app from rendering. Open the browser
              console to see the error details.
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {String(this.state.error)}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}

export default ErrorBoundary;
