
'use server';

/**
 * @fileOverview Delivery route optimization AI agents.
 *
 * - optimizeDeliveryRoute: Handles single delivery route optimization. (OBS: This action is now handled directly in actions.ts for simplicity)
 * - optimizeMultiDeliveryRoute: Handles multi-stop delivery route optimization.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { OptimizeMultiDeliveryRouteInput, OptimizeMultiDeliveryRouteOutput, MultiStopOrderInfo } from '@/lib/types';


// Esquemas e fluxo para otimização de múltiplas rotas
const MultiStopOrderInfoSchema = z.object({
    orderId: z.string().describe('O ID do pedido.'),
    customerAddress: z.string().describe('O endereço de entrega do cliente para este pedido.'),
});

const OptimizeMultiDeliveryRouteInputSchema = z.object({
  pizzeriaAddress: z.string().describe('O endereço da pizzaria (ponto de partida).'),
  ordersToDeliver: z.array(MultiStopOrderInfoSchema).min(1).describe('Uma lista de pedidos a serem entregues, cada um com seu ID e endereço do cliente.'),
});

const OptimizedRouteLegSchema = z.object({
    orderIds: z.array(z.string()).describe('IDs dos pedidos agrupados nesta perna da rota.'),
    description: z.string().describe('Descrição textual da rota ou trecho.'),
    googleMapsUrl: z.string().url().describe('URL do Google Maps para esta perna ou rota completa.'),
});

const OptimizeMultiDeliveryRouteOutputSchema = z.object({
  optimizedRoutePlan: z.array(OptimizedRouteLegSchema).describe('Um plano de rota otimizado, possivelmente com múltiplas "pernas" ou uma única rota consolidada.'),
  summary: z.string().optional().describe('Um resumo geral da otimização ou sugestões.'),
});

export async function optimizeMultiDeliveryRoute(input: OptimizeMultiDeliveryRouteInput): Promise<OptimizeMultiDeliveryRouteOutput> {
  return optimizeMultiDeliveryRouteFlow(input);
}

const getMultiStopRouteTool = ai.defineTool(
  {
    name: 'getGoogleMapsMultiStopRouteUrl',
    description: 'Gera uma URL do Google Maps para uma rota com um ponto de partida, múltiplos destinos (waypoints) e um destino final (que pode ser o ponto de partida ou o último cliente). A ordem dos waypoints deve ser otimizada.',
    inputSchema: z.object({
      origin: z.string().describe('O endereço de partida (pizzaria).'),
      waypoints: z.array(z.string()).describe('Uma lista ordenada de endereços de clientes (paradas intermediárias).'),
      destination: z.string().describe('O endereço final da rota (pode ser o último cliente ou a pizzaria).'),
    }),
    outputSchema: z.string().url().describe('A URL do Google Maps para a rota com múltiplos destinos.'),
  },
  async (input) => {
    const originEncoded = encodeURIComponent(input.origin);
    const destinationEncoded = encodeURIComponent(input.destination);
    const waypointsEncoded = input.waypoints.map(wp => encodeURIComponent(wp)).join('|');
    if (input.waypoints.length > 0) {
      return `https://www.google.com/maps/dir/?api=1&origin=${originEncoded}&destination=${destinationEncoded}&waypoints=${waypointsEncoded}&travelmode=driving`;
    }
    return `https://www.google.com/maps/dir/?api=1&origin=${originEncoded}&destination=${destinationEncoded}&travelmode=driving`;
  }
);

const multiRoutePrompt = ai.definePrompt({
  name: 'optimizeMultiDeliveryRoutePrompt',
  input: {schema: OptimizeMultiDeliveryRouteInputSchema},
  output: {schema: OptimizeMultiDeliveryRouteOutputSchema},
  tools: [getMultiStopRouteTool],
  prompt: `Você é um especialista em logística de entrega de pizzas e otimização de rotas.
Seu objetivo é criar um plano de entrega eficiente para múltiplos pedidos a partir de um endereço de pizzaria.

Endereço da Pizzaria (Origem): {{{pizzeriaAddress}}}

Pedidos para entrega:
{{#each ordersToDeliver}}
- Pedido ID: {{orderId}}, Endereço do Cliente: {{customerAddress}}
{{/each}}

Considere a proximidade dos endereços para minimizar a distância total percorrida e o tempo.
1. Determine a ordem ótima de entrega para os clientes.
2. Agrupe os pedidos em uma única rota, se possível, ou em poucas rotas eficientes.
3. Para cada rota/agrupamento, use a ferramenta 'getGoogleMapsMultiStopRouteUrl'.
   - 'origin' será sempre o endereço da pizzaria.
   - 'waypoints' será a lista ordenada dos endereços dos clientes para essa rota.
   - 'destination' será o endereço do último cliente nessa rota. Se houver apenas um cliente na "rota" (ou seja, um único pedido sendo considerado como uma rota), não haverá waypoints, e o 'destination' será o endereço desse cliente.
4. Retorne o plano no formato 'optimizedRoutePlan', onde cada elemento do array representa uma rota. Inclua os IDs dos pedidos servidos por essa rota.
   - Se todos os pedidos puderem ser entregues em uma única rota otimizada, 'optimizedRoutePlan' terá apenas um elemento.
   - Forneça uma breve descrição para cada rota e a URL do Google Maps.
   - Inclua um 'summary' opcional com qualquer observação ou sugestão sobre o plano.

Exemplo de como você deve pensar para chamar a ferramenta:
Se a ordem otimizada for ClienteA, depois ClienteB, e depois ClienteC:
- origin: Endereço da Pizzaria
- waypoints: [Endereço ClienteA, Endereço ClienteB] (ClienteA é o primeiro waypoint)
- destination: Endereço ClienteC (último cliente da rota)

Se você decidir que todos os clientes podem ser atendidos em uma única rota, o 'destination' da ferramenta será o endereço do último cliente.
Se você decidir que precisa de duas rotas (ex: Rota 1 para Clientes A e B; Rota 2 para Clientes C e D), você chamará a ferramenta duas vezes e retornará dois elementos em 'optimizedRoutePlan'.
`,
});

const optimizeMultiDeliveryRouteFlow = ai.defineFlow(
  {
    name: 'optimizeMultiDeliveryRouteFlow',
    inputSchema: OptimizeMultiDeliveryRouteInputSchema,
    outputSchema: OptimizeMultiDeliveryRouteOutputSchema,
  },
  async input => {
    if (!input.ordersToDeliver || input.ordersToDeliver.length === 0) {
      return { 
        optimizedRoutePlan: [], 
        summary: "Nenhum pedido fornecido para otimização." 
      };
    }
    
    // Se houver apenas um pedido, a IA deve ser capaz de lidar com isso chamando
    // a ferramenta getGoogleMapsMultiStopRouteUrl com waypoints vazio e o cliente como destino.
    // O prompt foi ajustado para cobrir isso.

    try {
        const {output} = await multiRoutePrompt(input);

        // Fallback mais robusto se a IA não retornar um plano válido
        if (!output || !output.optimizedRoutePlan || output.optimizedRoutePlan.length === 0) {
            console.warn("AI failed to produce a valid multi-route plan. Generating individual routes as fallback.");
            const fallbackPlan: OptimizeMultiDeliveryRouteOutput['optimizedRoutePlan'] = input.ordersToDeliver.map(order => ({
                orderIds: [order.orderId],
                description: `Rota individual para pedido ${order.orderId}`,
                googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(input.pizzeriaAddress)}&destination=${encodeURIComponent(order.customerAddress)}&travelmode=driving`
            }));
            return { 
                optimizedRoutePlan: fallbackPlan, 
                summary: "Otimização da IA falhou em agrupar rotas. Rotas individuais foram geradas como fallback." 
            };
        }
        return output;
    } catch (error) {
        console.error("Error during multi-route optimization flow:", error);
        // Fallback em caso de erro na execução do prompt
        const fallbackPlan: OptimizeMultiDeliveryRouteOutput['optimizedRoutePlan'] = input.ordersToDeliver.map(order => ({
            orderIds: [order.orderId],
            description: `Rota individual para pedido ${order.orderId} (fallback de erro)`,
            googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(input.pizzeriaAddress)}&destination=${encodeURIComponent(order.customerAddress)}&travelmode=driving`
        }));
        return { 
            optimizedRoutePlan: fallbackPlan, 
            summary: "Erro durante a otimização da IA. Rotas individuais foram geradas como fallback."
        };
    }
  }
);
// O fluxo de otimização de rota única (optimizeDeliveryRouteFlow) foi removido daqui
// pois a lógica foi simplificada e movida diretamente para actions.ts
// para evitar chamadas de IA desnecessárias para um único destino.
