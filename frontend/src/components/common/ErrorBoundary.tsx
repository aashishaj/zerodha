import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unknown frontend error",
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Dashboard render error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
          <div className="max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-panel">
            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-rose-600">Frontend Error</div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">The dashboard hit a rendering problem</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This screen is shown instead of a blank page so we can see what failed. Refresh once, and if it still
              happens, share the message below.
            </p>
            <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950/95 p-4 text-sm text-slate-100">
              {this.state.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
