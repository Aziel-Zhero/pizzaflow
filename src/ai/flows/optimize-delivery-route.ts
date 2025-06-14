
'use server';

/**
 * @fileOverview Delivery route optimization AI agents using Geoapify.
 *
 * - optimizeMultiDeliveryRoute: Handles multi-stop delivery route optimization for a single delivery person.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { 
    OptimizeMultiDeliveryRouteInput, 
    OptimizeMultiDeliveryRouteOutput, 
    MultiStopOrderInfo,
    Coordinates,
    OptimizedRouteLeg
} from '@/lib/types';
import fetch from 'node-fetch'; 

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;

// Helper Schemas
const CoordinatesSchema = z.object({
    lat: z.number(),
    lon: z.number(),
});

// Tool: Geocode Address using Geoapify
const geocodeAddressTool = ai.defineTool(
  {
    name: 'geocodeAddressTool',
    description: 'Converts a physical address into geographic coordinates (latitude and longitude) using Geoapify Geocoding API. Prioritize Brazilian addresses if country is not specified.',
    inputSchema: z.object({
      address: z.string().describe('The full street address to geocode. Example: "Rua Exemplo, 123, Bairro, Cidade, Estado, CEP"'),
    }),
    outputSchema: CoordinatesSchema.nullable().describe('The latitude and longitude, or null if the address could not be geocoded.'),
  },
  async (input) => {
    if (!GEOAPIFY_API_KEY) {
      console.error("Geoapify API key is missing.");
      throw new Error("Geoapify API key is not configured.");
    }
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(input.address)}&apiKey=${GEOAPIFY_API_KEY}&limit=1&lang=pt&filter=countrycode:br`;
    console.log(`Geoapify Geocoding URL for address "${input.address}": ${url.replace(GEOAPIFY_API_KEY, "******")}`);
    try {
      const response = await fetch(url);
      const responseBodyText = await response.text(); // Read body once
      if (!response.ok) {
        console.error(`Geoapify Geocoding API error for address "${input.address}": ${response.status} - ${responseBodyText}`);
        return null;
      }
      const data = JSON.parse(responseBodyText) as any;
      console.log(`Geoapify Geocoding response for "${input.address}":`, JSON.stringify(data, null, 2));
      if (data.features && data.features.length > 0) {
        const { lat, lon } = data.features[0].properties;
        if (lat && lon) {
            return { lat, lon };
        }
        console.warn(`Geoapify Geocoding: Lat/Lon missing in response for address: ${input.address}`, data.features[0].properties);
        return null;
      }
      console.warn(`Geoapify Geocoding: No coordinates found for address: ${input.address}`);
      return null;
    } catch (error) {
      console.error(`Error calling Geoapify Geocoding API for ${input.address}:`, error);
      return null;
    }
  }
);

// Tool: Get Route from Geoapify Routing API
const getGeoapifyRouteTool = ai.defineTool(
  {
    name: 'getGeoapifyRouteTool',
    description: 'Generates an optimized route using Geoapify Routing API for a sequence of waypoints and returns the route planner URL, distance, and time.',
    inputSchema: z.object({
      waypoints: z.array(CoordinatesSchema).min(2).describe('An ordered list of waypoints (latitude, longitude objects). The first waypoint is the origin, the last is the destination, and intermediate ones are stops.'),
      mode: z.string().optional().default('drive').describe('Transportation mode (e.g., drive, truck, walk). Default is "drive".')
    }),
    outputSchema: z.object({
      routePlannerUrl: z.string().url().describe('URL to Geoapify route planner.'),
      distance: z.number().describe('Total distance in meters.'),
      time: z.number().describe('Total time in seconds.'),
    }).nullable().describe("The route details, or null if a route could not be generated."),
  },
  async (input) => {
    if (!GEOAPIFY_API_KEY) {
      console.error("Geoapify API key is missing.");
      throw new Error("Geoapify API key is not configured.");
    }
    if (input.waypoints.length < 2) {
        console.error("Geoapify Routing: At least two waypoints (origin and destination) are required.");
        return null;
    }

    const waypointsString = input.waypoints.map(wp => `${wp.lat},${wp.lon}`).join('|');
    const apiUrl = `https://api.geoapify.com/v1/routing?waypoints=${waypointsString}&mode=${input.mode}&apiKey=${GEOAPIFY_API_KEY}`;
    const routePlannerBaseUrl = `https://www.geoapify.com/route-planner?waypoints=${waypointsString}&mode=${input.mode}`;
    console.log(`Geoapify Routing API URL: ${apiUrl.replace(GEOAPIFY_API_KEY, "******")}`);

    try {
      const response = await fetch(apiUrl);
      const responseBodyText = await response.text(); // Read body once
      if (!response.ok) {
        console.error(`Geoapify Routing API error: ${response.status} - ${responseBodyText}`);
        return null;
      }
      const data = JSON.parse(responseBodyText) as any;
      console.log(`Geoapify Routing response:`, JSON.stringify(data, null, 2));

      if (data.features && data.features.length > 0 && data.features[0].properties) {
        const properties = data.features[0].properties;
        if (properties.distance !== undefined && properties.time !== undefined) {
             return {
                routePlannerUrl: routePlannerBaseUrl, 
                distance: properties.distance, 
                time: properties.time, 
            };
        }
        console.warn(`Geoapify Routing: Distance or Time missing in response for waypoints: ${waypointsString}`, properties);
        return { routePlannerUrl: routePlannerBaseUrl, distance: 0, time: 0 }; // Return URL even if distance/time missing
      }
      console.warn(`Geoapify Routing: No route found for waypoints: ${waypointsString}`);
      return null;
    } catch (error) {
      console.error(`Error calling Geoapify Routing API for waypoints ${waypointsString}:`, error);
      return null;
    }
  }
);


// Schemas for multi-stop route optimization
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
    geoapifyRoutePlannerUrl: z.string().url().describe('URL do Geoapify Route Planner para esta perna ou rota completa.'),
    distanceMeters: z.number().optional().describe('Distância da rota em metros.'),
    timeSeconds: z.number().optional().describe('Tempo estimado da rota em segundos.'),
});

const OptimizeMultiDeliveryRouteOutputSchema = z.object({
  optimizedRoutePlan: z.array(OptimizedRouteLegSchema).describe('Um plano de rota otimizado, possivelmente com múltiplas "pernas" ou uma única rota consolidada. Este plano é para UM entregador.'),
  summary: z.string().optional().describe('Um resumo geral da otimização ou sugestões. Mencione se este plano pode ser parte de uma estratégia maior envolvendo múltiplos entregadores se apropriado.'),
});

export async function optimizeMultiDeliveryRoute(input: OptimizeMultiDeliveryRouteInput): Promise<OptimizeMultiDeliveryRouteOutput> {
  return optimizeMultiDeliveryRouteFlow(input);
}

const multiRoutePrompt = ai.definePrompt({
  name: 'optimizeMultiDeliveryRouteGeoapifyPrompt',
  input: {schema: OptimizeMultiDeliveryRouteInputSchema},
  output: {schema: OptimizeMultiDeliveryRouteOutputSchema},
  tools: [geocodeAddressTool, getGeoapifyRouteTool],
  prompt: `Você é um especialista em logística de entrega de pizzas e otimização de rotas usando a API Geoapify.
Seu objetivo é criar um plano de entrega eficiente para múltiplos pedidos a partir de um endereço de pizzaria para UM ÚNICO ENTREGADOR.
Se houver muitos pedidos, você pode sugerir no sumário que este plano é para um entregador e que outros entregadores podem ser necessários para outros grupos de pedidos.

Fluxo de trabalho:
1.  **Geocodificação Obrigatória**:
    *   Primeiro, obtenha as coordenadas (latitude, longitude) para o 'pizzeriaAddress' usando a ferramenta 'geocodeAddressTool'. Se falhar, retorne um erro indicando que o endereço da pizzaria não pôde ser geocodificado.
    *   Para CADA pedido em 'ordersToDeliver', obtenha as coordenadas (latitude, longitude) do 'customerAddress' usando a ferramenta 'geocodeAddressTool'.
    *   Se algum endereço de cliente não puder ser geocodificado, esse pedido específico deve ser omitido do plano de rota e uma nota deve ser adicionada ao 'summary'. Não falhe todo o processo por causa de um endereço de cliente.

2.  **Planejamento da Rota**:
    *   Com todas as coordenadas obtidas, determine a ORDEM ÓTIMA de entrega para os clientes cujos endereços foram geocodificados com sucesso.
    *   Prepare os waypoints para a ferramenta 'getGeoapifyRouteTool'. A lista de waypoints deve ser uma array de objetos {lat, lon}, começando com as coordenadas da pizzaria, seguidas pelas coordenadas dos clientes na ordem otimizada. A última coordenada na lista de waypoints será o destino final dessa rota (o último cliente).
    *   Chame a ferramenta 'getGeoapifyRouteTool' com a lista de waypoints preparada.

3.  **Formato da Saída**:
    *   Retorne o plano no formato 'optimizedRoutePlan'. Como estamos planejando para um único entregador, 'optimizedRoutePlan' geralmente terá apenas um elemento.
    *   Para cada rota no plano (geralmente uma):
        *   'orderIds': inclua os IDs de TODOS os pedidos que foram incluídos com sucesso nesta rota.
        *   'description': uma descrição concisa da rota. Ex: "Rota otimizada para X pedidos".
        *   'geoapifyRoutePlannerUrl': a URL retornada pela ferramenta 'getGeoapifyRouteTool'.
        *   'distanceMeters': a distância retornada pela ferramenta 'getGeoapifyRouteTool'.
        *   'timeSeconds': o tempo retornado pela ferramenta 'getGeoapifyRouteTool'.
    *   'summary': inclua um resumo geral, como "Rota otimizada para X pedidos." e mencione quaisquer pedidos que não puderam ser incluídos devido a falhas na geocodificação. Se o número de pedidos for alto, sugira que este é um plano para um entregador e que outros podem ser necessários.

Exemplo de chamada para 'getGeoapifyRouteTool' se a pizzaria for P e os clientes A, B, C na ordem otimizada:
waypoints: [ {lat:P_lat, lon:P_lon}, {lat:A_lat, lon:A_lon}, {lat:B_lat, lon:B_lon}, {lat:C_lat, lon:C_lon} ]

Endereço da Pizzaria (Origem): {{{pizzeriaAddress}}}

Pedidos para entrega:
{{#each ordersToDeliver}}
- Pedido ID: {{orderId}}, Endereço do Cliente: {{{customerAddress}}}
{{/each}}

Lembre-se: Otimize para um único entregador servindo todos os pedidos geocodificados em uma única sequência.
Se a geocodificação da pizzaria falhar, você DEVE retornar um plano vazio e um sumário indicando o problema.
Se todos os endereços dos clientes falharem na geocodificação (mas a pizzaria não), retorne um plano vazio e um sumário.
`,
});

const optimizeMultiDeliveryRouteFlow = ai.defineFlow(
  {
    name: 'optimizeMultiDeliveryRouteFlow',
    inputSchema: OptimizeMultiDeliveryRouteInputSchema,
    outputSchema: OptimizeMultiDeliveryRouteOutputSchema,
  },
  async (input) => {
    if (!GEOAPIFY_API_KEY) {
        return { 
            optimizedRoutePlan: [], 
            summary: "ERRO CRÍTICO: A chave da API Geoapify não está configurada no servidor." 
        };
    }
    if (!input.ordersToDeliver || input.ordersToDeliver.length === 0) {
      return { 
        optimizedRoutePlan: [], 
        summary: "Nenhum pedido fornecido para otimização." 
      };
    }
    
    try {
        const {output} = await multiRoutePrompt(input);

        if (!output || !output.optimizedRoutePlan) {
            console.warn("AI failed to produce a valid multi-route plan or output was null. Input:", input);
            let fallbackSummary = "Otimização da IA falhou em produzir um plano válido. ";
            const pizzeriaCoords = await geocodeAddressTool({address: input.pizzeriaAddress});
            if (!pizzeriaCoords) {
                 fallbackSummary += "Endereço da pizzaria não pôde ser geocodificado.";
                 return { optimizedRoutePlan: [], summary: fallbackSummary };
            }

            const fallbackPlan: OptimizedRouteLeg[] = [];
            for (const order of input.ordersToDeliver) {
                const customerCoords = await geocodeAddressTool({address: order.customerAddress});
                if (pizzeriaCoords && customerCoords) {
                    const routeInfo = await getGeoapifyRouteTool({waypoints: [pizzeriaCoords, customerCoords]});
                    if (routeInfo) {
                        fallbackPlan.push({
                            orderIds: [order.orderId],
                            description: `Rota individual (fallback) para pedido ${order.orderId}`,
                            geoapifyRoutePlannerUrl: routeInfo.routePlannerUrl,
                            distanceMeters: routeInfo.distance,
                            timeSeconds: routeInfo.time,
                        });
                    } else {
                         fallbackSummary += `Não foi possível gerar rota fallback para ${order.orderId}. `;
                    }
                } else {
                    fallbackSummary += `Endereço do pedido ${order.orderId} não pôde ser geocodificado para rota fallback. `;
                }
            }
            return { 
                optimizedRoutePlan: fallbackPlan, 
                summary: fallbackSummary.trim() 
            };
        }
        return output;
    } catch (error) {
        console.error("Error during multi-route optimization flow with Geoapify:", error);
        return { 
            optimizedRoutePlan: [], 
            summary: `Erro catastrófico durante a otimização: ${(error as Error).message}`
        };
    }
  }
);
