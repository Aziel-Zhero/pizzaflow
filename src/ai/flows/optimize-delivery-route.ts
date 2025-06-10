
'use server';

/**
 * @fileOverview A delivery route optimization AI agent.
 *
 * - optimizeDeliveryRoute - A function that handles the delivery route optimization process.
 * - OptimizeDeliveryRouteInput - The input type for the optimizeDeliveryRoute function.
 * - OptimizeDeliveryRouteOutput - The return type for the optimizeDeliveryRoute function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeDeliveryRouteInputSchema = z.object({
  pizzeriaAddress: z.string().describe('O endereço da pizzaria.'),
  customerAddress: z.string().describe('O endereço de entrega do cliente.'),
});
export type OptimizeDeliveryRouteInput = z.infer<typeof OptimizeDeliveryRouteInputSchema>;

const OptimizeDeliveryRouteOutputSchema = z.object({
  optimizedRoute: z.string().describe('A rota de entrega otimizada da pizzaria para o cliente.'),
});
export type OptimizeDeliveryRouteOutput = z.infer<typeof OptimizeDeliveryRouteOutputSchema>;

export async function optimizeDeliveryRoute(input: OptimizeDeliveryRouteInput): Promise<OptimizeDeliveryRouteOutput> {
  return optimizeDeliveryRouteFlow(input);
}

const getRoute = ai.defineTool(
  {
    name: 'getRoute',
    description: 'Retorna a melhor rota de um endereço de partida para um endereço de destino usando a API do Google Maps.',
    inputSchema: z.object({
      startAddress: z.string().describe('O endereço de partida para a rota.'),
      endAddress: z.string().describe('O endereço de destino para a rota.'),
    }),
    outputSchema: z.string(),
  },
  async (input) => {
    // TODO: Implementar integração com a API do Google Maps aqui para obter a rota.
    // Isto é um placeholder; substitua pela chamada real da API.
    return `Rota otimizada de ${input.startAddress} para ${input.endAddress} usando a API do Google Maps. (Simulado)`;
  }
);

const prompt = ai.definePrompt({
  name: 'optimizeDeliveryRoutePrompt',
  input: {schema: OptimizeDeliveryRouteInputSchema},
  output: {schema: OptimizeDeliveryRouteOutputSchema},
  tools: [getRoute],
  prompt: `Você é um especialista em otimização de rotas para entrega de pizzas.

  Dado o endereço da pizzaria e o endereço do cliente, use a ferramenta getRoute para encontrar a rota otimizada.

Endereço da Pizzaria: {{{pizzeriaAddress}}}
Endereço do Cliente: {{{customerAddress}}}

Retorne a rota otimizada.`,
});

const optimizeDeliveryRouteFlow = ai.defineFlow(
  {
    name: 'optimizeDeliveryRouteFlow',
    inputSchema: OptimizeDeliveryRouteInputSchema,
    outputSchema: OptimizeDeliveryRouteOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
