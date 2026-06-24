'use client';

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, LayoutDashboard, BarChart3, Layers,
  ClipboardCheck, X, Database, Menu, Printer, Target, Crosshair,
} from 'lucide-react';
import type { RaLevel } from '../_lib/types';
import Tip from '@/components/ui/Tip';

interface Props {
  currentMenu: RaLevel;
  viewMode: 'dashboard' | 'data-entry' | 'cetak';
  onSelectMenu: (m: RaLevel) => void;
  onSelectDataEntry: (m: RaLevel) => void;
  onSelectCetak: () => void;
  isOpen: boolean;
  onToggle: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type SubMenu = { id: RaLevel; label: string; short: string; icon: typeof ClipboardCheck; color: string };

const subMenus: SubMenu[] = [
  { id: 'tujuan',       label: 'Indikator Tujuan',       short: 'Tujuan',       icon: Crosshair,        color: '#7C5CFC' },
  { id: 'sasaran',      label: 'Indikator Sasaran',      short: 'Sasaran',      icon: ClipboardCheck,   color: '#10B981' },
  { id: 'program',      label: 'Indikator Program',      short: 'Program',      icon: BarChart3,        color: '#378ADD' },
  { id: 'kegiatan',     label: 'Indikator Kegiatan',     short: 'Kegiatan',     icon: LayoutDashboard,  color: '#EC4899' },
  { id: 'sub-kegiatan', label: 'Indikator Sub Kegiatan', short: 'Sub Kegiatan', icon: Layers,           color: '#F59E0B' },
];

const dataEntrySubMenus: SubMenu[] = [
  { id: 'tujuan',       label: 'Data Entry Tujuan',       short: 'Tujuan',       icon: Crosshair,        color: '#7C5CFC' },
  { id: 'sasaran',      label: 'Data Entry Sasaran',      short: 'Sasaran',      icon: ClipboardCheck,   color: '#10B981' },
  { id: 'program',      label: 'Data Entry Program',      short: 'Program',      icon: BarChart3,        color: '#378ADD' },
  { id: 'kegiatan',     label: 'Data Entry Kegiatan',     short: 'Kegiatan',     icon: LayoutDashboard,  color: '#EC4899' },
  { id: 'sub-kegiatan', label: 'Data Entry Sub Kegiatan', short: 'Sub Kegiatan', icon: Layers,           color: '#F59E0B' },
];

export default function Sidebar({
  currentMenu, viewMode, onSelectMenu, onSelectDataEntry, onSelectCetak,
  isOpen, onToggle, collapsed, onToggleCollapse,
}: Props) {
  const [openGroup, setOpenGroup] = useState<'data-entry' | 'kinerja' | null>(
    viewMode === 'data-entry' ? 'data-entry' : 'kinerja'
  );
  const dataEntryOpen = openGroup === 'data-entry';
  const kinerjaOpen   = openGroup === 'kinerja';

  const width = collapsed ? 'w-[68px]' : 'w-72';

  return (
    <>
      {isOpen && (
        <div onClick={onToggle} className="fixed inset-0 z-40 bg-black/60 transition-opacity lg:hidden" />
      )}

      <aside
        className={`ra-sidebar fixed inset-y-0 left-0 z-50 flex h-full ${width} flex-col bg-[#042C53] text-gray-300 transition-[width,transform] duration-300 ease-in-out lg:relative lg:translate-x-0 border-r border-[#0C447C] ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className={`flex flex-col flex-1 ${collapsed ? 'overflow-visible' : 'overflow-y-auto'}`}>
          {/* Brand */}
          <div className={`flex items-center border-b border-[#0C447C] py-5 ${collapsed ? 'justify-center px-3' : 'justify-between px-5'}`}>
            <div className={`flex items-center ${collapsed ? '' : 'gap-3'} min-w-0`}>
              <div
                className="ra-brand-icon flex h-9 w-9 items-center justify-center rounded-[10px] shrink-0"
                {...(collapsed ? { onClick: onToggleCollapse, role: 'button', title: 'Perbesar sidebar', style: { cursor: 'pointer' } } : {})}
              >
                <Target size={18} strokeWidth={2.4} />
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <h1 className="ra-brand-title leading-tight truncate" style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: '.3px' }}>
                    PRIMA · Renaksi & Kinerja
                  </h1>
                  <p className="text-[10px] tracking-tight text-[#378ADD] font-semibold mt-0.5 truncate">
                    RSJD Dr. Amino Gondohutomo
                  </p>
                </div>
              )}
            </div>

