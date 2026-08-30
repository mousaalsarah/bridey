"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand, Button, Field, inputClass } from "@/components/ui";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@bridey.ly");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError("البريد أو كلمة المرور غير صحيحة");
      return;
    }
    router.push("/admin");
  }

  return (
    <div className="bridal-bg grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-md space-y-6">
        <Brand href="/" />
        <h1 className="font-display text-4xl">إدارة رسوم برايدي</h1>
        <form onSubmit={submit} className="space-y-3 rounded-[2rem] border border-champagne/30 bg-white/80 p-6">
          <Field label="البريد">
            <input className={inputClass()} dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="كلمة المرور">
            <input className={inputClass()} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" variant="gold" className="w-full">
            دخول
          </Button>
        </form>
      </div>
    </div>
  );
}
