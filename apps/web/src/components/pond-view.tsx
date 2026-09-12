'use client';

import { useId, useRef } from 'react';
import type { DayPoint } from '@/lib/twin';

type Sensor = { id: string; x: number; y: number; label: string };
interface Props {
  daily: Pick<DayPoint,'ph'|'temperatureC'|'dissolvedOxygenMgL'|'opticalDensity'>[]; pinValues?: Record<string,string>; areaM2: number; depthM: number; mixing: boolean;
  sensors: Sensor[]; onMoveSensor: (id: string, x: number, y: number) => void;
  day: number; airTemperature: number; selectedSensor: string;
  onSelectSensor: (id: string) => void;
}

// The scene uses a stated 3:1 rectangular footprint, not surveyed site geometry.
// One shared transform keeps the dimensions, scale bar and probe positions aligned.
const pond = { x: 155, y: 228, width: 660, height: 220 };
export function PondView({ daily, areaM2, depthM, mixing, sensors, onMoveSensor, day, airTemperature, selectedSensor, onSelectSensor, pinValues }: Props) {
  const id = useId().replaceAll(':', '');
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const point = daily[Math.min(day, daily.length - 1)];
  const length = Math.sqrt(areaM2 * 3);
  const width = length / 3;
  const scale = [1, 2, 5, 10, 20, 50, 100].find(n => n >= length / 8) ?? 100;
  const scalePixels = scale / length * pond.width;
  const heat = airTemperature >= 35;
  const cool = airTemperature <= 20;
  const density = Math.min(1, Math.max(0, (point?.opticalDensity ?? .2) / .8));
  const readings: Record<string,string> = point ? { ph: point.ph.toFixed(1), do: `${point.dissolvedOxygenMgL.toFixed(1)} mg/L`, temp: `${point.temperatureC.toFixed(1)} °C`, od: point.opticalDensity.toFixed(2) } : {};
  const water = `hsl(${100 - density * 25} 36% ${53 - density * 20}%)`;
  const move = (sensor: Sensor, dx: number, dy: number) => {
    const y = Math.max(.12, Math.min(.88, sensor.y + dy));
    onMoveSensor(sensor.id, Math.max(.1, Math.min(.9, sensor.x + dx)), y > .42 && y < .58 ? (dy > 0 ? .58 : .42) : y);
  };
  return <div className={`pond-landscape ${heat ? 'landscape-hot' : cool ? 'landscape-cool' : 'landscape-mild'}`}>
    <div className="scene-weather"><span aria-hidden="true">{heat ? '☀' : cool ? '☁' : '◒'}</span><div><strong>{heat ? 'Hot conditions' : cool ? 'Cool conditions' : 'Mild conditions'}</strong><span>{airTemperature} °C average air · scenario input</span></div></div>
    <div className="pond-map"
      onPointerMove={e => {
        if (!dragging.current || !svg.current) return;
        const matrix = svg.current.getScreenCTM(); if (!matrix) return;
        const cursor = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
        const sensor = sensors.find(s => s.id === dragging.current); if (!sensor) return;
        move(sensor, (cursor.x - pond.x) / pond.width - sensor.x, (cursor.y - pond.y) / pond.height - sensor.y);
      }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
    <svg ref={svg} viewBox="80 90 840 470" className="pond-scene-svg" role="img" aria-label="Overhead pond plan with dimensions and a scale bar">
      <defs>
        <pattern id={`${id}-grid`} width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#526c4420" strokeWidth="1" /></pattern>
        <pattern id={`${id}-crops`} width="26" height="26" patternUnits="userSpaceOnUse"><path d="M0 13H26" stroke="#547b4340" strokeWidth="8" /></pattern>
        <linearGradient id={`${id}-water`} x2="0" y2="1"><stop stopColor={water} /><stop offset="1" stopColor="#366c49" /></linearGradient>
      </defs>
      <rect width="1000" height="680" fill={heat ? '#e9dfbd' : cool ? '#dce6e3' : '#e3ead5'} />
      <rect width="1000" height="680" fill={`url(#${id}-grid)`} />
      <path d="M0 575H1000M900 0V680" fill="none" stroke="#c8c7b5" strokeWidth="54" />
      <path d="M0 575H1000" stroke="#eeeadd" strokeWidth="2" strokeDasharray="15 12" />
      <rect x="36" y="90" width="180" height="78" rx="8" fill={`url(#${id}-crops)`} />
      <rect x="275" y="95" width="250" height="62" rx="8" fill={`url(#${id}-crops)`} />
      {[60,290,470,700].map((x,i) => <g key={x} transform={`translate(${x},${i % 2 ? 625 : 630})`}><circle r="24" fill="#bacbab" /><circle cy="-5" r="18" fill="#6b8c5f" /><circle cx="-6" cy="-10" r="10" fill="#88a473" /></g>)}
      <g transform="translate(730 95)"><rect width="115" height="62" rx="5" fill="#b3bfb5" /><path d="M-8 0L57 -22L123 0" fill="#5c716b" /><rect x="42" y="22" width="25" height="40" fill="#7e9187" /><text x="57" y="84" textAnchor="middle" className="scene-small">PUMP HOUSE</text></g>
      <path d="M785 157V190H770V228" fill="none" stroke="#758b82" strokeWidth="8" />
      <rect x="141" y="214" width="688" height="248" rx="50" fill="#b3b8a3" />
      <rect {...{x:pond.x,y:pond.y,width:pond.width,height:pond.height}} rx="38" fill={`url(#${id}-water)`} stroke="#788a70" strokeWidth="3" />
      <rect x="248" y="321" width="473" height="34" rx="17" fill="#cbd0b7" stroke="#b5bea2" strokeWidth="3" />
      <g className={mixing ? 'scene-flow is-running' : 'scene-flow'} fill="none" stroke="#d1efb8" strokeOpacity=".4" strokeWidth="4" strokeDasharray="24 38"><path d="M265 264H720Q787 264 787 323" /><path d="M720 411H265Q183 411 183 345" /></g>
      <g transform="translate(200 302)"><rect x="-16" y="-42" width="32" height="84" rx="4" fill={mixing ? '#244e45' : '#934734'} /><g className={mixing ? 'scene-wheel is-running' : 'scene-wheel'} stroke="#c5d7cc" strokeWidth="5">{[-30,-15,0,15,30].map(y=><path key={y} d={`M-12 ${y}H12`} />)}</g></g>
      <text x="205" y="490" textAnchor="middle" className="scene-small">PADDLEWHEEL {mixing ? 'ON' : 'OFF'}</text>
      <g stroke="#52675b" strokeWidth="1.5" fill="none"><path d="M155 204V180M815 204V180M155 188H815M155 182V194M815 182V194" /><path d="M835 228H875M835 448H875M863 228V448M857 228H869M857 448H869" /></g>
      <text x="485" y="176" textAnchor="middle" className="scene-dimension">{length.toFixed(1)} m</text>
      <text x="882" y="338" textAnchor="middle" transform="rotate(90 882 338)" className="scene-dimension">{width.toFixed(1)} m</text>
      <text x="490" y="342" textAnchor="middle" className="scene-small">{Math.round(areaM2).toLocaleString('en-IN')} m² · {Math.round(depthM * 100)} cm deep</text>
      <g transform="translate(80 535)"><path d={`M0 -5V5H${scalePixels}V-5`} fill="none" stroke="#425c4a" strokeWidth="3" /><text x={scalePixels/2} y="-13" textAnchor="middle" className="scene-small">{scale} m</text></g>
      <g transform="translate(944 490)"><path d="M0 25V-20M-8 -8L0 -22L8 -8" fill="none" stroke="#486554" strokeWidth="3" /><text y="-32" textAnchor="middle" className="scene-small">N</text></g>
    </svg>
    {sensors.map(sensor => <button type="button" key={sensor.id} className="scene-probe" aria-pressed={selectedSensor === sensor.id} aria-label={`${sensor.label} sensor. Select to inspect; arrow keys move the marker.`}
      style={{ left: `${(pond.x + sensor.x * pond.width - 80) / 840 * 100}%`, top: `${(pond.y + sensor.y * pond.height - 90) / 470 * 100}%` }}
      onClick={() => onSelectSensor(sensor.id)} onPointerDown={e => { onSelectSensor(sensor.id); dragging.current = sensor.id; e.currentTarget.setPointerCapture(e.pointerId); }}
      onKeyDown={e => { const delta: Record<string,number[]> = { ArrowLeft: [-.025,0], ArrowRight: [.025,0], ArrowUp: [0,-.08], ArrowDown: [0,.08] }; if(delta[e.key]) { e.preventDefault(); move(sensor,delta[e.key]![0]!,delta[e.key]![1]!); } }}>
      <span className="probe-dot" /><span className="probe-name">{sensor.label} {readings[sensor.id]}{pinValues?.[sensor.id] && <><br/>{pinValues[sensor.id]}</>}</span>
    </button>)}
    </div>
    <div className="scene-caption"><span>Overhead plan · auto-fit scale</span><span>Illustrative 3:1 footprint; equipment not to scale</span></div>
  </div>;
}
