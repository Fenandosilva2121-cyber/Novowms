
import { GoogleGenAI, Type } from "@google/genai";
import { Product, StorageLocation } from "../types";

// Always use process.env.API_KEY directly as per SDK guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getInventoryInsights = async (products: Product[], locations: StorageLocation[]) => {
  const inventorySummary = locations.map(loc => {
    const product = products.find(p => p.id === loc.productId);
    return {
      location: loc.code,
      product: product?.name || 'Vazio',
      sku: product?.sku || 'N/A',
      qty: loc.quantity,
      minStock: product?.minStock || 0
    };
  });

  const prompt = `Analise este resumo de inventário de um armazém e forneça 3 a 5 insights estratégicos em português:
  ${JSON.stringify(inventorySummary)}

  Foque em:
  1. Itens com estoque baixo.
  2. Otimização de espaço (locais vazios ou superlotados).
  3. Sugestões de reabastecimento de picking.
  
  Retorne um array de objetos JSON com as chaves 'title' e 'description'.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ['title', 'description']
          }
        }
      }
    });

    return JSON.parse(response.text?.trim() || '[]');
  } catch (error) {
    console.error("Erro ao obter insights da IA:", error);
    return [];
  }
};

export const getStorageSuggestions = async (product: Partial<Product>, locations: StorageLocation[], products: Product[]) => {
  const emptyLocations = locations.filter(l => l.productId === null).map(l => ({ code: l.code, type: l.type }));
  const occupiedSummary = locations.filter(l => l.productId !== null).map(l => {
    const p = products.find(prod => prod.id === l.productId);
    return { code: l.code, category: p?.category, type: l.type };
  });

  const prompt = `Sugira as melhores localizações para o seguinte produto novo:
  Produto: ${product.name} (Categoria: ${product.category})
  
  Locais vazios disponíveis: ${JSON.stringify(emptyLocations)}
  Mapa de locais ocupados: ${JSON.stringify(occupiedSummary)}

  Critérios:
  1. Agrupar por categoria similar.
  2. Preferir PICKING para itens que parecem ser de alta rotatividade.
  3. Manter organização lógica de corredores.

  Retorne um array de no máximo 3 sugestões JSON com 'locationCode', 'reason' e 'score' (0-100). Em português.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              locationCode: { type: Type.STRING },
              reason: { type: Type.STRING },
              score: { type: Type.NUMBER }
            },
            required: ['locationCode', 'reason', 'score']
          }
        }
      }
    });

    return JSON.parse(response.text?.trim() || '[]');
  } catch (error) {
    console.error("Erro ao obter sugestões de IA:", error);
    return [];
  }
};
