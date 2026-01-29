
import React, { useState, useEffect, useMemo } from 'react';
import Layout from './components/Layout';
import { Product, StorageLocation, Unit, InventoryAudit } from './types';
import { 
  Package, Plus, Search, Trash2, Edit, AlertCircle, CheckCircle2, 
  BrainCircuit, ArrowRight, ChevronRight, Truck, MapPin, 
  X, ArrowUpRight, ArrowDownLeft, Settings2, 
  History, Scale, Save, Sparkles, Loader2 
} from 'lucide-react';
import { getInventoryInsights, getStorageSuggestions } from './services/geminiService';
import { supabase } from './services/supabase';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [aiInsights, setAiInsights] = useState<{title: string, description: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // UI States
  const [showProductModal, setShowProductModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingLocation, setEditingLocation] = useState<StorageLocation | null>(null);
  
  // Form States
  const [productForm, setProductForm] = useState<Partial<Product>>({ unit: Unit.UN });
  const [locationForm, setLocationForm] = useState<Partial<StorageLocation>>({ type: 'STORAGE', quantity: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  // AI Suggestions States
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [placementSuggestions, setPlacementSuggestions] = useState<{locationCode: string, reason: string, score: number}[]>([]);

  // Audit Form State
  const [auditLocationId, setAuditLocationId] = useState('');
  const [actualQty, setActualQty] = useState<number | ''>('');

  // Initial Data Fetch
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, lRes, aRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('storage_locations').select('*').order('code'),
        supabase.from('inventory_audits').select('*').order('date', { ascending: false }).limit(50)
      ]);

      if (pRes.data) setProducts(pRes.data.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit as Unit,
        minStock: p.min_stock,
        price: p.price
      })));
      
      if (lRes.data) setLocations(lRes.data.map(l => ({
        id: l.id,
        code: l.code,
        type: l.type as 'PICKING' | 'STORAGE',
        productId: l.product_id,
        quantity: l.quantity
      })));

      if (aRes.data) setAudits(aRes.data.map(a => ({
        id: a.id,
        date: a.date,
        locationId: a.location_id,
        productId: a.product_id,
        expectedQty: a.expected_qty,
        actualQty: a.actual_qty,
        status: a.status as 'ADJUSTED' | 'MATCHED'
      })));
    } catch (error) {
      console.error("Erro ao sincronizar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Product Handlers ---
  const handleOpenProductModal = (product?: Product) => {
    setPlacementSuggestions([]);
    if (product) {
      setEditingProduct(product);
      setProductForm({ ...product });
    } else {
      setEditingProduct(null);
      setProductForm({ 
        sku: '', 
        name: '', 
        category: 'Geral', 
        unit: Unit.UN, 
        minStock: 0, 
        price: 0 
      });
    }
    setShowProductModal(true);
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.sku) return alert("Nome e SKU são obrigatórios");
    setIsSaving(true);

    const productData = {
      sku: productForm.sku!,
      name: productForm.name!,
      category: productForm.category || 'Geral',
      unit: productForm.unit || Unit.UN,
      min_stock: Number(productForm.minStock) || 0,
      price: Number(productForm.price) || 0,
    };

    try {
      if (editingProduct) {
        const { error } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert([productData]);
        if (error) throw error;
      }
      setShowProductModal(false);
      await fetchData();
    } catch (error: any) {
      alert(`Erro ao salvar produto: ${error.message || 'Verifique se o SKU é único'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este produto? Isso removerá o vínculo com as posições de estoque.")) {
      setLoading(true);
      try {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (error: any) {
        alert(`Erro ao deletar: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  // --- Location Handlers ---
  const handleOpenLocationModal = (loc?: StorageLocation) => {
    if (loc) {
      setEditingLocation(loc);
      setLocationForm({ ...loc });
    } else {
      setEditingLocation(null);
      setLocationForm({ code: '', type: 'STORAGE', quantity: 0, productId: null });
    }
    setShowLocationModal(true);
  };

  const handleSaveLocation = async () => {
    if (!locationForm.code) return alert("Código da posição é obrigatório");
    setIsSaving(true);

    const locationData = {
      code: locationForm.code!,
      type: locationForm.type || 'STORAGE',
      product_id: locationForm.productId || null,
      quantity: Number(locationForm.quantity) || 0,
    };

    try {
      if (editingLocation) {
        const { error } = await supabase.from('storage_locations').update(locationData).eq('id', editingLocation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('storage_locations').insert([locationData]);
        if (error) throw error;
      }
      setShowLocationModal(false);
      await fetchData();
    } catch (error: any) {
      alert(`Erro ao salvar localização: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (confirm("Deseja remover este endereço do armazém?")) {
      setLoading(true);
      try {
        const { error } = await supabase.from('storage_locations').delete().eq('id', id);
        if (error) throw error;
        await fetchData();
      } catch (error: any) {
        alert(`Erro ao deletar local: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const adjustStock = async (locId: string, amount: number) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return;
    const newQty = Math.max(0, loc.quantity + amount);
    await supabase.from('storage_locations').update({ quantity: newQty }).eq('id', locId);
    setLocations(locations.map(l => l.id === locId ? { ...l, quantity: newQty } : l));
  };

  // --- Audit Logic ---
  const executeAudit = async () => {
    if (!auditLocationId || actualQty === '') return alert("Selecione um local e informe a contagem.");
    setIsSaving(true);
    
    const loc = locations.find(l => l.id === auditLocationId);
    if (!loc) return;

    const auditData = {
      date: new Date().toISOString(),
      location_id: loc.id,
      product_id: loc.productId || null,
      expected_qty: loc.quantity,
      actual_qty: Number(actualQty),
      status: loc.quantity === Number(actualQty) ? 'MATCHED' : 'ADJUSTED'
    };

    try {
      const { error: aError } = await supabase.from('inventory_audits').insert([auditData]);
      if (aError) throw aError;

      if (auditData.status === 'ADJUSTED') {
        await supabase.from('storage_locations').update({ quantity: Number(actualQty) }).eq('id', loc.id);
      }

      setAuditLocationId('');
      setActualQty('');
      await fetchData();
      alert(auditData.status === 'MATCHED' ? "Contagem OK! Sem divergências." : "Estoque ajustado com sucesso!");
    } catch (error: any) {
      alert(`Erro na auditoria: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFetchSuggestions = async () => {
    if (!productForm.name || !productForm.category) return alert("Preencha o nome e categoria primeiro.");
    setLoadingSuggestions(true);
    const suggestions = await getStorageSuggestions(productForm, locations, products);
    setPlacementSuggestions(suggestions);
    setLoadingSuggestions(false);
  };

  const handleGetInsights = async () => {
    setLoadingInsights(true);
    const insights = await getInventoryInsights(products, locations);
    setAiInsights(insights);
    setLoadingInsights(false);
  };

  // --- Computed ---
  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const totalStockCount = useMemo(() => locations.reduce((acc, curr) => acc + curr.quantity, 0), [locations]);
  const lowStockCount = products.filter(p => {
    const qty = locations.filter(l => l.productId === p.id).reduce((acc, curr) => acc + curr.quantity, 0);
    return qty < p.minStock;
  }).length;

  if (loading && products.length === 0) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-4">
      <Loader2 size={48} className="text-blue-600 animate-spin" />
      <p className="text-slate-500 font-medium animate-pulse">Sincronizando com Supabase...</p>
    </div>
  );

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && (
        <div className="space-y-6 lg:space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Total de SKUs</h3>
              <p className="text-2xl font-bold text-slate-800">{products.length}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Itens em Estoque</h3>
              <p className="text-2xl font-bold text-slate-800">{totalStockCount}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Abaixo do Mínimo</h3>
              <p className="text-2xl font-bold text-red-600">{lowStockCount}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Locais Ocupados</h3>
              <p className="text-2xl font-bold text-slate-800">
                {locations.filter(l => l.productId !== null).length} / {locations.length}
              </p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 lg:p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 hidden md:block">
              <BrainCircuit size={120} />
            </div>
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 p-2 rounded-lg"><BrainCircuit size={24} /></div>
                  <div>
                    <h3 className="text-xl font-bold">SmartStock AI Insights</h3>
                    <p className="text-slate-400 text-sm">Otimização logística via Gemini</p>
                  </div>
                </div>
                <button 
                  onClick={handleGetInsights} 
                  disabled={loadingInsights} 
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors text-sm flex items-center gap-2"
                >
                  {loadingInsights && <Loader2 size={16} className="animate-spin" />}
                  {loadingInsights ? 'Analisando...' : 'Gerar Insights'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aiInsights.map((insight, idx) => (
                  <div key={idx} className="bg-slate-800/50 border border-slate-700 p-5 rounded-xl hover:bg-slate-800 transition-colors group">
                    <h4 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
                      <ChevronRight size={16} className="text-blue-500" />
                      {insight.title}
                    </h4>
                    <p className="text-sm text-slate-300 leading-relaxed">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por SKU ou Nome..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            <button onClick={() => handleOpenProductModal()} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors text-sm font-medium">
              <Plus size={20} /> Novo Produto
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                    <th className="px-6 py-4">SKU</th>
                    <th className="px-6 py-4">Produto</th>
                    <th className="px-6 py-4">Categoria</th>
                    <th className="px-6 py-4">Preço</th>
                    <th className="px-6 py-4 text-center">Estoque Total</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map(p => {
                    const currentQty = locations.filter(l => l.productId === p.id).reduce((acc, curr) => acc + curr.quantity, 0);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">{p.sku}</td>
                        <td className="px-6 py-4 font-semibold text-slate-800">{p.name}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">
                          <span className="px-2 py-1 bg-slate-100 rounded-md text-[10px] uppercase font-bold text-slate-500">{p.category}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">R$ {p.price?.toFixed(2)}</td>
                        <td className="px-6 py-4 text-center">
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${
                            currentQty < p.minStock ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
                          }`}>
                            {currentQty} {p.unit}
                            {currentQty < p.minStock && <AlertCircle size={14} />}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleOpenProductModal(p)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={18} /></button>
                          <button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'warehouse' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-800">Mapa de Endereçamento</h3>
            <button onClick={() => handleOpenLocationModal()} className="px-4 py-2 bg-slate-800 text-white rounded-lg flex items-center gap-2 hover:bg-black transition-colors text-sm">
              <Plus size={18} /> Novo Endereço
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {locations.map(loc => {
              const product = products.find(p => p.id === loc.productId);
              return (
                <div key={loc.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group hover:border-blue-300 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                      loc.type === 'PICKING' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>{loc.type}</span>
                    <button onClick={() => handleOpenLocationModal(loc)} className="text-slate-300 hover:text-blue-500"><Settings2 size={14} /></button>
                  </div>
                  <h4 className="font-bold text-slate-900 text-lg">{loc.code}</h4>
                  {product ? (
                    <div className="mt-2 space-y-3">
                      <p className="text-sm font-medium text-slate-500 line-clamp-1">{product.name}</p>
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-black text-slate-800">{loc.quantity} <span className="text-[10px] text-slate-400 font-normal">{product.unit}</span></div>
                        <div className="flex gap-1">
                          <button onClick={() => adjustStock(loc.id, -1)} className="p-2 border border-slate-100 rounded-lg bg-slate-50 hover:bg-red-50 hover:text-red-600 transition-colors"><ArrowDownLeft size={16} /></button>
                          <button onClick={() => adjustStock(loc.id, 1)} className="p-2 border border-slate-100 rounded-lg bg-slate-50 hover:bg-green-50 hover:text-green-600 transition-colors"><ArrowUpRight size={16} /></button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 py-6 rounded-lg text-slate-300">
                      <MapPin size={24} className="mb-1 opacity-20" />
                      <span className="text-[10px] font-bold uppercase italic">Local Vazio</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl p-6 border border-slate-200 shadow-sm h-fit space-y-6">
            <h3 className="font-bold flex items-center gap-2 text-slate-800"><Scale className="text-blue-600" size={20} /> Nova Auditoria</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Selecionar Local</label>
                <select 
                  value={auditLocationId} 
                  onChange={(e) => setAuditLocationId(e.target.value)} 
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione o endereço...</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.code} {l.productId ? `(${products.find(p => p.id === l.productId)?.sku})` : '(Vazio)'}
                    </option>
                  ))}
                </select>
              </div>
              
              {auditLocationId && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Estoque Sistêmico</p>
                  <p className="text-xl font-black text-slate-700">
                    {locations.find(l => l.id === auditLocationId)?.quantity} UN
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Quantidade Real Contada</label>
                <input 
                  type="number" 
                  value={actualQty} 
                  onChange={(e) => setActualQty(e.target.value === '' ? '' : Number(e.target.value))} 
                  placeholder="0" 
                  className="w-full p-3 border border-slate-200 rounded-lg text-2xl font-black outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>

              <button 
                onClick={executeAudit} 
                disabled={isSaving || !auditLocationId || actualQty === ''} 
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all"
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                Finalizar Auditoria
              </button>
            </div>
          </div>
          
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700 flex items-center gap-2">
              <History size={18} /> Histórico de Contagens
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-[10px] uppercase text-slate-400 font-bold border-b">
                  <tr>
                    <th className="p-4">Data</th>
                    <th className="p-4">Local</th>
                    <th className="p-4">Produto</th>
                    <th className="p-4 text-center">Esperado</th>
                    <th className="p-4 text-center">Real</th>
                    <th className="p-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {audits.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-slate-400 font-mono text-xs">
                        {new Date(a.date).toLocaleDateString()} {new Date(a.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 font-bold text-slate-700">{locations.find(l => l.id === a.locationId)?.code || 'N/A'}</td>
                      <td className="p-4 text-slate-600">{products.find(p => p.id === a.productId)?.name || 'Vazio'}</td>
                      <td className="p-4 text-center font-medium text-slate-500">{a.expectedQty}</td>
                      <td className="p-4 text-center font-bold text-slate-800">{a.actualQty}</td>
                      <td className="p-4 text-right">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                          a.status === 'MATCHED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>{a.status === 'MATCHED' ? 'Conforme' : 'Ajustado'}</span>
                      </td>
                    </tr>
                  ))}
                  {audits.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-300 italic">Nenhum registro de auditoria encontrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS --- */}

      {/* Modal Produto */}
      {showProductModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg">{editingProduct ? 'Editar' : 'Novo'} Produto</h3>
              <button onClick={() => setShowProductModal(false)} className="p-1 text-slate-400 hover:text-red-500 transition-colors"><X /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">SKU</label>
                  <input 
                    value={productForm.sku || ''} 
                    onChange={e => setProductForm({...productForm, sku: e.target.value.toUpperCase()})} 
                    placeholder="EX: PRD-001" 
                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Categoria</label>
                  <input 
                    value={productForm.category || ''} 
                    onChange={e => setProductForm({...productForm, category: e.target.value})} 
                    placeholder="Geral" 
                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">Nome do Produto</label>
                <input 
                  value={productForm.name || ''} 
                  onChange={e => setProductForm({...productForm, name: e.target.value})} 
                  placeholder="Nome completo do item" 
                  className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>

              <div className="p-4 bg-blue-50 rounded-xl space-y-3 border border-blue-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-blue-600 uppercase flex items-center gap-1">
                    <Sparkles size={12} /> Sugestão de Endereço IA
                  </span>
                  <button 
                    onClick={handleFetchSuggestions} 
                    disabled={loadingSuggestions}
                    className="text-[10px] font-bold text-blue-700 hover:underline uppercase"
                  >
                    {loadingSuggestions ? 'Gerando...' : 'Obter'}
                  </button>
                </div>
                {placementSuggestions.length > 0 && (
                  <div className="space-y-2">
                    {placementSuggestions.map((s, idx) => (
                      <div key={idx} className="bg-white p-2 rounded-lg text-[10px] border border-blue-200 shadow-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-black text-blue-700">{s.locationCode}</span>
                          <span className="text-slate-400 font-bold">{s.score}% Match</span>
                        </div>
                        <p className="text-slate-600 italic leading-tight">{s.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Unidade</label>
                  <select 
                    value={productForm.unit} 
                    onChange={e => setProductForm({...productForm, unit: e.target.value as Unit})} 
                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value={Unit.UN}>UN</option>
                    <option value={Unit.KG}>KG</option>
                    <option value={Unit.CX}>CX</option>
                    <option value={Unit.LT}>LT</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Est. Mínimo</label>
                  <input 
                    type="number" 
                    value={productForm.minStock || 0} 
                    onChange={e => setProductForm({...productForm, minStock: Number(e.target.value)})} 
                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Preço R$</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={productForm.price || 0} 
                    onChange={e => setProductForm({...productForm, price: Number(e.target.value)})} 
                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
              </div>

              <button 
                onClick={handleSaveProduct} 
                disabled={isSaving}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 mt-4"
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                {editingProduct ? 'Salvar Alterações' : 'Cadastrar Produto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Localização */}
      {showLocationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800 text-lg">{editingLocation ? 'Gerenciar' : 'Nova'} Posição</h3>
              <button onClick={() => setShowLocationModal(false)}><X className="text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Código</label>
                  <input 
                    value={locationForm.code || ''} 
                    onChange={e => setLocationForm({...locationForm, code: e.target.value.toUpperCase()})} 
                    placeholder="EX: A-01-01" 
                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Tipo</label>
                  <select 
                    value={locationForm.type} 
                    onChange={e => setLocationForm({...locationForm, type: e.target.value as any})} 
                    className="w-full p-2 border rounded-lg outline-none bg-white"
                  >
                    <option value="STORAGE">Armazenagem (Pulmão)</option>
                    <option value="PICKING">Picking (Separação)</option>
                  </select>
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">Produto Alocado</label>
                <select 
                  value={locationForm.productId || ''} 
                  onChange={e => setLocationForm({...locationForm, productId: e.target.value || null})} 
                  className="w-full p-2 border rounded-lg outline-none bg-white"
                >
                  <option value="">-- Nenhum (Vazio) --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">Quantidade Atual</label>
                <input 
                  type="number" 
                  value={locationForm.quantity || 0} 
                  onChange={e => setLocationForm({...locationForm, quantity: Number(e.target.value)})} 
                  className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>

              <div className="flex gap-3 pt-6">
                {editingLocation && (
                  <button 
                    onClick={() => handleDeleteLocation(editingLocation.id)} 
                    className="flex-1 py-3 border border-red-100 text-red-600 rounded-xl hover:bg-red-50 font-bold transition-colors"
                  >
                    Remover Endereço
                  </button>
                )}
                <button 
                  onClick={handleSaveLocation} 
                  disabled={isSaving}
                  className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                  Confirmar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
