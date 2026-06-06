"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "ホーム" },
  { href: "/workouts/new", label: "記録" },
  { href: "/settings", label: "設定" }
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "bottom-nav__item is-active" : "bottom-nav__item"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
