import { ErrorScreen } from "../components/Screens";

export default function NotFound() {
  return <ErrorScreen code="404" title="Page not found" text="That address doesn’t exist in NFS." />;
}
