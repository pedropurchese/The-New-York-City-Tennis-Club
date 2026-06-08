'use client';

import { useRef, useState, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import type { WaitTime } from '@/lib/supabase';
import type { WaitReportVoteKind } from '@/lib/waitTimeReportVotes';
import { LiveUpdateCourtCard } from '@/components/blocks/LiveUpdateCourtCard';

type MobileWaitTab = 'report' | 'live';
const DEUCE_APP_STORE_URL = 'https://apps.apple.com/us/app/deuce/id6749827534';

interface WaitTimesSectionProps {
  waitTimes: { [key: string]: WaitTime | null };
  getStatusFromWaitTime: (waitTime: string) => string;
  getStatusColor: (status: string) => string;
  formatTimeDifference: (timestamp: number) => string;
  handleReportWaitTime: (courtName: string, waitTime: string, comment: string) => Promise<void>;
  handleFlagWaitTime: (reportId: string, kind: WaitReportVoteKind) => Promise<void>;
  reporting: string | null;
  reportSuccess: string | null;
  reportCooldownActive?: boolean;
  reportCooldownSecondsLeft?: number;
}

const COURT_NAMES = [
  'Hudson River Park Courts',
  'Pier 42',
  'Brian Watkins Tennis Courts',
  'South Oxford Park Tennis Courts',
] as const;

export function WaitTimesSection({
  waitTimes,
  getStatusFromWaitTime,
  getStatusColor,
  formatTimeDifference,
  handleReportWaitTime,
  handleFlagWaitTime,
  reporting,
  reportSuccess,
  reportCooldownActive = false,
  reportCooldownSecondsLeft = 0,
}: WaitTimesSectionProps) {
  const [mobileTab, setMobileTab] = useState<MobileWaitTab>('report');
  /** Avoid duplicate ref targets (mobile vs desktop); measure once before paint. */
  const [useTabbedMobileLayout, setUseTabbedMobileLayout] = useState(true);

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setUseTabbedMobileLayout(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const hudsonSelectRef = useRef<HTMLSelectElement>(null);
  const hudsonCommentRef = useRef<HTMLInputElement>(null);
  const pierSelectRef = useRef<HTMLSelectElement>(null);
  const pierCommentRef = useRef<HTMLInputElement>(null);
  const brianSelectRef = useRef<HTMLSelectElement>(null);
  const brianCommentRef = useRef<HTMLInputElement>(null);
  const southOxfordSelectRef = useRef<HTMLSelectElement>(null);
  const southOxfordCommentRef = useRef<HTMLInputElement>(null);

  const refs = {
    'Hudson River Park Courts': { select: hudsonSelectRef, comment: hudsonCommentRef },
    'Pier 42': { select: pierSelectRef, comment: pierCommentRef },
    'Brian Watkins Tennis Courts': { select: brianSelectRef, comment: brianCommentRef },
    'South Oxford Park Tennis Courts': { select: southOxfordSelectRef, comment: southOxfordCommentRef },
  };

  const getReportButtonLabel = (courtName: string) => {
    if (reportCooldownActive) {
      return `Wait ${reportCooldownSecondsLeft}s`;
    }
    if (reporting === courtName) return 'Reporting...';
    if (reportSuccess === courtName) return '✓ Reported!';
    return 'Report';
  };

  const isReportButtonDisabled = (courtName: string) =>
    reportCooldownActive || reporting === courtName;

  return (
    <motion.section
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.1 }}
      className="mb-16 md:mb-24"
    >
      <style jsx global>{`
        @keyframes livePulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        .live-indicator { animation: livePulse 2s ease-in-out infinite; }
        .live-dot { animation: livePulse 1.5s ease-in-out infinite; }
      `}</style>

      <motion.h2
        id="wait-times"
        className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-12 md:mb-20 text-gray-800 dark:text-white"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        SmartCourt NYC — Live Status
      </motion.h2>
      <p className="mb-6 -mt-8 text-center text-sm text-[#1A1A1A]/80 md:mb-10 md:text-base">
        Looking for a hitting partner?{' '}
        <a
          href={DEUCE_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#1a3d1f] underline underline-offset-2 hover:text-[#16331a]"
        >
          Find one on Deuce
        </a>
      </p>

      {useTabbedMobileLayout ? (
        <>
          <div className="mb-4">
            <div
              role="tablist"
              aria-label="Wait times"
              className="flex overflow-hidden rounded-lg border-2 border-[#2D5A27]/35"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'report'}
                aria-controls="wait-panel-report"
                id="wait-tab-report"
                tabIndex={mobileTab === 'report' ? 0 : -1}
                onClick={() => setMobileTab('report')}
                className={`min-h-[48px] flex-1 px-2 py-2.5 text-center text-sm font-semibold transition-colors ${
                  mobileTab === 'report'
                    ? 'bg-[#1a3d1f] text-white'
                    : 'bg-white text-gray-500'
                }`}
              >
                Report Wait Time
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'live'}
                aria-controls="wait-panel-live"
                id="wait-tab-live"
                tabIndex={mobileTab === 'live' ? 0 : -1}
                onClick={() => setMobileTab('live')}
                className={`min-h-[48px] flex-1 px-2 py-2.5 text-center text-sm font-semibold transition-colors ${
                  mobileTab === 'live'
                    ? 'bg-[#1a3d1f] text-white'
                    : 'bg-white text-gray-500'
                }`}
              >
                Live Updates
              </button>
            </div>
          </div>

          <div
            id="wait-panel-report"
            role="tabpanel"
            aria-labelledby="wait-tab-report"
            hidden={mobileTab !== 'report'}
            className="space-y-4"
          >
            {mobileTab === 'report' &&
              COURT_NAMES.map((courtName) => (
                <div
                  key={courtName}
                  className="rounded-lg border-2 border-[#2D5A27]/35 bg-white/45 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-[#2D5A27]">{courtName}</h4>
                    <div
                      className={`w-4 h-4 min-w-[16px] min-h-[16px] ${
                        waitTimes[courtName]
                          ? getStatusColor(getStatusFromWaitTime(waitTimes[courtName]!.wait_time))
                          : 'bg-gray-500'
                      } rounded-full`}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <select
                      className="min-h-[44px] w-full rounded-lg border-2 border-[#2D5A27]/40 bg-white/70 px-2 py-2 text-sm text-[#1A1A1A] backdrop-blur-sm focus:border-[#2D5A27] focus:outline-none focus:ring-2 focus:ring-[#2D5A27] focus:ring-opacity-20"
                      defaultValue={waitTimes[courtName]?.wait_time || 'Select wait time...'}
                      ref={refs[courtName].select}
                    >
                      <option value="Select wait time...">Select wait time...</option>
                      <option value="Less than 1 hour">Less than 1 hour</option>
                      <option value="1-2 hours">1-2 hours</option>
                      <option value="2-3 hours">2-3 hours</option>
                      <option value="More than 3 hours">More than 3 hours</option>
                    </select>
                    <input
                      type="text"
                      placeholder="e.g. 6 rackets on fence, or 6 benches filled"
                      className="min-h-[36px] w-full rounded-lg border-2 border-[#2D5A27]/40 bg-white/70 px-2.5 py-1.5 text-xs text-[#1A1A1A] backdrop-blur-sm focus:border-[#2D5A27] focus:outline-none focus:ring-2 focus:ring-[#2D5A27] focus:ring-opacity-20"
                      ref={refs[courtName].comment}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleReportWaitTime(
                          courtName,
                          refs[courtName].select.current?.value || '',
                          refs[courtName].comment.current?.value || ''
                        )
                      }
                      disabled={isReportButtonDisabled(courtName)}
                      className={`min-h-[44px] w-full rounded-lg px-2 py-2 text-sm font-medium transition-all duration-300 ${
                        isReportButtonDisabled(courtName)
                          ? 'cursor-not-allowed bg-gray-400 text-white'
                          : reportSuccess === courtName
                            ? 'bg-[#2D5A27] text-[#FFFDD0] scale-[1.02]'
                            : 'bg-[#2D5A27] text-[#FFFDD0] hover:bg-[#24481f]'
                      }`}
                    >
                      {getReportButtonLabel(courtName)}
                    </button>
                  </div>
                </div>
              ))}
          </div>

          <div
            id="wait-panel-live"
            role="tabpanel"
            aria-labelledby="wait-tab-live"
            hidden={mobileTab !== 'live'}
            className="space-y-4"
          >
            {mobileTab === 'live' &&
              COURT_NAMES.map((courtName) => (
                <LiveUpdateCourtCard
                  key={courtName}
                  courtName={courtName}
                  report={waitTimes[courtName]}
                  getStatusFromWaitTime={getStatusFromWaitTime}
                  getStatusColor={getStatusColor}
                  formatTimeDifference={formatTimeDifference}
                  onFlag={handleFlagWaitTime}
                  cardClassName="rounded-lg border-2 border-[#2D5A27]/35 bg-white/45 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md"
                  titleClassName="text-[#2D5A27]"
                  commentQuoted={false}
                />
              ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16">
          <motion.div
            className="space-y-4 md:space-y-6"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="flex items-center gap-3 mb-4 md:mb-6">
              <h3 className="text-xl md:text-2xl lg:text-3xl font-semibold text-gray-800 dark:text-white">
                Report Wait Time
              </h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full live-dot" />
                <span className="text-sm font-bold text-red-500 live-indicator">LIVE</span>
              </div>
            </div>

            <div className="space-y-4">
              {COURT_NAMES.map((courtName) => (
                <div
                  key={courtName}
                  className="rounded-lg border-2 border-[#2D5A27]/35 bg-white/45 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md min-h-[44px]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-[#2D5A27]">{courtName}</h4>
                    <div
                      className={`w-4 h-4 min-w-[16px] min-h-[16px] ${
                        waitTimes[courtName]
                          ? getStatusColor(getStatusFromWaitTime(waitTimes[courtName]!.wait_time))
                          : 'bg-gray-500'
                      } rounded-full`}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:grid-rows-[auto_auto]">
                    <select
                      className="min-h-[44px] w-full min-w-0 rounded-lg border-2 border-[#2D5A27]/40 bg-white/70 px-2 py-2 text-sm text-[#1A1A1A] backdrop-blur-sm focus:border-[#2D5A27] focus:outline-none focus:ring-2 focus:ring-[#2D5A27] focus:ring-opacity-20 md:col-start-1 md:row-start-1"
                      defaultValue={waitTimes[courtName]?.wait_time || 'Select wait time...'}
                      ref={refs[courtName].select}
                    >
                      <option value="Select wait time...">Select wait time...</option>
                      <option value="Less than 1 hour">Less than 1 hour</option>
                      <option value="1-2 hours">1-2 hours</option>
                      <option value="2-3 hours">2-3 hours</option>
                      <option value="More than 3 hours">More than 3 hours</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Leave a comment about the wait time..."
                      className="min-h-[44px] w-full rounded-lg border-2 border-[#2D5A27]/40 bg-white/70 px-3 py-2 text-sm text-[#1A1A1A] backdrop-blur-sm focus:border-[#2D5A27] focus:outline-none focus:ring-2 focus:ring-[#2D5A27] focus:ring-opacity-20 md:col-span-2 md:row-start-2"
                      ref={refs[courtName].comment}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleReportWaitTime(
                          courtName,
                          refs[courtName].select.current?.value || '',
                          refs[courtName].comment.current?.value || ''
                        )
                      }
                      disabled={isReportButtonDisabled(courtName)}
                      className={`min-h-[44px] rounded-lg px-2 py-2 text-xs font-medium transition-all duration-300 whitespace-nowrap md:col-start-2 md:row-start-1 ${
                        isReportButtonDisabled(courtName)
                          ? 'cursor-not-allowed bg-gray-400 text-white'
                          : reportSuccess === courtName
                            ? 'bg-[#2D5A27] text-[#FFFDD0] scale-105'
                            : 'bg-[#2D5A27] text-[#FFFDD0] hover:bg-[#24481f] hover:scale-105'
                      }`}
                    >
                      {getReportButtonLabel(courtName)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="space-y-4 md:space-y-6"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="flex items-center gap-3 mb-4 md:mb-6">
              <h3 className="text-xl md:text-2xl lg:text-3xl font-semibold text-gray-800 dark:text-white">
                Live Updates
              </h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full live-dot" />
                <span className="text-sm font-bold text-red-500 live-indicator">LIVE</span>
              </div>
            </div>

            <div className="space-y-4">
              {COURT_NAMES.map((courtName) => (
                <LiveUpdateCourtCard
                  key={courtName}
                  courtName={courtName}
                  report={waitTimes[courtName]}
                  getStatusFromWaitTime={getStatusFromWaitTime}
                  getStatusColor={getStatusColor}
                  formatTimeDifference={formatTimeDifference}
                  onFlag={handleFlagWaitTime}
                  cardClassName="rounded-lg border-2 border-[#2D5A27]/35 bg-white/45 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md"
                  titleClassName="text-[#2D5A27]"
                />
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </motion.section>
  );
}
