
import React, { useState, useEffect, useMemo } from 'react';
import Layout from './components/Layout';
import { Product, StorageLocation, Unit, InventoryAudit } from './types';
import { 
  Package, Plus, Search, Trash2, Edit, AlertCircle, CheckCircle2, 
  BrainCircuit, ArrowRight, ChevronRight, Truck, MapPin, 
  X, ArrowUpRight, ArrowDownLeft, Settings2, 
  History, Scale, Save, Sparkles, Loader2, HandHelping, ArrowDownCircle
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
        id: p.id, sku: p.sku, name: p.name, category: p.category,
        unit: p.unit as Unit, minStock: p.min_stock, price: p.price
      })));
      
      if (lRes.data) setLocations(lRes.data.map(l => ({
        id: l.id, code: l.code, type: l.type as 'PICKING' | 'STORAGE',
        productId: l.product_id, quantity: l.quantity
      })));

      if (aRes.data) setAudits(aRes.data.map(a => ({
        id: a.id, date: a.date, locationId: a.location_id,
        productId: a.product_id, expectedQty: a.expected_qty,
        actualQty: a.actual_qty, status: a.status as 'ADJUSTED' | 'MATCHED'
      })));
    } catch (error) {
      console.error("Erro ao sincronizar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---
  const handleOpenProductModal = (product?: Product) => {
    setPlacementSuggestions([]);
    if (product) {
      setEditingProduct(product);
      setProductForm({ ...product });
    } else {
      setEditingProduct(null);
      setProductForm({ sku: '', name: '', category: 'Geral', unit: Unit.UN, minStock: 0, price: 0 });
    }
    setShowProductModal(true);
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.sku) return alert("Nome e SKU são obrigatórios");
    setIsSaving(true);
    const productData = {
      sku: productForm.sku!, name: productForm.name!, category: productForm.category || 'Geral',
      unit: productForm.unit || Unit.UN, min_stock: Number(productForm.minStock) || 0, price: Number(productForm.price) || 0,
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
    } catch (error: any) { alert(`Erro: ${error.message}`); } finally { setIsSaving(false); }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm("Excluir produto?")) {
      try {
        await supabase.from('products').delete().eq('id', id);
        await fetchData();
      } catch (error: any) { alert(error.message); }
    }
  };

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
    if (!locationForm.code) return alert("Código é obrigatório");
    setIsSaving(true);
    const locationData = {
      code: locationForm.code!, type: locationForm.type || 'STORAGE',
      product_id: locationForm.productId || null, quantity: Number(locationForm.quantity) || 0,
    };
    try {
      if (editingLocation) {
        await supabase.from('storage_locations').update(locationData).eq('id', editingLocation.id);
      } else {
        await supabase.from('storage_locations').insert([locationData]);
      }
      setShowLocationModal(false);
      await fetchData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const adjustStock = async (locId: string, amount: number) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return;
    const newQty = Math.max(0, loc.quantity + amount);
    await supabase.from('storage_locations').update({ quantity: newQty }).eq('id', locId);
    setLocations(locations.map(l => l.id === locId ? { ...l, quantity: newQty } : l));
  };

  const executeAudit = async () => {
    if (!auditLocationId || actualQty === '') return alert("Preencha todos os campos.");
    setIsSaving(true);
    const loc = locations.find(l => l.id === auditLocationId);
    if (!loc) return;
    const auditData = {
      date: new Date().toISOString(), location_id: loc.id, product_id: loc.productId || null,
      expected_qty: loc.quantity, actual_qty: Number(actualQty),
      status: loc.quantity === Number(actualQty) ? 'MATCHED' : 'ADJUSTED'
    };
    try {
      await supabase.from('inventory_audits').insert([auditData]);
      if (auditData.status === 'ADJUSTED') {
        await supabase.from('storage_locations').update({ quantity: Number(actualQty) }).eq('id', loc.id);
      }
      setAuditLocationId(''); setActualQty(''); await fetchData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleCompletePicking = async (locId: string, qtyToPick: number) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc || loc.quantity < qtyToPick) return alert("Saldo insuficiente no local para este picking.");
    setIsSaving(true);
    try {
      const newQty = loc.quantity - qtyToPick;
      await supabase.from('storage_locations').update({ quantity: newQty }).eq('id', locId);
      alert("Picking confirmado e estoque baixado!");
      await fetchData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleFetchSuggestions = async () => {
    if (!productForm.name || !productForm.category) return alert("Preencha o nome e categoria.");
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
  
  const pickingLocations = useMemo(() => locations.filter(l => l.type === 'PICKING' && l.productId !== null), [locations]);

  if (loading && products.length === 0) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-4">
      <Loader2 size={48} className="text-blue-600 animate-spin" />
      <p className="text-slate-500 font-medium">Conectando ao SmartStock Pro...</p>
    </div>
  );

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && (
        <div className="space-y-6 lg:space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">SKUs Cadastrados</h3>
              <p className="text-2xl font-bold text-slate-800">{products.length}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Estoque Total</h3>
              <p className="text-2xl font-bold text-slate-800">{totalStockCount}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Locais Vazios</h3>
              <p className="text-2xl font-bold text-blue-600">{locations.filter(l => !l.productId).length}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Auditorias Mês</h3>
              <p className="text-2xl font-bold text-slate-800">{audits.length}</p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 lg:p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 hidden md:block"><BrainCircuit size={120} /></div>
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 p-2 rounded-lg"><BrainCircuit size={24} /></div>
                  <div>
                    <h3 className="text-xl font-bold">Assistente Logístico AI</h3>
                    <p className="text-slate-400 text-sm">Insights automáticos do seu armazém</p>
                  </div>
                </div>
                <button onClick={handleGetInsights} disabled={loadingInsights} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors text-sm flex items-center gap-2">
                  {loadingInsights ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {loadingInsights ? 'Processando...' : 'Gerar Insights'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aiInsights.map((insight, idx) => (
                  <div key={idx} className="bg-slate-800/50 border border-slate-700 p-5 rounded-xl hover:bg-slate-800 transition-colors">
                    <h4 className="font-semibold text-blue-400 mb-2">{insight.title}</h4>
                    <p className="text-sm text-slate-300 leading-relaxed">{insight.description}</p>
                  </div>
                ))}
                {aiInsights.length === 0 && !loadingInsights && (
                  <p className="text-slate-500 text-sm italic">Clique em "Gerar Insights" para análise da IA.</p>
                )}
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
              <input type="text" placeholder="Buscar SKU ou Produto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm" />
            </div>
            <button onClick={() => handleOpenProductModal()} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors text-sm font-medium">
              <Plus size={20} /> Novo Produto
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b">
                  <th className="px-6 py-4">SKU</th>
                  <th className="px-6 py-4">Nome</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4">Estoque</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map(p => {
                  const currentQty = locations.filter(l => l.productId === p.id).reduce((acc, curr) => acc + curr.quantity, 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 group">
                      <td className="px-6 py-4 font-mono text-xs">{p.sku}</td>
                      <td className="px-6 py-4 font-semibold">{p.name}</td>
                      <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-100 rounded text-[10px] uppercase">{p.category}</span></td>
                      <td className="px-6 py-4 font-bold text-sm">{currentQty} {p.unit}</td>
                      <td className="px-6 py-4 text-right space-x-1">
                        <button onClick={() => handleOpenProductModal(p)} className="p-2 text-slate-400 hover:text-blue-600"><Edit size={16} /></button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'warehouse' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-800">Mapa de Endereçamento</h3>
            <button onClick={() => handleOpenLocationModal()} className="px-4 py-2 bg-slate-800 text-white rounded-lg flex items-center gap-2 hover:bg-black transition-colors text-sm font-medium">
              <Plus size={18} /> Novo Endereço
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {locations.map(loc => {
              const product = products.find(p => p.id === loc.productId);
              return (
                <div key={loc.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group hover:border-blue-300 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${loc.type === 'PICKING' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{loc.type}</span>
                    <button onClick={() => handleOpenLocationModal(loc)} className="text-slate-300 hover:text-blue-500"><Settings2 size={14} /></button>
                  </div>
                  <h4 className="font-bold text-slate-900 text-lg">{loc.code}</h4>
                  {product ? (
                    <div className="mt-2 space-y-3">
                      <p className="text-xs font-medium text-slate-500 line-clamp-1">{product.name}</p>
                      <div className="flex items-center justify-between">
                        <div className="text-xl font-black">{loc.quantity} <span className="text-[10px] text-slate-400 font-normal">{product.unit}</span></div>
                        <div className="flex gap-1">
                          <button onClick={() => adjustStock(loc.id, -1)} className="p-1.5 border border-slate-100 rounded-lg hover:bg-red-50 hover:text-red-600"><ArrowDownLeft size={14} /></button>
                          <button onClick={() => adjustStock(loc.id, 1)} className="p-1.5 border border-slate-100 rounded-lg hover:bg-green-50 hover:text-green-600"><ArrowUpRight size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ) : <div className="mt-4 py-4 border-2 border-dashed border-slate-100 rounded-lg text-center text-[10px] text-slate-300 font-bold uppercase italic">Vazio</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'picking' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <Truck className="text-amber-600" size={24} />
              <h3 className="text-xl font-bold">Fila de Separação (Picking)</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pickingLocations.map(loc => {
                const product = products.find(p => p.id === loc.productId);
                return (
                  <div key={loc.id} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                    <div className="bg-amber-600 p-3 text-white flex justify-between items-center">
                      <span className="font-bold text-lg">{loc.code}</span>
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-bold uppercase">Área de Picking</span>
                    </div>
                    <div className="p-5 flex-1 space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Produto</p>
                        <p className="font-bold text-slate-800">{product?.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{product?.sku}</p>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Saldo Disponível</p>
                          <p className="text-2xl font-black text-slate-700">{loc.quantity} {product?.unit}</p>
                        </div>
                        <button 
                          onClick={() => {
                            const qty = prompt(`Quanto deseja coletar de ${product?.name} em ${loc.code}?`);
                            if (qty && !isNaN(Number(qty))) handleCompletePicking(loc.id, Number(qty));
                          }}
                          className="flex items-center gap-2 bg-slate-800 hover:bg-black text-white px-4 py-2 rounded-lg font-bold text-xs transition-all"
                        >
                          <HandHelping size={16} /> Confirmar Coleta
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {pickingLocations.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-3 border-2 border-dashed border-slate-200 rounded-2xl">
                  <ArrowDownCircle className="mx-auto text-slate-300" size={48} />
                  <p className="text-slate-400 font-medium">Nenhum saldo pendente em áreas de Picking.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl p-6 border border-slate-200 shadow-sm h-fit space-y-6">
            <h3 className="font-bold flex items-center gap-2 text-slate-800"><Scale className="text-blue-600" size={20} /> Nova Auditoria</h3>
            <div className="space-y-4">
              <select value={auditLocationId} onChange={(e) => setAuditLocationId(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Selecione o endereço...</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.code} {l.productId ? `(${products.find(p => p.id === l.productId)?.sku})` : '(Vazio)'}</option>
                ))}
              </select>
              <input type="number" value={actualQty} onChange={(e) => setActualQty(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Quantidade Real Contada" className="w-full p-3 border border-slate-200 rounded-lg text-2xl font-black outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={executeAudit} disabled={isSaving || !auditLocationId || actualQty === ''} className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2">
                {isSaving ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                Finalizar Auditoria
              </button>
            </div>
          </div>
          
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700">Histórico Recente</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-[10px] uppercase text-slate-400 font-bold border-b">
                  <tr><th className="p-4">Data</th><th className="p-4">Local</th><th className="p-4 text-center">Esp./Real</th><th className="p-4 text-right">Status</th></tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {audits.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="p-4 text-slate-400 font-mono text-xs">{new Date(a.date).toLocaleDateString()}</td>
                      <td className="p-4 font-bold">{locations.find(l => l.id === a.locationId)?.code || 'N/A'}</td>
                      <td className="p-4 text-center font-medium">{a.expectedQty} / {a.actualQty}</td>
                      <td className="p-4 text-right"><span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${a.status === 'MATCHED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{a.status === 'MATCHED' ? 'OK' : 'AJUSTE'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS --- */}
      {showProductModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">{editingProduct ? 'Editar' : 'Novo'} Produto</h3>
              <button onClick={() => setShowProductModal(false)}><X /></button>
            </div>
            <div className="p-6 space-y-4">
              <input value={productForm.sku || ''} onChange={e => setProductForm({...productForm, sku: e.target.value.toUpperCase()})} placeholder="SKU" className="w-full p-2 border rounded-lg" />
              <input value={productForm.name || ''} onChange={e => setProductForm({...productForm, name: e.target.value})} placeholder="Nome do Produto" className="w-full p-2 border rounded-lg" />
              
              <div className="p-4 bg-blue-50 rounded-xl space-y-3 border border-blue-100">
                <button onClick={handleFetchSuggestions} disabled={loadingSuggestions} className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-1">
                  <Sparkles size={12} /> Sugerir Endereço via IA
                </button>
                {placementSuggestions.map((s, idx) => (
                  <div key={idx} className="bg-white p-2 rounded text-[10px] border border-blue-200">
                    <span className="font-bold">{s.locationCode}</span>: {s.reason}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <select value={productForm.unit} onChange={e => setProductForm({...productForm, unit: e.target.value as Unit})} className="w-full p-2 border rounded-lg bg-white">
                  <option value={Unit.UN}>UN</option><option value={Unit.KG}>KG</option><option value={Unit.CX}>CX</option>
                </select>
                <input type="number" value={productForm.minStock || 0} onChange={e => setProductForm({...productForm, minStock: Number(e.target.value)})} placeholder="Est. Mínimo" className="w-full p-2 border rounded-lg" />
              </div>
              <button onClick={handleSaveProduct} disabled={isSaving} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg">
                {isSaving ? <Loader2 className="animate-spin mx-auto" /> : 'Salvar Produto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-800 text-lg">Configurar Posição</h3>
              <button onClick={() => setShowLocationModal(false)}><X className="text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <input value={locationForm.code || ''} onChange={e => setLocationForm({...locationForm, code: e.target.value.toUpperCase()})} placeholder="Código (Ex: A-01-01)" className="w-full p-2 border rounded-lg" />
              <select value={locationForm.type} onChange={e => setLocationForm({...locationForm, type: e.target.value as any})} className="w-full p-2 border rounded-lg bg-white">
                <option value="STORAGE">Armazenagem (Pulmão)</option>
                <option value="PICKING">Picking (Separação)</option>
              </select>
              <select value={locationForm.productId || ''} onChange={e => setLocationForm({...locationForm, productId: e.target.value || null})} className="w-full p-2 border rounded-lg bg-white">
                <option value="">-- Local Vazio --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
              </select>
              <input type="number" value={locationForm.quantity || 0} onChange={e => setLocationForm({...locationForm, quantity: Number(e.target.value)})} placeholder="Quantidade" className="w-full p-2 border rounded-lg" />
              <button onClick={handleSaveLocation} disabled={isSaving} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg">
                {isSaving ? <Loader2 className="animate-spin mx-auto" /> : 'Confirmar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
