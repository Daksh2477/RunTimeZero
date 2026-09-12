import { HardwareWorkspace } from '@/components/hardware-workspace';
export const metadata={title:'Simulated sensor hardware',description:'Explore sensor channels, wiring, pin signals and itemised Indian-rupee costs.'};
export default function HardwarePage() {
 return <main className="wrap hardware"><div className="page-heading"><div><p className="eyebrow">SIMULATED SENSOR HARDWARE</p><h1>A pond reading, traced back to its pin.</h1><p>Explore an electronic model of the sensor node: its channels, wiring, power and component costs. Every node in this demo is simulated.</p></div></div><HardwareWorkspace/></main>;
}
