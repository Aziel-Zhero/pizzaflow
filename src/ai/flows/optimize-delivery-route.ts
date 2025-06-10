
'use server';

/**
 * @fileOverview Delivery route optimization AI agents.
 *
 * - optimizeDeliveryRoute: Handles single delivery route optimization.
 * - optimizeMultiDeliveryRoute: Handles multi-stop delivery route optimization.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { OptimizeDeliveryRouteInput, OptimizeDeliveryRouteOutput, OptimizeMultiDeliveryRouteInput, OptimizeMultiDeliveryRouteOutput, MultiStopOrderInfo } from '@/lib/types';


// Esquemas para otimização de rota única
const OptimizeDeliveryRouteInputSchema = z.object({
  pizzeriaAddress: z.string().describe('O endereço da pizzaria.'),
  customerAddress: z.string().describe('O endereço de entrega do cliente.'),
});
// export type OptimizeDeliveryRouteInput = z.infer<typeof OptimizeDeliveryRouteInputSchema>; // Moved to types.ts

const OptimizeDeliveryRouteOutputSchema = z.object({
  optimizedRoute: z.string().url().describe('A URL do Google Maps para a rota de entrega otimizada da pizzaria para o cliente.'),
});
// export type OptimizeDeliveryRouteOutput = z.infer<typeof OptimizeDeliveryRouteOutputSchema>; // Moved to types.ts

export async function optimizeDeliveryRoute(input: OptimizeDeliveryRouteInput): Promise<OptimizeDeliveryRouteOutput> {
  return optimizeDeliveryRouteFlow(input);
}

const getSingleRouteTool = ai.defineTool(
  {
    name: 'getGoogleMapsSingleRouteUrl',
    description: 'Gera uma URL do Google Maps com a rota de um endereço de partida para um endereço de destino.',
    inputSchema: z.object({
      startAddress: z.string().describe('O endereço de partida para a rota.'),
      endAddress: z.string().describe('O endereço de destino para a rota.'),
    }),
    outputSchema: z.string().url().describe('A URL do Google Maps para a rota.'),
  },
  async (input) => {
    const origin = encodeURIComponent(input.startAddress);
    const destination = encodeURIComponent(input.endAddress);
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  }
);

const singleRoutePrompt = ai.definePrompt({
  name: 'optimizeDeliveryRoutePrompt',
  input: {schema: OptimizeDeliveryRouteInputSchema},
  output: {schema: OptimizeDeliveryRouteOutputSchema},
  tools: [getSingleRouteTool],
  prompt: `Você é um especialista em otimização de rotas para entrega de pizzas.
  Dado o endereço da pizzaria e o endereço do cliente, use a ferramenta getGoogleMapsSingleRouteUrl para gerar a URL da rota otimizada no Google Maps.
  Endereço da Pizzaria: {{{pizzeriaAddress}}}
  Endereço do Cliente: {{{customerAddress}}}
  Retorne a URL da rota otimizada.`,
});

const optimizeDeliveryRouteFlow = ai.defineFlow(
  {
    name: 'optimizeDeliveryRouteFlow',
    inputSchema: OptimizeDeliveryRouteInputSchema,
    outputSchema: OptimizeDeliveryRouteOutputSchema,
  },
  async input => {
    const {output} = await singleRoutePrompt(input);
    if (!output || !output.optimizedRoute) {
      const fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(input.pizzeriaAddress)}&destination=${encodeURIComponent(input.customerAddress)}&travelmode=driving`;
      return { optimizedRoute: fallbackUrl };
    }
    return output!;
  }
);


// Esquemas e fluxo para otimização de múltiplas rotas
const MultiStopOrderInfoSchema = z.object({
    orderId: z.string().describe('O ID do pedido.'),
    customerAddress: z.string().describe('O endereço de entrega do cliente para este pedido.'),
});

const OptimizeMultiDeliveryRouteInputSchema = z.object({
  pizzeriaAddress: z.string().describe('O endereço da pizzaria (ponto de partida).'),
  ordersToDeliver: z.array(MultiStopOrderInfoSchema).min(1).describe('Uma lista de pedidos a serem entregues, cada um com seu ID e endereço do cliente.'),
});
// export type OptimizeMultiDeliveryRouteInput = z.infer<typeof OptimizeMultiDeliveryRouteInputSchema>; // Moved to types.ts

const OptimizedRouteLegSchema = z.object({
    orderIds: z.array(z.string()).describe('IDs dos pedidos agrupados nesta perna da rota.'),
    description: z.string().describe('Descrição textual da rota ou trecho.'),
    googleMapsUrl: z.string().url().describe('URL do Google Maps para esta perna ou rota completa.'),
});

const OptimizeMultiDeliveryRouteOutputSchema = z.object({
  optimizedRoutePlan: z.array(OptimizedRouteLegSchema).describe('Um plano de rota otimizado, possivelmente com múltiplas "pernas" ou uma única rota consolidada.'),
  summary: z.string().optional().describe('Um resumo geral da otimização ou sugestões.'),
});
// export type OptimizeMultiDeliveryRouteOutput = z.infer<typeof OptimizeMultiDeliveryRouteOutputSchema>; // Moved to types.ts

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
    // Google Maps URL format: dir/origin/waypoint1/waypoint2/.../destination
    // Or with waypoints parameter: dir/?api=1&origin=ORIGIN&destination=DESTINATION&waypoints=WAYPOINT1|WAYPOINT2
    if (input.waypoints.length > 0) {
      return `https://www.google.com/maps/dir/?api=1&origin=${originEncoded}&destination=${destinationEncoded}&waypoints=${waypointsEncoded}&travelmode=driving`;
    }
    // Fallback para rota simples se não houver waypoints (embora o prompt deva garantir waypoints)
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
   - 'destination' será o endereço do último cliente nessa rota.
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
    // Validação básica
    if (!input.ordersToDeliver || input.ordersToDeliver.length === 0) {
      return { optimizedRoutePlan: [], summary: "Nenhum pedido para otimizar." };
    }
    
    // Se houver apenas um pedido, podemos simplificar e usar a lógica de rota única ou deixar a IA decidir
    if (input.ordersToDeliver.length === 1) {
        const singleOrder = input.ordersToDeliver[0];
        const singleRouteUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(input.pizzeriaAddress)}&destination=${encodeURIComponent(singleOrder.customerAddress)}&travelmode=driving`;
        return {
            optimizedRoutePlan: [{
                orderIds: [singleOrder.orderId],
                description: `Rota para pedido ${singleOrder.orderId}`,
                googleMapsUrl: singleRouteUrl,
            }],
            summary: "Rota para um único pedido."
        };
    }

    const {output} = await multiRoutePrompt(input);

    if (!output || !output.optimizedRoutePlan || output.optimizedRoutePlan.length === 0) {
      // Fallback muito básico: criar rotas individuais se a IA falhar em agrupar
      const fallbackPlan: OptimizeMultiDeliveryRouteOutput['optimizedRoutePlan'] = input.ordersToDeliver.map(order => ({
        orderIds: [order.orderId],
        description: `Rota individual para pedido ${order.orderId}`,
        googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(input.pizzeriaAddress)}&destination=${encodeURIComponent(order.customerAddress)}&travelmode=driving`
      }));
      return { optimizedRoutePlan: fallbackPlan, summary: "Falha na otimização da IA, rotas individuais geradas." };
    }
    return output!;
  }
);
