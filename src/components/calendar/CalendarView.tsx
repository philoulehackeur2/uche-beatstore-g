'use client';

import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, MapPin } from 'lucide-react';

export function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/calendar')
      .then(res => res.json())
      .then(data => setEvents(data))
      .catch(console.error);
  }, []);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  return (
    <div className="bg-[#16130e] border border-[#1f1a13] rounded-3xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-8 border-b border-[#1f1a13] flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-[#E8DCC8]">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#4a4338] mt-1">Release Schedule & Milestones</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-[#0a0907] border border-[#1f1a13] rounded-xl p-1">
            <button onClick={prevMonth} className="p-2 hover:bg-[#1a160f] rounded-lg transition-colors text-[#4a4338] hover:text-[#E8DCC8]">
              <ChevronLeft size={18} />
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-[#1a160f] rounded-lg transition-colors text-[#4a4338] hover:text-[#E8DCC8]">
              <ChevronRight size={18} />
            </button>
          </div>
          <button className="bg-[#D4BFA0] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all">
            <Plus size={14} /> New Event
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border-b border-[#1f1a13]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-4 text-center text-[9px] font-black uppercase tracking-[0.4em] text-[#4a4338] border-r border-[#1f1a13] last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 min-h-[600px]">
        {days.map((day, i) => {
          const dayEvents = events.filter(e => isSameDay(new Date(e.date), day));
          return (
            <div 
              key={day.toString()} 
              className={`
                p-4 border-r border-b border-[#1f1a13] transition-colors
                ${!isSameMonth(day, currentMonth) ? 'bg-[#0a0907]/50 opacity-20' : 'hover:bg-[#1a160f]/50'}
                ${(i + 1) % 7 === 0 ? 'border-r-0' : ''}
              `}
            >
              <span className={`text-[10px] font-black tracking-widest ${isSameDay(day, new Date()) ? 'text-[#D4BFA0]' : 'text-[#4a4338]'}`}>
                {format(day, 'd')}
              </span>
              <div className="mt-4 space-y-2">
                {dayEvents.map(event => (
                  <div 
                    key={event.id}
                    className="p-2 rounded-lg bg-[#1a160f] border-l-4 border-l-[#D4BFA0] shadow-sm group cursor-pointer hover:bg-[#1f1a13] transition-all"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#E8DCC8] line-clamp-1">{event.title}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-1 h-1 rounded-full bg-[#D4BFA0]" />
                      <span className="text-[8px] font-bold uppercase tracking-widest text-[#4a4338]">{event.type || 'Event'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
