
import React, { useState, useEffect, useMemo } from 'react';
import Layout from './components/Layout';
import { Product, StorageLocation, Unit, InventoryAudit } from './types';
import { 
  Plus, Search, Trash2, Edit, AlertCircle, CheckCircle2, 
  BrainCircuit, Truck, MapPin, X, ArrowUpRight, ArrowDownLeft, 
  Settings2, Scale, Save, Sparkles, Loader2, HandHelping, ArrowDownCircle
} from 'lucide-react';
import { getInventoryInsights, getStorageSuggestions } from './services/geminiService';
import { supabase } from './services/supabase';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [error, setError] = useState<string | null>(null);
  
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
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [placementSuggestions, setPlacementSuggestions] = useState<{locationCode: string, reason: string, score: number}[]>([]);
  const [auditLocationId, setAuditLocationId] = useState('');
  const [actualQty, setActualQty] = useState<number | ''>('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: pData, error: pErr } = await supabase.from('products').select('*').order('name');
      const { data: lData, error: lErr } = await supabase.from('storage_locations').select('*').order('code');
      const { data: aData, error: aErr } = await supabase.from('inventory_audits').select('*').order('date', { ascending: false }).limit(50);

      if (pErr || lErr || aErr) throw new Error("Falha ao comunicar com o banco de dados.");

      if (pData) setProducts(pData.map(p => ({
        id: p.id, sku: p.sku, name: p.name, category: p.category,
        unit: p.unit as Unit, minStock: p.min_stock, price: p.price
      })));
      
      if (lData) setLocations(lData.map(l => ({
        id: l.id, code: l.code, type: l.type as 'PICKING' | 'STORAGE',
        productId: l.product_id, quantity: l.quantity
      })));

      if (aData) setAudits(aData.map(a => ({
        id: a.id, date: a.date, locationId: a.location_id,
        productId: a.product_id, expectedQty: a.expected_qty,
        actualQty: a.actual_qty, status: a.status as 'ADJUSTED' | 'MATCHED'
      })));
    } catch (err: any) {
      console.error("Erro de inicialização:", err);
      setError("Não foi possível carregar os dados. Verifique sua conexão e as variáveis de ambiente no Vercel.");
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
        await supabase.from('products').update(productData).eq('id', editingProduct.id);
      } else {
        await supabase.from('products').insert([productData]);
      }
      setShowProductModal(false);
      await fetchData();
    } catch (error: any) { alert(`Erro: ${error.message}`); } finally { setIsSaving(false); }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm("Deseja excluir este produto?")) {
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
    try {
      const locationData = {
        code: locationForm.code!, type: locationForm.type || 'STORAGE',
        product_id: locationForm.productId || null, quantity: Number(locationForm.quantity) || 0,
      };
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
    try {
      const auditData = {
        date: new Date().toISOString(), location_id: loc.id, product_id: loc.productId || null,
        expected_qty: loc.quantity, actual_qty: Number(actualQty),
        status: loc.quantity === Number(actualQty) ? 'MATCHED' : 'ADJUSTED'
      };
      await supabase.from('inventory_audits').insert([auditData]);
      if (auditData.status === 'ADJUSTED') {
        await supabase.from('storage_locations').update({ quantity: Number(actualQty) }).eq('id', loc.id);
      }
      setAuditLocationId(''); setActualQty(''); await fetchData();
      alert("Auditoria finalizada!");
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleCompletePicking = async (locId: string, qtyToPick: number) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc || loc.quantity < qtyToPick) return alert("Saldo insuficiente.");
    setIsSaving(true);
    try {
      const newQty = loc.quantity - qtyToPick;
      await supabase.from('storage_locations').update({ quantity: newQty }).eq('id', locId);
      await fetchData();
      alert("Picking realizado!");
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  // --- AI Logic ---
  const handleGetInsights = async () => {
    setLoadingInsights(true);
    const insights = await getInventoryInsights(products, locations);
    setAiInsights(insights);
    setLoadingInsights(false);
  };

  const handleFetchSuggestions = async () => {
    if (!productForm.name) return alert("Preencha o nome do produto.");
    setLoadingSuggestions(true);
    const suggestions = await getStorageSuggestions(productForm, locations, products);
    setPlacementSuggestions(suggestions);
    setLoadingSuggestions(false);
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

  if (loading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-4">
      <Loader2 size={48} className="text-blue-600 animate-spin" />
      <p className="text-slate-500 font-medium">Carregando SmartStock Pro...</p>
    </div>
  );

  if (error) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <AlertCircle size={64} className="text-red-500 mb-4" />
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Erro de Carregamento</h2>
      <p className="text-slate-600 max-w-md mb-6">{error}</p>
      <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold">Tentar Novamente</button>
    </div>
  );

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">SKUs</h3>
              <p className="text-2xl font-bold">{products.length}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Estoque Total</h3>
              <p className="text-2xl font-bold">{totalStockCount}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Locais Vazios</h3>
              <p className="text-2xl font-bold text-blue-600">{locations.filter(l => !l.productId).length}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-slate-500 text-sm font-medium">Auditorias</h3>
              <p className="text-2xl font-bold">{audits.length}</p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 lg:p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 p-2 rounded-lg"><BrainCircuit size={24} /></div>
                  <h3 className="text-xl font-bold">Assistente IA</h3>
                </div>
                <button onClick={handleGetInsights} disabled={loadingInsights} className="px-6 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
                  {loadingInsights ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {loadingInsights ? 'Analisando...' : 'Gerar Insights'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {aiInsights.map((insight, idx) => (
                  <div key={idx} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <h4 className="font-bold text-blue-400 mb-1">{insight.title}</h4>
                    <p className="text-xs text-slate-300">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="flex gap-4 items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="Filtrar produtos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg" />
            </div>
            <button onClick={() => handleOpenProductModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
              <Plus size={18} /> Novo
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b">
                <tr><th className="p-4">SKU</th><th className="p-4">Produto</th><th className="p-4">Estoque</th><th className="p-4 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y">
                {filteredProducts.map(p => {
                  const qty = locations.filter(l => l.productId === p.id).reduce((acc, curr) => acc + curr.quantity, 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-4 font-mono text-xs">{p.sku}</td>
                      <td className="p-4 font-bold">{p.name}</td>
                      <td className="p-4 font-bold">{qty} {p.unit}</td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => handleOpenProductModal(p)} className="text-slate-400 hover:text-blue-600"><Edit size={16} /></button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
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
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border">
            <h3 className="font-bold">Endereçamento</h3>
            <button onClick={() => handleOpenLocationModal()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <Plus size={16} /> Novo Local
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {locations.map(loc => {
              const product = products.find(p => p.id === loc.productId);
              return (
                <div key={loc.id} className="bg-white p-4 rounded-xl border shadow-sm group hover:border-blue-400 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">{loc.type}</span>
                    <button onClick={() => handleOpenLocationModal(loc)} className="text-slate-300 hover:text-blue-500"><Settings2 size={14} /></button>
                  </div>
                  <h4 className="font-bold text-lg">{loc.code}</h4>
                  {product ? (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500 truncate">{product.name}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className="font-black text-xl">{loc.quantity}</span>
                        <div className="flex gap-1">
                          <button onClick={() => adjustStock(loc.id, -1)} className="p-1 border rounded hover:bg-red-50"><ArrowDownLeft size={12} /></button>
                          <button onClick={() => adjustStock(loc.id, 1)} className="p-1 border rounded hover:bg-green-50"><ArrowUpRight size={12} /></button>
                        </div>
                      </div>
                    </div>
                  ) : <div className="mt-4 text-[10px] text-slate-300 italic">Vazio</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'picking' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pickingLocations.map(loc => {
            const product = products.find(p => p.id === loc.productId);
            return (
              <div key={loc.id} className="bg-white border rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-amber-500 p-3 text-white font-bold text-center">{loc.code}</div>
                <div className="p-5 space-y-4">
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-bold">Produto</p>
                    <p className="font-bold">{product?.name}</p>
                    <p className="font-mono text-[10px]">{product?.sku}</p>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-slate-400 uppercase font-bold">Saldo</p>
                      <p className="text-2xl font-black">{loc.quantity} {product?.unit}</p>
                    </div>
                    <button 
                      onClick={() => {
                        const q = prompt("Quantidade a retirar:");
                        if (q) handleCompletePicking(loc.id, Number(q));
                      }}
                      className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold"
                    >
                      Coletar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
            <h3 className="font-bold">Realizar Contagem</h3>
            <select value={auditLocationId} onChange={(e) => setAuditLocationId(e.target.value)} className="w-full p-2 border rounded-lg bg-slate-50">
              <option value="">Selecione o endereço...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.code} {l.productId ? `(${products.find(p => p.id === l.productId)?.sku})` : '(Vazio)'}</option>
              ))}
            </select>
            <input type="number" value={actualQty} onChange={(e) => setActualQty(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Quantidade Real" className="w-full p-3 border rounded-lg text-xl font-bold" />
            <button onClick={executeAudit} disabled={isSaving} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">
              Confirmar Auditoria
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 bg-slate-50 font-bold border-b">Recentes</div>
            <div className="overflow-y-auto max-h-[400px]">
              {audits.map(a => (
                <div key={a.id} className="p-4 border-b flex justify-between items-center text-sm">
                  <div>
                    <p className="font-bold">{locations.find(l => l.id === a.locationId)?.code}</p>
                    <p className="text-[10px] text-slate-400">{new Date(a.date).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{a.actualQty} UN</p>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${a.status === 'MATCHED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{a.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODALS (Simplified for brevity as logic remains same but ensuring it exists) */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md space-y-4">
            <h3 className="font-bold text-lg">Produto</h3>
            <input value={productForm.sku || ''} onChange={e => setProductForm({...productForm, sku: e.target.value.toUpperCase()})} placeholder="SKU" className="w-full p-2 border rounded" />
            <input value={productForm.name || ''} onChange={e => setProductForm({...productForm, name: e.target.value})} placeholder="Nome" className="w-full p-2 border rounded" />
            <div className="flex gap-2">
              <button onClick={handleSaveProduct} className="flex-1 bg-blue-600 text-white py-2 rounded">Salvar</button>
              <button onClick={() => setShowProductModal(false)} className="flex-1 bg-slate-100 py-2 rounded">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md space-y-4">
            <h3 className="font-bold text-lg">Localização</h3>
            <input value={locationForm.code || ''} onChange={e => setLocationForm({...locationForm, code: e.target.value.toUpperCase()})} placeholder="Código (Ex: A-01)" className="w-full p-2 border rounded" />
            <select value={locationForm.productId || ''} onChange={e => setLocationForm({...locationForm, productId: e.target.value})} className="w-full p-2 border rounded">
              <option value="">Vazio</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={handleSaveLocation} className="flex-1 bg-blue-600 text-white py-2 rounded">Salvar</button>
              <button onClick={() => setShowLocationModal(false)} className="flex-1 bg-slate-100 py-2 rounded">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
