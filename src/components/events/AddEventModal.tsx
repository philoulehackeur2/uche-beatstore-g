'use client';

import { useEffect, useState } from 'react';
import { X, Calendar, Clock, Tag, Loader2, Music } from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface AddEventModalProps {
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: Date;
}

export function AddEventModal({ onClose, onSuccess, initialDate }: AddEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    date: initialDate ? initialDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    type: 'release',
    notes: '',
    color: '#D4BFA0'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          date: new Date(formData.date).toISOString()
        }),
      });

      if (!res.ok) throw new Error('Failed to add event');
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error adding event:', err);
      toast.error('Could not add event', 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[#16130e] border border-[#1f1a13] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-6 py-4 border-b border-[#1f1a13] flex justify-between items-center bg-[#0a0907]">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-[#D4BFA0]" />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#E8DCC8]">Schedule Event</h2>
          </div>
          <button onClick={onClose} className="text-[#4a4338] hover:text-[#E8DCC8] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#4a4338] ml-1">Event Title</label>
            <input
              required
              type="text"
              placeholder="E.G. DANGER BEAT RELEASE"
              className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-xl py-3 px-4 text-xs uppercase tracking-widest text-[#E8DCC8] focus:outline-none focus:border-[#D4BFA0] transition-colors"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#4a4338] ml-1">Category</label>
              <select
                className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-xl py-3 px-4 text-xs uppercase tracking-widest text-[#E8DCC8] focus:outline-none focus:border-[#D4BFA0] transition-colors appearance-none cursor-pointer"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="release">Release</option>
                <option value="studio">Studio Session</option>
                <option value="meeting">Meeting</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#4a4338] ml-1">Date</label>
              <input
                type="date"
                className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-xl py-3 px-4 text-xs uppercase tracking-widest text-[#E8DCC8] focus:outline-none focus:border-[#D4BFA0] transition-colors"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#4a4338] ml-1">Color Palette</label>
            <div className="flex gap-2">
              {['#D4BFA0', '#4CAF50', '#FF9800', '#F44336', '#2196F3'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: c })}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${formData.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#4a4338] ml-1">Private Notes</label>
            <textarea
              placeholder="ADDITIONAL DETAILS OR LOGISTICS..."
              className="w-full bg-[#0a0907] border border-[#1f1a13] rounded-xl py-3 px-4 text-xs uppercase tracking-widest text-[#E8DCC8] focus:outline-none focus:border-[#D4BFA0] transition-colors h-24 resize-none"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="pt-4">
            <button
              disabled={loading}
              type="submit"
              className="w-full bg-[#D4BFA0] hover:bg-[#8A7A5C] disabled:bg-[#4a4338] text-white py-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-[#D4BFA0]/20"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <Clock size={16} />
                  Schedule Entry
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
