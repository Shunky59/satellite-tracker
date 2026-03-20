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
    // Updates the clock UI every 50ms to ensure it stays snappy at high time speeds
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
function Sun() {
  const sunRef = useRef();
  const lightRef = useRef();

  useFrame(() => {
    const simTime = new Date(GLOBAL_SIM_TIME);
    
    const jd = satellite.jday(simTime.getUTCFullYear(), simTime.getUTCMonth() + 1, simTime.getUTCDate(), simTime.getUTCHours(), simTime.getUTCMinutes(), simTime.getUTCSeconds());
    const n = jd - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = (357.528 + 0.9856003 * n) % 360;
    const gRad = g * Math.PI / 180;
    const lambda = (L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad)) % 360;
    const lambdaRad = lambda * Math.PI / 180;
    const epsilon = 23.439 - 0.0000004 * n;
    const epsilonRad = epsilon * Math.PI / 180;

    const x = Math.cos(lambdaRad);
    const y = Math.cos(epsilonRad) * Math.sin(lambdaRad);
    const z = Math.sin(epsilonRad) * Math.sin(lambdaRad);

    const distance = 50; 
    const sunPos = [x * distance, z * distance, -y * distance];

    if (sunRef.current) sunRef.current.position.set(...sunPos);
    if (lightRef.current) lightRef.current.position.set(...sunPos);
  });

  return (
    <>
      {/* Light emits white */}
      <directionalLight ref={lightRef} intensity={2.5} color="#ffffff" castShadow />
      <mesh ref={sunRef}>
        <sphereGeometry args={[1.5, 32, 32]} />
        {/* Sun mesh stays yellow */}
        <meshBasicMaterial color="#FFD700" />
      </mesh>
    </>
  );
}

function Moon() {
  const moonTexture = useTexture('/moon.jpg'); 
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

    const distanceScale = 10; 
    const moonPos = [x * distanceScale, z * distanceScale, -y * distanceScale];

    moonRef.current.position.set(...moonPos);

    const siderealRotationPeriodDays = 27.32166;
    const radiansPerMillisecond = (2 * Math.PI) / (siderealRotationPeriodDays * 24 * 60 * 60 * 1000);
    moonRef.current.rotation.y = (n * 24 * 60 * 60 * 1000) * radiansPerMillisecond;
  });

  return (
    <mesh ref={moonRef} castShadow receiveShadow>
      <sphereGeometry args={[0.3, 64, 64]} />
      <meshStandardMaterial map={moonTexture} roughness={0.9} metalness={0.0} />
    </mesh>
  );
}

