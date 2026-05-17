'use client';

import { useState } from 'react';
import { X, FolderPlus, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess: (project: any) => void;
}

export function CreateProjectModal({ onClose, onSuccess }: CreateProjectModalProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: title.trim() }),
      });

      const data = await res.json();
      if (data.project) {
        onSuccess(data.project);
      }
    } catch (err) {
      console.error('Create project error:', err);
      toast.error('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[#16130e] border border-[#1f1a13] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-6 py-4 border-b border-[#1f1a13] flex justify-between items-center bg-[#0a0907]">
          <div className="flex items-center gap-2">
            <FolderPlus size={18} className="text-[#D4BFA0]" />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#E8DCC8]">Initialize workspace</h2>
          </div>
          <button onClick={onClose} className="text-[#4a4338] hover:text-[#E8DCC8] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#4a4338] ml-1">Project Title</label>
            <input
              autoFocus
              required
              type="text"
              placeholder="E.G. UNTITLED PROJECT 01"
              className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-xl py-4 px-4 text-xs uppercase tracking-widest text-[#E8DCC8] focus:outline-none focus:border-[#D4BFA0] transition-colors"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="pt-2">
            <button
              disabled={loading || !title.trim()}
              type="submit"
              className="w-full bg-[#D4BFA0] hover:bg-[#8A7A5C] disabled:bg-[#1a160f] disabled:text-[#4a4338] text-white py-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-[#D4BFA0]/20"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating Workspace
                </>
              ) : (
                'Create Project'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
