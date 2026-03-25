import React, { Suspense, useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture, Line } from '@react-three/drei';
import * as satellite from 'satellite.js';
import * as THREE from 'three';

// --- GLOBAL TIME ENGINE ---
let GLOBAL_SIM_TIME = Date.now();
const EARTH_RADIUS_KM = 6371;

// --- TIME COMPONENTS ---
function TimeUpdater({ timeSpeed }) {
  useFrame((_, delta) => {
    GLOBAL_SIM_TIME += delta * 1000 * timeSpeed;
  });
  return null;
}

function LiveTimeDisplay() {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimeStr(new Date(GLOBAL_SIM_TIME).toLocaleString());
    }, 50);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div style={{ fontSize: '1.1rem', color: '#00ffcc', marginBottom: '15px', fontWeight: 'bold', backgroundColor: '#222', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid #444' }}>
      <span style={{ fontSize: '0.8rem', color: '#aaa', display: 'block', marginBottom: '4px' }}>SIMULATED TIME</span>
      <span>{timeStr}</span>
    </div>
  );
}

function LiveSatStats({ satData }) {
  const statsRef = useRef();
  const satrec = useMemo(() => satellite.twoline2satrec(satData.tle1, satData.tle2), [satData]);

  useEffect(() => {
    let animationFrameId;
    const updateStats = () => {
      const simulatedTime = new Date(GLOBAL_SIM_TIME);
      const posAndVel = satellite.propagate(satrec, simulatedTime);
      
      if (posAndVel.position && statsRef.current) {
        const gmst = satellite.gstime(simulatedTime);
        const geodetic = satellite.eciToGeodetic(posAndVel.position, gmst);
        
        const vx = posAndVel.velocity.x, vy = posAndVel.velocity.y, vz = posAndVel.velocity.z;
        const velocity = Math.sqrt(vx*vx + vy*vy + vz*vz);
        
        statsRef.current.innerHTML = `
          <strong>Live Altitude:</strong> ${geodetic.height.toFixed(2)} km<br/>
          <strong>Live Velocity:</strong> ${velocity.toFixed(2)} km/s
        `;
      }
      animationFrameId = requestAnimationFrame(updateStats);
    };
    updateStats();
    return () => cancelAnimationFrame(animationFrameId);
  }, [satrec]);

  return <div ref={statsRef} style={{ marginTop: '15px', padding: '10px', backgroundColor: '#111', borderRadius: '4px', color: '#00ffcc', lineHeight: '1.5' }}></div>;
}

// --- 3D CELESTIAL COMPONENTS ---
function Sun({ realisticLighting }) {
  const sunRef = useRef();
  const lightRef = useRef();

  useFrame(() => {
    const simTime = new Date(GLOBAL_SIM_TIME);
    const jd = satellite.jday(simTime.getUTCFullYear(), simTime.getUTCMonth() + 1, simTime.getUTCDate(), simTime.getUTCHours(), simTime.getUTCMinutes(), simTime.getUTCSeconds());
    const n = jd - 2451545.0;
    
    // Exact same astronomical position math
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = (357.528 + 0.9856003 * n) % 360;
    const gRad = g * Math.PI / 180;
    const lambda = (L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad)) % 360;
    const lambdaRad = lambda * Math.PI / 180;
    const epsilon = 23.439 - 0.0000004 * n;
    const epsilonRad = epsilon * Math.PI / 180;

    // The normalized vector pointing TO the sun
    const x = Math.cos(lambdaRad);
    const y = Math.cos(epsilonRad) * Math.sin(lambdaRad);
    const z = Math.sin(epsilonRad) * Math.sin(lambdaRad);

    
    const visualDistance = 500; 
    // We scale the visual radius to maintain the 0.53 degree apparent size:
    const visualRadius = visualDistance / 215; // ~2.32 units

    const sunPos = [x * visualDistance, z * visualDistance, -y * visualDistance];

    if (sunRef.current) {
        sunRef.current.position.set(...sunPos);
        sunRef.current.scale.set(visualRadius, visualRadius, visualRadius);
    }
    
    if (lightRef.current) {
        lightRef.current.position.set(...sunPos);
    }
  });

  return (
    <>
      {realisticLighting && (
        <directionalLight 
            ref={lightRef} 
            intensity={2.5} 
            color="#ffffff" 
            castShadow 
        />
      )}
      <mesh ref={sunRef}>
        {/* We use a base size of 1, scaled up by the visualRadius in useFrame */}
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#FFD700" />
      </mesh>
    </>
  );
}

