import { Component, type ReactNode } from "react";
import { ErrorScreen } from "./Screens";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("NFS render error:", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorScreen code="Oops" title="Something went wrong" text="This page failed to render. Refresh to try again; your saved data is not affected." />;
  }
}
