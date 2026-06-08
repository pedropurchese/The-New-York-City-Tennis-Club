'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { motion, AnimatePresence } from 'framer-motion';
import ScrollExpandMedia from '@/components/blocks/scroll-expansion-hero';
import { MobileAppShell } from '@/components/mobile/MobileAppShell';
import { SignupSheetsPanel } from '@/components/mobile/signup-sheets/SignupSheetsPanel';
import { supabase, formatSupabaseError, WaitTime, NewWaitTime } from '@/lib/supabase';
import { normalizeCourtNameFromDb } from '@/lib/waitTimesCourt';
import { ensureSmartcourtDeviceIdOnPageLoad, getOrCreateSmartcourtDeviceId } from '@/lib/smartcourtDeviceId';
import {
  releaseWaitTimeReportLock,
  startWaitTimeReportCooldown,
  tryAcquireWaitTimeReportLock,
} from '@/lib/waitTimeReportCooldown';
import { useWaitTimeReportCooldown } from '@/hooks/useWaitTimeReportCooldown';
import { incrementWaitTimeFlag, alertFlagError } from '@/lib/incrementWaitTimeFlag';
import {
  mergeWaitTimeUpdateIntoCourts,
  subscribeWaitTimesRealtime,
} from '@/lib/waitTimesRealtime';
import type { WaitReportVoteKind } from '@/lib/waitTimeReportVotes';
import { LiveUpdateCourtCard } from '@/components/blocks/LiveUpdateCourtCard';

const DEUCE_APP_STORE_URL = 'https://apps.apple.com/us/app/deuce/id6749827534';


// Interface for court data
interface CourtData {
  id: number;
  name: string;
  address: string;
  borough: string;
  surface: string;
  permitStatus: string;
  courts: number;
  datesOpen: string;
  hours: string;
  description: string;
  lat: number;
  lng: number;
}

// Function to load and parse CSV data
const loadCourtsData = async (): Promise<CourtData[]> => {
  try {
    const response = await fetch('/NYC TENNIS COURTS - Sheet1.csv');
    const csvText = await response.text();
    
    // Use a more robust CSV parser that handles multi-line quoted fields
    const courts: CourtData[] = [];
    const lines = csvText.split('\n');
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    // Skip header row
    let startParsing = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (i === 0) {
        startParsing = true;
        continue; // Skip header
      }
      
      if (!startParsing) continue;
      
      // Parse character by character
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          currentRow.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
      }
      
      // If we're not in quotes, this line ends a record
      if (!inQuotes) {
        currentRow.push(currentField.trim());

        // Process the complete row if it has enough fields
        if (currentRow.length >= 11) {
          const court: CourtData = {
            id: courts.length + 1,
            name: currentRow[0] || '',
            address: currentRow[1] || '',
            borough: currentRow[2] || '',
            surface: currentRow[3] || '',
            permitStatus: currentRow[4] || '',
            courts: parseInt(currentRow[5]) || 0,
            datesOpen: currentRow[6] || '',
            hours: currentRow[7] || '',
            description: currentRow[8] || '',
            lat: parseFloat(currentRow[9]) || 0,
            lng: parseFloat(currentRow[10]) || 0,
          };
          
          if (court.lat === 0 || court.lng === 0 || !court.name || court.name.length === 0) {
            // skip invalid row
          } else {
            courts.push(court);
          }
        }
        
        // Reset for next row
        currentRow = [];
        currentField = '';
      } else {
        // Add line break if we're continuing a multi-line field
        currentField += '\n';
      }
    }

    return courts;
  } catch (error) {
    console.error('Error loading courts data:', error);
    return [];
  }
};




// Google Maps Component
const MapComponent = ({ courts, selectedBoroughs, selectedSurfaces, selectedPermitStatuses }: {
  courts: CourtData[];
  selectedBoroughs: string[];
  selectedSurfaces: string[];
  selectedPermitStatuses: string[];
}) => {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);

  // Use useMemo to prevent filteredCourts from changing on every render
  const filteredCourts = useMemo(() => {
    return courts.filter(court => {
      const boroughMatch = selectedBoroughs.length === 0 || selectedBoroughs.includes(court.borough);
      const surfaceMatch = selectedSurfaces.length === 0 || selectedSurfaces.includes(court.surface);
      const permitMatch = selectedPermitStatuses.length === 0 || selectedPermitStatuses.includes(court.permitStatus);
      return boroughMatch && surfaceMatch && permitMatch;
    });
  }, [courts, selectedBoroughs, selectedSurfaces, selectedPermitStatuses]);

  useEffect(() => {
    if (!map) return;

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));

    // Create new markers for filtered courts
    const newMarkers = filteredCourts.map(court => {
      const marker = new google.maps.Marker({
        position: { lat: court.lat, lng: court.lng },
        map: map,
        title: court.name,
        icon: {
          url: getSurfaceIcon(),
          scaledSize: new google.maps.Size(30, 30)
        }
      });

      // Info window for court details
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="color: black; font-family: Arial, sans-serif; max-width: 300px; padding: 8px;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">${court.name}</h3>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">${court.address}</p>
            <div style="margin: 8px 0;">
              <p style="margin: 2px 0;"><strong>Surface:</strong> ${court.surface}</p>
              <p style="margin: 2px 0;"><strong>Courts:</strong> ${court.courts}</p>
              <p style="margin: 2px 0;"><strong>Hours:</strong> ${court.hours}</p>
              <p style="margin: 2px 0;"><strong>Season:</strong> ${court.datesOpen}</p>
              <p style="margin: 2px 0;"><strong>Permit:</strong> ${court.permitStatus}</p>
            </div>
            ${court.description ? `<p style="margin: 8px 0 0 0; font-size: 12px; color: #555; border-top: 1px solid #eee; padding-top: 8px; line-height: 1.4;">${court.description}</p>` : ''}
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      return marker;
    });

    setMarkers(newMarkers);
  }, [map, filteredCourts]);

  const getSurfaceIcon = () => {
    // Brand pin color (navy)
    const color = '#2D5A27';
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="15" cy="15" r="4" fill="white"/>
      </svg>`
    )}`;
  };

  const mapRef = (node: HTMLDivElement | null) => {
    if (node && !map) {
      const newMap = new google.maps.Map(node, {
        center: { lat: 40.7902065, lng: -73.9621475 }, // Central Park
        zoom: 12,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
          },
          {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#f5f5f5" }]
          },
          {
            featureType: "landscape",
            elementType: "geometry",
            stylers: [{ color: "#f0f0f0" }]
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#e0e0e0" }]
          },
          {
            featureType: "administrative",
            elementType: "labels",
            stylers: [{ visibility: "simplified" }]
          },
          {
            featureType: "transit",
            stylers: [{ visibility: "off" }]
          }
        ]
      });
      setMap(newMap);
    }
  };

  return <div ref={mapRef} style={{ width: '100%', height: '400px', borderRadius: '8px' }} className="md:h-[600px]" />;
};