function Moon() {
  const moonTexture = useTexture('/satellite-tracker/moon.jpg'); 
  const moonRef = useRef();

  useFrame(() => {
    if (!moonRef.current) return;
    const simTime = new Date(GLOBAL_SIM_TIME);
    const jd = satellite.jday(simTime.getUTCFullYear(), simTime.getUTCMonth() + 1, simTime.getUTCDate(), simTime.getUTCHours(), simTime.getUTCMinutes(), simTime.getUTCSeconds());
    const n = jd - 2451545.0;
    
    const M_L = (218.316 + 13.176396 * n) % 360;
    const M_A = (134.963 + 13.064993 * n) % 360;
    const M_A_Rad = M_A * Math.PI / 180;
    
    const lambda = (M_L + 6.289 * Math.sin(M_A_Rad) + 0.214 * Math.sin(2 * M_A_Rad)) % 360;
    const lambdaRad = lambda * Math.PI / 180;
    const inclinationRad = 5.145 * Math.PI / 180;

    const x = Math.cos(lambdaRad);
    const y = Math.sin(lambdaRad) * Math.cos(inclinationRad);
    const z = Math.sin(lambdaRad) * Math.sin(inclinationRad);

    // --- UPDATED SCALE AND DISTANCE ---
    const AVERAGE_MOON_DISTANCE_KM = 384400;
    const distanceScale = AVERAGE_MOON_DISTANCE_KM / EARTH_RADIUS_KM; // ~60.33 units
    
    const moonPos = [x * distanceScale, z * distanceScale, -y * distanceScale];

    moonRef.current.position.set(...moonPos);
    
    const siderealRotationPeriodDays = 27.32166;
    const radiansPerMillisecond = (2 * Math.PI) / (siderealRotationPeriodDays * 24 * 60 * 60 * 1000);
    moonRef.current.rotation.y = (n * 24 * 60 * 60 * 1000) * radiansPerMillisecond;
  });

  return (
    <mesh ref={moonRef} castShadow receiveShadow>
      <sphereGeometry args={[0.273, 64, 64]} /> 
      <meshStandardMaterial map={moonTexture} roughness={0.9} metalness={0.0} />
    </mesh>
  );
}

