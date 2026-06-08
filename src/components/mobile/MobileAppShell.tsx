'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MobileTabBar, type MobileTab } from './MobileTabBar';
import { SignupSheetsPanel } from '@/components/mobile/signup-sheets/SignupSheetsPanel';
import { WaitTimesSection } from '@/components/blocks/WaitTimesSection';
import { CourtFinderSection } from '@/components/blocks/CourtFinderSection';
import { MoreSection } from '@/components/blocks/MoreSection';
import { useWaitTimes } from '@/hooks/useWaitTimes';

export function MobileAppShell() {
  const {
    waitTimes,
    getStatusFromWaitTime,
    getStatusColor,
    formatTimeDifference,
    handleReportWaitTime,
    handleFlagWaitTime,
    reporting,
    reportSuccess,
    reportCooldownActive,
    reportCooldownSecondsLeft,
  } = useWaitTimes();
  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [selectedBoroughs, setSelectedBoroughs] = useState<string[]>([]);
  const [selectedSurfaces, setSelectedSurfaces] = useState<string[]>([]);
  const [selectedPermitStatuses, setSelectedPermitStatuses] = useState<string[]>([]);

  const contentPaddingBottom = 'calc(80px + env(safe-area-inset-bottom))';

  return (
    <div className="mobile-app-shell flex min-h-dvh flex-col bg-white">
      {/* Content Area — min-h-0 so flex + overflow-y-auto can scroll on real devices */}
      <main
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pt-[env(safe-area-inset-top)]"
        style={{
          paddingBottom: contentPaddingBottom,
        }}
      >
        {activeTab === 'home' && (
          <div className="flex-1 bg-white px-4 pt-4">
            <WaitTimesSection
              waitTimes={waitTimes}
              getStatusFromWaitTime={getStatusFromWaitTime}
              getStatusColor={getStatusColor}
              formatTimeDifference={formatTimeDifference}
              handleReportWaitTime={handleReportWaitTime}
              handleFlagWaitTime={handleFlagWaitTime}
              reporting={reporting}
              reportSuccess={reportSuccess}
              reportCooldownActive={reportCooldownActive}
              reportCooldownSecondsLeft={reportCooldownSecondsLeft}
            />
          </div>
        )}

        {activeTab === 'courts' && (
          <div className="flex-1 px-4 py-6">
            <CourtFinderSection
              selectedBoroughs={selectedBoroughs}
              selectedSurfaces={selectedSurfaces}
              selectedPermitStatuses={selectedPermitStatuses}
              onBoroughChange={(borough, checked) =>
                setSelectedBoroughs((prev) =>
                  checked ? [...prev, borough] : prev.filter((b) => b !== borough)
                )
              }
              onSurfaceChange={(surface, checked) =>
                setSelectedSurfaces((prev) =>
                  checked ? [...prev, surface] : prev.filter((s) => s !== surface)
                )
              }
              onPermitStatusChange={(permit, checked) =>
                setSelectedPermitStatuses((prev) =>
                  checked ? [...prev, permit] : prev.filter((p) => p !== permit)
                )
              }
              filtersCollapsed={filtersCollapsed}
              onFiltersCollapsedChange={setFiltersCollapsed}
              isMobile
            />
          </div>
        )}

        {activeTab === 'sheets' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <SignupSheetsPanel />
          </div>
        )}

        {activeTab === 'map' && (
          <div className="flex-1 px-4 py-4">
            <CourtFinderSection
              selectedBoroughs={selectedBoroughs}
              selectedSurfaces={selectedSurfaces}
              selectedPermitStatuses={selectedPermitStatuses}
              onBoroughChange={(borough, checked) =>
                setSelectedBoroughs((prev) =>
                  checked ? [...prev, borough] : prev.filter((b) => b !== borough)
                )
              }
              onSurfaceChange={(surface, checked) =>
                setSelectedSurfaces((prev) =>
                  checked ? [...prev, surface] : prev.filter((s) => s !== surface)
                )
              }
              onPermitStatusChange={(permit, checked) =>
                setSelectedPermitStatuses((prev) =>
                  checked ? [...prev, permit] : prev.filter((p) => p !== permit)
                )
              }
              filtersCollapsed={filtersCollapsed}
              onFiltersCollapsedChange={setFiltersCollapsed}
              isMobile
              mapOnly
            />
          </div>
        )}

        {activeTab === 'more' && (
          <div className="flex-1 px-4 py-6">
            <MoreSection isMobile />
          </div>
        )}
      </main>

      <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

