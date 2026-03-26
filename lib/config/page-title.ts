import { NAV_ITEMS } from "./navigation";

export function getPageTitle(pathname: string): string {
  const exact = NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact.label;
  const prefix = NAV_ITEMS.filter(
    (i) => i.href !== "/" && pathname.startsWith(`${i.href}/`),
  );
  const longest = prefix.sort((a, b) => b.href.length - a.href.length)[0];
  return longest?.label ?? "FasoStock";
}
