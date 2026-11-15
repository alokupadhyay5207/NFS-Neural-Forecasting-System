import React from "react";
const subs = new Set();
const snap = () => location.pathname + location.search + "|" + JSON.stringify(history.state);
function subscribe(f) { subs.add(f); addEventListener("popstate", f); return () => { subs.delete(f); removeEventListener("popstate", f); }; }
export function navigate(to, opts = {}) { history[opts.replace ? "replaceState" : "pushState"]({ usr: opts.state }, "", to); subs.forEach((f) => f()); }
function useLocation() { React.useSyncExternalStore(subscribe, snap); return { pathname: location.pathname, search: location.search, state: history.state ? history.state.usr : undefined }; }
export { useLocation };
export const useNavigate = () => navigate;
export const useSearchParams = () => { const l = useLocation(); return [new URLSearchParams(l.search), (p) => navigate(location.pathname + "?" + new URLSearchParams(p))]; };
export const BrowserRouter = ({ children }) => children;
const RouteCtx = React.createContext({ outlet: null });
const OutletCtxValue = React.createContext(undefined);
export const Outlet = ({ context }) => { const { outlet } = React.useContext(RouteCtx); return React.createElement(OutletCtxValue.Provider, { value: context }, outlet); };
export const useOutletContext = () => React.useContext(OutletCtxValue);
export const Route = () => null;
const toRoutes = (children) => React.Children.toArray(children).map((c) => ({ path: c.props.path, index: c.props.index, element: c.props.element, children: c.props.children ? toRoutes(c.props.children) : [] }));
const join = (a, b) => ("/" + a + "/" + b).replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
function match(routes, base, pathname) {
  for (const r of routes) {
    if (r.index) { if (pathname === base || pathname === base + "/") return [r]; continue; }
    if (r.path === undefined) { const m = match(r.children, base, pathname); if (m) return [r, ...m]; continue; }
    if (r.path === "*") return [r];
    const full = join(base, r.path);
    if (r.children.length) { if (pathname === full || pathname.startsWith(full + "/")) { const m = match(r.children, full, pathname); if (m) return [r, ...m]; } }
    else if (pathname === full) return [r];
  }
  return null;
}
export const Routes = ({ children }) => {
  const { pathname } = useLocation();
  const chain = match(toRoutes(children), "/", pathname);
  if (!chain) return React.createElement("div", { "data-testid": "no-route" }, "No route");
  return chain.reduceRight((outlet, r) => React.createElement(RouteCtx.Provider, { value: { outlet } }, r.element ?? React.createElement(Outlet)), null);
};
export const Navigate = ({ to, replace, state }) => { React.useEffect(() => { navigate(to, { replace, state }); }, [to]); return null; };
const click = (to) => (e) => { if (e.metaKey || e.ctrlKey || e.button) return; e.preventDefault(); navigate(to); };
export const Link = ({ to, children, className, onClick, ...r }) => React.createElement("a", { href: to, className, onClick: (e) => { onClick && onClick(e); click(to)(e); }, ...r }, children);
export const NavLink = ({ to, children, className, onClick, ...r }) => { const { pathname } = useLocation(); const isActive = pathname === to || pathname.startsWith(to + "/"); return React.createElement("a", { href: to, "aria-current": isActive ? "page" : undefined, className: typeof className === "function" ? className({ isActive }) : className, onClick: (e) => { onClick && onClick(e); click(to)(e); }, ...r }, children); };