            {/* Header right actions (expanded only) */}
            {!collapsed && (
              <div className="flex items-center gap-1 shrink-0">
                <Tip label="Kecilkan sidebar"><button
                  onClick={onToggleCollapse}
                  className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border border-[#0C447C]/60 text-[#85B7EB] hover:bg-[#0C447C]/40 hover:text-white transition-all"
                  aria-label="Kecilkan sidebar"
                >
                  <Menu className="h-4 w-4" />
                </button></Tip>

                <button
                  onClick={onToggle}
                  className="rounded-lg p-1.5 hover:bg-[#0C447C]/40 hover:text-white lg:hidden"
                  aria-label="Tutup sidebar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>

          {/* Collapsed-mode expand toggle (below brand) */}
          {collapsed && (
            <div className="hidden lg:flex justify-center py-2 border-b border-[#0C447C]">
              <button
                onClick={onToggleCollapse}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0C447C]/60 text-[#85B7EB] hover:bg-[#0C447C]/40 hover:text-white transition-all"
                data-tooltip="Perluas sidebar"
                data-tooltip-pos="below"
                aria-label="Perluas sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Nav */}
          <div className={`flex-1 py-5 ${collapsed ? 'px-2' : 'px-3'}`}>
            {!collapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                MENU UTAMA
              </p>
            )}

            <nav className={`${collapsed ? 'mt-2' : 'mt-3'} space-y-1`}>
              {/* Data Entry group */}
              <div>
                <button
                  onClick={() => !collapsed && setOpenGroup(dataEntryOpen ? null : 'data-entry')}
                  disabled={collapsed}
                  data-tooltip={collapsed ? 'Data Entry' : ''}
                  data-tooltip-pos="right"
                  className={`group flex w-full items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3'} rounded-lg py-2.5 text-sm font-semibold hover:bg-[#0C447C]/40 hover:text-white transition-all cursor-pointer disabled:cursor-default`}
                >
                  <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EF9F27]/10 text-[#EF9F27] shrink-0">
                      <Database className="h-4 w-4" />
                    </div>
                    {!collapsed && <span className="text-gray-200">Data Entry</span>}
                  </div>
                  {!collapsed && (
                    dataEntryOpen
                      ? <ChevronDown className="h-4 w-4 text-gray-500" />
                      : <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {(dataEntryOpen || collapsed) && (
                  <div className={`mt-1 space-y-0.5 ${collapsed ? '' : 'pl-3 ml-2 border-l border-[#0C447C]/50'}`}>
                    {dataEntrySubMenus.map((sub) => {
                      const Icon = sub.icon;
                      const sel = viewMode === 'data-entry' && currentMenu === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => onSelectDataEntry(sub.id)}
                          data-tooltip={collapsed ? sub.label : ''}
                  data-tooltip-pos="right"
                          className={`flex w-full items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} rounded-lg py-2 text-left text-[13.2px] font-medium transition-all duration-150 cursor-pointer ${
                            sel
                              ? 'bg-gradient-to-r from-[#EF9F27]/20 to-[#BA7517]/15 border-l-2 border-[#EF9F27] text-white shadow-sm font-semibold'
                              : 'text-gray-400 hover:bg-[#0C447C]/25 hover:text-gray-100'
                          }`}
                        >
                          <Icon
                            className={`h-[15.4px] w-[15.4px] shrink-0 ${sel ? 'text-[#EF9F27]' : ''}`}
                            style={!sel ? { color: sub.color } : undefined}
                          />
                          {!collapsed && <span className="truncate">{sub.short}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Kinerja group */}
              <div className={collapsed ? 'pt-2' : 'pt-3'}>
                <button
                  onClick={() => !collapsed && setOpenGroup(kinerjaOpen ? null : 'kinerja')}
                  disabled={collapsed}
                  data-tooltip={collapsed ? 'Realisasi Kinerja' : ''}
                  data-tooltip-pos="right"
                  className={`group flex w-full items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3'} rounded-lg py-2.5 text-sm font-semibold hover:bg-[#0C447C]/40 hover:text-white transition-all cursor-pointer disabled:cursor-default`}
                >
                  <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#378ADD]/10 text-[#378ADD] shrink-0">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    {!collapsed && <span className="text-gray-200">Realisasi Kinerja</span>}
                  </div>
                  {!collapsed && (
                    kinerjaOpen
                      ? <ChevronDown className="h-4 w-4 text-gray-500" />
                      : <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {(kinerjaOpen || collapsed) && (
                  <div className={`mt-1 space-y-0.5 ${collapsed ? '' : 'pl-3 ml-2 border-l border-[#0C447C]/50'}`}>
                    {subMenus.map((sub) => {
                      const Icon = sub.icon;
                      const sel = viewMode === 'dashboard' && currentMenu === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => onSelectMenu(sub.id)}
                          data-tooltip={collapsed ? sub.label : ''}
                  data-tooltip-pos="right"
                          className={`flex w-full items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} rounded-lg py-2 text-left text-[13.2px] font-medium transition-all duration-150 cursor-pointer ${
                            sel
                              ? 'bg-gradient-to-r from-[#378ADD]/20 to-[#1D9E75]/15 border-l-2 border-[#378ADD] text-white shadow-sm font-semibold'
                              : 'text-gray-400 hover:bg-[#0C447C]/25 hover:text-gray-200'
                          }`}
                        >
                          <Icon
                            className={`h-[15.4px] w-[15.4px] shrink-0 ${sel ? 'text-[#378ADD]' : ''}`}
                            style={!sel ? { color: sub.color } : undefined}
                          />
                          {!collapsed && <span className="truncate">{sub.short}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cetak — single button (non-collapsible group) */}
              <div className={collapsed ? 'pt-2' : 'pt-3'}>
                <button
                  onClick={onSelectCetak}
                  data-tooltip={collapsed ? 'Renaksi & Kinerja Cetak' : ''}
                  data-tooltip-pos="right"
                  className={`group flex w-full items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} rounded-lg py-2.5 text-sm font-semibold transition-all cursor-pointer ${
                    viewMode === 'cetak'
                      ? 'bg-gradient-to-r from-[#7C5CFC]/20 to-[#EC4899]/15 border-l-2 border-[#7C5CFC] text-white shadow-sm'
                      : 'text-gray-200 hover:bg-[#0C447C]/40 hover:text-white'
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7C5CFC]/10 text-[#7C5CFC] shrink-0">
                    <Printer className="h-4 w-4" />
                  </div>
                  {!collapsed && <span>Renaksi & Kinerja Cetak</span>}
                </button>
              </div>
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}
