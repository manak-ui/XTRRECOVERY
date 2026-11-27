import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected display error.',
    };
  }

  componentDidCatch(error: unknown): void {
    // Keep silent in UI; log only to dev console if needed
    console.error('[UI Boundary]', error);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[320px] flex items-center justify-center p-6">
          <div className="studio-card rounded-2xl max-w-md w-full p-6 text-center space-y-4 animate-modal-pop">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold">
                {this.props.fallbackTitle || 'Something interrupted this view'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {this.state.errorMessage || 'Tap below to safely return without losing your session.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleRecover}
                className="btn-shine press-scale flex-1 min-h-[44px] px-4 rounded-xl accent-btn text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {this.props.onReset ? <Home className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                {this.props.onReset ? 'Return to Lobby' : 'Try Again'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