function Earth() {
  const colorMap = useTexture('/earth.jpg');
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
      if (camDist < 1.5) camDist = 1.5;

      const targetPos = new THREE.Vector3(
        (worldX / r) * camDist,
        (worldY / r) * camDist,
        (worldZ / r) * camDist
      );

      camera.position.lerp(targetPos, 0.15);
      controlsRef.current.target.set(0, 0, 0);
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

function Satellite({ satData, trackLength, settings, isTracked, controlsRef }) {
  const satRef = useRef();
  const groundGroupRef = useRef();
  const lastUpdateRef = useRef(0);
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
        if (camDist < distToSat + 0.05) camDist = distToSat + 0.05;

        const targetPos = new THREE.Vector3(
          (px / distToSat) * camDist,
          (py / distToSat) * camDist,
          (pz / distToSat) * camDist
        );

        camera.position.lerp(targetPos, 0.15);
        controlsRef.current.target.set(0, 0, 0);
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
  
  // Satellite State
  const [satellites, setSatellites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [satSettings, setSatSettings] = useState({});
  const [selectedSat, setSelectedSat] = useState(null); 
  const [trackedSatId, setTrackedSatId] = useState(null); 
  
  // Location State
  const [locations, setLocations] = useState([]);
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

  // Handle tracking lock releases
  useEffect(() => {
    if (!trackedSatId && !trackedLocId && controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
    }
  }, [trackedSatId, trackedLocId]);

  // Initial Data Fetch
  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        const defaultIds = [
          { id: '25544', color: '#ff0000', startActive: true },
          { id: '20580', color: '#ffff00', startActive: false },
        ];
        const loadedSats = [];
        const initialSettings = {};

        for (const sat of defaultIds) {
          const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.id}&FORMAT=tle`);
          const text = await response.text();
          const lines = text.trim().split('\n');
          
          if (lines.length >= 3) {
            let satName = lines[0].trim();
            if (sat.id === '20580') satName = 'Hubble Space Telescope';
            loadedSats.push({ id: sat.id, name: satName, color: sat.color, tle1: lines[1].trim(), tle2: lines[2].trim() });
            initialSettings[sat.id] = { active: sat.startActive, showOrbit: true, showGround: true };
          }
        }
        setSatellites(loadedSats);
        setSatSettings(initialSettings);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch live satellite data:", error);
      }
    };
    fetchLiveData();
  }, []);

  // Handlers for Satellites
  const handleAddCustomId = async () => {
    if (!newSatId || satellites.some(s => s.id === newSatId)) return alert("Enter a valid, new NORAD ID.");
    setIsFetchingNew(true);
    try {
      const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${newSatId}&FORMAT=tle`);
      const text = await response.text();
      if (text.includes("No GP data found")) throw new Error("Invalid ID");

      const lines = text.trim().split('\n');
      if (lines.length >= 3) {
        const randomColor = `hsl(${Math.random() * 360}, 100%, 60%)`;
        const newSat = { id: newSatId, name: lines[0].trim(), color: randomColor, tle1: lines[1].trim(), tle2: lines[2].trim() };
        setSatellites(prev => [...prev, newSat]);
        setSatSettings(prev => ({ ...prev, [newSatId]: { active: true, showOrbit: true, showGround: true } }));
        setNewSatId(''); 
      }
    } catch (error) {
      alert(`Could not find NORAD ID: ${newSatId}`);
    }
    setIsFetchingNew(false);
  };

  const handleAddCustomTLE = () => {
    if (!customName || customTle1.length < 68 || customTle2.length < 68) return alert("Please enter a name and two valid 69-character TLE lines.");
    const fakeId = 'CUSTOM_' + Math.floor(Math.random() * 10000);
    const randomColor = `hsl(${Math.random() * 360}, 100%, 60%)`;
    const newSat = { id: fakeId, name: customName, color: randomColor, tle1: customTle1, tle2: customTle2 };
    setSatellites(prev => [...prev, newSat]);
    setSatSettings(prev => ({ ...prev, [fakeId]: { active: true, showOrbit: true, showGround: true } }));
    setCustomName(''); setCustomTle1(''); setCustomTle2('');
  };

  // Handlers for Locations
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
    if (!locName || isNaN(locLat) || isNaN(locLon)) return alert("Please provide a valid name, latitude, and longitude.");
    const randomColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
    const loc = { id: 'loc_' + Date.now(), name: locName, lat: parseFloat(locLat), lon: parseFloat(locLon), color: randomColor, active: true };
    setLocations(prev => [...prev, loc]);
    setLocName(''); setLocLat(''); setLocLon('');
  };

  const toggleLocActive = (id) => setLocations(prev => prev.map(loc => loc.id === id ? { ...loc, active: !loc.active } : loc));
  const removeLocation = (id) => {
    if (trackedLocId === id) setTrackedLocId(null);
    setLocations(prev => prev.filter(loc => loc.id !== id));
  };

  // Tracking Toggles
  const handleTrackSat = (id) => {
    setTrackedLocId(null);
    setTrackedSatId(prev => prev === id ? null : id);
  };
  const handleTrackLoc = (id) => {
    setTrackedSatId(null);
    setTrackedLocId(prev => prev === id ? null : id);
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
    return <div style={{ width: '100vw', height: '100vh', backgroundColor: 'black', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}><h2>Fetching Live Telemetry...</h2></div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: 'black', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' }}>
      
      {/* GLOBAL UI TOGGLE BUTTON */}
      <button 
        onClick={() => setShowUI(!showUI)}
        style={{ position: 'absolute', top: 20, right: 20, zIndex: 20, backgroundColor: 'rgba(20, 20, 20, 0.85)', color: 'white', border: '1px solid #444', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'sans-serif', fontWeight: 'bold' }}
      >
        {showUI ? '👁️ Hide UI' : '👁️ Show UI'}
      </button>

      {/* SATELLITE INFO MODAL */}
      {showUI && selectedSat && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(20, 20, 20, 0.95)', border: `2px solid ${selectedSat.color}`, padding: '25px', borderRadius: '12px', color: 'white', zIndex: 100, width: '400px', fontFamily: 'sans-serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #444', paddingBottom: '10px', marginBottom: '15px' }}>
            <h2 style={{ margin: 0, color: selectedSat.color }}>{selectedSat.name}</h2>
            <button onClick={() => setSelectedSat(null)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
          </div>
          <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
            <p style={{ margin: '5px 0' }}><strong>NORAD ID:</strong> {selectedSat.id.includes('CUSTOM') ? 'Custom Entity' : selectedSat.id}</p>
            <p style={{ margin: '5px 0' }}><strong>Launch Year:</strong> {parseTLEData(selectedSat.tle1, selectedSat.tle2).launchYear}</p>
            <p style={{ margin: '5px 0' }}><strong>Launch Number:</strong> {parseTLEData(selectedSat.tle1, selectedSat.tle2).launchNum}</p>
            <p style={{ margin: '5px 0' }}><strong>Inclination:</strong> {parseTLEData(selectedSat.tle1, selectedSat.tle2).inclination}°</p>
            <p style={{ margin: '5px 0' }}><strong>Orbital Period:</strong> {parseTLEData(selectedSat.tle1, selectedSat.tle2).periodMinutes} minutes</p>
          </div>
          <LiveSatStats satData={selectedSat} />
        </div>
      )}

      {/* UI OVERLAY PANEL */}
      {showUI && (
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, backgroundColor: 'rgba(20, 20, 20, 0.85)', color: 'white', padding: '20px', borderRadius: '10px', width: '320px', fontFamily: 'sans-serif', border: '1px solid #444', maxHeight: '90vh', overflowY: 'auto' }}>
          
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

          <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#aaa' }}>Trails</h3>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Length (Minutes): </span>
              <input type="number" min="0" max="2880" value={trackLength} onChange={(e) => setTrackLength(Number(e.target.value))} style={{ width: '60px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', padding: '4px', textAlign: 'right' }} />
            </label>
            <input type="range" min="0" max="2880" value={trackLength} onChange={(e) => setTrackLength(Number(e.target.value))} style={{ width: '100%', marginTop: '5px' }} />
          </div>

          <hr style={{ borderColor: '#444' }} />

          {/* SATELLITE CONTROLS */}
          <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#aaa' }}>Manage Satellites</h3>
          
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

          <p style={{fontSize: '0.75rem', color: '#888', fontStyle: 'italic', marginBottom: '5px'}}>Click a name for Chase Cam.</p>
          {satellites.map((sat) => {
            const settings = satSettings[sat.id];
            if (!settings) return null;
            return (
              <div key={sat.id} style={{ marginBottom: '10px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', cursor: 'pointer', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    <input type="checkbox" checked={settings.active} onChange={() => toggleSat(sat.id)} style={{ marginRight: '8px' }}/>
                    <span title={sat.name} onClick={(e) => { e.preventDefault(); handleTrackSat(sat.id); }} style={{ color: trackedSatId === sat.id ? '#ffffff' : sat.color, textDecoration: trackedSatId === sat.id ? 'underline' : 'none', transition: '0.2s' }}>
                      {sat.name} {trackedSatId === sat.id && ' 🎥'}
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '5px', paddingLeft: '5px' }}>
                    <button onClick={() => setSelectedSat(sat)} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '0.8rem' }}>ℹ️</button>
                    <button onClick={() => removeSatellite(sat.id)} style={{ background: '#cc0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '0.8rem' }}>✖</button>
                  </div>
                </div>
                {settings.active && (
                  <div style={{ marginLeft: '25px', fontSize: '0.85rem' }}>
                    <label style={{ display: 'inline-flex', cursor: 'pointer', marginRight: '10px' }}><input type="checkbox" checked={settings.showOrbit} onChange={() => toggleOrbit(sat.id)} style={{ marginRight: '4px' }} /> Path</label>
                    <label style={{ display: 'inline-flex', cursor: 'pointer' }}><input type="checkbox" checked={settings.showGround} onChange={() => toggleGround(sat.id)} style={{ marginRight: '4px' }} /> Ground</label>
                  </div>
                )}
              </div>
            );
          })}

          <hr style={{ borderColor: '#444' }} />

          {/* LOCATIONS CONTROLS */}
          <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#aaa' }}>Manage Locations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
            <input type="text" placeholder="Location Name" value={locName} onChange={e => setLocName(e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: '5px' }}>
              <input type="number" placeholder="Lat (e.g., 40.71)" value={locLat} onChange={e => setLocLat(e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Lon (e.g., -74.00)" value={locLon} onChange={e => setLocLon(e.target.value)} style={inputStyle} />
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
                <span title={loc.name} onClick={(e) => { e.preventDefault(); handleTrackLoc(loc.id); }} style={{ color: trackedLocId === loc.id ? '#ffffff' : loc.color, textDecoration: trackedLocId === loc.id ? 'underline' : 'none', transition: '0.2s' }}>
                  {loc.name} {trackedLocId === loc.id && ' 🎥'}
                </span>
              </label>
              <button onClick={() => removeLocation(loc.id)} style={{ background: '#cc0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '0.8rem' }}>✖</button>
            </div>
          ))}

        </div>
      )}

      {/* 3D CANVAS */}
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        <TimeUpdater timeSpeed={timeSpeed} />
        <ambientLight intensity={0.05} />
        <Sun />
        <Suspense fallback={null}><Moon /></Suspense>
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <Suspense fallback={null}><Earth /></Suspense>
        
        {locations.map(loc => (
          <LocationPin key={loc.id} locData={loc} isTracked={trackedLocId === loc.id} controlsRef={controlsRef} />
        ))}

        {satellites.map(sat => {
          const settings = satSettings[sat.id];
          return settings && settings.active && (
            <Satellite key={sat.id} satData={sat} trackLength={trackLength} settings={settings} isTracked={trackedSatId === sat.id} controlsRef={controlsRef} />
          );
        })}
        <OrbitControls ref={controlsRef} enablePan={true} enableZoom={true} enableRotate={true} minDistance={1.05} maxDistance={15} />
      </Canvas>
    </div>
  );
}