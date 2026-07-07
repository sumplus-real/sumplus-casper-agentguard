"use client";

import { useState } from "react";
import { Plus, X, Upload, CheckCircle, AlertCircle, Tag } from "lucide-react";

const CATEGORIES = [
  "Blockchain", "Finance", "Data", "Productivity",
  "AI/ML", "Communication", "Security", "Analytics",
];

const DEFAULT_SCHEMA = JSON.stringify({
  type: "object",
  required: ["input_field"],
  properties: {
    input_field: { type: "string", description: "Description of this field" }
  }
}, null, 2);

const DEFAULT_IMPLEMENTATION = "// Skill implementation\n// This function will be called with the validated input\nasync function execute(input: Record<string, unknown>) {\n  // Your implementation here\n  return {\n    result: \"Success\",\n    data: input\n  };\n}";

export default function UploadSkillPage() {
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    version: "1.0.0",
    is_paid: false,
    price: "",
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [inputSchema, setInputSchema] = useState(DEFAULT_SCHEMA);
  const [outputSchema, setOutputSchema] = useState(JSON.stringify({ type: "object", properties: { result: { type: "string" } } }, null, 2));
  const [implementation, setImplementation] = useState(DEFAULT_IMPLEMENTATION);
  const [examples, setExamples] = useState([{ title: "", input: "{}", output: "{}" }]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [schemaError, setSchemaError] = useState("");
  const [outputSchemaError, setOutputSchemaError] = useState("");

  const updateForm = (key: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const validateSchema = (v: string, setter: (e: string) => void) => {
    try {
      JSON.parse(v);
      setter("");
      return true;
    } catch {
      setter("Invalid JSON - please check your schema");
      return false;
    }
  };

  const addExample = () => {
    setExamples([...examples, { title: "", input: "{}", output: "{}" }]);
  };

  const updateExample = (i: number, key: string, value: string) => {
    setExamples(examples.map((ex, idx) => idx === i ? { ...ex, [key]: value } : ex));
  };

  const removeExample = (i: number) => {
    setExamples(examples.filter((_, idx) => idx !== i));
  };

  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validIn = validateSchema(inputSchema, setSchemaError);
    const validOut = validateSchema(outputSchema, setOutputSchemaError);
    if (!validIn || !validOut) return;

    setStatus("loading");
    setErrorMsg("");

    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) {
      setErrorMsg("You must be signed in to upload a skill.");
      setStatus("error");
      return;
    }

    let parsedInput: unknown, parsedOutput: unknown;
    try { parsedInput = JSON.parse(inputSchema); } catch { setSchemaError("Invalid JSON"); setStatus("idle"); return; }
    try { parsedOutput = JSON.parse(outputSchema); } catch { setOutputSchemaError("Invalid JSON"); setStatus("idle"); return; }

    const parsedExamples = examples
      .filter((ex) => ex.title)
      .map((ex) => {
        try { return { title: ex.title, input: JSON.parse(ex.input), output: JSON.parse(ex.output) }; }
        catch { return { title: ex.title, input: ex.input, output: ex.output }; }
      });

    const payload = {
      name: form.name,
      description: form.description,
      category: form.category,
      tags,
      version: form.version,
      schema: { input: parsedInput, output: parsedOutput },
      code: implementation,
      usage_examples: parsedExamples,
      is_paid: form.is_paid,
      ...(form.is_paid && form.price ? { price: parseFloat(form.price) } : {}),
    };

    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Submission failed. Please try again.");
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] py-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Upload Skill</h1>
          <p className="text-slate-400">Share your AI skill with the community</p>
        </div>

        {status === "success" && (
          <div className="flex items-start gap-4 p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-8">
            <CheckCircle className="text-emerald-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-semibold text-emerald-300 mb-1">Skill submitted successfully!</h3>
              <p className="text-emerald-400/70 text-sm">Your skill is under review and will be published within 24 hours.</p>
            </div>
          </div>
        )}
        {status === "error" && errorMsg && (
          <div className="flex items-start gap-4 p-5 bg-red-500/10 border border-red-500/20 rounded-xl mb-8">
            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-semibold text-red-300 mb-1">Submission failed</h3>
              <p className="text-red-400/70 text-sm">{errorMsg}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-5">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Skill Name <span className="text-red-400">*</span></label>
                <input type="text" required value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="e.g., DeFi Portfolio Analyzer" className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Description <span className="text-red-400">*</span></label>
                <textarea required value={form.description} onChange={(e) => updateForm("description", e.target.value)} placeholder="Describe what your skill does..." rows={4} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Category <span className="text-red-400">*</span></label>
                  <select required value={form.category} onChange={(e) => updateForm("category", e.target.value)} className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm">
                    <option value="">Select category</option>
                    {CATEGORIES.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Version</label>
                  <input type="text" value={form.version} onChange={(e) => updateForm("version", e.target.value)} placeholder="1.0.0" className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Tags</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Add a tag..." className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm" />
                  <button type="button" onClick={addTag} className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 text-blue-400 hover:text-white rounded-lg text-sm transition-colors"><Plus size={16} /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 text-xs bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full">
                      <Tag size={10} /> {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="ml-1 text-slate-500 hover:text-red-400 transition-colors"><X size={10} /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-5">Schema Definition</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Input Schema (JSON Schema) <span className="text-red-400">*</span></label>
                <textarea value={inputSchema} onChange={(e) => { setInputSchema(e.target.value); validateSchema(e.target.value, setSchemaError); }} rows={8} className={"w-full px-4 py-3 bg-slate-900 border rounded-lg text-sm text-green-300 font-mono focus:outline-none resize-none " + (schemaError ? "border-red-500" : "border-slate-700 focus:border-blue-500")} />
                {schemaError && (<p className="flex items-center gap-1.5 text-xs text-red-400 mt-1"><AlertCircle size={12} /> {schemaError}</p>)}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Output Schema (JSON Schema) <span className="text-red-400">*</span></label>
                <textarea value={outputSchema} onChange={(e) => { setOutputSchema(e.target.value); validateSchema(e.target.value, setOutputSchemaError); }} rows={6} className={"w-full px-4 py-3 bg-slate-900 border rounded-lg text-sm text-blue-300 font-mono focus:outline-none resize-none " + (outputSchemaError ? "border-red-500" : "border-slate-700 focus:border-blue-500")} />
                {outputSchemaError && (<p className="flex items-center gap-1.5 text-xs text-red-400 mt-1"><AlertCircle size={12} /> {outputSchemaError}</p>)}
              </div>
            </div>
          </section>

          <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-5">Implementation</h2>
            <textarea value={implementation} onChange={(e) => setImplementation(e.target.value)} rows={12} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-sm text-yellow-200 font-mono focus:outline-none focus:border-blue-500 resize-none" />
          </section>

          <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Usage Examples</h2>
              <button type="button" onClick={addExample} className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"><Plus size={16} /> Add Example</button>
            </div>
            <div className="space-y-5">
              {examples.map((ex, i) => (
                <div key={i} className="relative bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
                  {examples.length > 1 && (
                    <button type="button" onClick={() => removeExample(i)} className="absolute top-3 right-3 text-slate-500 hover:text-red-400 transition-colors"><X size={16} /></button>
                  )}
                  <div className="space-y-3">
                    <input type="text" value={ex.title} onChange={(e) => updateExample(i, "title", e.target.value)} placeholder="Example title" className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm" />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Input</label>
                        <textarea value={ex.input} onChange={(e) => updateExample(i, "input", e.target.value)} rows={4} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-green-300 font-mono focus:outline-none focus:border-blue-500 resize-none" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Output</label>
                        <textarea value={ex.output} onChange={(e) => updateExample(i, "output", e.target.value)} rows={4} className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-blue-300 font-mono focus:outline-none focus:border-blue-500 resize-none" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-5">Pricing</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => updateForm("is_paid", false)} className={"flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all " + (!form.is_paid ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-slate-700 text-slate-400 hover:border-slate-600")}>Free</button>
                <button type="button" onClick={() => updateForm("is_paid", true)} className={"flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all " + (form.is_paid ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-400 hover:border-slate-600")}>Paid</button>
              </div>
              {form.is_paid && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Price (USD)</label>
                  <input type="number" value={form.price} onChange={(e) => updateForm("price", e.target.value)} placeholder="9.99" min="0.01" step="0.01" className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm max-w-xs" />
                </div>
              )}
            </div>
          </section>

          <div className="flex items-center gap-4 pb-8">
            <button type="submit" disabled={status === "loading" || status === "success"} className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-semibold rounded-xl transition-colors">
              <Upload size={18} />
              {status === "loading" ? "Submitting..." : status === "success" ? "Submitted!" : "Submit Skill"}
            </button>
            <p className="text-slate-500 text-sm">Your skill will be reviewed before publishing</p>
          </div>
        </form>
      </div>
    </div>
  );
}