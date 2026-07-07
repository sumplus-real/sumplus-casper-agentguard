"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn, Settings, Upload, CreditCard, LayoutGrid, UserPlus, ChevronDown, Bot, User } from "lucide-react";

function AuthPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (searchParams.get("mode") === "signup") setTab("signup");
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            {tab === "signin" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-slate-400 text-sm">
            {tab === "signin" ? "Sign in to manage your Arsenal account" : "Join the AI skills marketplace"}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 mb-6">
          <button
            onClick={() => setTab("signin")}
            className={"flex-1 py-2 text-sm font-medium rounded-lg transition-all " + (tab === "signin" ? "bg-white/[0.1] text-white" : "text-slate-400 hover:text-white")}
          >
            Sign In
          </button>
          <button
            onClick={() => setTab("signup")}
            className={"flex-1 py-2 text-sm font-medium rounded-lg transition-all " + (tab === "signup" ? "bg-white/[0.1] text-white" : "text-slate-400 hover:text-white")}
          >
            Create Account
          </button>
        </div>

        {tab === "signin" ? <SignInForm /> : <SignUpForm />}

        {/* Agent hint */}
        <div className="mt-4 p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl text-center">
          <p className="text-xs text-slate-600">
            Building an agent?{" "}
            <Link href="/docs#agent-registration" className="text-slate-400 hover:text-slate-300 transition-colors">
              Register via API →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      localStorage.setItem("arsenal_token", data.session.access_token);
      localStorage.setItem("arsenal_user", JSON.stringify(data.user));
      window.location.href = "/settings";
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Feature hints */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {[
          { icon: Settings, text: "Configure your account" },
          { icon: Upload, text: "Upload & manage skills" },
          { icon: CreditCard, text: "Manage billing & API keys" },
          { icon: LayoutGrid, text: "Track your submissions" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-lg">
            <Icon size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-xs text-slate-500">{text}</span>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-8 backdrop-blur-sm">
        {error && (
          <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 pr-12 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="flex justify-end mt-1.5">
              <a href="#" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Forgot password?</a>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-semibold rounded-xl transition-all hover:scale-[1.02] disabled:scale-100 shadow-lg shadow-blue-500/20"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </>
  );
}

function SignUpForm() {
  const [openSection, setOpenSection] = useState<"human" | "agent" | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const update = (key: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggle = (section: "human" | "agent") => {
    setOpenSection((prev) => (prev === section ? null : section));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.acceptTerms) { setError("Please accept the Terms of Service to continue"); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password, role: "user" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Signup failed"); return; }
      if (data.api_key) setApiKey(data.api_key);
      setSuccess(true);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-white/[0.04] border border-white/[0.08] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <UserPlus className="text-white" size={28} />
        </div>
        <h2 className="text-xl font-bold text-white mb-3">Account Created!</h2>
        <p className="text-slate-400 mb-6">Welcome to Sumplus Arsenal.</p>
        {apiKey && (
          <div className="mb-6 p-4 bg-slate-800/60 border border-slate-700/50 rounded-xl text-left">
            <p className="text-xs text-slate-400 mb-2 font-mono uppercase tracking-wider">Your API Key</p>
            <p className="text-xs font-mono text-emerald-400 break-all">{apiKey}</p>
            <p className="text-xs text-slate-500 mt-2">Save this — it won&apos;t be shown again.</p>
          </div>
        )}
        <a href="/login" className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors inline-block">
          Sign In
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* For Agents */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
        <button
          type="button"
          onClick={() => toggle("agent")}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-500/15 border border-purple-500/20 rounded-lg flex items-center justify-center">
              <Bot size={15} className="text-purple-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">For Agents</p>
              <p className="text-xs text-slate-500">Register programmatically via API</p>
            </div>
          </div>
          <ChevronDown size={16} className={"text-slate-500 transition-transform duration-200 " + (openSection === "agent" ? "rotate-180" : "")} />
        </button>

        {openSection === "agent" && (
          <div className="px-6 pb-5 border-t border-white/[0.05]">
            <p className="text-sm text-slate-400 mt-4 mb-3">
              Agents can register without a password — one is auto-generated and returned alongside your API key.
            </p>
            <pre className="text-xs font-mono text-slate-400 bg-black/30 rounded-lg p-3 overflow-x-auto">{`POST /api/auth/signup
Content-Type: application/json

{
  "email": "your-agent@example.com",
  "role": "agent"
}

// Response
{
  "user": { "id": "...", "email": "...", "role": "agent" },
  "api_key": "<your-api-key>",
  "password": "<auto-generated>"
}`}</pre>
            <p className="text-xs text-slate-600 mt-3">
              Full docs in{" "}
              <Link href="/docs#agent-registration" className="text-slate-400 hover:text-slate-300 transition-colors">
                Docs → Agent Registration →
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* For Humans */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
        <button
          type="button"
          onClick={() => toggle("human")}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/15 border border-blue-500/20 rounded-lg flex items-center justify-center">
              <User size={15} className="text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">For Humans</p>
              <p className="text-xs text-slate-500">Create an account to manage skills & billing</p>
            </div>
          </div>
          <ChevronDown size={16} className={"text-slate-500 transition-transform duration-200 " + (openSection === "human" ? "rotate-180" : "")} />
        </button>

        {openSection === "human" && (
          <div className="px-6 pb-6 border-t border-white/[0.05]">
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 pr-12 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Re-enter your password"
                  className={"w-full px-4 py-3 bg-slate-900 border rounded-xl text-white placeholder-slate-500 focus:outline-none transition-colors " + (form.confirmPassword && form.password !== form.confirmPassword ? "border-red-500" : "border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500")}
                />
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={(e) => update("acceptTerms", e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-blue-500 flex-shrink-0"
                />
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                  I agree to the <a href="#" className="text-blue-400 hover:text-blue-300">Terms of Service</a> and <a href="#" className="text-blue-400 hover:text-blue-300">Privacy Policy</a>
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><UserPlus size={18} /> Create Account</>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthPage />
    </Suspense>
  );
}
