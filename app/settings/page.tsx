"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      if (active) {
        setEmail(user.email ?? "");
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function logout() {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Settings</p>
        <h1>設定</h1>
      </header>

      <section className="panel">
        <div className="field">
          <span>ログイン中のメールアドレス</span>
          <p>{email || "確認中"}</p>
        </div>
        <button className="button danger full" disabled={loading} type="button" onClick={logout}>
          ログアウト
        </button>
      </section>
    </div>
  );
}
