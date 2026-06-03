"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormData = z.infer<typeof schema>;

const TEST_ACCOUNTS = [
  { label: "Admin", email: "admin@example.com", password: "Admin1234!", emoji: "👔" },
];

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState("");

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const fillAccount = (email: string, password: string) => {
    setValue("email", email, { shouldValidate: true });
    setValue("password", password, { shouldValidate: true });
  };

  const onSubmit = async (data: FormData) => {
    try {
      setError("");
      await login(data.email, data.password);
      router.push("/dashboard");
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg).join(", "));
      } else {
        setError(detail || "Login failed");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600/20 border border-primary-500/30 mb-4">
            <span className="text-3xl">🏢</span>
          </div>
          <h1 className="text-2xl font-bold text-white">AI Office OS</h1>
          <p className="text-white/50 text-sm mt-1">Sign in to your workspace</p>
        </div>

        {/* Quick fill */}
        <div className="mb-4 rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="text-xs font-medium text-white/40 mb-3 uppercase tracking-wider">Test Accounts</p>
          <div className="flex flex-col gap-2">
            {TEST_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fillAccount(acc.email, acc.password)}
                className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/4 px-4 py-3 text-left hover:border-primary-500/40 hover:bg-primary-600/10 transition-all group"
              >
                <span className="text-xl">{acc.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{acc.label}</p>
                  <p className="text-xs text-white/40 truncate">{acc.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-white/25 font-mono">{acc.password}</p>
                  <p className="text-[10px] text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    คลิกเพื่อใส่ข้อมูล →
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="you@company.com"
              error={errors.email?.message}
              {...register("email")}
            />
            <Input
              id="password"
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register("password")}
            />

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-white/40 mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary-400 hover:text-primary-300">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
