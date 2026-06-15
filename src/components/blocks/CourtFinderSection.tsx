'use client';

import { useState, useEffect, useMemo } from 'react';
import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { motion } from 'framer-motion';
import type { CourtData } from '@/types/courts';
import { formatCourtDescriptionHtml } from '@/lib/formatCourtDescription';

const loadCourtsData = async (): Promise<CourtData[]> => {
  try {
    const response = await fetch('/NYC TENNIS COURTS - Sheet1.csv');
    const csvText = await response.text();
    const courts: CourtData[] = [];
    const lines = csvText.split('\n');
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) continue;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          currentRow.push(currentField.trim());
          currentField = '';
        } else currentField += char;
      }
      if (!inQuotes) {
        currentRow.push(currentField.trim());
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
          if (court.lat !== 0 && court.lng !== 0 && court.name) courts.push(court);
        }
        currentRow = [];
        currentField = '';
      } else currentField += '\n';
    }
    return courts;
  } catch {
    return [];
  }
};

const MapComponent = ({
  courts,
  selectedBoroughs,
  selectedSurfaces,
  selectedPermitStatuses,
  className,
}: {
  courts: CourtData[];
  selectedBoroughs: string[];
  selectedSurfaces: string[];
  selectedPermitStatuses: string[];
  className?: string;
}) => {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);

  const filteredCourts = useMemo(() => {
    return courts.filter((court) => {
      const boroughMatch = selectedBoroughs.length === 0 || selectedBoroughs.includes(court.borough);
      const surfaceMatch = selectedSurfaces.length === 0 || selectedSurfaces.includes(court.surface);
      const permitMatch =
        selectedPermitStatuses.length === 0 || selectedPermitStatuses.includes(court.permitStatus);
      return boroughMatch && surfaceMatch && permitMatch;
    });
  }, [courts, selectedBoroughs, selectedSurfaces, selectedPermitStatuses]);

  useEffect(() => {
    if (!map) return;
    markers.forEach((marker) => marker.setMap(null));
    const color = '#2D5A27';
    const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="15" cy="15" r="4" fill="white"/>
      </svg>`
    )}`;

    const newMarkers = filteredCourts.map((court) => {
      const marker = new google.maps.Marker({
        position: { lat: court.lat, lng: court.lng },
        map,
        title: court.name,
        icon: { url: iconUrl, scaledSize: new google.maps.Size(30, 30) },
      });
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
            ${court.description ? formatCourtDescriptionHtml(court.description) : ''}
          </div>
        `,
      });
      marker.addListener('click', () => infoWindow.open(map, marker));
      return marker;
    });
    setMarkers(newMarkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markers cleared intentionally when filteredCourts changes
  }, [map, filteredCourts]);

  const mapRef = (node: HTMLDivElement | null) => {
    if (node && !map) {
      setMap(
        new google.maps.Map(node, {
          center: { lat: 40.7902065, lng: -73.9621475 },
          zoom: 12,
          styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
            { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f0f0f0' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e0e0e0' }] },
            { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
          ],
        })
      );
    }
  };

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '400px', borderRadius: '8px' }}
      className={className || 'md:h-[600px]'}
    />
  );
};

const mapRender = (status: Status) => {
  if (status === Status.FAILURE) {
    return (
      <div className="text-red-500 p-4 text-center">
        Error loading Google Maps. Please check your API key.
      </div>
    );
  }
  return <div className="text-center p-4">Loading Google Maps...</div>;
};

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'The Bronx'];
const SURFACES = ['Hard', 'Clay', 'Har-Tru'];
const PERMIT_OPTIONS = [
  { value: 'Required & Enforced', label: 'Required & Enforced' },
  { value: 'Required, but Rarely Checked', label: 'Required, Rarely Checked' },
  { value: 'Not Required', label: 'Not Required' },
];

interface CourtFinderSectionProps {
  selectedBoroughs: string[];
  selectedSurfaces: string[];
  selectedPermitStatuses: string[];
  onBoroughChange: (borough: string, checked: boolean) => void;
  onSurfaceChange: (surface: string, checked: boolean) => void;
  onPermitStatusChange: (permitStatus: string, checked: boolean) => void;
  filtersCollapsed?: boolean;
  onFiltersCollapsedChange?: (collapsed: boolean) => void;
  isMobile?: boolean;
  mapOnly?: boolean;
}

export function CourtFinderSection({
  selectedBoroughs,
  selectedSurfaces,
  selectedPermitStatuses,
  onBoroughChange,
  onSurfaceChange,
  onPermitStatusChange,
  filtersCollapsed = false,
  onFiltersCollapsedChange,
  isMobile = false,
  mapOnly = false,
}: CourtFinderSectionProps) {
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCourtsData().then((data) => {
      setCourts(data);
      setLoading(false);
    });
  }, []);

  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const hasApiKey = GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY_HERE';

  const FilterCheckbox = ({
    id,
    checked,
    onChange,
    label,
  }: {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
  }) => (
    <div className="flex items-center gap-4 w-full min-h-[44px]">
      <div className="checkbox-wrapper flex-shrink-0">
        <input
          className="check"
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id} className="label">
          <svg width={45} height={45} viewBox="0 0 95 95">
            <rect x={30} y={20} width={50} height={50} className="checkbox-rect" />
          </svg>
        </label>
      </div>
      <span className="text-lg text-black dark:text-white">{label}</span>
    </div>
  );

  const filtersContent = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12 mb-6 md:mb-10">
      <div className="text-center">
        <h3 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-black dark:text-white">
          Boroughs
        </h3>
        <div className="space-y-3 md:space-y-4 flex flex-col items-start">
          {BOROUGHS.map((borough) => (
            <FilterCheckbox
              key={borough}
              id={`borough-${borough}`}
              checked={selectedBoroughs.includes(borough)}
              onChange={(checked) => onBoroughChange(borough, checked)}
              label={borough}
            />
          ))}
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-black dark:text-white">
          Surfaces
        </h3>
        <div className="space-y-3 md:space-y-4 flex flex-col items-start">
          {SURFACES.map((surface) => (
            <FilterCheckbox
              key={surface}
              id={`surface-${surface}`}
              checked={selectedSurfaces.includes(surface)}
              onChange={(checked) => onSurfaceChange(surface, checked)}
              label={surface}
            />
          ))}
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-black dark:text-white">
          Permit Status
        </h3>
        <div className="space-y-3 md:space-y-4 flex flex-col items-start">
          {PERMIT_OPTIONS.map((opt) => (
            <FilterCheckbox
              key={opt.value}
              id={`permit-${opt.value}`}
              checked={selectedPermitStatuses.includes(opt.value)}
              onChange={(checked) => onPermitStatusChange(opt.value, checked)}
              label={opt.label}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full">
      <style jsx>{`
        .checkbox-wrapper input[type='checkbox'] {
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
        .checkbox-wrapper .checkbox-rect {
          stroke: #d1d5db;
          fill: none;
          stroke-width: 2;
          transition: all 0.3s ease;
        }
        .checkbox-wrapper input[type='checkbox']:checked + label svg rect {
          stroke: #2D5A27;
          fill: #2D5A27;
        }
      `}</style>

      {!mapOnly && (
        <motion.h2
          id="court-finder"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold mb-8 md:mb-12 text-black dark:text-white text-center"
        >
          Court Finder
        </motion.h2>
      )}

      {!mapOnly && isMobile && onFiltersCollapsedChange ? (
        <div className="mb-4">
          <button
            onClick={() => onFiltersCollapsedChange(!filtersCollapsed)}
            className="w-full py-3 px-4 bg-[#2D5A27] text-[#FFFDD0] rounded-lg font-semibold flex items-center justify-between min-h-[44px]"
          >
            <span>Filters</span>
            <span className="text-xl">{filtersCollapsed ? '▼' : '▲'}</span>
          </button>
          {!filtersCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              {filtersContent}
            </motion.div>
          )}
        </div>
      ) : !mapOnly ? (
        <div className="flex justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
          >
            {filtersContent}
          </motion.div>
        </div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="mt-12"
      >
        {!mapOnly && (
          <motion.h3
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-black dark:text-white text-center"
          >
            Court Locations {courts.length > 0 && `(${courts.length} courts)`}
          </motion.h3>
        )}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className={
            isMobile
              ? 'rounded-lg border border-[#2D5A27]/25 bg-white/40 p-2 shadow-md backdrop-blur-sm md:p-4'
              : 'rounded-lg bg-[#FFFDD0] p-2 shadow-lg md:p-4'
          }
        >
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-[400px] md:h-[600px] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-600"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="text-6xl mb-4"
              >
                ⏳
              </motion.div>
              <h4 className="text-xl font-bold mb-2 text-gray-800">Loading Tennis Courts...</h4>
              <p className="text-center">Fetching court data from NYC database</p>
            </motion.div>
          ) : hasApiKey ? (
            <Wrapper apiKey={GOOGLE_MAPS_API_KEY} render={mapRender}>
              <MapComponent
                courts={courts}
                selectedBoroughs={selectedBoroughs}
                selectedSurfaces={selectedSurfaces}
                selectedPermitStatuses={selectedPermitStatuses}
                className={
                  mapOnly
                    ? 'h-[calc(100dvh-8rem)] min-h-[400px]'
                    : isMobile
                      ? 'h-[50vh] min-h-[300px]'
                      : 'md:h-[600px]'
                }
              />
            </Wrapper>
          ) : (
            <div className="h-[600px] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-600">
              <div className="text-6xl mb-4">🗺️</div>
              <h4 className="text-xl font-bold mb-2 text-gray-800">Google Maps Integration Ready</h4>
              <p className="text-center max-w-md">
                Add your Google Maps API key to{' '}
                <code className="bg-gray-200 px-2 py-1 rounded">.env.local</code> to see the
                interactive court map.
              </p>
              <div className="mt-4 text-sm text-gray-500">
                <p>Courts loaded: {courts.length}</p>
                <p>
                  Selected filters:{' '}
                  {selectedBoroughs.length > 0 ? selectedBoroughs.join(', ') : 'All Boroughs'}
                </p>
              </div>
            </div>
          )}
        </motion.div>
        {!mapOnly && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-4 flex justify-center gap-6 text-sm"
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#2D5A27] rounded-full" />
              <span className="text-black dark:text-white">All Tennis Courts</span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