function Earth() {
  const colorMap = useTexture('/satellite-tracker/earth.jpg');
  const earthRef = useRef();

  useFrame(() => {
    const gmst = satellite.gstime(new Date(GLOBAL_SIM_TIME));
    if (earthRef.current) earthRef.current.rotation.y = gmst;
  });

  return (
    <mesh ref={earthRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial map={colorMap} roughness={0.6} metalness={0.1} />
    </mesh>
  );
}

// --- 3D TRACKING COMPONENTS ---
function LocationPin({ locData, isTracked, controlsRef }) {
  const pinRef = useRef();
  const wasTracked = useRef(false);
  const { camera } = useThree();

  const r = 1.005; 
  const latRad = locData.lat * (Math.PI / 180);
  const lonRad = locData.lon * (Math.PI / 180);

  const x = r * Math.cos(latRad) * Math.cos(lonRad);
  const y = r * Math.sin(latRad);
  const z = -r * Math.cos(latRad) * Math.sin(lonRad);

  useFrame(() => {
    const simulatedTime = new Date(GLOBAL_SIM_TIME);
    const gmst = satellite.gstime(simulatedTime);
    
    if (pinRef.current) pinRef.current.rotation.y = gmst;

    if (isTracked && controlsRef.current) {
      const cosG = Math.cos(gmst);
      const sinG = Math.sin(gmst);
      
      const worldX = x * cosG + z * sinG;
      const worldY = y;
      const worldZ = -x * sinG + z * cosG;

      let camDist = camera.position.length();

      if (!wasTracked.current) {
        camDist = 1.5; 
        wasTracked.current = true;
      }

      if (camDist < 1.05) camDist = 1.05;

      const targetPos = new THREE.Vector3(
        (worldX / r) * camDist,
        (worldY / r) * camDist,
        (worldZ / r) * camDist
      );

      camera.position.lerp(targetPos, 0.15);
      controlsRef.current.target.set(0, 0, 0);
    } else {
      wasTracked.current = false;
    }
  });

  if (!locData.active) return null;

  return (
    <group ref={pinRef}>
      <mesh position={[x, y, z]}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color={locData.color} />
      </mesh>
      <mesh position={[x, y, z]}>
        <ringGeometry args={[0.02, 0.025, 32]} />
        <meshBasicMaterial color={locData.color} side={2} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function Satellite({ satData, trackLength, settings, isTracked, controlsRef, onSelect }) {
  const satRef = useRef();
  const groundGroupRef = useRef();
  const lastUpdateRef = useRef(0);
  const wasTracked = useRef(false);
  const { camera } = useThree(); 
  
  const satrec = useMemo(() => satellite.twoline2satrec(satData.tle1, satData.tle2), [satData]);
  const [points, setPoints] = useState({ orbit: [], ground: [] });

  const calculateTrails = (simTimeMs) => {
    if (!settings.showOrbit && !settings.showGround) {
      setPoints({ orbit: [], ground: [] });
      return;
    }

    const orbPts = [];
    const gndPts = [];
    const simulatedDate = new Date(simTimeMs);

    for (let i = -trackLength; i <= 0; i++) {
      const pastTime = new Date(simulatedDate.getTime() + i * 60000);
      const pastPosVel = satellite.propagate(satrec, pastTime);
      const pastPos = pastPosVel.position;

      if (pastPos && !isNaN(pastPos.x)) {
        const px = pastPos.x / EARTH_RADIUS_KM;
        const py = pastPos.z / EARTH_RADIUS_KM;
        const pz = -pastPos.y / EARTH_RADIUS_KM;
        
        if (settings.showOrbit) orbPts.push([px, py, pz]);

        if (settings.showGround) {
          const gmst = satellite.gstime(pastTime);
          const geodetic = satellite.eciToGeodetic(pastPos, gmst);
          
          const lat = geodetic.latitude; 
          const lon = geodetic.longitude; 
          const r = 1.002; 
          
          const ecefX = r * Math.cos(lat) * Math.cos(lon);
          const ecefY = r * Math.sin(lat);
          const ecefZ = -r * Math.cos(lat) * Math.sin(lon);

          gndPts.push([ecefX, ecefY, ecefZ]);
        }
      }
    }
    setPoints({ orbit: orbPts, ground: gndPts });
  };

  useEffect(() => {
    calculateTrails(GLOBAL_SIM_TIME);
    lastUpdateRef.current = GLOBAL_SIM_TIME;
  }, [trackLength, settings.showOrbit, settings.showGround]);

  useFrame(() => {
    const simTimeMs = GLOBAL_SIM_TIME;
    const simulatedTime = new Date(simTimeMs);
    const posAndVel = satellite.propagate(satrec, simulatedTime);
    
    if (posAndVel.position && !isNaN(posAndVel.position.x) && satRef.current) {
      const px = posAndVel.position.x / EARTH_RADIUS_KM;
      const py = posAndVel.position.z / EARTH_RADIUS_KM;
      const pz = -posAndVel.position.y / EARTH_RADIUS_KM;
      
      satRef.current.position.set(px, py, pz);

      if (isTracked && controlsRef.current) {
        const distToSat = Math.sqrt(px*px + py*py + pz*pz);
        let camDist = camera.position.length();

        if (!wasTracked.current) {
          camDist = distToSat * 1.35;
          wasTracked.current = true;
        }

        if (camDist < distToSat + 0.05) camDist = distToSat + 0.05;

        const targetPos = new THREE.Vector3(
          (px / distToSat) * camDist,
          (py / distToSat) * camDist,
          (pz / distToSat) * camDist
        );

        camera.position.lerp(targetPos, 0.15);
        controlsRef.current.target.set(0, 0, 0);
      } else {
        wasTracked.current = false;
      }
    }

    if (groundGroupRef.current) groundGroupRef.current.rotation.y = satellite.gstime(simulatedTime);

    if (Math.abs(simTimeMs - lastUpdateRef.current) > 60000) {
      calculateTrails(simTimeMs);
      lastUpdateRef.current = simTimeMs;
    }
  });

  return (
    <group>
      <mesh ref={satRef}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color={satData.color} />
        <mesh 
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          onPointerOver={() => document.body.style.cursor = 'pointer'}
          onPointerOut={() => document.body.style.cursor = 'auto'}
        >
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </mesh>
      {settings.showOrbit && points.orbit.length > 0 && <Line points={points.orbit} color={satData.color} lineWidth={1.5} opacity={0.4} transparent />}
      <group ref={groundGroupRef}>
        {settings.showGround && points.ground.length > 0 && <Line points={points.ground} color={satData.color} lineWidth={2.5} opacity={0.8} transparent />}
      </group>
    </group>
  );
}

// --- MAIN APPLICATION & UI ---
export default function App() {
  const controlsRef = useRef();
  const [showUI, setShowUI] = useState(true); 
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [trackLength, setTrackLength] = useState(90);
  const [realisticLighting, setRealisticLighting] = useState(true);
  
  // Satellite State
  const [satellites, setSatellites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [satSettings, setSatSettings] = useState({});
  const [selectedSat, setSelectedSat] = useState(null); 
  const [trackedSatId, setTrackedSatId] = useState(null); 
  const [searchQuery, setSearchQuery] = useState(''); 
  
  // Group Accordion State - ALL CLOSED BY DEFAULT
  const [expandedGroups, setExpandedGroups] = useState({
    'Space Stations': false,
    'Science (Space Telescopes)': false,
    'GPS Constellation': false,
    'Starlink (Sampled)': false,
    'Earth Res. (NASA/USGS)': false,
    'Earth Res. (ESA)': false,
    'Earth Res. (Commercial)': false,
    'Custom': false
  });

  // Location State 
  const [locations, setLocations] = useState([
    { id: 'loc_cape', name: 'Cape Canaveral (USA)', lat: 28.3922, lon: -80.6077, color: '#ff5555', active: false },
    { id: 'loc_vandenberg', name: 'Vandenberg SFB (USA)', lat: 34.7420, lon: -120.5724, color: '#ffaaaa', active: false },
    { id: 'loc_baikonur', name: 'Baikonur Cosmodrome (RUS)', lat: 45.9646, lon: 63.3052, color: '#55ff55', active: false },
    { id: 'loc_jiuquan', name: 'Jiuquan Launch Center (CHN)', lat: 40.9605, lon: 100.2983, color: '#ffff55', active: false },
    { id: 'loc_guiana', name: 'Guiana Space Centre (ESA)', lat: 5.2372, lon: -52.7750, color: '#5555ff', active: false }
  ]);
  const [trackedLocId, setTrackedLocId] = useState(null);
  
  // Inputs
  const [newSatId, setNewSatId] = useState('');
  const [isFetchingNew, setIsFetchingNew] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customTle1, setCustomTle1] = useState('');
  const [customTle2, setCustomTle2] = useState('');
  const [locName, setLocName] = useState('');
  const [locLat, setLocLat] = useState('');
  const [locLon, setLocLon] = useState('');

  useEffect(() => {
    if (!trackedSatId && !trackedLocId && controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
    }
  }, [trackedSatId, trackedLocId]);

  // CATEGORIZED INITIAL FETCH
  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        let loadedSats = [];
        let initialSettings = {};

        const urls = [
          'GROUP=stations',
          'GROUP=gps-ops',
          'GROUP=goes',
          'GROUP=weather',
          'GROUP=resource',
          'GROUP=science',
          'GROUP=starlink'
        ];

        const responses = await Promise.all(urls.map(url => fetch(`https://celestrak.org/NORAD/elements/gp.php?${url}&FORMAT=tle`)));
        const texts = await Promise.all(responses.map(res => res.text()));

        texts.forEach((text, index) => {
          const groupUrl = urls[index];
          const lines = text.trim().split('\n');
          
          for (let i = 0; i < lines.length; i += 3) {
            if (i + 2 < lines.length) {
              const name = lines[i].trim();
              const tle1 = lines[i+1].trim();
              const tle2 = lines[i+2].trim();
              const id = tle1.substring(2, 7).trim();
              
              let category = 'Uncategorized';
              let hue = 0;
              let include = true;

              if (groupUrl === 'GROUP=stations') {
                category = 'Space Stations'; hue = 0;
              } 
              else if (groupUrl === 'GROUP=gps-ops') {
                category = 'GPS Constellation'; hue = 120;
              } 
              else if (groupUrl === 'GROUP=goes') {
                category = 'GOES Constellation'; hue = 30;
              } 
              else if (groupUrl === 'GROUP=weather') {
                if (name.includes('NOAA') || name.includes('METOP') || name.includes('METEOR')) {
                  category = 'Weather & Environment'; hue = 200;
                } else { include = false; }
              } 
              else if (groupUrl === 'GROUP=resource') {
                if (name.match(/(LANDSAT|TERRA|AQUA|AURA|SMAP|ICESAT|GRACE)/i)) {
                  category = 'Earth Res. (NASA/USGS)'; hue = 260;
                } else if (name.match(/(SENTINEL|EARTHCARE|CRYOSAT|SMOS)/i)) {
                  category = 'Earth Res. (ESA)'; hue = 280;
                } else if (name.match(/(FLOCK|LEMUR|SKYSAT|WORLDVIEW|GEOEYE|BLACKSKY|ICEYE|CAPELLA|PELICAN)/i)) {
                  category = 'Earth Res. (Commercial)'; hue = 300;
                } else {
                  category = 'Earth Res. (Intl/Other)'; hue = 320;
                }
              } 
              else if (groupUrl === 'GROUP=science') {
                if (name.match(/(HST|CHANDRA|SWIFT|FERMI|NUSTAR|IXPE|XMM|INTEGRAL)/i)) {
                  category = 'Science (Space Telescopes)'; hue = 50;
                } else {
                  category = 'Science (Earth/Other)'; hue = 70;
                }
              }
              else if (groupUrl === 'GROUP=starlink') {
                if (Math.random() > 0.03) { include = false; } 
                else { category = 'Starlink (Sampled)'; hue = 180; }
              }

              if (include && !loadedSats.some(s => s.id === id)) {
                const satColor = `hsl(${hue + (Math.random()*30 - 15)}, ${70 + Math.random()*30}%, ${50 + Math.random()*20}%)`;
                
                // ONLY ISS (25544) AND HUBBLE (HST) ACTIVE ON BOOT
                const startActive = (id === '25544' || name.includes('HST')); 
                
                loadedSats.push({ id, name, color: satColor, group: category, tle1, tle2 });
                initialSettings[id] = { active: startActive, showOrbit: startActive, showGround: startActive };
              }
            }
          }
        });

        // CUSTOM SORTING LOGIC TO FORCE SPACE STATIONS TO THE TOP
        const groupOrder = [
          'Space Stations',
          'Science (Space Telescopes)',
          'GPS Constellation',
          'Weather & Environment',
          'GOES Constellation',
          'Earth Res. (NASA/USGS)',
          'Earth Res. (ESA)',
          'Earth Res. (Commercial)',
          'Earth Res. (Intl/Other)',
          'Science (Earth/Other)',
          'Starlink (Sampled)',
          'Custom'
        ];

        loadedSats.sort((a, b) => {
          let indexA = groupOrder.indexOf(a.group);
          let indexB = groupOrder.indexOf(b.group);
          if (indexA === -1) indexA = 99;
          if (indexB === -1) indexB = 99;
          if (indexA === indexB) return a.name.localeCompare(b.name);
          return indexA - indexB;
        });

        setSatellites(loadedSats);
        setSatSettings(initialSettings);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch categorized satellite data:", error);
      }
    };
    fetchLiveData();
  }, []);

  const handleAddCustomId = async () => {
    if (!newSatId || isNaN(newSatId) || Number(newSatId) <= 0 || satellites.some(s => s.id === newSatId)) {
      return alert("Please enter a valid, new numeric NORAD ID.");
    }
    setIsFetchingNew(true);
    try {
      const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${newSatId}&FORMAT=tle`);
      const text = await response.text();
      if (text.includes("No GP data found")) throw new Error("Invalid ID");

      const lines = text.trim().split('\n');
      if (lines.length >= 3) {
        const randomColor = `hsl(${Math.random() * 360}, 100%, 60%)`;
        const newSat = { id: newSatId, name: lines[0].trim(), color: randomColor, group: 'Custom', tle1: lines[1].trim(), tle2: lines[2].trim() };
        setSatellites(prev => [...prev, newSat]);
        setSatSettings(prev => ({ ...prev, [newSatId]: { active: true, showOrbit: true, showGround: true } }));
        setExpandedGroups(prev => ({ ...prev, 'Custom': true })); 
        setNewSatId(''); 
      }
    } catch (error) {
      alert(`Could not find NORAD ID: ${newSatId}. Check your connection or the ID number.`);
    }
    setIsFetchingNew(false);
  };

  const handleAddCustomTLE = () => {
    if (!customName || !customTle1 || !customTle2 || customTle1.length !== 69 || customTle2.length !== 69 || !customTle1.startsWith('1 ') || !customTle2.startsWith('2 ')) {
      return alert("Please enter a valid name and two correctly formatted 69-character TLE lines.");
    }
    const fakeId = 'CUSTOM_' + Math.floor(Math.random() * 10000);
    const randomColor = `hsl(${Math.random() * 360}, 100%, 60%)`;
    const newSat = { id: fakeId, name: customName, color: randomColor, group: 'Custom', tle1: customTle1, tle2: customTle2 };
    setSatellites(prev => [...prev, newSat]);
    setSatSettings(prev => ({ ...prev, [fakeId]: { active: true, showOrbit: true, showGround: true } }));
    setExpandedGroups(prev => ({ ...prev, 'Custom': true }));
    setCustomName(''); setCustomTle1(''); setCustomTle2('');
  };

  const handleTrackSat = (id) => {
    setTrackedLocId(null);
    setTrackedSatId(prev => prev === id ? null : id);
  };

  const removeSatellite = (id) => {
    if (trackedSatId === id) setTrackedSatId(null);
    setSatellites(prev => prev.filter(sat => sat.id !== id));
    setSatSettings(prev => {
      const newSettings = { ...prev };
      delete newSettings[id];
      return newSettings;
    });
  };

  const toggleSat = (id) => setSatSettings(prev => ({ ...prev, [id]: { ...prev[id], active: !prev[id].active } }));
  const toggleOrbit = (id) => setSatSettings(prev => ({ ...prev, [id]: { ...prev[id], showOrbit: !prev[id].showOrbit } }));
  const toggleGround = (id) => setSatSettings(prev => ({ ...prev, [id]: { ...prev[id], showGround: !prev[id].showGround } }));

  const toggleGroupMaster = (groupName, field) => {
    const satsInGroup = satellites.filter(s => s.group === groupName);
    const anyTrue = satsInGroup.some(s => satSettings[s.id]?.[field]);
    const newState = !anyTrue; 

    setSatSettings(prev => {
      const next = { ...prev };
      satsInGroup.forEach(s => {
        if (next[s.id]) {
          next[s.id] = { ...next[s.id], [field]: newState };
          if (newState === true && (field === 'showOrbit' || field === 'showGround')) {
            next[s.id].active = true;
          }
        }
      });
      return next;
    });
  };

  const toggleAccordion = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const groupedSatellites = satellites.reduce((acc, sat) => {
    const searchStr = searchQuery.toLowerCase();
    
    // Alias injection for search
    if (searchStr.includes('international')) {
        if (!acc['Space Stations']) acc['Space Stations'] = [];
        const isAlreadyAdded = acc['Space Stations'].some(s => s.id === '25544');
        if (sat.id === '25544' && !isAlreadyAdded) acc['Space Stations'].push(sat); 
        return acc;
    }
    
    if (searchStr.includes('hubble')) {
        if (!acc['Science (Space Telescopes)']) acc['Science (Space Telescopes)'] = [];
        const isAlreadyAdded = acc['Science (Space Telescopes)'].some(s => s.name === 'HST');
        if (sat.name === 'HST' && !isAlreadyAdded) acc['Science (Space Telescopes)'].push(sat);
        return acc;
    }

    const matchesSearch = sat.name.toLowerCase().includes(searchStr) || sat.id.includes(searchStr);
    if (!matchesSearch) return acc;

    if (!acc[sat.group]) acc[sat.group] = [];
    acc[sat.group].push(sat);
    return acc;
  }, {});

  const handleLocateMe = () => {
    if (!navigator.geolocation) return alert("Geolocation is not supported by your browser.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { id: 'loc_' + Date.now(), name: 'My Local Position', lat: pos.coords.latitude, lon: pos.coords.longitude, color: '#00ffcc', active: true };
        setLocations(prev => [...prev, loc]);
      },
      () => alert("Unable to retrieve your location. Check your browser permissions.")
    );
  };
  
  const handleAddCustomLocation = () => {
    const lat = parseFloat(locLat);
    const lon = parseFloat(locLon);
    if (!locName || isNaN(lat) || lat < -90 || lat > 90 || isNaN(lon) || lon < -180 || lon > 180) {
      return alert("Please provide a valid name, a latitude (-90 to 90), and a longitude (-180 to 180).");
    }
    const randomColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
    const loc = { id: 'loc_' + Date.now(), name: locName, lat: lat, lon: lon, color: randomColor, active: true };
    setLocations(prev => [...prev, loc]);
    setLocName(''); setLocLat(''); setLocLon('');
  };
  
  const handleTrackLoc = (id) => {
    setTrackedSatId(null);
    setTrackedLocId(prev => prev === id ? null : id);
  };
  
  const toggleLocActive = (id) => setLocations(prev => prev.map(loc => loc.id === id ? { ...loc, active: !loc.active } : loc));
  
  const removeLocation = (id) => {
    if (trackedLocId === id) setTrackedLocId(null);
    setLocations(prev => prev.filter(loc => loc.id !== id));
  };

  const parseTLEData = (tle1, tle2) => {
    let launchYear = parseInt(tle1.substring(9, 11));
    launchYear = launchYear > 50 ? 1900 + launchYear : 2000 + launchYear;
    const launchNum = tle1.substring(11, 14).trim();
    const inclination = parseFloat(tle2.substring(8, 16)).toFixed(2);
    const meanMotion = parseFloat(tle2.substring(52, 63));
    const periodMinutes = meanMotion > 0 ? (1440 / meanMotion).toFixed(1) : "Unknown";
    return { launchYear, launchNum, inclination, periodMinutes };
  };

  const btnStyle = { flex: 1, padding: '6px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', transition: '0.2s' };
  const inputStyle = { width: '100%', padding: '6px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', boxSizing: 'border-box' };

  if (isLoading) {
    return <div style={{ width: '100vw', height: '100vh', backgroundColor: 'black', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}><h2>Loading Satellite Databases...</h2></div>;
  }

  const isTracking = trackedSatId !== null || trackedLocId !== null;

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: 'black', margin: 0, padding: 0, overflow: 'hidden' }}>
      
      {showUI && (
        <div style={{ 
          width: '360px', minWidth: '360px', maxWidth: '360px', flexShrink: 0,
          height: '100vh',
          backgroundColor: '#141414', color: 'white', 
          padding: '20px', fontFamily: 'sans-serif', 
          borderRight: '1px solid #444',
          overflowY: 'auto', boxSizing: 'border-box' 
        }}>
          
          <h2 style={{ margin: '0 0 15px 0', fontSize: '1.2rem', textAlign: 'center' }}>Orbit Controls</h2>
          <LiveTimeDisplay />
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <span>Simulation Speed (x):</span>
              <input type="number" value={timeSpeed} onChange={(e) => setTimeSpeed(Number(e.target.value))} style={{ width: '80px', padding: '4px', backgroundColor: '#333', color: '#00ffcc', border: '1px solid #555', borderRadius: '4px', textAlign: 'right', fontWeight: 'bold' }} />
            </label>
            <input type="range" min="-3000" max="3000" value={timeSpeed} onChange={(e) => setTimeSpeed(Number(e.target.value))} style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
              <button onClick={() => setTimeSpeed(0)} style={btnStyle}>Pause</button>
              <button onClick={() => setTimeSpeed(1)} style={btnStyle}>1x</button>
              <button onClick={() => { GLOBAL_SIM_TIME = Date.now(); setTimeSpeed(1); }} style={{...btnStyle, backgroundColor: '#0066cc', borderColor: '#0066cc'}}>Reset Now</button>
            </div>
          </div>

          <hr style={{ borderColor: '#444' }} />

          <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#aaa' }}>Visuals</h3>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '10px' }}>
              <input type="checkbox" checked={realisticLighting} onChange={(e) => setRealisticLighting(e.target.checked)} style={{ marginRight: '8px' }} />
              Realistic Sun Shading
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Global Trail Length (Min): </span>
              <input type="number" min="0" max="2880" value={trackLength} onChange={(e) => setTrackLength(Number(e.target.value))} style={{ width: '60px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', padding: '4px', textAlign: 'right' }} />
            </label>
            <input type="range" min="0" max="2880" value={trackLength} onChange={(e) => setTrackLength(Number(e.target.value))} style={{ width: '100%', marginTop: '5px' }} />
          </div>

          <hr style={{ borderColor: '#444' }} />

          <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#aaa' }}>Manage Satellites</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <input 
              type="text" 
              placeholder="🔍 Search by name or ID..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{...inputStyle, backgroundColor: '#222', borderColor: '#666', fontWeight: 'bold'}} 
            />
          </div>

          <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
            <input type="text" placeholder="Add NORAD ID..." value={newSatId} onChange={(e) => setNewSatId(e.target.value)} style={inputStyle} />
            <button onClick={handleAddCustomId} disabled={isFetchingNew} style={{ ...btnStyle, flex: 0.5, backgroundColor: isFetchingNew ? '#555' : '#009944' }}>{isFetchingNew ? '...' : 'Add'}</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px' }}>
            <input type="text" placeholder="Custom Entity Name" value={customName} onChange={e => setCustomName(e.target.value)} style={inputStyle} />
            <input type="text" placeholder="TLE Line 1" value={customTle1} onChange={e => setCustomTle1(e.target.value)} style={{...inputStyle, fontFamily: 'monospace', fontSize: '0.7rem'}} />
            <input type="text" placeholder="TLE Line 2" value={customTle2} onChange={e => setCustomTle2(e.target.value)} style={{...inputStyle, fontFamily: 'monospace', fontSize: '0.7rem'}} />
            <button onClick={handleAddCustomTLE} style={{ ...btnStyle, backgroundColor: '#6600cc', borderColor: '#6600cc', marginTop: '5px' }}>Simulate Custom TLE</button>
          </div>

          <p style={{fontSize: '0.75rem', color: '#888', fontStyle: 'italic', marginBottom: '10px'}}>Click a satellite name to engage Chase Cam.</p>
          
          {Object.keys(groupedSatellites).map(groupName => {
            const isExpanded = searchQuery.length > 0 ? true : expandedGroups[groupName];
            const groupSats = groupedSatellites[groupName];
            
            const anyActive = groupSats.some(sat => satSettings[sat.id]?.active);
            const anyOrbit = groupSats.some(sat => satSettings[sat.id]?.showOrbit);
            const anyGround = groupSats.some(sat => satSettings[sat.id]?.showGround);

            return (
              <div key={groupName} style={{ marginBottom: '10px', backgroundColor: '#1a1a1a', borderRadius: '6px', overflow: 'hidden', border: '1px solid #333' }}>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#333', padding: '8px 10px', cursor: 'pointer' }}>
                  <span onClick={() => toggleAccordion(groupName)} style={{ flex: 1, fontWeight: 'bold', fontSize: '0.9rem', color: '#eee' }}>
                    {isExpanded ? '▼' : '▶'} {groupName} ({groupSats.length})
                  </span>
                  <div style={{ display: 'flex', gap: '6px', fontSize: '0.75rem' }}>
                    <label style={{ cursor: 'pointer' }} title="Toggle all Satellites">
                      <input type="checkbox" checked={anyActive} onChange={() => toggleGroupMaster(groupName, 'active')} style={{ margin: 0, verticalAlign: 'middle' }}/>
                    </label>
                    <label style={{ cursor: 'pointer', color: '#aaa' }} title="Toggle all Paths">
                      P: <input type="checkbox" checked={anyOrbit} onChange={() => toggleGroupMaster(groupName, 'showOrbit')} style={{ margin: 0, verticalAlign: 'middle' }}/>
                    </label>
                    <label style={{ cursor: 'pointer', color: '#aaa' }} title="Toggle all Ground Tracks">
                      G: <input type="checkbox" checked={anyGround} onChange={() => toggleGroupMaster(groupName, 'showGround')} style={{ margin: 0, verticalAlign: 'middle' }}/>
                    </label>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '5px 10px' }}>
                    {groupSats.map(sat => {
                      const settings = satSettings[sat.id];
                      if (!settings) return null;
                      return (
                        <div key={sat.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #333' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', cursor: 'pointer', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              <input type="checkbox" checked={settings.active} onChange={() => toggleSat(sat.id)} style={{ marginRight: '8px' }}/>
                              <span title={sat.name} onClick={(e) => { e.preventDefault(); handleTrackSat(sat.id); }} style={{ color: trackedSatId === sat.id ? '#ffffff' : sat.color, textDecoration: trackedSatId === sat.id ? 'underline' : 'none', transition: '0.2s', fontSize: '0.85rem' }}>
                                {sat.name} {trackedSatId === sat.id && ' 🎥'}
                              </span>
                            </label>
                            <div style={{ display: 'flex', gap: '4px', paddingLeft: '5px' }}>
                              <button onClick={() => setSelectedSat(sat)} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 5px', fontSize: '0.75rem' }}>ℹ️</button>
                              <button onClick={() => removeSatellite(sat.id)} style={{ background: '#cc0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 5px', fontSize: '0.75rem' }}>✖</button>
                            </div>
                          </div>
                          {settings.active && (
                            <div style={{ marginLeft: '25px', fontSize: '0.75rem', color: '#aaa' }}>
                              <label style={{ display: 'inline-flex', cursor: 'pointer', marginRight: '10px' }}><input type="checkbox" checked={settings.showOrbit} onChange={() => toggleOrbit(sat.id)} style={{ marginRight: '4px' }} /> Path</label>
                              <label style={{ display: 'inline-flex', cursor: 'pointer' }}><input type="checkbox" checked={settings.showGround} onChange={() => toggleGround(sat.id)} style={{ marginRight: '4px' }} /> Ground</label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <hr style={{ borderColor: '#444', marginTop: '20px' }} />

          <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#aaa' }}>Manage Locations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
            <input type="text" placeholder="Location Name" value={locName} onChange={e => setLocName(e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: '5px' }}>
              <input type="number" placeholder="Lat (-90 to 90)" value={locLat} onChange={e => setLocLat(e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Lon (-180 to 180)" value={locLon} onChange={e => setLocLon(e.target.value)} style={inputStyle} />
            </div>
            <button onClick={handleAddCustomLocation} style={{ ...btnStyle, backgroundColor: '#009944' }}>Add Coordinates</button>
          </div>
          
          <button onClick={handleLocateMe} style={{ ...btnStyle, width: '100%', backgroundColor: '#cc6600', borderColor: '#cc6600', marginBottom: '15px' }}>
            📍 Add My Device Location
          </button>

          {locations.map((loc) => (
            <div key={loc.id} style={{ marginBottom: '10px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', cursor: 'pointer', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                <input type="checkbox" checked={loc.active} onChange={() => toggleLocActive(loc.id)} style={{ marginRight: '8px' }}/>
                <span title={loc.name} onClick={(e) => { e.preventDefault(); handleTrackLoc(loc.id); }} style={{ color: trackedLocId === loc.id ? '#ffffff' : loc.color, textDecoration: trackedLocId === loc.id ? 'underline' : 'none', transition: '0.2s', fontSize: '0.85rem' }}>
                  {loc.name} {trackedLocId === loc.id && ' 🎥'}
                </span>
              </label>
              <button onClick={() => removeLocation(loc.id)} style={{ background: '#cc0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '0.8rem' }}>✖</button>
            </div>
          ))}

        </div>
      )}

      {/* STRICT VIEWPORT SIZING FOR THE CANVAS CONTAINER */}
      <div style={{ 
        flex: 1, 
        width: showUI ? 'calc(100vw - 360px)' : '100vw', 
        height: '100vh',
        position: 'relative',
        overflow: 'hidden'
      }}>
         
         <button 
            onClick={() => setShowUI(!showUI)}
            style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000, backgroundColor: 'rgba(20, 20, 20, 0.85)', color: 'white', border: '1px solid #444', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'sans-serif', fontWeight: 'bold' }}
          >
            {showUI ? '👁️ Hide Controls' : '👁️ Show Controls'}
          </button>

          {selectedSat && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(20, 20, 20, 0.95)', border: `2px solid ${selectedSat.color}`, padding: '25px', borderRadius: '12px', color: 'white', zIndex: 100, width: '400px', fontFamily: 'sans-serif' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #444', paddingBottom: '10px', marginBottom: '15px' }}>
                <h2 style={{ margin: 0, color: selectedSat.color }}>{selectedSat.name}</h2>
                <button onClick={() => setSelectedSat(null)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
              </div>
              <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                <p style={{ margin: '5px 0' }}><strong>NORAD ID:</strong> {selectedSat.id.includes('CUSTOM') ? 'Custom Entity' : selectedSat.id}</p>
                <p style={{ margin: '5px 0' }}><strong>Group:</strong> {selectedSat.group}</p>
                <p style={{ margin: '5px 0' }}><strong>Launch Year:</strong> {parseTLEData(selectedSat.tle1, selectedSat.tle2).launchYear}</p>
                <p style={{ margin: '5px 0' }}><strong>Launch Number:</strong> {parseTLEData(selectedSat.tle1, selectedSat.tle2).launchNum}</p>
                <p style={{ margin: '5px 0' }}><strong>Inclination:</strong> {parseTLEData(selectedSat.tle1, selectedSat.tle2).inclination}°</p>
                <p style={{ margin: '5px 0' }}><strong>Orbital Period:</strong> {parseTLEData(selectedSat.tle1, selectedSat.tle2).periodMinutes} minutes</p>
              </div>
              <LiveSatStats satData={selectedSat} />
            </div>
          )}

         <Canvas camera={{ position: [0, 0, 3], fov: 45 }} style={{ width: '100%', height: '100%' }}>
            <TimeUpdater timeSpeed={timeSpeed} />
            
            {/* AMBIENT LIGHT WIRED TO TOGGLE */}
            <ambientLight intensity={realisticLighting ? 0.05 : 2.5} />
            
            <Sun realisticLighting={realisticLighting} />
            <Suspense fallback={null}><Moon /></Suspense>
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            <Suspense fallback={null}><Earth /></Suspense>
            
            {locations.map(loc => (
              <LocationPin key={loc.id} locData={loc} isTracked={trackedLocId === loc.id} controlsRef={controlsRef} />
            ))}

            {satellites.map(sat => {
              const settings = satSettings[sat.id];
              return settings && settings.active && (
                <Satellite 
                  key={sat.id} 
                  satData={sat} 
                  trackLength={trackLength} 
                  settings={settings} 
                  isTracked={trackedSatId === sat.id} 
                  controlsRef={controlsRef} 
                  onSelect={() => setSelectedSat(sat)}
                />
              );
            })}
            <OrbitControls 
              ref={controlsRef} 
              enablePan={!isTracking} 
              enableRotate={!isTracking} 
              enableZoom={true} 
              minDistance={1.05} 
              maxDistance={100} 
            />
          </Canvas>
      </div>
    </div>
  );
}
