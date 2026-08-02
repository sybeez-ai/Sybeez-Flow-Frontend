import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = { error: Error | null };

/** Prevents a single panel crash from blanking the whole app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error boundary:", error, info.componentStack);
  }

  private recover = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const detail =
        import.meta.env.DEV || import.meta.env.MODE === "development"
          ? this.state.error.message
          : "";
      return (
        <div className="flex h-full min-h-[240px] w-full items-center justify-center bg-background px-6 py-10 text-foreground">
          <div className="max-w-md text-center">
            <h1 className="text-lg font-semibold tracking-tight">
              {this.props.fallbackTitle || "Something went wrong"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Try again below. If this keeps happening, reload the page or sign out and back in.
            </p>
            {detail ? (
              <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground break-words">
                {detail}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={this.recover}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.reload();
                }}
                className="inline-flex items-center justify-center rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
