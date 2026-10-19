import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Heart,
  Thermometer,
  Wifi,
  WifiOff,
  User,
  Cpu,
  Clock,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  TrendingUp,
  Sparkles,
  Layers,
  ArrowUpRight,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface ClientDevice {
  id: string;
  name: string;
  patientCode: string;
  age: number;
  gender: string;
  location: string;
  condition: string;
  deviceId: string;
  deviceModel: string;
  source: 'real' | 'simulated';
  ipAddress: string;
  signalStrengthDbm: number;
  batteryPercent: number;
  baselineHr: number;
  baselineSpo2: number;
  baselineTemp: number;
}

interface TelemetryPoint {
  time: string;
  timestamp: number;
  heartRate: number | null;
  spo2: number | null;
  skinTemperature: number;
  quality: 'valid' | 'no_contact';
  sequence: number;
}

const CLIENT_DEVICES: ClientDevice[] = [
  {
    id: 'client-1',
    name: 'Carlos Mendoza',
    patientCode: 'P-001',
    age: 42,
    gender: 'Masculino',
    location: 'Cama 04 — Sala de Monitoreo',
    condition: 'Postoperatorio ambulatorio estable',
    deviceId: 'ESP8266-A101',
    deviceModel: 'NodeMCU ESP8266 + MAX30102 + DS18B20',
    source: 'simulated',
    ipAddress: '192.168.1.101',
    signalStrengthDbm: -58,
    batteryPercent: 100,
    baselineHr: 74,
    baselineSpo2: 98.2,
    baselineTemp: 33.4,
  },
  {
    id: 'client-2',
    name: 'Elena Ramos',
    patientCode: 'P-002',
    age: 65,
    gender: 'Femenino',
    location: 'UCI Adultos — Módulo B',
    condition: 'Monitoreo respiratorio preventivo',
    deviceId: 'ESP8266-B202',
    deviceModel: 'NodeMCU ESP8266 + MAX30102 + DS18B20',
    source: 'simulated',
    ipAddress: '192.168.1.102',
    signalStrengthDbm: -64,
    batteryPercent: 92,
    baselineHr: 82,
    baselineSpo2: 96.5,
    baselineTemp: 34.1,
  },
  {
    id: 'client-3',
    name: 'Dr. Mario Estrada',
    patientCode: 'P-003',
    age: 38,
    gender: 'Masculino',
    location: 'Consultorio 01 — Chequeo de Prueba',
    condition: 'Evaluación funcional de telemetría',
    deviceId: 'ESP8266-C303',
    deviceModel: 'NodeMCU ESP8266 Físico (Placa Principal)',
    source: 'real',
    ipAddress: '192.168.1.103',
    signalStrengthDbm: -52,
    batteryPercent: 98,
    baselineHr: 68,
    baselineSpo2: 99.0,
    baselineTemp: 32.8,
  },
  {
    id: 'client-4',
    name: 'Sofía Castillo',
    patientCode: 'P-004',
    age: 19,
    gender: 'Femenino',
    location: 'Observación Médica — Cubículo 2',
    condition: 'Seguimiento hemodinámico continuo',
    deviceId: 'ESP8266-D404',
    deviceModel: 'PulsoLink Simulator Client v1.0',
    source: 'simulated',
    ipAddress: '192.168.1.104',
    signalStrengthDbm: -70,
    batteryPercent: 88,
    baselineHr: 92,
    baselineSpo2: 98.0,
    baselineTemp: 33.7,
  },
];

function generateInitialHistory(client: ClientDevice): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const now = Date.now();
  let currentHr = client.baselineHr;
  let currentSpo2 = client.baselineSpo2;
  let currentTemp = client.baselineTemp;

  for (let i = 24; i >= 0; i--) {
    const timestamp = now - i * 2000;
    const timeStr = new Intl.DateTimeFormat('es-GT', {
      timeZone: 'America/Guatemala',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(timestamp));

    currentHr = Math.round(
      Math.max(55, Math.min(115, currentHr + (Math.random() * 3 - 1.5)))
    );
    currentSpo2 = Math.round(
      Math.max(94, Math.min(99.8, currentSpo2 + (Math.random() * 0.4 - 0.2))) * 10
    ) / 10;
    currentTemp = Math.round(
      Math.max(31.5, Math.min(35.5, currentTemp + (Math.random() * 0.08 - 0.04))) * 100
    ) / 100;

    points.push({
      time: timeStr,
      timestamp,
      heartRate: currentHr,
      spo2: currentSpo2,
      skinTemperature: currentTemp,
      quality: 'valid',
      sequence: 25 - i,
    });
  }

  return points;
}

