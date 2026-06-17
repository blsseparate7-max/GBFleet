import React, { useState, useEffect, useRef } from 'react';
import { 
  Calculator, 
  MapPin, 
  Fuel, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  AlertTriangle, 
  HelpCircle, 
  Printer, 
  Copy, 
  Check, 
  Truck as TruckIcon,
  RefreshCw,
  Clock,
  ArrowRight,
  Plus,
  Trash2,
  Edit,
  X,
  Compass,
  Info,
  Layers,
  Settings,
  Navigation,
  Map as MapIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import Modal from './ui/Modal';
import L from 'leaflet';

// Static fallback routes representing heavy-duty trucking routes in Brazil if DB happens to be completely empty
const FALLBACK_ROUTES = [
  {
    id: "route_1",
    nome: "São Paulo, SP ➔ Rio de Janeiro, RJ",
    origem: "São Paulo, SP",
    destino: "Rio de Janeiro, RJ",
    distanciaKm: 435,
    valorPedagio: 380,
    diariaMotorista: 450,
    valorFrete: 4500,
    outrosCustos: 150,
    descricao: "Rota Dutra - Alta densidade de pedágios e tráfego pesado."
  },
  {
    id: "route_2",
    nome: "Curitiba, PR ➔ Belo Horizonte, MG",
    origem: "Curitiba, PR",
    destino: "Belo Horizonte, MG",
    distanciaKm: 1005,
    valorPedagio: 650,
    diariaMotorista: 900,
    valorFrete: 8800,
    outrosCustos: 200,
    descricao: "Interior - Trechos de serra e rodovias concessionadas."
  },
  {
    id: "route_3",
    nome: "Porto Alegre, RS ➔ São Paulo, SP",
    origem: "Porto Alegre, RS",
    destino: "São Paulo, SP",
    distanciaKm: 1150,
    valorPedagio: 820,
    diariaMotorista: 1100,
    valorFrete: 10500,
    outrosCustos: 250,
    descricao: "Corredor Sul - Longa distância, escoamento de insumos e manufaturados."
  }
];

interface SimulatorProps {
  data: any;
  onUpdate?: () => void;
}

export default function Simulator({ data, onUpdate }: SimulatorProps) {
  // Pull real routing-model presets dynamically from backend DB
  const routesList = data?.routes || FALLBACK_ROUTES;

  // Simulator inputs state
  const [origem, setOrigem] = useState('São Paulo, SP');
  const [destino, setDestino] = useState('Rio de Janeiro, RJ');
  const [distance, setDistance] = useState(435);
  const [consumption, setConsumption] = useState(3.0); // heavy duty trucks avg km/l (usually 2.5 to 3.8)
  const [dieselPrice, setDieselPrice] = useState(5.89); // real standard diesel price R$/liter
  const [tolls, setTolls] = useState(380);
  const [driverRate, setDriverRate] = useState(450);
  const [otherCosts, setOtherCosts] = useState(150);
  const [freightValue, setFreightValue] = useState(4500);
  const [selectedTruckPlaca, setSelectedTruckPlaca] = useState('');

  // Address Autocomplete UI & Coordinates States (Main panel)
  const [startCoords, setStartCoords] = useState<{ lat: number, lon: number } | null>(null);
  const [endCoords, setEndCoords] = useState<{ lat: number, lon: number } | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<any | null>(null);
  const [travelDuration, setTravelDuration] = useState<string | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

  const [origemSuggestions, setOrigemSuggestions] = useState<any[]>([]);
  const [destinoSuggestions, setDestinoSuggestions] = useState<any[]>([]);
  const [showOrigemSuggestions, setShowOrigemSuggestions] = useState(false);
  const [showDestinoSuggestions, setShowDestinoSuggestions] = useState(false);
  const [isLoadingOrigemSeg, setIsLoadingOrigemSeg] = useState(false);
  const [isLoadingDestinoSeg, setIsLoadingDestinoSeg] = useState(false);

  // Address Autocomplete & Coordinates States (Modal edit/add panel)
  const [modalStartCoords, setModalStartCoords] = useState<{ lat: number, lon: number } | null>(null);
  const [modalEndCoords, setModalEndCoords] = useState<{ lat: number, lon: number } | null>(null);
  const [modalOrigemSuggestions, setModalOrigemSuggestions] = useState<any[]>([]);
  const [modalDestinoSuggestions, setModalDestinoSuggestions] = useState<any[]>([]);
  const [showModalOrigemSeg, setShowModalOrigemSeg] = useState(false);
  const [showModalDestinoSeg, setShowModalDestinoSeg] = useState(false);
  const [isLoadingModalOrigemSeg, setIsLoadingModalOrigemSeg] = useState(false);
  const [isLoadingModalDestinoSeg, setIsLoadingModalDestinoSeg] = useState(false);

  // Modals state for dynamic routes CRUD
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isManageRoutesOpen, setIsManageRoutesOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any | null>(null);

  // Form parameters for custom route template
  const [formNome, setFormNome] = useState('');
  const [formOrigem, setFormOrigem] = useState('');
  const [formDestino, setFormDestino] = useState('');
  const [formDistanciaKm, setFormDistanciaKm] = useState(300);
  const [formValorPedagio, setFormValorPedagio] = useState(150);
  const [formDiariaMotorista, setFormDiariaMotorista] = useState(400);
  const [formValorFrete, setFormValorFrete] = useState(3500);
  const [formOutrosCustos, setFormOutrosCustos] = useState(100);
  const [formDescricao, setFormDescricao] = useState('');

  // UI state feedback
  const [copied, setCopied] = useState(false);
  const [savedSuccessAlert, setSavedSuccessAlert] = useState(false);

  // Leaflet Map instance & layers references
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Initialize Map Once
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView([-23.5505, -46.6333], 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      // Intentionally keep the map instance mounted between soft state renders to prevent recreate flickering,
      // but remove it completely if unmounted. we clean inside the return
    };
  }, []);

  // Sync route on the Leaflet map with coordinates or routing geometries
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous elements
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    const bounds: L.LatLngBoundsExpression = [];

    // Start Pin (Origin)
    if (startCoords) {
      const startMarker = L.marker([startCoords.lat, startCoords.lon], {
        icon: L.divIcon({
          html: `<div class="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-md text-white font-black text-xs animate-pulse">A</div>`,
          className: 'custom-pin-start',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      }).addTo(map);
      startMarker.bindPopup(`<b>Origem:</b><br/>${origem}`);
      markersRef.current.push(startMarker);
      bounds.push([startCoords.lat, startCoords.lon]);
    }

    // End Pin (Destination)
    if (endCoords) {
      const endMarker = L.marker([endCoords.lat, endCoords.lon], {
        icon: L.divIcon({
          html: `<div class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-md text-white font-black text-xs">B</div>`,
          className: 'custom-pin-end',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      }).addTo(map);
      endMarker.bindPopup(`<b>Destino:</b><br/>${destino}`);
      markersRef.current.push(endMarker);
      bounds.push([endCoords.lat, endCoords.lon]);
    }

    // Draw route geometry if loaded via OSRM
    if (routeGeometry) {
      const geojsonLine = L.geoJSON(routeGeometry, {
        style: {
          color: '#2563eb', // blue-600
          weight: 6,
          opacity: 0.85
        }
      }).addTo(map);
      routeLayerRef.current = geojsonLine;
      map.fitBounds(geojsonLine.getBounds(), { padding: [40, 40] });
    } else if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
    }
  }, [startCoords, endCoords, routeGeometry, origem, destino]);

  // Handle address lookup from Nominatim API
  const querySuggestions = async (
    query: string, 
    setSuggestions: (data: any[]) => void, 
    setLoading: (loading: boolean) => void
  ) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1&countrycodes=br`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data || []);
      }
    } catch (err) {
      console.error("Error fetching suggestions:", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced effects for main inputs lookup
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (origem && origem.length >= 3 && !origemSuggestions.some(s => s.display_name === origem)) {
        querySuggestions(origem, setOrigemSuggestions, setIsLoadingOrigemSeg);
      } else if (!origem) {
        setOrigemSuggestions([]);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [origem]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (destino && destino.length >= 3 && !destinoSuggestions.some(s => s.display_name === destino)) {
        querySuggestions(destino, setDestinoSuggestions, setIsLoadingDestinoSeg);
      } else if (!destino) {
        setDestinoSuggestions([]);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [destino]);

  // Debounced effects for modal inputs lookup
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (formOrigem && formOrigem.length >= 3 && !modalOrigemSuggestions.some(s => s.display_name === formOrigem)) {
        querySuggestions(formOrigem, setModalOrigemSuggestions, setIsLoadingModalOrigemSeg);
      } else if (!formOrigem) {
        setModalOrigemSuggestions([]);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [formOrigem]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (formDestino && formDestino.length >= 3 && !modalDestinoSuggestions.some(s => s.display_name === formDestino)) {
        querySuggestions(formDestino, setModalDestinoSuggestions, setIsLoadingModalDestinoSeg);
      } else if (!formDestino) {
        setModalDestinoSuggestions([]);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [formDestino]);

  // Initial geocoding on-mount to draw default route
  const resolveAddressToCoords = async (addressQuery: string, type: 'start' | 'end') => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}&limit=1&countrycodes=br`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const item = data[0];
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          if (type === 'start') {
            setStartCoords({ lat, lon });
          } else {
            setEndCoords({ lat, lon });
          }
        }
      }
    } catch (err) {
      console.error("Error geocoding startup address:", err);
    }
  };

  useEffect(() => {
    if (origem) resolveAddressToCoords(origem, 'start');
    if (destino) resolveAddressToCoords(destino, 'end');
  }, []);

  // OSRM Routing Calculation
  useEffect(() => {
    const calculateRoute = async () => {
      if (!startCoords || !endCoords) {
        setRouteGeometry(null);
        setTravelDuration(null);
        return;
      }
      setIsCalculatingRoute(true);
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson`);
        if (res.ok) {
          const json = await res.json();
          if (json.routes && json.routes.length > 0) {
            const route = json.routes[0];
            const distKm = Math.round(route.distance / 1000);
            setDistance(distKm);
            setRouteGeometry(route.geometry);

            const durSec = route.duration;
            const hrs = Math.floor(durSec / 3600);
            const mins = Math.round((durSec % 3600) / 60);
            setTravelDuration(hrs > 0 ? `${hrs}h ${mins}min` : `${mins}min`);
          }
        }
      } catch (err) {
        console.error("OSRM call error:", err);
      } finally {
        setIsCalculatingRoute(false);
      }
    };

    calculateRoute();
  }, [startCoords, endCoords]);

  // OSRM Distance Autofill for modal
  useEffect(() => {
    const calculateModalDistance = async () => {
      if (!modalStartCoords || !modalEndCoords) return;
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${modalStartCoords.lon},${modalStartCoords.lat};${modalEndCoords.lon},${modalEndCoords.lat}?overview=false`);
        if (res.ok) {
          const json = await res.json();
          if (json.routes && json.routes.length > 0) {
            const distKm = Math.round(json.routes[0].distance / 1000);
            setFormDistanciaKm(distKm);
          }
        }
      } catch (err) {
        console.error("Modal router distance calculation error:", err);
      }
    };
    calculateModalDistance();
  }, [modalStartCoords, modalEndCoords]);

  // Sync inputs with selected truck average km/l if available
  useEffect(() => {
    if (selectedTruckPlaca && data) {
      const fuelLogs = (data.fuel_logs || []).filter((l: any) => l.truckId === selectedTruckPlaca);
      const sortedLogs = [...fuelLogs].sort((a: any, b: any) => a.km - b.km);
      let truckDist = 0;
      let truckLiters = 0;
      for (let i = 1; i < sortedLogs.length; i++) {
        const prev = sortedLogs[i - 1];
        const curr = sortedLogs[i];
        const dist = curr.km - prev.km;
        if (dist > 0 && curr.litros > 0) {
          truckDist += dist;
          truckLiters += curr.litros;
        }
      }
      if (truckLiters > 0) {
        setConsumption(parseFloat((truckDist / truckLiters).toFixed(2)));
      } else {
        setConsumption(3.2); // standard fallback
      }
    }
  }, [selectedTruckPlaca, data]);

  // Calculations
  const fuelLitersNeeded = distance / (consumption || 1);
  const fuelCostTotal = fuelLitersNeeded * dieselPrice;
  const totalCosts = fuelCostTotal + Number(tolls) + Number(driverRate) + Number(otherCosts);
  const netEarnings = freightValue - totalCosts;
  const profitMarginPercent = freightValue > 0 ? (netEarnings / freightValue) * 100 : 0;
  
  // Cost per KM indicators
  const costPerKm = distance > 0 ? totalCosts / distance : 0;
  const earningsPerKm = distance > 0 ? freightValue / distance : 0;
  const fuelPercentOfTotal = totalCosts > 0 ? (fuelCostTotal / totalCosts) * 100 : 0;

  // Apply route preset
  const applyPreset = (preset: any) => {
    setOrigem(preset.origem);
    setDestino(preset.destino);
    // Resolve coordinates so map updates
    resolveAddressToCoords(preset.origem, 'start');
    resolveAddressToCoords(preset.destino, 'end');

    setDistance(preset.distanciaKm || preset.distance || 0);
    setTolls(preset.valorPedagio || preset.tolls || 0);
    setDriverRate(preset.diariaMotorista || preset.driverRate || 0);
    setFreightValue(preset.valorFrete || preset.freightValue || 0);
    setOtherCosts(preset.outrosCustos || preset.otherCosts || 0);
    setSelectedTruckPlaca('');
  };

  // Save current dynamic simulation parameters as a persistent routing preset in DB
  const handleSaveCurrentAsPreset = () => {
    setFormNome(`${origem} ➔ ${destino}`);
    setFormOrigem(origem);
    setFormDestino(destino);
    setFormDistanciaKm(distance);
    setFormValorPedagio(tolls);
    setFormDiariaMotorista(driverRate);
    setFormValorFrete(freightValue);
    setFormOutrosCustos(otherCosts);
    setFormDescricao("Salvo a partir da simulação rápida");
    setEditingRoute(null);
    setIsModalOpen(true);

    if (startCoords) setModalStartCoords({ ...startCoords });
    if (endCoords) setModalEndCoords({ ...endCoords });
  };

  // Submit and save custom route in DB (Create / Edit)
  const handleSaveRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOrigem || !formDestino) {
      alert("Por favor, preencha origem e destino!");
      return;
    }

    const payload = {
      companyId: "comp_1",
      nome: formNome.trim() || `${formOrigem} ➔ ${formDestino}`,
      origem: formOrigem.trim(),
      destino: formDestino.trim(),
      distanciaKm: Number(formDistanciaKm),
      valorPedagio: Number(formValorPedagio),
      diariaMotorista: Number(formDiariaMotorista),
      valorFrete: Number(formValorFrete),
      outrosCustos: Number(formOutrosCustos),
      descricao: formDescricao.trim() || "Modelo de rota frequente customizada"
    };

    try {
      if (editingRoute) {
        await fetch(`/api/routes/${editingRoute.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch('/api/routes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      setIsModalOpen(false);
      setEditingRoute(null);
      setSavedSuccessAlert(true);
      setTimeout(() => setSavedSuccessAlert(false), 3000);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
      alert("Falha de comunicação ao persistir modelo de rota.");
    }
  };

  // Begin Editing a saved route
  const handleStartEditRoute = (route: any) => {
    setEditingRoute(route);
    setFormNome(route.nome);
    setFormOrigem(route.origem);
    setFormDestino(route.destino);
    setFormDistanciaKm(route.distanciaKm);
    setFormValorPedagio(route.valorPedagio);
    setFormDiariaMotorista(route.diariaMotorista);
    setFormValorFrete(route.valorFrete);
    setFormOutrosCustos(route.outrosCustos || 0);
    setFormDescricao(route.descricao || '');
    setIsModalOpen(true);

    // Fetch coords for modal route
    setModalStartCoords(null);
    setModalEndCoords(null);
    const fetchModalCoords = async () => {
      try {
        const startRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(route.origem)}&limit=1&countrycodes=br`, {
          headers: { 'Accept': 'application/json' }
        });
        const endRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(route.destino)}&limit=1&countrycodes=br`, {
          headers: { 'Accept': 'application/json' }
        });
        if (startRes.ok && endRes.ok) {
          const startD = await startRes.json();
          const endD = await endRes.json();
          if (startD.length > 0) setModalStartCoords({ lat: parseFloat(startD[0].lat), lon: parseFloat(startD[0].lon) });
          if (endD.length > 0) setModalEndCoords({ lat: parseFloat(endD[0].lat), lon: parseFloat(endD[0].lon) });
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchModalCoords();
  };

  // Delete dynamic route from DB
  const handleDeleteRoute = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja apagar o modelo de rota: "${name}"?`)) {
      try {
        await fetch(`/api/routes/${id}`, { method: 'DELETE' });
        if (onUpdate) onUpdate();
      } catch (err) {
        console.error(err);
        alert("Erro ao excluir modelo de rota.");
      }
    }
  };

  const handleCopySummary = () => {
    const text = `📊 SIMULAÇÃO DE FRETE: ${origem} ➔ ${destino}
🛣️ Distância: ${distance} KM
Consumido Estimado: ${consumption} km/l | Óleo Diesel: R$ ${dieselPrice.toFixed(2)}/L
💰 Receita Líquida (Valor Frete): R$ ${freightValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

💸 DEMONSTRATIVO DE CUSTOS ESTIMADOS:
⛽ Combustível (Diesel): R$ ${fuelCostTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${fuelLitersNeeded.toFixed(1)}L)
🛣️ Pedágios Previstos: R$ ${Number(tolls).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
🧑‍Fretista/Motorista Custo: R$ ${Number(driverRate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
📦 Despesas Adicionais: R$ ${Number(otherCosts).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
-------------------------------------------
📈 TOTAL DE CUSTOS PREVISTOS: R$ ${totalCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
🏁 RESULTADO OPERACIONAL: R$ ${netEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
🔔 Margem de Lucro Planejada: ${profitMarginPercent.toFixed(1)}%
📍 Ponto de Equilíbrio (Custo Seco): R$ ${totalCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

⚠️ NOTA OPERACIONAL IMPORTANTE DO SISTEMA: Os preços calculados representam previsões aproximadas baseadas nos parâmetros inseridos para guiar o fechamento, dependendo de confirmação de rodagem física real.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Simulador Avançado de Rotas & Custos de Frete</h2>
          <p className="text-sm text-slate-500 font-medium">Configure de forma interativa trajetos no mapa com cálculo automático de quilometragem e combustível em tempo real.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            id="btn-register-new-route"
            onClick={() => {
              setEditingRoute(null);
              setFormNome('');
              setFormOrigem('');
              setFormDestino('');
              setFormDistanciaKm(150);
              setFormValorPedagio(50);
              setFormDiariaMotorista(250);
              setFormValorFrete(2200);
              setFormOutrosCustos(50);
              setFormDescricao('');
              setModalStartCoords(null);
              setModalEndCoords(null);
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-100 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>Cadastrar Nova Rota Frequente</span>
          </button>

          <button
            id="btn-manage-db-routes"
            onClick={() => setIsManageRoutesOpen(true)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer"
          >
            <Settings size={16} className="text-slate-500" />
            <span>Gerenciar Banco de Rotas ({routesList.length})</span>
          </button>
        </div>
      </div>

      {/* Advisory Warning Plate */}
      <div className="bg-amber-50/75 border border-amber-200/80 p-5 rounded-3xl flex flex-col md:flex-row items-start gap-4">
        <div className="p-3 bg-amber-150/80 text-amber-900 rounded-2xl shrink-0 mt-1 md:mt-0">
          <AlertCircle size={22} className="text-amber-800" />
        </div>
        <div className="space-y-1 text-slate-700 text-xs leading-relaxed">
          <h4 className="font-extrabold text-amber-900 text-sm flex items-center gap-1">
            ⚠️ Esclarecimento Técnico e Planejamento Operacional (SaaS Multi-Empresa)
          </h4>
          <p className="font-semibold text-slate-600">
            GBFleet é uma plataforma desenhada para se adaptar a <strong className="text-slate-800">qualquer tipo de empresa de frete, cargas e logística</strong>. Por não ficarmos presos a tabelas engessadas de rotas de terceiros, os cálculos representam uma <strong className="text-amber-800">possibilidade estimada de custos logísticos</strong> sob simulação teórica baseada em dados reais de roteamento OSRM e OpenStreetMap.
          </p>
          <p className="text-slate-500 font-medium">
            Sempre valide preços médios do diesel praticados em cada estado, praças de pedágios reais de concessionárias e eventuais diárias de ajudantes acordados antes do despacho físico.
          </p>
        </div>
      </div>

      {/* Dynamic routing presets selector */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200">
        <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-4 flex items-center justify-between border-b border-slate-50 pb-2">
          <span className="flex items-center gap-1.5 text-slate-700">
            <Compass size={16} className="text-blue-500" />
            Selecione uma Viagem Frequente da Empresa para Pré-carregar os Dados
          </span>
          <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-bold">
            {routesList.length} Rotas Cadastradas
          </span>
        </h3>
        
        {routesList.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400 italic text-xs">
            Nenhuma rota persistente foi cadastrada ainda. Use o botão no topo para salvar rotas do seu segmento comercial!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {routesList.map((p: any) => (
              <div
                key={p.id}
                className="text-left bg-slate-50/70 hover:bg-slate-100 border border-slate-250/60 rounded-2xl p-4 transition-all group flex flex-col justify-between relative"
              >
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <p className="font-extrabold text-xs text-slate-800 line-clamp-1 flex-1">{p.nome || `${p.origem} a ${p.destino}`}</p>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleStartEditRoute(p)}
                        className="text-slate-400 hover:text-blue-600 bg-white p-1 rounded-md border border-slate-100 shadow-xs" 
                        title="Editar modelo de rota"
                      >
                        <Edit size={10} />
                      </button>
                      <button 
                        onClick={() => handleDeleteRoute(p.id, p.nome)}
                        className="text-slate-400 hover:text-rose-600 bg-white p-1 rounded-md border border-slate-100 shadow-xs" 
                        title="Remover modelo de rota"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{p.descricao || "Sem observações administrativas no banco."}</p>
                </div>
                
                <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-150 w-full text-[10px] font-mono font-bold text-slate-500">
                  <span className="bg-slate-200/60 px-1.5 py-0.5 rounded font-black">{p.distanciaKm || p.distance || 0} km</span>
                  <button 
                    onClick={() => applyPreset(p)}
                    className="text-blue-600 hover:text-blue-800 font-extrabold font-sans text-xs flex items-center gap-1 bg-white hover:bg-blue-50 px-2 py-1 rounded-md border border-slate-100 transition-all"
                  >
                    <span>Carregar</span>
                    <ArrowRight size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main container grid layout: left inputs, right map + metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Paramas input controls (width: 1/3) */}
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Calculator className="text-blue-600" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">Roteador e Parâmetros de Carga</h3>
            </div>

            {/* Inputs de Origem e Destino com Auto-complete */}
            <div className="space-y-4">
              
              {/* INPUT: ORIGEM */}
              <div className="relative">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-2 flex items-center gap-1">
                  <MapPin size={12} className="text-emerald-500" /> Endereço de Origem (A)
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={origem}
                    onChange={e => {
                      setOrigem(e.target.value);
                      setShowOrigemSuggestions(true);
                    }}
                    onFocus={() => setShowOrigemSuggestions(true)}
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl pl-9 pr-8 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                    placeholder="Cidade, estado, endereço..."
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <MapPin size={14} className="text-emerald-500" />
                  </div>
                  {origem && (
                    <button 
                      type="button" 
                      onClick={() => { setOrigem(''); setStartCoords(null); }} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown ORIGEM */}
                {showOrigemSuggestions && (origemSuggestions.length > 0 || isLoadingOrigemSeg) && (
                  <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {isLoadingOrigemSeg && (
                      <div className="p-3 text-xs text-slate-400 flex items-center gap-2 font-medium">
                        <RefreshCw className="animate-spin text-blue-500" size={14} />
                        <span>Buscando endereços no mapa...</span>
                      </div>
                    )}
                    {origemSuggestions.map((item) => {
                      const cityName = item.address.city || item.address.town || item.address.village || item.address.municipality || "Localidade";
                      const stateName = item.address.state ? `, ${item.address.state}` : '';
                      return (
                        <button
                          key={item.place_id}
                          type="button"
                          onClick={() => {
                            setOrigem(item.display_name);
                            setStartCoords({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
                            setOrigemSuggestions([]);
                            setShowOrigemSuggestions(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-xs text-slate-700 transition-colors flex items-start gap-2"
                        >
                          <MapPin size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block truncate">
                              {cityName}{stateName}
                            </span>
                            <span className="text-[10px] text-slate-500 line-clamp-1">
                              {item.display_name}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* INPUT: DESTINO */}
              <div className="relative">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-2 flex items-center gap-1">
                  <MapPin size={12} className="text-blue-500" /> Endereço de Destino (B)
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={destino}
                    onChange={e => {
                      setDestino(e.target.value);
                      setShowDestinoSuggestions(true);
                    }}
                    onFocus={() => setShowDestinoSuggestions(true)}
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl pl-9 pr-8 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                    placeholder="Cidade, estado, endereço..."
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <MapPin size={14} className="text-blue-500" />
                  </div>
                  {destino && (
                    <button 
                      type="button" 
                      onClick={() => { setDestino(''); setEndCoords(null); }} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown DESTINO */}
                {showDestinoSuggestions && (destinoSuggestions.length > 0 || isLoadingDestinoSeg) && (
                  <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {isLoadingDestinoSeg && (
                      <div className="p-3 text-xs text-slate-400 flex items-center gap-2 font-medium">
                        <RefreshCw className="animate-spin text-blue-500" size={14} />
                        <span>Buscando rotas...</span>
                      </div>
                    )}
                    {destinoSuggestions.map((item) => {
                      const cityName = item.address.city || item.address.town || item.address.village || item.address.municipality || "Localidade";
                      const stateName = item.address.state ? `, ${item.address.state}` : '';
                      return (
                        <button
                          key={item.place_id}
                          type="button"
                          onClick={() => {
                            setDestino(item.display_name);
                            setEndCoords({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
                            setDestinoSuggestions([]);
                            setShowDestinoSuggestions(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-xs text-slate-700 transition-colors flex items-start gap-2"
                        >
                          <MapPin size={13} className="text-blue-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block truncate">
                              {cityName}{stateName}
                            </span>
                            <span className="text-[10px] text-slate-500 line-clamp-1">
                              {item.display_name}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Input Slider for distance */}
            <div className="border-t border-slate-100 pt-4">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500">Distância Calculada (KM)</label>
                <span className="text-xs font-mono font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{distance} km</span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="4000" 
                step="5"
                value={distance}
                onChange={e => setDistance(Number(e.target.value))}
                className="w-full text-blue-600 cursor-pointer accent-blue-600 mb-2 h-1.5 bg-slate-100 rounded-lg appearance-none"
              />
              <input 
                type="number"
                value={distance || ''}
                onChange={e => setDistance(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Introduzir Km manualmente se desejado..."
              />
            </div>

            {/* Fleet Sync Vehicle Selection */}
            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/60 flex flex-col gap-2 text-xs">
              <span className="text-slate-600 font-bold flex items-center gap-1">
                <TruckIcon size={14} className="text-blue-500" />
                Sincronizar consumo da frota?
              </span>
              <select
                value={selectedTruckPlaca}
                onChange={e => setSelectedTruckPlaca(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-250 rounded-xl font-bold text-slate-700 text-xs focus:outline-none"
              >
                <option value="">Consumo Autônomo Livre...</option>
                {(data?.trucks || []).map((t: any) => (
                  <option key={t.id} value={t.placa}>{t.placa} ({t.modelo})</option>
                ))}
              </select>
            </div>

            {/* Input for fuel consumption & diesel price */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">Média Média (KM/L)</label>
                <input 
                  type="number"
                  step="0.05"
                  value={consumption || ''}
                  onChange={e => setConsumption(Math.max(0.1, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">Diesel R$ / Litro</label>
                <input 
                  type="number"
                  step="0.01"
                  value={dieselPrice || ''}
                  onChange={e => setDieselPrice(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Miscellaneous Toll & Driver rates */}
            <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">Pedágios (R$)</label>
                <input 
                  type="number" 
                  value={tolls || ''}
                  onChange={e => setTolls(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  placeholder="R$ 0,00"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">Diária Equipe (R$)</label>
                <input 
                  type="number" 
                  value={driverRate || ''}
                  onChange={e => setDriverRate(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  placeholder="R$ 0,00"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">Outros Custos (R$)</label>
                <input 
                  type="number" 
                  value={otherCosts || ''}
                  onChange={e => setOtherCosts(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  placeholder="R$ 0,00"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-700 font-bold mb-1.5 text-blue-600">Frete Proposto R$</label>
                <input 
                  type="number" 
                  value={freightValue || ''}
                  onChange={e => setFreightValue(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs font-mono font-black text-blue-700 focus:outline-none"
                  placeholder="R$ 0,00"
                />
              </div>
            </div>

          </div>

          {/* Quick save simulation button */}
          <button
            id="btn-save-simulation-preset"
            onClick={handleSaveCurrentAsPreset}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 mt-4 cursor-pointer shadow-md shadow-emerald-50 select-none transition-all"
          >
            <Check size={16} />
            <span>Salvar Simulação no Banco</span>
          </button>
        </div>

        {/* RIGHT COLUMN: Interactive Live map & Results dashboard (width: 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* MAP PLATE CONTAINER (Uber-like active map viz) */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 relative overflow-hidden flex flex-col">
            <div className="mb-3 flex items-center justify-between text-slate-700">
              <span className="font-bold text-xs uppercase flex items-center gap-1.5">
                <MapIcon size={16} className="text-blue-500 animate-pulse" />
                Mapa Roteador Interativo (Direções via GPS / OSRM)
              </span>
              <div className="flex gap-2 text-[10px] font-semibold text-slate-500">
                {isCalculatingRoute ? (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <RefreshCw className="animate-spin" size={10} />
                    Calculando rota ideal...
                  </span>
                ) : travelDuration ? (
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold">
                    ⏱️ Tempo Estimado: {travelDuration}
                  </span>
                ) : (
                  <span className="text-slate-400">Insira origem e destino para ver no mapa</span>
                )}
              </div>
            </div>

            {/* Map Canvas Mount */}
            <div 
              id="simulator-map" 
              ref={mapContainerRef} 
              className="w-full h-[380px] bg-slate-100 rounded-2xl relative border border-slate-200 shadow-xs overflow-hidden z-10"
            />

            {/* Floating Navigation route detail card inside of Map */}
            {startCoords && endCoords && (
              <div className="mt-3 bg-slate-50 border border-slate-150 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0"></span>
                      <p className="truncate font-bold text-slate-800 text-[11px] max-w-[200px]" title={origem}>{origem}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2.5 h-2.5 bg-blue-600 rounded-full shrink-0"></span>
                      <p className="truncate font-bold text-slate-800 text-[11px] max-w-[200px]" title={destino}>{destino}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right border-l border-slate-200 pl-3">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Rotas OSRM</p>
                  <p className="font-extrabold text-blue-600 text-sm font-mono leading-tight">{distance} km de estrada</p>
                  <p className="text-[9px] text-slate-500 font-medium font-sans leading-none">{travelDuration ? `Aprox. ${travelDuration}` : 'Indeterminado'}</p>
                </div>
              </div>
            )}
          </div>

          {/* RESULTS DISPLAY ROW (Financial card + KPI KPIs card) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Dark Card: Dry operating Statement */}
            <div className="bg-slate-900 text-white p-6 rounded-[28px] flex flex-col justify-between min-h-[320px] relative overflow-hidden shadow-lg shadow-blue-900/10">
              <div className="space-y-4">
                <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 bg-slate-800 px-3 py-1 rounded-full inline-block">Balanço Operacional</span>
                
                <div className="space-y-1">
                  <p className="text-xs text-slate-400 font-semibold">Previsão Sob Lucro Líquido</p>
                  <h3 className={cn("text-3xl font-black font-sans leading-none", netEarnings >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    R$ {netEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </h3>
                </div>

                {/* Profit thermometer bar */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Margem Líquida</span>
                    <span className={cn(
                      "font-black font-mono",
                      profitMarginPercent >= 25 ? "text-emerald-400" :
                      profitMarginPercent >= 10 ? "text-amber-400" : "text-rose-400"
                    )}>
                      {profitMarginPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        profitMarginPercent >= 25 ? "bg-emerald-500" :
                        profitMarginPercent >= 10 ? "bg-amber-500" : "bg-rose-500"
                      )}
                      style={{ width: `${Math.max(0, Math.min(100, profitMarginPercent))}%` }}
                    />
                  </div>
                  
                  {/* Descriptive advice depending on profit */}
                  <div className="pt-2 text-[11px] leading-relaxed text-slate-300">
                    {profitMarginPercent >= 21 ? (
                      <p className="text-emerald-400 flex items-center gap-1 font-bold">
                        <TrendingUp size={14} /> Viagem Altamente Lucrativa! Margem espetacular.
                      </p>
                    ) : profitMarginPercent >= 10 ? (
                      <p className="text-amber-400 flex items-center gap-1 font-bold">
                        <AlertTriangle size={14} /> Rota viável sob custos bem monitorados.
                      </p>
                    ) : (
                      <p className="text-rose-400 flex items-center gap-1 font-bold">
                        <AlertCircle size={14} /> Margem Operacional de Alto Risco! Reajuste de frete ideal.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom summary details */}
              <div className="border-t border-slate-800 pt-4 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-400 font-medium">Custos Fiscais & Rodagem</p>
                  <p className="font-bold text-sm text-slate-100">R$ {totalCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-medium">Equilíbrio Mínimo</p>
                  <p className="font-bold text-sm text-blue-400 font-mono">R$ {totalCosts.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                </div>
              </div>
            </div>

            {/* White Card: Efficiency indicators list */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col justify-between min-h-[320px]">
              <div className="space-y-3.5">
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Métricas Detalhadas de Viagem</h4>
                
                <div className="space-y-2.5 text-xs font-sans">
                  <div className="flex justify-between items-center text-slate-600 border-b border-slate-50 pb-2">
                    <span className="font-medium">Diesel Estimado Necessário</span>
                    <span className="font-bold text-slate-800 font-mono">{fuelLitersNeeded.toFixed(1)} Litros</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600 border-b border-slate-50 pb-2">
                    <span className="font-medium">Gasto com Combustível</span>
                    <span className="font-bold text-amber-600 font-mono">
                      R$ {fuelCostTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600 border-b border-slate-50 pb-2">
                    <span className="font-medium">Proporção Diesel / Frete</span>
                    <span className="font-bold text-slate-800 font-mono">{fuelPercentOfTotal.toFixed(1)}% do custo</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600 border-b border-slate-50 pb-2">
                    <span className="font-medium">Custo por Quilômetro Rodado</span>
                    <span className="font-bold text-slate-800 font-mono">R$ {costPerKm.toFixed(2)}/km</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600 pb-1">
                    <span className="font-medium">Rentabilidade Bruta por KM</span>
                    <span className="font-bold text-blue-600 font-mono">R$ {earningsPerKm.toFixed(2)}/km</span>
                  </div>
                </div>
              </div>

              {/* Print and share capabilities */}
              <div className="flex gap-3 pt-3">
                <button
                  id="btn-copy-sim-summary"
                  onClick={handleCopySummary}
                  className="flex-1 px-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer select-none"
                >
                  {copied ? (
                    <>
                      <Check size={16} className="text-emerald-500" />
                      <span className="text-emerald-600">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      <span>Copiar Resumo</span>
                    </>
                  )}
                </button>
                <button
                  id="btn-print-sim-results"
                  onClick={() => window.print()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-100 cursor-pointer"
                >
                  <Printer size={16} />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Floating dynamic success alerts */}
      {savedSuccessAlert && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white border border-slate-800 p-4 rounded-2xl flex items-center gap-3 z-50 text-xs font-bold animate-fade-in shadow-2xl">
          <Check className="text-emerald-500 animate-bounce" size={18} />
          <span>Modelo de rota cadastrado no banco de dados e sincronizado!</span>
        </div>
      )}

      {/* Modal: Create and Edit route presets */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingRoute(null);
        }}
        title={editingRoute ? "Editar Rota Sincronizada" : "Cadastrar Rota Frequente"}
        size="large"
      >
        <form onSubmit={handleSaveRoute} className="p-6 space-y-6">
          <div className="bg-slate-50 p-4 border border-slate-150 rounded-2xl text-[11px] leading-relaxed text-slate-600">
            <h5 className="font-bold text-slate-800 mb-1 flex items-center gap-1">
              <Info size={14} className="text-blue-500" /> Vantagens das Rotas Presets
            </h5>
            Visto que o sistema suporta múltiplos arranjos industriais, registrar presets com mapas torna as futuras simulações instantâneas. Você digita ou seleciona endereços com autocomplemento georreferenciado e o sistema preenche as distâncias rodoviárias de forma automatizada.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Nome da Rota */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Nome Identificador do Modelo *</label>
              <input
                type="text"
                required
                value={formNome}
                onChange={e => setFormNome(e.target.value)}
                placeholder="Ex Fábrica Hortolândia SP para CD Contagem MG"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
            </div>

            {/* Origem Modal */}
            <div className="relative">
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Origem da Viagem *</label>
              <input
                type="text"
                required
                value={formOrigem}
                onChange={e => {
                  setFormOrigem(e.target.value);
                  setShowModalOrigemSeg(true);
                }}
                onFocus={() => setShowModalOrigemSeg(true)}
                placeholder="Ex Hortolândia, SP"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />

              {/* Dropdown Suggestions Modal ORIGEM */}
              {showModalOrigemSeg && (modalOrigemSuggestions.length > 0 || isLoadingModalOrigemSeg) && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {isLoadingModalOrigemSeg && (
                    <div className="p-3 text-xs text-slate-400 flex items-center gap-2">
                      <RefreshCw className="animate-spin text-blue-500" size={12} />
                      <span>Buscando...</span>
                    </div>
                  )}
                  {modalOrigemSuggestions.map((item) => {
                    const labelStr = item.address.city || item.address.town || item.address.village || item.address.municipality || "Localidade";
                    const stateStr = item.address.state ? `, ${item.address.state}` : '';
                    return (
                      <button
                        key={item.place_id}
                        type="button"
                        onClick={() => {
                          setFormOrigem(item.display_name);
                          setModalStartCoords({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
                          setModalOrigemSuggestions([]);
                          setShowModalOrigemSeg(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-[11px] text-slate-700 transition-colors block truncate"
                      >
                        <span className="font-extrabold">{labelStr}{stateStr}</span>
                        <span className="text-[9px] text-slate-400 block truncate">{item.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Destino Modal */}
            <div className="relative">
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Destino da Viagem *</label>
              <input
                type="text"
                required
                value={formDestino}
                onChange={e => {
                  setFormDestino(e.target.value);
                  setShowModalDestinoSeg(true);
                }}
                onFocus={() => setShowModalDestinoSeg(true)}
                placeholder="Ex Contagem, MG"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />

              {/* Dropdown Suggestions Modal DESTINO */}
              {showModalDestinoSeg && (modalDestinoSuggestions.length > 0 || isLoadingModalDestinoSeg) && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {isLoadingModalDestinoSeg && (
                    <div className="p-3 text-xs text-slate-400 flex items-center gap-2">
                      <RefreshCw className="animate-spin text-blue-500" size={12} />
                      <span>Buscando...</span>
                    </div>
                  )}
                  {modalDestinoSuggestions.map((item) => {
                    const labelStr = item.address.city || item.address.town || item.address.village || item.address.municipality || "Localidade";
                    const stateStr = item.address.state ? `, ${item.address.state}` : '';
                    return (
                      <button
                        key={item.place_id}
                        type="button"
                        onClick={() => {
                          setFormDestino(item.display_name);
                          setModalEndCoords({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
                          setModalDestinoSuggestions([]);
                          setShowModalDestinoSeg(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-[11px] text-slate-700 transition-colors block truncate"
                      >
                        <span className="font-extrabold">{labelStr}{stateStr}</span>
                        <span className="text-[9px] text-slate-400 block truncate">{item.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Distancia KM */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Distância (KM) *</label>
              <input
                type="number"
                min="1"
                required
                value={formDistanciaKm || ''}
                onChange={e => setFormDistanciaKm(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono font-bold"
              />
            </div>

            {/* Toll */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Pedágio Médio (R$)</label>
              <input
                type="number"
                min="0"
                value={formValorPedagio || ''}
                onChange={e => setFormValorPedagio(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono font-bold"
              />
            </div>

            {/* Driver diária */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Diária do Motorista (R$)</label>
              <input
                type="number"
                min="0"
                value={formDiariaMotorista || ''}
                onChange={e => setFormDiariaMotorista(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono font-bold"
              />
            </div>

            {/* Outros custos */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Outros Custos (R$)</label>
              <input
                type="number"
                min="0"
                value={formOutrosCustos || ''}
                onChange={e => setFormOutrosCustos(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono font-bold"
              />
            </div>
          </div>

          {/* Freight gross proposed */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Preço de Venda Sugerido (R$)</label>
            <input
              type="number"
              min="0"
              value={formValorFrete || ''}
              onChange={e => setFormValorFrete(Math.max(0, Number(e.target.value)))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-blue-600 focus:outline-none"
              placeholder="Preço padrão do frete de venda"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Instruções / Notas da Viagem</label>
            <input
              type="text"
              value={formDescricao}
              onChange={e => setFormDescricao(e.target.value)}
              placeholder="Ex Rota secundária livre de balanças, mercadoria com pedágios pré-pagos."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 font-semibold">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setEditingRoute(null);
              }}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs shadow-md shadow-blue-100 cursor-pointer"
            >
              {editingRoute ? "Salvar Alterações" : "Gravar Nova Rota"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Full CRUD Manage list */}
      <Modal
        isOpen={isManageRoutesOpen}
        onClose={() => setIsManageRoutesOpen(false)}
        title="Gerenciar Banco de Modelos de Rotas de Frete"
        size="large"
      >
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500 font-medium">As rotas cadastradas abaixo estão associadas canonicamente ao banco do SaaS do GBFleet e podem ser carregadas a qualquer momento para rápida precificação e simulações com clientes.</p>

          <div className="max-h-[380px] overflow-y-auto border border-slate-250/70 rounded-2xl divide-y divide-slate-100">
            {routesList.map((item: any) => (
              <div key={item.id} className="p-4 hover:bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <h5 className="font-extrabold text-slate-800 text-sm">{item.nome}</h5>
                  <p className="text-slate-400 font-medium text-[10px]">{item.descricao || "Sem notas especificadas."}</p>
                  <div className="flex gap-4 font-mono font-bold text-[9px] text-slate-500">
                    <span>Distância: {item.distanciaKm || item.distance || 0} KM</span>
                    <span>Pedágio: R$ {item.valorPedagio || item.tolls || 0}</span>
                    <span>Frete: R$ {item.valorFrete || item.freightValue || 0}</span>
                  </div>
                </div>

                <div className="flex gap-2 font-bold text-xs">
                  <button
                    onClick={() => {
                      handleStartEditRoute(item);
                      setIsManageRoutesOpen(false); // Switch modal safely
                    }}
                    className="p-1 px-3 border border-slate-250 hover:border-blue-400 hover:bg-blue-50 text-blue-700 rounded-lg text-[10px] transition-all cursor-pointer"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteRoute(item.id, item.nome)}
                    className="p-1 px-3 border border-slate-250 hover:border-rose-400 hover:bg-rose-50 text-rose-700 rounded-lg text-[10px] transition-all cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => setIsManageRoutesOpen(false)}
              className="px-5 py-2 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs cursor-pointer"
            >
              Fechar Visualização
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
