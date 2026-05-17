'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreditCard, Store, Moon, Shield, Mail, Camera, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export default function ProfilePage() {
  const [darkMode, setDarkMode] = useState(true);

  const links = [
    { name: 'Beat store', icon: Store, desc: 'Manage your beat store' },
    { name: 'Purchases', icon: CreditCard, desc: 'View order history' },
    { name: 'Instagram', icon: Camera, desc: '@yourbabema' },
    { name: 'Contact', icon: Mail, desc: 'Get support' },
    { name: 'Trust & security', icon: Shield, desc: 'Privacy and terms' },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-[600px] mx-auto px-10 pt-14">
        {/* Avatar + name */}
        <div className="flex flex-col items-center text-center mb-8 pb-8 border-b border-[#16130e]">
          <div className="w-20 h-20 rounded-full bg-[#14110d] border border-[#1a160f] flex items-center justify-center mb-4">
            <span className="text-2xl font-light text-[#3a3328]">C</span>
          </div>
          <h1 className="text-xl font-medium text-white mb-1">crayche</h1>
          <p className="text-[10px] font-mono text-[#5a5142] uppercase tracking-wider">Joined Apr 2026</p>
        </div>

        {/* Usage */}
        <div className="bg-[#14110d] border border-[#1a160f] rounded-lg p-5 mb-8">
          <div className="flex justify-between items-end mb-3">
            <div>
              <p className="text-[12px] font-medium text-[#E8DCC8]">Pro</p>
              <p className="text-[10px] font-mono text-[#5a5142] mt-0.5">14 / 100 tracks</p>
            </div>
            <button className="text-[10px] font-mono text-[#E8D8B8] hover:text-white transition-colors uppercase tracking-wider">Manage</button>
          </div>
          <div className="w-full h-1 bg-[#1a160f] rounded-full overflow-hidden">
            <div className="h-full bg-[#D4BFA0] rounded-full" style={{ width: '14%' }} />
          </div>
        </div>

        {/* Links */}
        <div className="border border-[#1a160f] rounded-lg divide-y divide-[#161310] mb-32">
          {/* Dark mode toggle */}
          <div
            className="flex items-center justify-between px-4 py-3.5 hover:bg-[#0c0a08] transition-colors cursor-pointer"
            onClick={() => setDarkMode(!darkMode)}
          >
            <div className="flex items-center gap-3">
              <Moon size={14} className="text-[#5a5142]" />
              <div>
                <p className="text-[12px] font-medium text-[#E8DCC8]">Dark mode</p>
                <p className="text-[10px] text-[#5a5142]">Toggle app appearance</p>
              </div>
            </div>
            <div className={`w-9 h-5 rounded-full relative transition-colors ${darkMode ? 'bg-[#D4BFA0]' : 'bg-[#1a160f] border border-[#2d2620]'}`}>
              <div className={`w-3.5 h-3.5 rounded-full absolute top-[3px] transition-all ${darkMode ? 'right-[3px] bg-white' : 'left-[3px] bg-[#5a5142]'}`} />
            </div>
          </div>

          {links.map((link, i) => (
            <button
              key={i}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#0c0a08] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <link.icon size={14} className="text-[#5a5142]" />
                <div>
                  <p className="text-[12px] font-medium text-[#E8DCC8]">{link.name}</p>
                  <p className="text-[10px] text-[#5a5142]">{link.desc}</p>
                </div>
              </div>
              <ChevronRight size={13} className="text-[#3a3328]" />
            </button>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