export const LiveMockupPage: React.FC = () => {
  const [selectedClientId, setSelectedClientId] = useState<string>(CLIENT_DEVICES[0].id);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [simulateNoContact, setSimulateNoContact] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'both' | 'oximetry' | 'temperature'>('both');

  // Historial de telemetría por cada cliente para persistencia en memoria durante la demo
  const [telemetryMap, setTelemetryMap] = useState<Record<string, TelemetryPoint[]>>(() => {
    const initial: Record<string, TelemetryPoint[]> = {};
    for (const client of CLIENT_DEVICES) {
      initial[client.id] = generateInitialHistory(client);
    }
    return initial;
  });

  const selectedClient = CLIENT_DEVICES.find((c) => c.id === selectedClientId) ?? CLIENT_DEVICES[0];
  const currentHistory = telemetryMap[selectedClientId] || [];
  const latestReading = currentHistory[currentHistory.length - 1];

  // Tick generator para simular datos en tiempo real cada 2s (o 1s si speedMultiplier == 2)
  useEffect(() => {
    if (!isRunning) return;

    const intervalTime = Math.max(800, Math.floor(2000 / speedMultiplier));
    const interval = setInterval(() => {
      const now = Date.now();
      const timeStr = new Intl.DateTimeFormat('es-GT', {
        timeZone: 'America/Guatemala',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(now));

      setTelemetryMap((prevMap) => {
        const newMap = { ...prevMap };

        for (const client of CLIENT_DEVICES) {
          const clientHistory = prevMap[client.id] || [];
          const lastPoint = clientHistory[clientHistory.length - 1];
          const prevHr = lastPoint?.heartRate ?? client.baselineHr;
          const prevSpo2 = lastPoint?.spo2 ?? client.baselineSpo2;
          const prevTemp = lastPoint?.skinTemperature ?? client.baselineTemp;
          const nextSeq = (lastPoint?.sequence ?? 0) + 1;

          const isCurrentTargetNoContact =
            client.id === selectedClientId && simulateNoContact;

          let nextHr: number | null = null;
          let nextSpo2: number | null = null;
          const nextTemp = Math.round(
            Math.max(31.5, Math.min(35.5, prevTemp + (Math.random() * 0.08 - 0.04))) * 100
          ) / 100;

          if (!isCurrentTargetNoContact) {
            nextHr = Math.round(
              Math.max(58, Math.min(110, prevHr + (Math.random() * 2.8 - 1.4)))
            );
            nextSpo2 = Math.round(
              Math.max(94.5, Math.min(99.8, prevSpo2 + (Math.random() * 0.35 - 0.17))) * 10
            ) / 10;
          }

          const newPoint: TelemetryPoint = {
            time: timeStr,
            timestamp: now,
            heartRate: nextHr,
            spo2: nextSpo2,
            skinTemperature: nextTemp,
            quality: isCurrentTargetNoContact ? 'no_contact' : 'valid',
            sequence: nextSeq,
          };

          // Mantener ventana corrediza de hasta 35 muestras en pantalla
          newMap[client.id] = [...clientHistory.slice(-34), newPoint];
        }

        return newMap;
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isRunning, speedMultiplier, simulateNoContact, selectedClientId]);

  const handleResetHistory = () => {
    setTelemetryMap((prev) => ({
      ...prev,
      [selectedClientId]: generateInitialHistory(selectedClient),
    }));
  };

  // Cálculos estadísticos para el cliente activo
  const validHrs = currentHistory.map((p) => p.heartRate).filter((v): v is number => v !== null);
  const avgHr = validHrs.length > 0 ? Math.round(validHrs.reduce((a, b) => a + b, 0) / validHrs.length) : null;
  const maxHr = validHrs.length > 0 ? Math.max(...validHrs) : null;
  const minHr = validHrs.length > 0 ? Math.min(...validHrs) : null;

  const validSpo2s = currentHistory.map((p) => p.spo2).filter((v): v is number => v !== null);
  const avgSpo2 = validSpo2s.length > 0 ? (validSpo2s.reduce((a, b) => a + b, 0) / validSpo2s.length).toFixed(1) : null;

  const temps = currentHistory.map((p) => p.skinTemperature);
  const avgTemp = temps.length > 0 ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(2) : null;
  const maxTemp = temps.length > 0 ? Math.max(...temps).toFixed(1) : null;
  const minTemp = temps.length > 0 ? Math.min(...temps).toFixed(1) : null;

  return (
    <div className="space-y-6">
      {/* Barra superior de modo presentación / demo */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 border border-sky-800/40 rounded-2xl p-4 sm:p-5 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300">
            <Activity className="w-6 h-6 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded bg-rose-500/30 text-rose-300 border border-rose-400/30">
                En Vivo • Presentación
              </span>
              <span className="text-xs text-sky-300/80 font-mono">
                Actualización: {speedMultiplier === 1 ? 'cada 2s (Contrato A)' : 'modo rápido 1s'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white mt-0.5">
              Prototipo Interactivo: Telemetría de Signos Vitales
            </h1>
          </div>
        </div>

        {/* Controles de la simulación */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
              isRunning
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" /> Pausar flujo
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" /> Reanudar flujo
              </>
            )}
          </button>

          <button
            onClick={() => setSimulateNoContact(!simulateNoContact)}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              simulateNoContact
                ? 'bg-rose-600 text-white border-rose-500 shadow-md animate-pulse'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Simula que el participante retira el dedo del sensor óptico MAX30102"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {simulateNoContact ? 'Retiro de dedo activo' : 'Simular sin contacto'}
          </button>

          <button
            onClick={() => setSpeedMultiplier((prev) => (prev === 1 ? 2 : 1))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            Velocidad: {speedMultiplier}x
          </button>

          <button
            onClick={handleResetHistory}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
            title="Reiniciar buffer de historial"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid principal: Lista de clientes / dispositivos (Izquierda) + Dashboard en vivo (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ===================== COLUMNA IZQUIERDA: CLIENTES Y DISPOSITIVOS ===================== */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <User className="w-4 h-4 text-sky-600" />
              Pacientes & Dispositivos ({CLIENT_DEVICES.length})
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              4 Conectados
            </span>
          </div>

          <div className="space-y-3">
            {CLIENT_DEVICES.map((client) => {
              const isSelected = client.id === selectedClientId;
              const history = telemetryMap[client.id] || [];
              const latest = history[history.length - 1];

              return (
                <div
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  className={`cursor-pointer rounded-xl p-4 transition-all border text-left relative overflow-hidden ${
                    isSelected
                      ? 'bg-white border-sky-500 shadow-md ring-2 ring-sky-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none">
                      <div className="w-full h-full bg-sky-500/10 rotate-45 transform origin-top-right" />
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{client.name}</span>
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                          {client.patientCode}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{client.location}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[11px] font-semibold text-emerald-700">En línea</span>
                    </div>
                  </div>

                  {/* Datos del dispositivo asignado */}
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono text-[11px] truncate">{client.deviceId}</span>
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[11px] font-mono">{client.signalStrengthDbm} dBm</span>
                    </div>
                  </div>

                  {/* Micro-lecturas en vivo en la tarjeta del cliente */}
                  <div className="mt-2 pt-2 border-t border-slate-100/60 flex items-center justify-between text-xs font-mono">
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {latest?.heartRate ? `${latest.heartRate} bpm` : '--'}
                    </span>
                    <span className="text-sky-600 font-bold flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {latest?.spo2 ? `${latest.spo2}%` : '--'}
                    </span>
                    <span className="text-amber-600 font-bold flex items-center gap-1">
                      <Thermometer className="w-3 h-3" />
                      {latest?.skinTemperature ? `${latest.skinTemperature}°C` : '--'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tarjeta de Especificación Técnica del Hardware */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2 text-slate-600">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Cpu className="w-4 h-4 text-sky-600" />
              Arquitectura IoT PulsoLink
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Dispositivos basados en <strong>NodeMCU ESP8266</strong>, sensor óptico reflectivo <strong>MAX30102</strong> en dedo y sonda digital <strong>DS18B20 TO-92</strong>. Comunicación mediante Contrato A HTTP POST con token Bearer criptográfico.
            </p>
          </div>
        </div>

        {/* ===================== COLUMNA DERECHA: DASHBOARD Y GRÁFICAS EN TIEMPO REAL ===================== */}
        <div className="lg:col-span-8 space-y-6">
          {/* Encabezado del paciente seleccionado */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
                    Expediente {selectedClient.patientCode}
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500">
                    {selectedClient.age} años, {selectedClient.gender}
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
                  {selectedClient.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ubicación: <strong>{selectedClient.location}</strong> | Diagnóstico:{' '}
                  <span className="italic">{selectedClient.condition}</span>
                </p>
              </div>

              <div className="flex flex-col sm:items-end gap-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Telemetría en Vivo
                  </span>
                  <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200">
                    Seq: #{latestReading?.sequence ?? 0}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  Dispositivo: {selectedClient.deviceId} ({selectedClient.deviceModel})
                </span>
              </div>
            </div>

            {/* Aviso de falta de contacto si está activo */}
            {simulateNoContact && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 animate-bounce" />
                <div>
                  <p className="font-bold">Falta de contacto óptico detectada (MAX30102)</p>
                  <p className="text-[11px] text-rose-700">
                    El algoritmo clasifica la calidad como <code className="bg-rose-100 px-1 rounded font-mono">no_contact</code>. Los valores de pulso y SpO₂ se reportan como <code className="bg-rose-100 px-1 rounded font-mono">null</code> según los requerimientos médicos de PulsoLink.
                  </p>
                </div>
              </div>
            )}

            {/* 3 Tarjetas de Signos Vitales Principales (KPI Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Pulso Cardíaco */}
              <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50/70 to-white p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Heart className="w-4 h-4 text-rose-600 animate-pulse" />
                    Pulso Cardíaco
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                    MAX30102
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                    {latestReading?.heartRate !== null && latestReading?.heartRate !== undefined ? (
                      latestReading.heartRate
                    ) : (
                      <span className="text-slate-400 text-2xl">--</span>
                    )}
                  </span>
                  <span className="text-xs font-bold text-rose-700">BPM</span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-rose-100/70 pt-2">
                  <span>Rango: 60 - 100</span>
                  <span className="font-semibold text-slate-700">
                    Prom: {avgHr ? `${avgHr} bpm` : '--'}
                  </span>
                </div>
              </div>

              {/* Card 2: Saturación SpO2 */}
              <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/70 to-white p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-sky-600" />
                    Saturación SpO₂
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                    Óptico (IR/Rojo)
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                    {latestReading?.spo2 !== null && latestReading?.spo2 !== undefined ? (
                      `${latestReading.spo2}`
                    ) : (
                      <span className="text-slate-400 text-2xl">--</span>
                    )}
                  </span>
                  <span className="text-xs font-bold text-sky-700">%</span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-sky-100/70 pt-2">
                  <span>Normal: ≥ 95%</span>
                  <span className="font-semibold text-slate-700">
                    Prom: {avgSpo2 ? `${avgSpo2}%` : '--'}
                  </span>
                </div>
              </div>

              {/* Card 3: Temperatura Superficial */}
              <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Thermometer className="w-4 h-4 text-amber-600" />
                    Temp. Cutánea
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    DS18B20 (Dedo)
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                    {latestReading ? latestReading.skinTemperature.toFixed(1) : '--'}
                  </span>
                  <span className="text-xs font-bold text-amber-700">°C</span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-amber-100/70 pt-2">
                  <span>Piel: 31° - 35°C</span>
                  <span className="font-semibold text-slate-700">
                    Prom: {avgTemp ? `${avgTemp}°C` : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Aviso médico normativo */}
            <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-200/80 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Nota de rigor biomédico:</strong> La temperatura mostrada corresponde a lectura superficial de piel en dedo, no a temperatura central interna. SpO₂ es una estimación académica sujeta al acoplamiento óptico y algoritmos de calibración del MAX30102.
              </span>
            </div>
          </div>

          {/* ===================== GRÁFICAS TEMPORALES CON RECHARTS ===================== */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-sky-600" />
                  Evolución y Variaciones en el Tiempo
                </h3>
                <p className="text-xs text-slate-500">
                  Visualización de curvas continuas de telemetría médica en tiempo real.
                </p>
              </div>

              {/* Pestañas de filtrado de gráficas */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-600">
                <button
                  onClick={() => setActiveTab('both')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeTab === 'both' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
                  }`}
                >
                  Ambas Gráficas
                </button>
                <button
                  onClick={() => setActiveTab('oximetry')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeTab === 'oximetry' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
                  }`}
                >
                  Oximetría & Pulso
                </button>
                <button
                  onClick={() => setActiveTab('temperature')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeTab === 'temperature' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
                  }`}
                >
                  Temperatura
                </button>
              </div>
            </div>

            {/* GRÁFICA 1: OXÍMETRO Y FRECUENCIA CARDÍACA */}
            {(activeTab === 'both' || activeTab === 'oximetry') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Frecuencia Cardíaca (BPM) vs.
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 ml-2" />
                    Saturación SpO₂ (%)
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Últimos ~60 segundos
                  </span>
                </div>

                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={currentHistory} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="spo2Gradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      {/* Eje Y izquierdo: BPM */}
                      <YAxis
                        yAxisId="left"
                        domain={[50, 120]}
                        tick={{ fontSize: 11, fill: '#f43f5e' }}
                        tickLine={false}
                        axisLine={false}
                        unit=" bpm"
                      />
                      {/* Eje Y derecho: SpO2 */}
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[90, 100]}
                        tick={{ fontSize: 11, fill: '#0284c7' }}
                        tickLine={false}
                        axisLine={false}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '8px',
                          border: 'none',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                        formatter={(val: any, name: any): [string, string] => {
                          if (val === null || val === undefined) return ['Sin señal (no_contact)', String(name)];
                          if (name === 'heartRate') return [`${val} bpm`, 'Frecuencia Cardíaca'];
                          if (name === 'spo2') return [`${val} %`, 'Saturación SpO₂'];
                          return [String(val), String(name)];
                        }}
                      />
                      <ReferenceLine yAxisId="right" y={95} stroke="#0284c7" strokeDasharray="3 3" opacity={0.4} />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="heartRate"
                        stroke="#f43f5e"
                        strokeWidth={2.5}
                        fill="url(#hrGradient)"
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                      <Area
                        yAxisId="right"
                        type="monotone"
                        dataKey="spo2"
                        stroke="#0284c7"
                        strokeWidth={2.5}
                        fill="url(#spo2Gradient)"
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* GRÁFICA 2: CONTROL Y VARIACIÓN DE TEMPERATURA A LO LARGO DEL TIEMPO */}
            {(activeTab === 'both' || activeTab === 'temperature') && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Variación de Temperatura Cutánea Superficial (°C)
                  </span>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                    <span>Mín: {minTemp}°C</span>
                    <span>Máx: {maxTemp}°C</span>
                  </div>
                </div>

                <div className="h-60 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={currentHistory} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        domain={[30, 37]}
                        tick={{ fontSize: 11, fill: '#d97706' }}
                        tickLine={false}
                        axisLine={false}
                        unit="°C"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '8px',
                          border: 'none',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                        formatter={(val: any): [string, string] => [`${val} °C`, 'Temperatura Superficial']}
                      />
                      <ReferenceLine y={33.5} stroke="#10b981" strokeDasharray="4 4" opacity={0.6} label={{ value: 'Normotermia cutánea (33.5°C)', fill: '#059669', fontSize: 10, position: 'insideTopLeft' }} />
                      <Area
                        type="monotone"
                        dataKey="skinTemperature"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        fill="url(#tempGradient)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* ===================== LOG TELEMÉTRICO DEL CONTRATO A ===================== */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-600" />
                Registro de Ingestión Telemétrica (Contrato A)
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                Idempotencia: {selectedClient.deviceId} + bootId + seq
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                    <th className="pb-2">Secuencia</th>
                    <th className="pb-2">Marca de Tiempo</th>
                    <th className="pb-2">Pulso (BPM)</th>
                    <th className="pb-2">SpO₂ (%)</th>
                    <th className="pb-2">Temperatura (°C)</th>
                    <th className="pb-2">Calidad</th>
                    <th className="pb-2 text-right">HTTP Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentHistory.slice(-5).reverse().map((item) => (
                    <tr key={item.sequence} className="text-slate-700 hover:bg-slate-50/70">
                      <td className="py-2 font-bold text-slate-900">#{item.sequence}</td>
                      <td className="py-2 text-slate-500">{item.time}</td>
                      <td className="py-2 text-rose-600 font-semibold">
                        {item.heartRate ? `${item.heartRate} bpm` : <span className="text-slate-400">null</span>}
                      </td>
                      <td className="py-2 text-sky-600 font-semibold">
                        {item.spo2 ? `${item.spo2}%` : <span className="text-slate-400">null</span>}
                      </td>
                      <td className="py-2 text-amber-600 font-semibold">{item.skinTemperature.toFixed(2)} °C</td>
                      <td className="py-2">
                        {item.quality === 'valid' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3 text-rose-500" /> no_contact
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px]">
                          201 Created
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