// Render component for Google Maps
const render = (status: Status) => {
  if (status === Status.FAILURE) {
    return <div className="text-red-500 p-4 text-center">Error loading Google Maps. Please check your API key.</div>;
  }
  return <div className="text-center p-4">Loading Google Maps...</div>;
};

// Q&A Item Component
const QAItem = ({ qa }: { qa: { question: string; answer: string } }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className='relative'
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Question - Always visible */}
      <div className='py-4 md:py-6 cursor-pointer transition-all duration-300'>
        <div className='flex items-center justify-between'>
          <h3 className={`text-xl md:text-2xl font-semibold transition-colors duration-300 ${isHovered ? 'text-[#2e4f7a]' : 'text-gray-800'}`}>
            {qa.question}
          </h3>
          <motion.svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="black"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-6 h-6 transition-all duration-300`}
            animate={{ rotate: isHovered ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <path d="m12 5 7 7-7 7"/>
          </motion.svg>
        </div>
      </div>

      {/* Answer - Appears on hover */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className='overflow-hidden'
          >
            <div className='pb-4'>
              <p className='text-gray-700 leading-relaxed text-base md:text-lg'>
                {qa.answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface MediaAbout {
  overview: string;
  conclusion: string;
}

interface MediaContent {
  src: string;
  poster?: string;
  background: string;
  title: string;
  date: string;
  scrollToExpand: string;
  about: MediaAbout;
}

interface MediaContentCollection {
  [key: string]: MediaContent;
}

/** Optional photo hero if you switch ScrollExpandMedia to backdrop="image". */
const HERO_AMBIENT_BG =
  'https://images.unsplash.com/photo-1587280501635-68a419bf0b43?q=85&w=2400&auto=format&fit=crop';

const sampleMediaContent: MediaContentCollection = {
  video: {
    // You can use local files from public folder like this:
    // src: '/your-video.mp4',
    // poster: '/your-poster.jpg',
    // background: '/your-background.jpg',
    
    // Using your tennis video:
    src: '/mixkit-two-people-playing-tennis-aerial-view-880-hd-ready.mp4',
    poster: HERO_AMBIENT_BG,
    background: HERO_AMBIENT_BG,
    title: 'SmartCourtNYC',
    date: 'Scroll down',
    scrollToExpand: 'Scroll Down',
    about: {
      overview:
        'Welcome to SmartCourt NYC - your ultimate resource for real-time wait times and court availability across NYC\'s premier tennis facilities. We\'re revolutionizing the way New Yorkers access tennis courts by providing instant updates, eliminating guesswork, and ensuring you never waste time waiting for a court again.',
      conclusion:
        'Join the tennis revolution in NYC. With our innovative platform, you can check wait times, book courts instantly, and maximize your playing time. Experience the future of tennis accessibility in the city that never sleeps.',
    },
  },
  image: {
    // You can use local files from public folder like this:
    // src: '/your-image.jpg',
    // background: '/your-background.jpg',
    
    // Or keep using external URLs:
    src: 'https://images.unsplash.com/photo-1682687982501-1e58ab814714?q=80&w=1280&auto=format&fit=crop',
    background: HERO_AMBIENT_BG,
    title: 'SmartCourtNYC',
    date: 'Scroll down',
    scrollToExpand: 'Scroll Down',
    about: {
      overview:
        'SmartCourt NYC is transforming the tennis experience in NYC. Our platform provides real-time wait times, court availability, and instant booking capabilities, making it easier than ever for tennis enthusiasts to find and secure court time across the city.',
      conclusion:
        'Say goodbye to long waits and hello to more tennis. Our revolutionary approach to court management is changing the game for NYC tennis players, ensuring you spend more time playing and less time waiting.',
    },
  },
};

const MediaContent = ({ mediaType }: { mediaType: 'video' | 'image' }) => {
  const [selectedBoroughs, setSelectedBoroughs] = useState<string[]>([]);
  const [selectedSurfaces, setSelectedSurfaces] = useState<string[]>([]);
  const [selectedPermitStatuses, setSelectedPermitStatuses] = useState<string[]>([]);
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPlayed, setHasPlayed] = useState(false);

  // State for wait times and live updates from Supabase
  const [waitTimes, setWaitTimes] = useState<{ [key: string]: WaitTime | null }>({
    'Hudson River Park Courts': null,
    'Pier 42': null,
    'Brian Watkins Tennis Courts': null,
    'South Oxford Park Tennis Courts': null,
  });
  const [waitTimesLoading, setWaitTimesLoading] = useState(true);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);
  const {
    reportCooldownActive,
    reportCooldownSecondsLeft,
    refreshCooldown,
  } = useWaitTimeReportCooldown();

  // Refs for form elements
  const hudsonSelectRef = useRef<HTMLSelectElement>(null);
  const hudsonCommentRef = useRef<HTMLInputElement>(null);
  const pierSelectRef = useRef<HTMLSelectElement>(null);
  const pierCommentRef = useRef<HTMLInputElement>(null);
  const brianSelectRef = useRef<HTMLSelectElement>(null);
  const brianCommentRef = useRef<HTMLInputElement>(null);
  const southOxfordSelectRef = useRef<HTMLSelectElement>(null);
  const southOxfordCommentRef = useRef<HTMLInputElement>(null);

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





  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Helper function to get default comment based on wait time
  const getDefaultComment = (waitTime: string) => {
    // Return empty string so no default comment is generated
    return '';
  };

  // Helper function to determine status color from wait time
  const getStatusFromWaitTime = (waitTime: string) => {
    if (waitTime.includes('Less than 1 hour')) return 'green';
    if (waitTime.includes('1-2 hours')) return 'yellow';
    if (waitTime.includes('2-3 hours')) return 'orange';
    if (waitTime.includes('More than 3 hours')) return 'red';
    return 'gray';
  };

  // Get status color for display
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'green': return 'bg-[#4a6fa5]';
      case 'yellow': return 'bg-yellow-500';
      case 'orange': return 'bg-orange-500';
      case 'red': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // Function to format time difference
  const formatTimeDifference = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) !== 1 ? 's' : ''} ago`;
  };

  // Load wait times from Supabase - Load only recent, non-expired data
  const loadWaitTimes = async () => {
    try {
      setWaitTimesLoading(true);
      if (!supabase) {
        setWaitTimes({
          'Hudson River Park Courts': null,
          'Pier 42': null,
          'Brian Watkins Tennis Courts': null,
          'South Oxford Park Tennis Courts': null,
        });
        return;
      }
      // Load only non-expired wait times from database
      const { data, error } = await supabase
        .from('wait_times')
        .select('*')
        .gt('expires_at', new Date().toISOString()) // Only get non-expired records
        .order('created_at', { ascending: false });

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Supabase not configured or error loading wait times:', error.message || error);
        }
        // Fallback to empty state
        const courtWaitTimes: { [key: string]: WaitTime | null } = {
          'Hudson River Park Courts': null,
          'Pier 42': null,
          'Brian Watkins Tennis Courts': null,
          'South Oxford Park Tennis Courts': null,
        };
        setWaitTimes(courtWaitTimes);
        return;
      }

      // Group by court name and get the most recent entry for each court
      const courtWaitTimes: { [key: string]: WaitTime | null } = {
        'Hudson River Park Courts': null,
        'Pier 42': null,
        'Brian Watkins Tennis Courts': null,
        'South Oxford Park Tennis Courts': null,
      };

      if (data) {
        data.forEach((row) => {
          const key = normalizeCourtNameFromDb(row.court_name);
          if (courtWaitTimes.hasOwnProperty(key) && !courtWaitTimes[key]) {
            courtWaitTimes[key] = row;
          }
        });
      }

      setWaitTimes(courtWaitTimes);
    } catch (error) {
      if (process.env.NODE_ENV === 'development' && supabase) {
        console.warn('Error loading wait times:', error instanceof Error ? error.message : 'Unknown error');
      }
      // Fallback to empty state
      const courtWaitTimes: { [key: string]: WaitTime | null } = {
        'Hudson River Park Courts': null,
        'Pier 42': null,
        'Brian Watkins Tennis Courts': null,
        'South Oxford Park Tennis Courts': null,
      };
      setWaitTimes(courtWaitTimes);
    } finally {
      setWaitTimesLoading(false);
    }
  };

  const loadWaitTimesRef = useRef(loadWaitTimes);
  loadWaitTimesRef.current = loadWaitTimes;

  // Clean up expired wait times from database
  const cleanupExpiredWaitTimes = async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('wait_times')
        .delete()
        .lt('expires_at', new Date().toISOString());
      if (error && process.env.NODE_ENV === 'development') {
        console.warn('Cleanup expired wait times:', error.message || error);
      }
    } catch {
      // Silently ignore cleanup errors (e.g. when Supabase not configured)
    }
  };

  // Initialize wait times on component mount + realtime sync
  useEffect(() => {
    ensureSmartcourtDeviceIdOnPageLoad();
    loadWaitTimes();
    cleanupExpiredWaitTimes(); // Clean up old data
    if (!supabase) return;
    return subscribeWaitTimesRealtime(
      supabase,
      (row) => setWaitTimes((prev) => mergeWaitTimeUpdateIntoCourts(prev, row)),
      () => void loadWaitTimesRef.current()
    );
  }, []);

  // Load courts data on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const courtsData = await loadCourtsData();
        setCourts(courtsData);
      } catch (error) {
        console.error('Error loading courts data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Auto-play video when it comes into view
  useEffect(() => {
    if (!isMounted || !videoRef.current) return;

    const video = videoRef.current;
    
    // Force video to load and play on mobile
    const playVideo = async () => {
      try {
        video.load();
        // Try to play immediately
        await video.play();
        setHasPlayed(true);
      } catch {
        // On mobile, we might need user interaction
        const playOnInteraction = () => {
          video.play().catch(() => {});
          document.removeEventListener('touchstart', playOnInteraction);
          document.removeEventListener('click', playOnInteraction);
        };
        document.addEventListener('touchstart', playOnInteraction);
        document.addEventListener('click', playOnInteraction);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasPlayed) {
            playVideo();
          }
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [isMounted, hasPlayed]);







  const handleBoroughChange = (borough: string, checked: boolean) => {
    if (checked) {
      setSelectedBoroughs(prev => [...prev, borough]);
    } else {
      setSelectedBoroughs(prev => prev.filter(b => b !== borough));
    }
  };

  const handleSurfaceChange = (surface: string, checked: boolean) => {
    if (checked) {
      setSelectedSurfaces(prev => [...prev, surface]);
    } else {
      setSelectedSurfaces(prev => prev.filter(s => s !== surface));
    }
  };

  const handlePermitStatusChange = (permitStatus: string, checked: boolean) => {
    if (checked) {
      setSelectedPermitStatuses(prev => [...prev, permitStatus]);
    } else {
      setSelectedPermitStatuses(prev => prev.filter(ps => ps !== permitStatus));
    }
  };



  // Handle reporting wait times to Supabase
  const handleReportWaitTime = async (courtName: string, waitTime: string, comment: string = '') => {
    if (!tryAcquireWaitTimeReportLock()) {
      return;
    }
    if (!waitTime || waitTime === 'Select wait time...') {
      releaseWaitTimeReportLock();
      alert('Please select a wait time before reporting');
      return;
    }

    setReporting(courtName);
    
    try {
      // Check if Supabase is properly configured
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      // Create new wait time record with 2-hour expiration
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // 2 hours from now
      
      const newWaitTime: NewWaitTime & { expires_at: string } = {
        court_name: courtName,
        wait_time: waitTime,
        comment: comment || getDefaultComment(waitTime),
        expires_at: expiresAt.toISOString(),
        device_id: getOrCreateSmartcourtDeviceId(),
      };

      const { error } = await supabase.from('wait_times').insert(newWaitTime).select();

      if (error) throw error;

      startWaitTimeReportCooldown();
      refreshCooldown();
      setReportSuccess(courtName);
      
      // Reset success state after 3 seconds
      setTimeout(() => setReportSuccess(null), 3000);
      
      // Reload wait times to update UI
      await loadWaitTimes();
      
    } catch (error) {
      console.error('Error reporting wait time:', error);
      alert(`Failed to report wait time. ${formatSupabaseError(error)}`);
    } finally {
      releaseWaitTimeReportLock();
      setReporting(null);
    }
  };

  const handleFlagWaitTime = async (reportId: string, kind: WaitReportVoteKind) => {
    if (!supabase) {
      alert('Supabase client not initialized');
      return;
    }
    try {
      await incrementWaitTimeFlag(supabase, reportId, kind);
      await loadWaitTimes();
    } catch (error) {
      console.error('Error flagging wait time:', error);
      alertFlagError(error);
    }
  };

  // Replace with your actual Google Maps API key
  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const hasApiKey = GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY_HERE";

  return (
    <div className='w-full mx-auto px-4'>
      <style jsx global>{`
        /* From Uiverse.io by SujitAdroja */ 
        .btn {
          color: #1F2937 !important;
          text-transform: uppercase !important;
          text-decoration: none !important;
          border: 2px solid white !important;
          padding: 15px 30px !important;
          font-size: 20px !important;
          cursor: pointer !important;
          font-weight: bold !important;
          background: transparent !important;
          position: relative !important;
          transition: all 1s !important;
          overflow: hidden !important;
          display: inline-block !important;
        }

        .btn:hover {
          color: white !important;
        }

        .btn::before {
          content: "" !important;
          position: absolute !important;
          height: 100% !important;
          width: 0% !important;
          top: 0 !important;
          left: -40px !important;
          transform: skewX(45deg) !important;
          background-color: #1F2937 !important;
          z-index: -1 !important;
          transition: all 1s !important;
        }

        .btn:hover::before {
          width: 160% !important;
        }
      `}</style>
      
      <style jsx>{`
        .checkbox-wrapper input[type="checkbox"] {
          visibility: hidden;
          display: none;
        }

        .checkbox-wrapper *,
        .checkbox-wrapper ::after,
        .checkbox-wrapper ::before {
          box-sizing: border-box;
          user-select: none;
        }

        .checkbox-wrapper {
          position: relative;
          display: block;
          overflow: hidden;
        }

        .checkbox-wrapper .label {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .checkbox-wrapper .check {
          width: 50px;
          height: 50px;
          position: absolute;
          opacity: 0;
        }

        .checkbox-wrapper .label svg {
          vertical-align: middle;
        }

        .checkbox-wrapper .path1 {
          stroke-dasharray: 400;
          stroke-dashoffset: 400;
          transition: .5s stroke-dashoffset;
          opacity: 0;
          stroke: #2D5A27;
          stroke-width: 3;
          fill: none;
        }

        .checkbox-wrapper input[type="checkbox"]:checked + label svg g path {
          stroke-dashoffset: 0;
          opacity: 1;
        }

        .checkbox-wrapper .checkbox-rect {
          stroke: #d1d5db;
          fill: none;
          stroke-width: 2;
          transition: all 0.3s ease;
        }

        .checkbox-wrapper input[type="checkbox"]:checked + label svg rect {
          stroke: #2D5A27;
          fill: #2D5A27;
        }

        /* Brand-tinted hover cards */
        .cards {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }

        .cards .red {
          background-color: white;
          box-shadow: 0 6px 20px rgba(30, 58, 95, 0.4);
          border: 2px solid rgba(30, 58, 95, 0.3);
        }

        .cards .blue {
          background-color: white;
          box-shadow: 0 6px 20px rgba(30, 58, 95, 0.4);
          border: 2px solid rgba(30, 58, 95, 0.3);
        }

        .cards .green {
          background-color: white;
          box-shadow: 0 6px 20px rgba(30, 58, 95, 0.4);
          border: 2px solid rgba(30, 58, 95, 0.3);
        }

        .cards .card {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          flex-direction: row;
          text-align: left;
          height: 120px;
          width: 100%;
          max-width: 350px;
          border-radius: 15px;
          color: #374151;
          cursor: pointer;
          transition: 400ms;
          padding: 20px;
          position: relative;
          margin: 0 auto;
        }

        .cards .card p.tip {
          font-size: 1.1em;
          font-weight: 700;
          color: #111827;
          margin-bottom: 6px;
          background: none;
          border: none;
          box-shadow: none;
          padding: 0;
        }

        .cards .card p.second-text {
          font-size: 0.9em;
          color: #6b7280;
          background: none;
          border: none;
          box-shadow: none;
          padding: 0;
        }

        /* Mobile responsive adjustments for cards */
        @media (max-width: 768px) {
          .cards .card {
            height: 100px;
            max-width: 100%;
            padding: 16px;
          }
          
          .cards .card p.tip {
            font-size: 1em;
            margin-bottom: 5px;
          }
          
          .cards .card p.second-text {
            font-size: 0.8em;
          }
        }

        .cards .card .comment-box {
          position: absolute;
          bottom: -60px;
          left: -20px;
          background: white;
          border: 2px solid rgba(30, 58, 95, 0.5);
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: 0 4px 12px rgba(30, 58, 95, 0.3);
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
          white-space: nowrap;
          font-size: 0.9em;
          color: #374151;
          z-index: 10;
        }

        .cards .card:hover {
          /* Keep shadow effect but no scale transform to prevent text movement */
          box-shadow: 0 10px 30px rgba(30, 58, 95, 0.5);
        }

        .cards .card:hover .comment-box {
          opacity: 1;
          visibility: visible;
          bottom: -50px;
        }

        .cards:hover > .card:not(:hover) {
          filter: blur(8px);
          /* Keep blur effect but no scale transform to prevent text movement */
        }

        /* Animated Hover Bars - From Uiverse.io by joe-watson-sbf */
        .card {
          width: 100%;
          max-width: 600px;
          height: 350px;
          border-radius: 12px;
          background: #2D5A27;
          display: flex;
          gap: 12px;
          padding: 1.2em;
          margin: 0 auto;
        }

        .card p {
          height: 100%;
          flex: 1;
          overflow: hidden;
          cursor: pointer;
          border-radius: 8px;
          transition: all .5s;
          background: white;
          border: 2px solid #2D5A27;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .card > div:hover {
          flex: 6;
        }

        .card > div span {
          min-width: 22em;
          padding: 1.5em;
          text-align: center;
          transform: rotate(-90deg);
          transition: all .5s;
          text-transform: uppercase;
          color: #2D5A27;
          letter-spacing: .1em;
          font-size: 1.1em;
          font-weight: 600;
        }

        .card > div:hover span {
          transform: rotate(0);
        }

        /* Mobile responsive adjustments */
        @media (max-width: 768px) {
          .card {
            width: 100%;
            max-width: 100%;
            height: 250px;
            flex-direction: column;
            gap: 10px;
            padding: 1em;
          }
          
          .card > div span {
            min-width: auto;
            font-size: 1em;
            padding: 1em;
          }
          
          .card > div:hover {
            flex: 1;
          }
        }

        /* Comment Input Boxes for Interactive Court Info */
        .comment-inputs {
          margin-top: 20px;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }

        .card:hover + .comment-inputs {
          opacity: 1;
          visibility: visible;
        }

        .comment-input {
          margin-bottom: 15px;
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.3s ease;
        }

        .card:hover + .comment-inputs .comment-input {
          opacity: 1;
          transform: translateY(0);
        }

        .comment-input input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid rgba(30, 58, 95, 0.3);
          border-radius: 8px;
          background: white;
          color: #374151;
          font-size: 0.9em;
          transition: all 0.3s ease;
        }

        .comment-input input:focus {
          outline: none;
          border-color: rgba(30, 58, 95, 0.6);
          box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.1);
        }

        .comment-input input::placeholder {
          color: #9ca3af;
        }

        /* Comment Input Boxes Within Each Hover Bar */
        .card > div {
          height: 100%;
          flex: 1;
          overflow: hidden;
          cursor: pointer;
          border-radius: 6px;
          transition: all .5s;
          background: white;
          border: 2px solid #2e4f7a;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          position: relative;
        }

        .card > div .comment-input-inline {
          position: absolute;
          bottom: 40px;
          left: 15px;
          right: 15px;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
          transform: translateY(10px);
        }

        .card > div:hover .comment-input-inline {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }

        .comment-input-inline input {
          width: 100%;
          padding: 18px 24px;
          border: 2px solid rgba(30, 58, 95, 0.4);
          border-radius: 12px;
          background: white;
          color: #374151;
          font-size: 1.2em;
          transition: all 0.3s ease;
        }

        .comment-input-inline input:focus {
          outline: none;
          border-color: rgba(30, 58, 95, 0.7);
          box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.1);
        }

        .comment-input-inline input::placeholder {
          color: #9ca3af;
          font-size: 0.8em;
        }

        /* Wait Time Controls */
        .wait-time-controls {
          position: absolute;
          bottom: 140px;
          left: 20px;
          right: 20px;
          display: flex;
          gap: 16px;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
          transform: translateY(10px);
        }

        .card > div:hover .wait-time-controls {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }

        .wait-time-selector {
          flex: 1;
        }

        .wait-time-selector select {
          width: 100%;
          padding: 14px 18px;
          border: 2px solid rgba(30, 58, 95, 0.4);
          border-radius: 10px;
          background: white;
          color: #374151;
          font-size: 1em;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .wait-time-selector select:focus {
          outline: none;
          border-color: rgba(30, 58, 95, 0.7);
          box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.1);
        }

        .report-btn {
          padding: 14px 24px;
          background: rgba(30, 58, 95, 0.9);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 1em;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          white-space: nowrap;
        }

        .report-btn:hover {
          background: rgba(30, 58, 95, 1);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(30, 58, 95, 0.3);
        }
        
        /* Additional mobile optimizations */
        @media (max-width: 768px) {
          /* Ensure proper mobile spacing */
          .container {
            padding-left: 1rem;
            padding-right: 1rem;
          }
          
          /* Better mobile card spacing */
          .cards {
            gap: 15px;
          }
          
          /* Mobile-friendly input sizing */
          .comment-input-inline input,
          .wait-time-selector select {
            font-size: 0.85em;
            padding: 12px 16px;
          }
          
          /* Mobile button sizing */
          .report-btn {
            padding: 8px 16px;
            font-size: 0.85em;
          }
          
          /* Ensure no horizontal overflow */
          .card > div span {
            word-break: break-word;
            max-width: 100%;
          }
          
          /* Mobile card padding adjustments */
          .bg-white.border-2.border-\[#1e3a5f\].rounded-lg {
            padding: 12px !important;
          }
          
          /* Mobile button container */
          .flex.gap-2.flex-wrap {
            gap: 8px !important;
          }
          
          /* Mobile select and button sizing */
          .flex-1.min-w-0 {
            min-width: 0 !important;
            flex-shrink: 1 !important;
          }
          
          .px-2.py-2.rounded-lg {
            padding: 6px 8px !important;
            font-size: 11px !important;
          }
          
          /* Mobile logo positioning optimizations */
          .mobile-logo {
            position: absolute !important;
            top: 12px !important;
            left: -50px !important;
            z-index: 60 !important;
          }
          
          /* Mobile logo sizing */
          .mobile-logo img {
            height: 96px !important;
            width: auto !important;
          }
          
          /* Ensure logo doesn't get cut off on mobile */
          .mobile-logo {
            overflow: visible !important;
            max-width: none !important;
          }
        }
        
        /* Extra small mobile devices */
        @media (max-width: 480px) {
          .card {
            height: 120px;
            padding: 0.5em;
          }
          
          .cards .card {
            height: 70px;
            padding: 10px;
          }
          
          .card > div span {
            font-size: 0.75em;
            padding: 0.5em;
          }
        }

        /* Custom pulsing animation for LIVE indicator */
        @keyframes livePulse {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.1);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .live-indicator {
          animation: livePulse 2s ease-in-out infinite;
        }

        .live-dot {
          animation: livePulse 1.5s ease-in-out infinite;
        }

        }
      `}</style>
      
      {/* Content Container - Constrained */}
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className='max-w-7xl mx-auto px-3 md:px-4'
      >
        {/* Real-Time Wait Times Section */}
        <motion.section 
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className='mb-16 md:mb-24'
        >
          <motion.h2 
            id="wait-times"
            className='text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-12 md:mb-20 text-gray-800 dark:text-white'
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            SmartCourt NYC — Live Status
          </motion.h2>

          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16'>
            {/* Animated Hover Bars - Left Side */}
            <motion.div 
              className='space-y-4 md:space-y-6'
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="flex items-center gap-3 mb-4 md:mb-6">
                <h3 className='text-xl md:text-2xl lg:text-3xl font-semibold text-gray-800 dark:text-white'>
                  Report Wait Time
                </h3>
                {/* Pulsing LIVE indicator */}
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full live-dot"></div>
                  <span className="text-sm font-bold text-red-500 live-indicator">LIVE</span>
                </div>
                
              </div>

              {/* Clean, Mobile-Friendly Court Info Cards */}
              <div className="space-y-4">
                {/* Hudson River Park Courts */}
                <div className="bg-white border-2 border-[#1e3a5f] rounded-lg p-4 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-[#1e3a5f]">Hudson River Park Courts</h4>
                    <div className={`w-3 h-3 ${waitTimes['Hudson River Park Courts'] ? getStatusColor(getStatusFromWaitTime(waitTimes['Hudson River Park Courts'].wait_time)) : 'bg-gray-500'} rounded-full`}></div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <select 
                        className="flex-1 min-w-0 px-2 py-2 border-2 border-[#1e3a5f] rounded-lg bg-white text-sm focus:outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f] focus:ring-opacity-20"
                        defaultValue={waitTimes['Hudson River Park Courts']?.wait_time || "Select wait time..."}
                        ref={hudsonSelectRef}
                      >
                        <option value="Select wait time...">Select wait time...</option>
                        <option value="Less than 1 hour">Less than 1 hour</option>
                        <option value="1-2 hours">1-2 hours</option>
                        <option value="2-3 hours">2-3 hours</option>
                        <option value="More than 3 hours">More than 3 hours</option>
                      </select>
                      <button 
                        onClick={() => {
                          handleReportWaitTime('Hudson River Park Courts', hudsonSelectRef.current?.value || '', hudsonCommentRef.current?.value || '');
                        }}
                        disabled={isReportButtonDisabled('Hudson River Park Courts')}
                        className={`px-2 py-2 rounded-lg font-medium transition-all duration-300 text-xs whitespace-nowrap flex-shrink-0 ${
                          isReportButtonDisabled('Hudson River Park Courts')
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : reportSuccess === 'Hudson River Park Courts'
                            ? 'bg-[#1e3a5f] text-white scale-105'
                            : 'bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 hover:scale-105'
                        }`}
                      >
                        {getReportButtonLabel('Hudson River Park Courts')}
                      </button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Leave a comment about the wait time..." 
                      className="w-full px-3 py-2 border-2 border-[#1e3a5f] rounded-lg bg-white text-sm focus:outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f] focus:ring-opacity-20"
                      ref={hudsonCommentRef}
                    />
                  </div>
                </div>
                
                {/* Pier 42 */}
                <div className="bg-white border-2 border-[#1e3a5f] rounded-lg p-4 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-[#1e3a5f]">Pier 42</h4>
                    <div className={`w-3 h-3 ${waitTimes['Pier 42'] ? getStatusColor(getStatusFromWaitTime(waitTimes['Pier 42'].wait_time)) : 'bg-gray-500'} rounded-full`}></div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <select 
                        className="flex-1 min-w-0 px-2 py-2 border-2 border-[#1e3a5f] rounded-lg bg-white text-sm focus:outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f] focus:ring-opacity-20"
                        defaultValue={waitTimes['Pier 42']?.wait_time || "Select wait time..."}
                        ref={pierSelectRef}
                      >
                        <option value="Select wait time...">Select wait time...</option>
                        <option value="Less than 1 hour">Less than 1 hour</option>
                        <option value="1-2 hours">1-2 hours</option>
                        <option value="2-3 hours">2-3 hours</option>
                        <option value="More than 3 hours">More than 3 hours</option>
                      </select>
                      <button 
                        onClick={() => {
                          handleReportWaitTime('Pier 42', pierSelectRef.current?.value || '', pierCommentRef.current?.value || '');
                        }}
                        disabled={isReportButtonDisabled('Pier 42')}
                        className={`px-2 py-2 rounded-lg font-medium transition-all duration-300 text-xs whitespace-nowrap flex-shrink-0 ${
                          isReportButtonDisabled('Pier 42')
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : reportSuccess === 'Pier 42'
                            ? 'bg-[#1e3a5f] text-white scale-105'
                            : 'bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 hover:scale-105'
                        }`}
                      >
                        {getReportButtonLabel('Pier 42')}
                      </button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Leave a comment about the wait time..." 
                      className="w-full px-3 py-2 border-2 border-[#1e3a5f] rounded-lg bg-white text-sm focus:outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f] focus:ring-opacity-20"
                      ref={pierCommentRef}
                    />
                  </div>
                </div>
                
                {/* Brian Watkins Tennis Courts */}
                <div className="bg-white border-2 border-[#1e3a5f] rounded-lg p-4 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-[#1e3a5f]">Brian Watkins Tennis Courts</h4>
                    <div className={`w-3 h-3 ${waitTimes['Brian Watkins Tennis Courts'] ? getStatusColor(getStatusFromWaitTime(waitTimes['Brian Watkins Tennis Courts'].wait_time)) : 'bg-gray-500'} rounded-full`}></div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <select 
                        className="flex-1 min-w-0 px-2 py-2 border-2 border-[#1e3a5f] rounded-lg bg-white text-sm focus:outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f] focus:ring-opacity-20"
                        defaultValue={waitTimes['Brian Watkins Tennis Courts']?.wait_time || "Select wait time..."}
                        ref={brianSelectRef}
                      >
                        <option value="Select wait time...">Select wait time...</option>
                        <option value="Less than 1 hour">Less than 1 hour</option>
                        <option value="1-2 hours">1-2 hours</option>
                        <option value="2-3 hours">2-3 hours</option>
                        <option value="More than 3 hours">More than 3 hours</option>
                      </select>
                      <button 
                        onClick={() => {
                          handleReportWaitTime('Brian Watkins Tennis Courts', brianSelectRef.current?.value || '', brianCommentRef.current?.value || '');
                        }}
                        disabled={isReportButtonDisabled('Brian Watkins Tennis Courts')}
                        className={`px-2 py-2 rounded-lg font-medium transition-all duration-300 text-xs whitespace-nowrap flex-shrink-0 ${
                          isReportButtonDisabled('Brian Watkins Tennis Courts')
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : reportSuccess === 'Brian Watkins Tennis Courts'
                            ? 'bg-[#1e3a5f] text-white scale-105'
                            : 'bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 hover:scale-105'
                        }`}
                      >
                        {getReportButtonLabel('Brian Watkins Tennis Courts')}
                      </button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Leave a comment about the wait time..." 
                      className="w-full px-3 py-2 border-2 border-[#1e3a5f] rounded-lg bg-white text-sm focus:outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f] focus:ring-opacity-20"
                      ref={brianCommentRef}
                    />
                  </div>
                </div>

                {/* South Oxford Park Tennis Courts */}
                <div className="bg-white border-2 border-[#1e3a5f] rounded-lg p-4 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-[#1e3a5f]">South Oxford Park Tennis Courts</h4>
                    <div className={`w-3 h-3 ${waitTimes['South Oxford Park Tennis Courts'] ? getStatusColor(getStatusFromWaitTime(waitTimes['South Oxford Park Tennis Courts'].wait_time)) : 'bg-gray-500'} rounded-full`}></div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <select 
                        className="flex-1 min-w-0 px-2 py-2 border-2 border-[#1e3a5f] rounded-lg bg-white text-sm focus:outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f] focus:ring-opacity-20"
                        defaultValue={waitTimes['South Oxford Park Tennis Courts']?.wait_time || "Select wait time..."}
                        ref={southOxfordSelectRef}
                      >
                        <option value="Select wait time...">Select wait time...</option>
                        <option value="Less than 1 hour">Less than 1 hour</option>
                        <option value="1-2 hours">1-2 hours</option>
                        <option value="2-3 hours">2-3 hours</option>
                        <option value="More than 3 hours">More than 3 hours</option>
                      </select>
                      <button 
                        onClick={() => {
                          handleReportWaitTime('South Oxford Park Tennis Courts', southOxfordSelectRef.current?.value || '', southOxfordCommentRef.current?.value || '');
                        }}
                        disabled={isReportButtonDisabled('South Oxford Park Tennis Courts')}
                        className={`px-2 py-2 rounded-lg font-medium transition-all duration-300 text-xs whitespace-nowrap flex-shrink-0 ${
                          isReportButtonDisabled('South Oxford Park Tennis Courts')
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : reportSuccess === 'South Oxford Park Tennis Courts'
                            ? 'bg-[#1e3a5f] text-white scale-105'
                            : 'bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 hover:scale-105'
                        }`}
                      >
                        {getReportButtonLabel('South Oxford Park Tennis Courts')}
                      </button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Leave a comment about the wait time..." 
                      className="w-full px-3 py-2 border-2 border-[#1e3a5f] rounded-lg bg-white text-sm focus:outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f] focus:ring-opacity-20"
                      ref={southOxfordCommentRef}
                    />
                  </div>
                </div>
              </div>
              

            </motion.div>

            {/* Big Green Display Cards - Right Side */}
            <motion.div 
              className='space-y-4 md:space-y-6'
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="flex items-center gap-3 mb-4 md:mb-6">
                <h3 className='text-xl md:text-2xl lg:text-3xl font-semibold text-gray-800 dark:text-white'>
                  Live Updates
                </h3>
                {/* Pulsing LIVE indicator */}
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full live-dot"></div>
                  <span className="text-sm font-bold text-red-500 live-indicator">LIVE</span>
                </div>
              </div>

              {/* Big Green Display Cards */}
              <div className="space-y-4">
                {(
                  [
                    'Hudson River Park Courts',
                    'Pier 42',
                    'Brian Watkins Tennis Courts',
                    'South Oxford Park Tennis Courts',
                  ] as const
                ).map((courtName) => (
                  <LiveUpdateCourtCard
                    key={courtName}
                    courtName={courtName}
                    report={waitTimes[courtName]}
                    getStatusFromWaitTime={getStatusFromWaitTime}
                    getStatusColor={getStatusColor}
                    formatTimeDifference={formatTimeDifference}
                    onFlag={handleFlagWaitTime}
                    cardClassName="bg-white border-2 border-[#1e3a5f] rounded-lg p-4 hover:shadow-lg transition-all duration-300"
                    titleClassName="text-[#1e3a5f]"
                  />
                ))}

                <div className="relative bg-white border-2 border-[#1e3a5f] rounded-lg p-4 hover:shadow-lg transition-all duration-300">
                  <img
                    src="/deuce-logo.png"
                    alt="Deuce logo"
                    className="absolute right-3 top-3 h-10 w-10 rounded-lg object-cover shadow-sm"
                  />
                  <p className="text-lg font-semibold text-[#1e3a5f]">Need a hitting partner?</p>
                  <p className="mt-1 text-sm text-gray-600">Find one on Deuce</p>
                  <a
                    href={DEUCE_APP_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#1a3d1f] px-4 py-2 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#16331a]"
                  >
                    Open Deuce →
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* Sign-up Sheets Section */}
        <motion.section
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className='mb-16 md:mb-24'
        >
          <motion.h2
            id="sign-up-sheets"
            className='text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-8 md:mb-12 text-black dark:text-white'
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Sign-up Sheets
          </motion.h2>
          <div className='bg-white rounded-lg p-2 md:p-4 shadow-lg'>
            <div className='mx-auto w-full max-w-4xl rounded-lg border-2 border-[#1e3a5f]/20 bg-white'>
              <SignupSheetsPanel />
            </div>
          </div>
        </motion.section>

        <motion.h2 
          id="court-finder"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className='text-3xl md:text-4xl lg:text-5xl font-bold mb-8 md:mb-12 text-black dark:text-white text-center'
        >
          Court Finder
        </motion.h2>
        
        {/* Centered checkbox sections */}
        <div className='flex justify-center'>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className='grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12 mb-6 md:mb-10'
          >
            {/* Boroughs */}
            <motion.div 
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ 
                duration: 0.6, 
                delay: 1.1 
              }}
              className='text-center'
            >
              <h3 className='text-xl md:text-2xl font-bold mb-4 md:mb-6 text-black dark:text-white'>
                Boroughs
              </h3>
              <div className='space-y-3 md:space-y-4 flex flex-col items-start'>
                {['Manhattan', 'Brooklyn', 'Queens', 'The Bronx'].map((borough, index) => (
                  <motion.div
                    key={borough}
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      duration: 0.5, 
                      delay: 1.3 + (index * 0.1) 
                    }}
                    whileHover={{ 
                      scale: 1.02,
                      transition: { duration: 0.2 }
                    }}
                    className='flex items-center gap-4 w-full'
                  >
                    <div className="checkbox-wrapper flex-shrink-0">
                      <input 
                        className="check"
                        type="checkbox" 
                        id={`borough-${borough}`}
                        onChange={(e) => handleBoroughChange(borough, e.target.checked)}
                      />
                      <label htmlFor={`borough-${borough}`} className="label">
                        <svg width={45} height={45} viewBox="0 0 95 95">
                          <rect x={30} y={20} width={50} height={50} className="checkbox-rect" />
                        </svg>
                      </label>
    </div>
                    <span className='text-lg text-black dark:text-white'>{borough}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Surfaces */}
            <motion.div 
              initial={{ x: 0, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.1 }}
              className='text-center'
            >
              <h3 className='text-xl md:text-2xl font-bold mb-4 md:mb-6 text-black dark:text-white'>
                Surfaces
              </h3>
              <div className='space-y-3 md:space-y-4 flex flex-col items-start'>
                {['Hard', 'Clay', 'Har-Tru'].map((surface, index) => (
                  <motion.div
                    key={surface}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      duration: 0.5, 
                      delay: 1.3 + (index * 0.1) 
                    }}
                    whileHover={{ 
                      scale: 1.02,
                      transition: { duration: 0.2 }
                    }}
                    className='flex items-center gap-4 w-full'
                  >
                    <div className="checkbox-wrapper flex-shrink-0">
                      <input 
                        className="check"
                        type="checkbox" 
                        id={`surface-${surface}`}
                        onChange={(e) => handleSurfaceChange(surface, e.target.checked)}
                      />
                      <label htmlFor={`surface-${surface}`} className="label">
                        <svg width={45} height={45} viewBox="0 0 95 95">
                          <rect x={30} y={20} width={50} height={50} className="checkbox-rect" />
                        </svg>
                      </label>
                    </div>
                    <span className='text-lg text-black dark:text-white'>{surface}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Permit Status */}
            <motion.div 
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.1 }}
              className='text-center'
            >
              <h3 className='text-xl md:text-2xl font-bold mb-4 md:mb-6 text-black dark:text-white'>
                Permit Status
              </h3>
              <div className='space-y-3 md:space-y-4 flex flex-col items-start'>
                {[
                  { value: 'Required & Enforced', label: 'Required & Enforced' },
                  { value: 'Required, but Rarely Checked', label: 'Required, Rarely Checked' },
                  { value: 'Not Required', label: 'Not Required' }
                ].map((permitStatus, index) => (
                  <motion.div
                    key={permitStatus.value}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      duration: 0.5, 
                      delay: 1.3 + (index * 0.1) 
                    }}
                    whileHover={{ 
                      scale: 1.02,
                      transition: { duration: 0.2 }
                    }}
                    className='flex items-center gap-4 w-full'
                  >
                    <div className="checkbox-wrapper flex-shrink-0">
                      <input 
                        className="check"
                        type="checkbox" 
                        id={`permit-${permitStatus.value}`}
                        onChange={(e) => handlePermitStatusChange(permitStatus.value, e.target.checked)}
                      />
                      <label htmlFor={`permit-${permitStatus.value}`} className="label">
                        <svg width={45} height={45} viewBox="0 0 95 95">
                          <rect x={30} y={20} width={50} height={50} className="checkbox-rect" />
                        </svg>
                      </label>
                    </div>
                    <span className='text-lg text-black dark:text-white whitespace-nowrap'>{permitStatus.label}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* Map Section - Full Width */}
      <motion.div 
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className='mt-12'
      >
        <motion.h3 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className='text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-black dark:text-white text-center'
        >
          Court Locations {courts.length > 0 && `(${courts.length} courts)`}
        </motion.h3>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className='bg-white rounded-lg p-2 md:p-4 shadow-lg'
        >
          {loading ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className='h-[400px] md:h-[600px] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-600'
            >
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className='text-6xl mb-4'
              >
                ⏳
              </motion.div>
              <h4 className='text-xl font-bold mb-2 text-gray-800'>Loading Tennis Courts...</h4>
              <p className='text-center'>Fetching court data from NYC database</p>
            </motion.div>
          ) : hasApiKey ? (
            <Wrapper apiKey={GOOGLE_MAPS_API_KEY} render={render}>
              <MapComponent 
                courts={courts}
                selectedBoroughs={selectedBoroughs}
                selectedSurfaces={selectedSurfaces}
                selectedPermitStatuses={selectedPermitStatuses}
              />
            </Wrapper>
          ) : (
            <div className='h-[600px] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-600'>
              <div className='text-6xl mb-4'>🗺️</div>
              <h4 className='text-xl font-bold mb-2 text-gray-800'>Google Maps Integration Ready</h4>
              <p className='text-center max-w-md'>
                Add your Google Maps API key to <code className='bg-gray-200 px-2 py-1 rounded'>.env.local</code> to see the interactive court map.
              </p>
              <div className='mt-4 text-sm text-gray-500'>
                <p>Courts loaded: {courts.length}</p>
                <p>Selected filters: {selectedBoroughs.length > 0 ? selectedBoroughs.join(', ') : 'All Boroughs'}</p>
                <p>Surfaces: {selectedSurfaces.length > 0 ? selectedSurfaces.join(', ') : 'All Surfaces'}</p>
                <p>Permit Status: {selectedPermitStatuses.length > 0 ? selectedPermitStatuses.join(', ') : 'All Permit Types'}</p>
              </div>
    </div>
          )}
        </motion.div>
        
        {/* Legend */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className='mt-4 flex justify-center gap-6 text-sm'
        >
          <div className='flex items-center gap-2'>
            <div className='w-4 h-4 bg-[#1e3a5f] rounded-full'></div>
            <span className='text-black dark:text-white'>All Tennis Courts</span>
          </div>
        </motion.div>
      </motion.div>

      {/* NYC Tennis 101 Q&A Section */}
      <motion.div 
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className='mt-16 md:mt-24 py-12 md:py-16'
      >
        <div className='max-w-4xl mx-auto px-4'>
          <motion.h2 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className='text-3xl md:text-4xl lg:text-5xl font-bold mb-8 md:mb-16 text-black text-center'
          >
            NYC Tennis 101
          </motion.h2>
          
          <div className='space-y-8'>
            {[
                              {
                  question: "What is the official tennis season?",
                  answer: "The official NYC tennis season runs from the first Saturday of April through the Sunday before Thanksgiving. Most outdoor public courts require a valid NYC Parks tennis permit during this time."
                },
                {
                  question: "What types of permits are available?",
                  answer: "There are several types: Full-Season Permit (best for frequent players, valid the entire season), Single-Play Permit (one-day use for occasional play - $15), Senior Permit (discounted rate for seniors 65+), and Student Permit (discounted rate for students with valid ID)."
                },
                {
                  question: "Where can I get a tennis permit?",
                  answer: "You can get permits at NYC Parks Tennis Permit Offices in all five boroughs: Bronx (1 Bronx River Parkway, Bronx, NY 10462), Brooklyn (95 Prospect Park West, between 4th & 5th Streets, Brooklyn, NY 11215), Manhattan (830 5th Avenue, The Arsenal, Room 1 Basement, New York, NY 10065), Queens (Passerelle Building, across from outdoor tennis courts, Flushing Meadows–Corona Park, Queens, NY 11368), or Paragon Sports (867 Broadway & 18th Street, New York, NY 10003). All offices are open Monday–Friday, 9 AM–4 PM, except Paragon which is open Monday–Sunday, 11:00 a.m.–7:00 p.m. (note: Paragon will not issue/renew permits past 30 minutes before closing)."
                },
              {
                question: "How strictly are permits enforced?",
                answer: "Enforcement varies widely between courts. Some locations check permits every time, others rarely check, and some courts are permit-free. There are also opportunities to play without a permit during the official season."
              },
              {
                question: "Can I play tennis in winter?",
                answer: "Yes! After the season ends (late November - March), permits are no longer required at most courts. Many courts remain open, while others close. Some facilities install seasonal 'bubbles' and operate privately with separate fees."
              },
              {
                question: "What should I know about court rules?",
                answer: "Rules vary significantly: some courts have time limits, reservation systems, or attendants; others are purely first-come, first-serve. Surfaces and conditions also differ by location and borough."
              }
            ].map((qa, index) => (
              <QAItem key={index} qa={qa} />
            ))}
          </div>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className='text-center text-gray-600 mt-16 text-lg'
          >
            For specific court details, rules, and permit enforcement, always check our{' '}
            <span className='text-[#1e3a5f] font-semibold'>Court Finder</span> above.
          </motion.p>
        </div>
      </motion.div>

      {/* Tennis App Promotion Section */}
      <motion.div
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className='mt-16 md:mt-24 py-16 md:py-20 bg-white'
      >
        <div className='max-w-7xl mx-auto px-4'>
          <div className='flex items-center justify-center'>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className='w-full max-w-4xl'
            >
              <motion.h2
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className='text-center text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 leading-tight'
              >
                Tennis convenience starts here
              </motion.h2>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const Demo = () => {
  const [mediaType] = useState('video');
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className='min-h-screen overflow-x-hidden'>
      {/* Desktop — full scroll expansion hero */}
      <div className="desktop-rebrand hidden min-[768px]:block">
        <ScrollExpandMedia
          backdrop="light"
          mediaType={mediaType as 'video' | 'image'}
          mediaSrc={currentMedia.src}
          posterSrc={mediaType === 'video' ? currentMedia.poster : undefined}
          title={currentMedia.title}
          scrollToExpand={currentMedia.scrollToExpand}
        >
          <MediaContent mediaType={mediaType as 'video' | 'image'} />
        </ScrollExpandMedia>
      </div>

      {/* Mobile tab app when viewport is under 768px wide (px breakpoint — matches JS, not 48rem) */}
      <div className="landing-mobile-route block min-[768px]:hidden bg-white min-h-screen min-h-dvh">
        <MobileAppShell />
      </div>
    </div>
  );
};

export default Demo; 